"use strict";

/*
 * GET /api/hero-posters
 *
 * A small pool of current movie / TV series posters (TMDB) for the animated
 * poster wall behind the home page title. Cached at the edge for a few hours,
 * so it costs a handful of TMDB calls per day no matter how many visitors.
 *
 * Response: { posters: [ { p: "<tmdb poster path>", t: "movie"|"tv" } ] }
 * The page builds https://image.tmdb.org/t/p/w342<p> itself.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "TMDB_API_KEY is not configured" });
        }

        const isToken = apiKey.length > 40;

        async function tmdb(path, type) {
            const sep = path.includes("?") ? "&" : "?";
            const url = `${TMDB_BASE}${path}${sep}language=en-US` +
                (isToken ? "" : `&api_key=${encodeURIComponent(apiKey)}`);
            const r = await fetch(url, {
                headers: isToken ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(7000)
            });
            if (!r.ok) throw new Error("TMDB " + r.status);
            const data = await r.json();
            return (data.results || []).map(x => ({
                p: x.poster_path,
                t: type || (x.media_type === "tv" ? "tv" : "movie"),
                lang: x.original_language
            }));
        }

        const parts = await Promise.allSettled([
            tmdb("/trending/movie/week", "movie"),
            tmdb("/trending/tv/week", "tv"),
            tmdb("/movie/popular", "movie"),
            tmdb("/tv/popular", "tv"),
            tmdb("/trending/movie/week?page=2", "movie"),
            tmdb("/trending/tv/week?page=2", "tv")
        ]);

        const seen = new Set();
        const posters = [];

        parts.forEach(r => {
            if (r.status !== "fulfilled") return;
            r.value.forEach(x => {
                if (!x.p || seen.has(x.p)) return;
                seen.add(x.p);
                posters.push({ p: x.p, t: x.t });
            });
        });

        res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
        return res.status(200).json({ posters: posters.slice(0, 60) });

    } catch (error) {
        console.error("HERO POSTERS ERROR:", error.message);
        return res.status(502).json({ error: "Could not load posters" });
    }
};
