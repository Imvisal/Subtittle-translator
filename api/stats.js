/* SinSubz — public usage counters (web + Windows + Android all report here).

   GET  /api/stats  -> { enabled, translated, movies, series, episodes, synced, merged }
   GET  /api/stats?downloads=1 -> { enabled, android, windows, portable, windowsTotal }
   GET  /api/stats?admin=1     -> admin panel data (needs the ADMIN_KEY header, see api/_admin.js)
   POST /api/stats?user=1      -> records a signed-in Google account (needs its ID token, see api/_admin.js)
   POST /api/stats  -> { type: "translated" | "synced" | "merged", name?: "Title" | "Title.S01E02" }

   Needs a small Redis database (free): in Vercel -> Storage -> Upstash Redis -> connect to the
   project. Vercel then adds KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*)
   automatically. Without it, GET returns { enabled:false } and the website hides the counters.

   The public counters hold no personal data: only counters, plus the movie / series / episode
   NAME as a set (so the same title is counted once), a short list of the latest titles and
   per-day totals. Signed-in Google accounts (name, email, photo, last seen) are kept separately
   by api/_admin.js and are only readable with the ADMIN_KEY. */
"use strict";

// Works with any prefix Vercel gave the variables (KV_..., UPSTASH_REDIS_..., STORAGE_KV_... ).
function findEnv(re) {
    const key = Object.keys(process.env).find(k => re.test(k) && process.env[k]);
    return key ? process.env[key] : "";
}
const URL_BASE = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?URL$/);
const TOKEN = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?TOKEN$/);

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
    // GET /api/stats?downloads=1 -> release download counts (kept in a "_" helper file so it does
    // not count as a 13th serverless function; the Hobby plan allows 12)
    if (req.method === "GET" && /(?:^|[?&])downloads(?:=|&|$)/.test(String(req.url || ""))) {
        return require("./_downloads.js")(req, res);
    }

    // admin panel + signed-in user records (kept in a "_" helper file, not a function of their own)
    if (/(?:^|[?&])admin(?:=|&|$)/.test(String(req.url || "")) && req.method === "GET") {
        return require("./_admin.js").overview(req, res);
    }
    if (/(?:^|[?&])health(?:=|&|$)/.test(String(req.url || "")) && req.method === "GET") {
        return require("./_admin.js").health(req, res);
    }
    if (/(?:^|[?&])admin(?:=|&|$)/.test(String(req.url || "")) && req.method === "POST") {
        return require("./_admin.js").action(req, res);
    }
    if (/(?:^|[?&])announcement(?:=|&|$)/.test(String(req.url || "")) && req.method === "GET") {
        return require("./_admin.js").publicAnnouncement(req, res);
    }
    if (/(?:^|[?&])me(?:=|&|$)/.test(String(req.url || "")) && req.method === "GET") {
        return require("./_admin.js").me(req, res);
    }
    if (/(?:^|[?&])plan(?:=|&|$)/.test(String(req.url || ""))) {
        if (req.method === "GET") return require("./_admin.js").planPublic(req, res);
        if (req.method === "POST") return require("./_admin.js").planSubmit(req, res);
    }
    if (/(?:^|[?&])user(?:=|&|$)/.test(String(req.url || "")) && req.method === "POST") {
        return require("./_admin.js").ping(req, res);
    }

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

        const day = require("./_admin.js").dayKey(0);

        if (type === "translated") {
            cmds.push(["INCR", "stats:translated"]);
            cmds.push(["HINCRBY", "stats:d:" + day, "translated", 1], ["EXPIRE", "stats:d:" + day, 120 * 86400]);

            // latest titles for the admin panel (50 kept, no personal data)
            const shown = String(body.name || "").replace(/\.(Sinhala\.SinSubz|synced)$/i, "").replace(/[._]+/g, " ")
                .replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
            if (shown.length >= 2) {
                cmds.push(["LPUSH", "stats:recent", JSON.stringify({ t: Date.now(), n: shown })], ["LTRIM", "stats:recent", 0, 49]);
            }

            // a signed-in visitor also counts for "translations per user" and "active today"
            if (/^Bearer\s+/i.test(String(req.headers.authorization || ""))) {
                try {
                    const who = await require("./_google").verifyGoogleUser(req);
                    if (who) {
                        const uk = require("./_admin.js").uidKeyOf(who.uid);
                        cmds.push(["HINCRBY", "u:tc", uk, 1], ["SADD", "u:dau:" + day, uk], ["EXPIRE", "u:dau:" + day, 60 * 86400]);
                    }
                } catch (e) { /* the counter still counts */ }
            }

            const c = classify(body.name);
            // most translated titles: all time + per day (a series counts as one title)
            const topName = c && (c.movie || c.series);
            if (topName) {
                cmds.push(["ZINCRBY", "stats:top", 1, topName], ["ZINCRBY", "stats:top:" + day, 1, topName], ["EXPIRE", "stats:top:" + day, 20 * 86400]);
            }
            if (c && c.movie) cmds.push(["SADD", "stats:movies", c.movie]);
            if (c && c.series) {
                cmds.push(["SADD", "stats:series", c.series]);
                cmds.push(["SADD", "stats:episodes", c.episode]);
            }
        } else if (type === "synced") {
            cmds.push(["INCR", "stats:synced"], ["HINCRBY", "stats:d:" + day, "synced", 1], ["EXPIRE", "stats:d:" + day, 120 * 86400]);
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
