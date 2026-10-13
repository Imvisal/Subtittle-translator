"use strict";

/*
 * GET /api/new-releases
 *
 * Newly released movies and TV series (TMDB, last 30 days), each one
 * with a Sinhala-subtitle check. The Android and Windows apps poll this
 * and show a notification when a title appears for the first time, and
 * again when a Sinhala subtitle becomes available for it.
 *
 * Response:
 * { success, generatedAt, items: [
 *     { key, type: "movie"|"series", title, year, poster,
 *       sinhala: { found: boolean, source: string, url: string } } ] }
 */

const sinhalaSearch = require("./sinhala-search");

const TMDB_BASE = "https://api.themoviedb.org/3";
const DAYS_BACK = 30;
const MOVIES = 6;
const SERIES = 4;
const SINHALA_TIMEOUT_MS = 12000;

function isoDaysAgo(days) {
    return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Runs the existing /api/sinhala-search handler in-process.
function checkSinhala(title, year, type) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), SINHALA_TIMEOUT_MS);

        const req = {
            method: "GET",
            query: { title, year: String(year || ""), type }
        };

        const res = {
            status() { return res; },
            setHeader() { return res; },
            json(body) {
                clearTimeout(timer);
                resolve(body);
                return res;
            }
        };

        Promise.resolve(sinhalaSearch(req, res)).catch(() => {
            clearTimeout(timer);
            resolve(null);
        });
    });
}

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "TMDB_API_KEY is not configured" });
        }

        async function tmdb(endpoint) {
            // works with a v3 API key and with a v4 read access token
            const isToken = apiKey.length > 40;
            const sep = endpoint.includes("?") ? "&" : "?";
            const url =
                `${TMDB_BASE}${endpoint}${sep}language=en-US&include_adult=false` +
                (isToken ? "" : `&api_key=${encodeURIComponent(apiKey)}`);

            const response = await fetch(url, {
                headers: isToken ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(7000)
            });

            if (!response.ok) {
                throw new Error(`TMDB API error ${response.status}`);
            }
            return response.json();
        }

        const from = isoDaysAgo(DAYS_BACK);
        const today = isoDaysAgo(0);

        const [movieData, tvData] = await Promise.all([
            tmdb(
                "/discover/movie?sort_by=popularity.desc" +
                `&primary_release_date.gte=${from}&primary_release_date.lte=${today}` +
                "&vote_count.gte=0&page=1"
            ),
            tmdb(
                "/discover/tv?sort_by=popularity.desc" +
                `&first_air_date.gte=${from}&first_air_date.lte=${today}&page=1`
            )
        ]);

        const items = [];

        for (const m of (movieData.results || []).slice(0, MOVIES)) {
            items.push({
                key: "m" + m.id,
                type: "movie",
                title: m.title || "",
                year: (m.release_date || "").slice(0, 4),
                poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : ""
            });
        }

        for (const t of (tvData.results || []).slice(0, SERIES)) {
            items.push({
                key: "t" + t.id,
                type: "series",
                title: t.name || "",
                year: (t.first_air_date || "").slice(0, 4),
                poster: t.poster_path ? `https://image.tmdb.org/t/p/w342${t.poster_path}` : ""
            });
        }

        const wanted = items.filter((i) => i.title);

        const checks = await Promise.all(
            wanted.map((i) => checkSinhala(i.title, i.year, i.type === "series" ? "series" : "movie"))
        );

        const out = wanted.map((item, idx) => {
            const c = checks[idx];
            const first = c && c.found && c.sources && c.sources[0];
            return Object.assign({}, item, {
                sinhala: first
                    ? { found: true, source: first.source || "", url: first.url || "" }
                    : { found: false, source: "", url: "" }
            });
        });

        res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");

        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            items: out
        });

    } catch (error) {
        console.error("NEW RELEASES ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to load new releases"
        });
    }
};
