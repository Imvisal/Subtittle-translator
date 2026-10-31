/* SinSubz — library of finished Sinhala translations.

   Served by api/translate.js (so it is NOT a 13th serverless function; the Hobby plan allows 12 and
   files that start with "_" are not counted):

     GET    /api/translate?lib=get&k=<titleKey>&h=<englishHash>
              -> { enabled, entries: [ { h, pairs: [ { s, e, en, si } ] } ] }
                 the entry for exactly this English file if there is one, otherwise up to 3 saved
                 entries of the same film / episode (the app lines them up by text, see retime.js)
     POST   /api/translate?lib=save   { k, h, pairs }   -> 204   (first write wins, never overwrites)
     DELETE /api/translate?lib=del&k=..&h=..   header "x-admin-key: <ADMIN_KEY>"   -> 204

   titleKey  = imdb id (+ ":s1e2" for an episode) + ":" + translation style
   h         = hash of the English subtitle text (same text = same hash, whatever the timing)
   pair      = start ms, end ms, English line, Sinhala line

   Storage: the same Upstash Redis database as the usage counters (KV_REST_API_* or
   UPSTASH_REDIS_REST_*). One Redis hash per title, one field per English file, the value is
   base64(gzip(JSON)). Without Redis everything quietly turns off and the app translates as before.

   Anyone can call "save", so the input is checked hard: shape, sizes, mostly Sinhala letters, at most
   6 saved copies per title, a per-IP limit, and the first copy for a given h is kept.
   Remove a bad copy with the DELETE call above. */
"use strict";

const zlib = require("zlib");
const crypto = require("crypto");

function findEnv(re) {
    const key = Object.keys(process.env).find(k => re.test(k) && process.env[k]);
    return key ? process.env[key] : "";
}
const URL_BASE = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?URL$/);
const TOKEN = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?TOKEN$/);

const MAX_ENTRIES_PER_TITLE = 6;
const MAX_ENTRIES_RETURNED = 3;
const MIN_PAIRS = 20;
const MAX_PAIRS = 4000;
const MAX_JSON_CHARS = 900 * 1000;
const MIN_SINHALA_SHARE = 0.85;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_GET = 40;
const RATE_MAX_SAVE = 6;
const hits = { get: new Map(), save: new Map() };

function clientIp(req) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

function limited(kind, ip, max) {
    const now = Date.now();
    const map = hits[kind];
    const list = (map.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
    list.push(now);
    map.set(ip, list);
    if (map.size > 5000) {
        for (const [k, v] of map) {
            if (!v.some(t => now - t < RATE_WINDOW_MS)) { map.delete(k); }
        }
    }
    return list.length > max;
}

async function redis(commands) {
    const res = await fetch(URL_BASE.replace(/\/$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) { throw new Error("redis " + res.status); }
    const data = await res.json();
    return data.map(x => (x && x.error ? null : x && x.result));
}

const validKey = k => typeof k === "string" && /^tt\d{5,10}(?::s\d{1,3}e\d{1,4})?:[a-z0-9_-]{1,24}$/.test(k);
const validHash = h => typeof h === "string" && /^[a-f0-9]{16}$/.test(h);

const SINHALA = /[඀-෿]/;
// control characters are never valid in subtitle text (new lines and tabs are fine)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

// returns the cleaned pair list, or null when the data does not look like a real translation
function cleanPairs(input) {
    if (!Array.isArray(input) || input.length < MIN_PAIRS || input.length > MAX_PAIRS) { return null; }

    const out = [];
    let withSinhala = 0;

    for (const p of input) {
        if (!p || typeof p !== "object") { return null; }

        const s = Number(p.s), e = Number(p.e);
        if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < s || e > 1e8) { return null; }

        const en = typeof p.en === "string" ? p.en.trim() : "";
        const si = typeof p.si === "string" ? p.si.trim() : "";
        if (!en || en.length > 600 || si.length > 900) { return null; }
        if (CONTROL.test(en) || CONTROL.test(si)) { return null; }

        if (si && SINHALA.test(si)) { withSinhala++; }
        out.push({ s: Math.round(s), e: Math.round(e), en: en, si: si });
    }

    // most lines must really be Sinhala (blocks junk and untranslated English being saved)
    if (withSinhala / out.length < MIN_SINHALA_SHARE) { return null; }

    return out;
}

const pack = pairs => zlib.gzipSync(Buffer.from(JSON.stringify(pairs), "utf8"), { level: 9 }).toString("base64");
const unpack = text => JSON.parse(zlib.gunzipSync(Buffer.from(text, "base64")).toString("utf8"));

function sameKey(a, b) {
    const x = Buffer.from(String(a || ""));
    const y = Buffer.from(String(b || ""));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async function libraryHandler(req, res) {

    res.setHeader("Cache-Control", "no-store");

    const url = new URL(req.url || "/", "http://localhost");
    const action = url.searchParams.get("lib");
    const k = String(url.searchParams.get("k") || (req.body && req.body.k) || "");
    const h = String(url.searchParams.get("h") || (req.body && req.body.h) || "");

    if (!URL_BASE || !TOKEN) {
        if (req.method === "GET") { return res.status(200).json({ enabled: false }); }
        return res.status(204).end();
    }

    try {

        // ---------- look up ----------
        if (req.method === "GET" && action === "get") {
            if (limited("get", clientIp(req), RATE_MAX_GET)) { return res.status(429).json({ error: "Too many requests" }); }
            if (!validKey(k)) { return res.status(400).json({ error: "Bad key" }); }

            const [all] = await redis([["HGETALL", "lib:t:" + k]]);
            const entries = [];

            if (Array.isArray(all)) {
                for (let i = 0; i + 1 < all.length; i += 2) {
                    try {
                        const pairs = unpack(all[i + 1]);
                        if (Array.isArray(pairs)) { entries.push({ h: all[i], pairs: pairs }); }
                    } catch (e) { /* skip a damaged entry */ }
                }
            }

            const exact = entries.filter(x => x.h === h);
            const chosen = exact.length
                ? exact
                : entries.sort((a, b) => b.pairs.length - a.pairs.length).slice(0, MAX_ENTRIES_RETURNED);

            return res.status(200).json({ enabled: true, entries: chosen });
        }

        // ---------- save ----------
        if (req.method === "POST" && action === "save") {
            if (limited("save", clientIp(req), RATE_MAX_SAVE)) { return res.status(429).json({ error: "Too many requests" }); }
            if (!validKey(k) || !validHash(h)) { return res.status(400).json({ error: "Bad key" }); }

            const pairs = cleanPairs(req.body && req.body.pairs);
            if (!pairs) { return res.status(400).json({ error: "Not a usable translation" }); }
            if (JSON.stringify(pairs).length > MAX_JSON_CHARS) { return res.status(413).json({ error: "Too large" }); }

            const key = "lib:t:" + k;
            const [count] = await redis([["HLEN", key]]);
            if (Number(count) >= MAX_ENTRIES_PER_TITLE) { return res.status(204).end(); }

            await redis([["HSETNX", key, h, pack(pairs)]]);
            return res.status(204).end();
        }

        // ---------- remove (owner only) ----------
        if (req.method === "DELETE" && action === "del") {
            if (!process.env.ADMIN_KEY) { return res.status(503).json({ error: "ADMIN_KEY is not set" }); }
            if (!sameKey(req.headers["x-admin-key"], process.env.ADMIN_KEY)) { return res.status(401).json({ error: "Not allowed" }); }
            if (!validKey(k)) { return res.status(400).json({ error: "Bad key" }); }

            // no h -> remove every saved copy of this title
            await redis([validHash(h) ? ["HDEL", "lib:t:" + k, h] : ["DEL", "lib:t:" + k]]);
            return res.status(204).end();
        }

        return res.status(400).json({ error: "Unknown request" });

    } catch (e) {
        // the library must never break translating
        return res.status(req.method === "GET" ? 200 : 204).end(req.method === "GET" ? JSON.stringify({ enabled: false }) : undefined);
    }
};

module.exports._test = { cleanPairs, validKey, validHash };
