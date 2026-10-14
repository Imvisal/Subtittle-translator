"use strict";

/*
 * GET /api/ratings?ids=tt0111161,tt0068646
 *
 * IMDb ratings (read from OMDb) for up to 24 titles at once. The website and both apps
 * call this after a list of movies is shown and put a small "IMDb 7.4" label on each poster.
 *
 * Response: { success, ratings: { tt0111161: { rating: "9.3", votes: "3,100,000" } }, unknown: [] }
 *   - titles that have no IMDb rating are simply left out of "ratings"
 *   - "unknown" = ids we could not check right now (OMDb down / daily limit reached);
 *     the page asks again later instead of remembering "no rating".
 *
 * OMDb's free key allows ~1000 requests a day, so answers are remembered:
 *   - in memory on the server (12 h when a rating exists, 1 h when it does not)
 *   - by Vercel's CDN (the response is cached for 6 h)
 * and when OMDb says "Request limit reached" we stop calling it for 30 minutes.
 */

const OMDB = "https://www.omdbapi.com/";
const MAX_IDS = 24;
const PARALLEL = 6;
const TTL_FOUND = 12 * 60 * 60 * 1000;
const TTL_MISSING = 60 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const MAX_CACHE = 3000;

const cache = new Map();      // imdbID -> { value: {rating, votes} | null, exp }
let blockedUntil = 0;

function remember(id, value, ttl) {
    if (cache.size >= MAX_CACHE) {
        cache.delete(cache.keys().next().value);        // drop the oldest
    }
    cache.set(id, { value, exp: Date.now() + ttl });
}

// -> { rating, votes }  |  null (no rating)  |  undefined (could not check)
async function lookup(id, apiKey) {
    const hit = cache.get(id);
    if (hit && hit.exp > Date.now()) {
        return hit.value;
    }
    if (Date.now() < blockedUntil) {
        return undefined;
    }

    try {
        const url = new URL(OMDB);
        url.searchParams.set("apikey", apiKey);
        url.searchParams.set("i", id);

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();

        if (data.Response === "False") {
            if (/limit/i.test(String(data.Error || ""))) {
                blockedUntil = Date.now() + BLOCK_MS;
                return undefined;
            }
            remember(id, null, TTL_MISSING);            // unknown / removed id
            return null;
        }

        const rating = String(data.imdbRating || "");
        const ok = rating && rating !== "N/A" && !Number.isNaN(parseFloat(rating));
        const votes = data.imdbVotes && data.imdbVotes !== "N/A" ? String(data.imdbVotes) : "";
        const value = ok ? { rating, votes } : null;

        remember(id, value, ok ? TTL_FOUND : TTL_MISSING);
        return value;

    } catch (error) {
        return undefined;
    }
}

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const apiKey = process.env.OMDB_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "OMDB_API_KEY is missing" });
        }

        const ids = Array.from(new Set(
            String(req.query.ids || "")
                .split(",")
                .map((s) => s.trim())
                .filter((s) => /^tt\d{5,10}$/.test(s))
        )).slice(0, MAX_IDS);

        if (!ids.length) {
            return res.status(400).json({ error: "ids is required (IMDb ids like tt0111161)" });
        }

        const ratings = {};
        const unknown = [];
        let next = 0;

        async function worker() {
            while (next < ids.length) {
                const id = ids[next++];
                const value = await lookup(id, apiKey);
                if (value === undefined) {
                    unknown.push(id);
                } else if (value) {
                    ratings[id] = value;
                }
            }
        }

        await Promise.all(
            Array.from({ length: Math.min(PARALLEL, ids.length) }, worker)
        );

        res.setHeader(
            "Cache-Control",
            unknown.length
                ? "public, s-maxage=60"
                : "public, s-maxage=21600, stale-while-revalidate=86400"
        );

        return res.status(200).json({ success: true, ratings, unknown });

    } catch (error) {
        console.error("RATINGS API ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to load ratings"
        });
    }
};
