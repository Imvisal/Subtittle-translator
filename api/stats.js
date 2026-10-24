/* SinSubz — public usage counters (web + Windows + Android all report here).

   GET  /api/stats  -> { enabled, translated, movies, series, episodes, synced, merged }
   POST /api/stats  -> { type: "translated" | "synced" | "merged", name?: "Title" | "Title.S01E02" }

   Needs a small Redis database (free): in Vercel -> Storage -> Upstash Redis -> connect to the
   project. Vercel then adds KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*)
   automatically. Without it, GET returns { enabled:false } and the website hides the counters.

   No personal data is stored: only counters, plus the movie / series / episode NAME as a set
   (so the same title is counted once). */
"use strict";

const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_POSTS = 20;       // one person never needs more than this per minute
const rateHits = new Map();

function clientIp(req) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

function limited(ip) {
    const now = Date.now();
    const hits = (rateHits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
    hits.push(now);
    rateHits.set(ip, hits);
    if (rateHits.size > 5000) {
        for (const [k, list] of rateHits) {
            if (!list.some(t => now - t < RATE_WINDOW_MS)) rateHits.delete(k);
        }
    }
    return hits.length > RATE_MAX_POSTS;
}

async function redis(commands) {
    const res = await fetch(URL_BASE.replace(/\/$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error("redis " + res.status);
    const data = await res.json();
    return data.map(x => (x && x.error ? null : x && x.result));
}

// "The Mentalist.S01E01" -> series "the mentalist", episode "the mentalist s01e01"
// anything else            -> movie  "title"
function classify(name) {
    const clean = String(name || "")
        .replace(/\.(Sinhala\.SinSubz|synced)$/i, "")
        .replace(/[._]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .slice(0, 120);

    if (clean.length < 2) return null;

    const m = /^(.*?)\s*[\s.\-]s(\d{1,2})\s*e(\d{1,3})\b/i.exec(clean);
    if (m && m[1].length >= 2) {
        return { series: m[1].trim(), episode: m[1].trim() + " s" + (+m[2]) + "e" + (+m[3]) };
    }
    return { movie: clean };
}

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!URL_BASE || !TOKEN) {
        if (req.method === "GET") return res.status(200).json({ enabled: false });
        return res.status(204).end();
    }

    try {
        if (req.method === "GET") {
            const r = await redis([
                ["GET", "stats:translated"],
                ["SCARD", "stats:movies"],
                ["SCARD", "stats:series"],
                ["SCARD", "stats:episodes"],
                ["GET", "stats:synced"],
                ["GET", "stats:merged"]
            ]);
            res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
            return res.status(200).json({
                enabled: true,
                translated: Number(r[0]) || 0,
                movies: Number(r[1]) || 0,
                series: Number(r[2]) || 0,
                episodes: Number(r[3]) || 0,
                synced: Number(r[4]) || 0,
                merged: Number(r[5]) || 0
            });
        }

        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        if (limited(clientIp(req))) return res.status(429).json({ error: "Too many requests" });

        const body = req.body || {};
        const type = String(body.type || "");
        const cmds = [];

        if (type === "translated") {
            cmds.push(["INCR", "stats:translated"]);
            const c = classify(body.name);
            if (c && c.movie) cmds.push(["SADD", "stats:movies", c.movie]);
            if (c && c.series) {
                cmds.push(["SADD", "stats:series", c.series]);
                cmds.push(["SADD", "stats:episodes", c.episode]);
            }
        } else if (type === "synced") {
            cmds.push(["INCR", "stats:synced"]);
        } else if (type === "merged") {
            cmds.push(["INCR", "stats:merged"]);
        } else {
            return res.status(400).json({ error: "Unknown type" });
        }

        await redis(cmds);
        return res.status(204).end();

    } catch (e) {
        // counters must never break the app
        return res.status(204).end();
    }
};
