"use strict";

/*
 * GET /api/title-info?id=tt0111161&type=movie|series
 *
 * Short, spoiler-light info for the title the visitor just picked:
 *   { success, info: { title, year, tagline, overview, genres[], runtime, rating, trailer } }
 * `overview` is trimmed to the first two sentences (max ~260 chars) so it never turns into a
 * full plot retelling. `trailer` is a YouTube video id (official trailer first) or null.
 * Data comes from TMDB; answers are cached by the CDN for a day and in memory.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

function shortOverview(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [clean];
    let out = "";
    for (const s of sentences.slice(0, 2)) {
        if ((out + s).length > 260 && out) break;
        out += s;
    }
    out = out.trim();
    return out.length > 280 ? out.slice(0, 277).replace(/\s+\S*$/, "") + "…" : out;
}

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const id = String(req.query.id || "").trim();
        const isSeries = String(req.query.type || "") === "series" || req.query.type === "tv";

        if (!/^tt\d{5,12}$/.test(id)) {
            return res.status(400).json({ error: "Bad id" });
        }

        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "TMDB_API_KEY is not configured" });
        }

        const key = id + (isSeries ? ":tv" : ":movie");
        const hit = cache.get(key);
        if (hit && hit.exp > Date.now()) {
            res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
            return res.status(200).json({ success: true, info: hit.info });
        }

        const isToken = apiKey.length > 40;

        async function tmdb(path) {
            const sep = path.includes("?") ? "&" : "?";
            const url = `${TMDB_BASE}${path}${sep}language=en-US` +
                (isToken ? "" : `&api_key=${encodeURIComponent(apiKey)}`);
            const r = await fetch(url, {
                headers: isToken ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(7000)
            });
            if (!r.ok) throw new Error("TMDB " + r.status);
            return r.json();
        }

        const found = await tmdb(`/find/${id}?external_source=imdb_id`);
        const base = isSeries
            ? (found.tv_results || [])[0]
            : (found.movie_results || [])[0];
        const pick = base || (found.movie_results || [])[0] || (found.tv_results || [])[0];

        if (!pick) {
            return res.status(404).json({ error: "Not found" });
        }

        const kind = pick.first_air_date !== undefined || (isSeries && base) ? "tv" : "movie";
        const d = await tmdb(`/${kind}/${pick.id}?append_to_response=videos`);

        const vids = ((d.videos && d.videos.results) || [])
            .filter(v => v.site === "YouTube" && /^[\w-]{6,20}$/.test(v.key || ""));
        const trailer =
            vids.find(v => v.type === "Trailer" && v.official) ||
            vids.find(v => v.type === "Trailer") ||
            vids.find(v => v.type === "Teaser") ||
            null;

        const info = {
            title: d.title || d.name || "",
            year: String(d.release_date || d.first_air_date || "").slice(0, 4),
            tagline: d.tagline || "",
            overview: shortOverview(d.overview),
            genres: (d.genres || []).slice(0, 3).map(g => g.name),
            runtime: kind === "movie"
                ? (d.runtime || 0)
                : ((d.episode_run_time || [])[0] || 0),
            seasons: kind === "tv" ? (d.number_of_seasons || 0) : 0,
            rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
            trailer: trailer ? trailer.key : null
        };

        if (cache.size >= MAX_CACHE) {
            cache.delete(cache.keys().next().value);
        }
        cache.set(key, { info, exp: Date.now() + TTL });

        res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
        return res.status(200).json({ success: true, info });
    } catch (error) {
        console.error("title-info error:", error && error.message);
        return res.status(502).json({ error: "Could not load details" });
    }
};
