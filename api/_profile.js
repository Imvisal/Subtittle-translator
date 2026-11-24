/* SinSubz: user profile (nickname + picture) and "my translations" (saved Sinhala subtitles, premium download).
   Served through /api/stats (see api/stats.js); this "_" file is not a serverless function of its own.

   Redis keys
     u:prof            hash  uidKey -> JSON { n: nickname, p: small JPEG data URL }
     tr:meta:<uidKey>  hash  id -> JSON { id, title, year, type, poster, t, filename, size }   (newest 30 kept)
     tr:srt:<uidKey>:<id>  string  gzip + base64 of the .srt text, kept 60 days
*/
"use strict";

const zlib = require("zlib");
const { hasRedis, redis, clean, sha } = require("./_google");

const MAX_KEPT = 30;
const KEEP_SECONDS = 60 * 86400;
const MAX_SRT = 600000;

const hits = new Map();
function limited(key, max) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < 60000);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 2000) { for (const [k, v] of hits) { if (!v.some(t => now - t < 60000)) { hits.delete(k); } } }
    return list.length > max;
}
function ip(req) {
    return String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
}
function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function query(req) {
    const q = Object.assign({}, req.query || {});
    const u = String(req.url || "");
    const i = u.indexOf("?");
    if (i >= 0) { new URLSearchParams(u.slice(i + 1)).forEach((v, k) => { if (q[k] == null) { q[k] = v; } }); }
    return q;
}
function pairs(flat) {
    const out = {};
    if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) { out[flat[i]] = flat[i + 1]; } }
    return out;
}
const https = u => (/^https:\/\/\S{3,400}$/i.test(String(u || "").trim()) ? String(u).trim() : "");

async function who(req) {
    const adm = require("./_admin.js");
    const w = await adm.authUser(req);
    return w ? { w, key: adm.uidKeyOf(w.uid), adm } : null;
}

// ---------------------------------------------------------------- profile
async function profile(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(503).json({ error: "Database not connected" }); }
    if (limited("p:" + ip(req), 30)) { return res.status(429).json({ error: "Too many requests" }); }
    try {
        const me = await who(req);
        if (!me) { return res.status(401).json({ error: "Please sign in with Google first." }); }

        if (req.method === "GET") {
            const [raw] = await redis([["HGET", "u:prof", me.key]]);
            const p = parse(raw) || {};
            return res.status(200).json({ nick: p.n || "", pic: p.p || "" });
        }
        if (req.method !== "POST") { return res.status(405).json({ error: "Method not allowed" }); }

        const body = req.body && typeof req.body === "object" ? req.body : {};
        const [oldRaw] = await redis([["HGET", "u:prof", me.key]]);
        const old = parse(oldRaw) || {};
        const rec = { n: old.n || "", p: old.p || "" };

        if (body.nick !== undefined) {
            const nick = clean(body.nick, 24);
            if (nick && nick.length < 2) { return res.status(400).json({ error: "Name must have at least 2 letters." }); }
            if (/https?:|www\.|\.(com|lk|net|org)\b|@/i.test(nick)) { return res.status(400).json({ error: "Names cannot contain links or emails." }); }
            rec.n = nick;
        }
        if (body.removePic) { rec.p = ""; }
        if (body.pic) {
            const pic = String(body.pic);
            if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(pic) || pic.length > 45000) {
                return res.status(400).json({ error: "That picture is not usable. Choose another one." });
            }
            rec.p = pic;
        }
        await redis([["HSET", "u:prof", me.key, JSON.stringify(rec)]]);
        return res.status(200).json({ ok: true, nick: rec.n, pic: rec.p });
    } catch (e) {
        return res.status(500).json({ error: "Could not save" });
    }
}

// ---------------------------------------------------------------- my translations
async function mytr(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(503).json({ error: "Database not connected" }); }
    if (limited("t:" + ip(req), 40)) { return res.status(429).json({ error: "Too many requests" }); }
    try {
        const me = await who(req);
        if (!me) { return res.status(401).json({ error: "Please sign in with Google first." }); }
        const act = String(query(req).mytr || "");
        const metaKey = "tr:meta:" + me.key;
        const srtKey = id => "tr:srt:" + me.key + ":" + id;

        if (act === "list" && req.method === "GET") {
            const [flat] = await redis([["HGETALL", metaKey]]);
            let items = Object.values(pairs(flat)).map(parse).filter(Boolean).sort((a, b) => b.t - a.t).slice(0, MAX_KEPT);
            if (items.length) {
                const ex = await redis(items.map(i => ["EXISTS", srtKey(i.id)]));
                items = items.filter((i, n) => Number(ex[n]) === 1);
            }
            const until = await me.adm.premiumUntil(me.key);
            return res.status(200).json({ items, premium: until > Date.now() || !!me.w.owner, keepDays: KEEP_SECONDS / 86400 });
        }

        if (act === "save" && req.method === "POST") {
            const b = req.body && typeof req.body === "object" ? req.body : {};
            const srt = String(b.srt || "");
            if (srt.length < 50 || srt.length > MAX_SRT || srt.indexOf("-->") < 0) { return res.status(400).json({ error: "Bad subtitle" }); }
            const title = clean(b.title, 100);
            if (!title) { return res.status(400).json({ error: "Missing title" }); }
            const filename = clean(b.filename, 140).replace(/[\\/:*?"<>|]+/g, "_") || (title + ".Sinhala.SinSubz.srt");
            const id = sha(filename.toLowerCase()).toString("hex").slice(0, 12);
            const meta = {
                id, title, year: clean(b.year, 8), type: b.type === "tv" ? "tv" : "movie",
                poster: https(b.poster), t: Date.now(), filename, size: srt.length
            };
            if (!meta.poster) {                      // saved again without a picture (e.g. an uploaded file): keep the old poster
                const old = parse((await redis([["HGET", metaKey, id]]))[0]);
                if (old && old.poster) { meta.poster = old.poster; if (!meta.year) { meta.year = old.year || ""; } }
            }
            const packed = zlib.gzipSync(Buffer.from(srt, "utf8")).toString("base64");
            await redis([
                ["SET", srtKey(id), packed, "EX", KEEP_SECONDS],
                ["HSET", metaKey, id, JSON.stringify(meta)],
                ["EXPIRE", metaKey, KEEP_SECONDS]
            ]);
            // keep the newest MAX_KEPT only
            const [flat] = await redis([["HGETALL", metaKey]]);
            const all = Object.values(pairs(flat)).map(parse).filter(Boolean).sort((a, c) => c.t - a.t);
            if (all.length > MAX_KEPT) {
                const drop = all.slice(MAX_KEPT);
                await redis([...drop.map(d => ["HDEL", metaKey, d.id]), ...drop.map(d => ["DEL", srtKey(d.id)])]);
            }
            return res.status(200).json({ ok: true, id });
        }

        const id = clean(query(req).id, 20);
        if (!/^[0-9a-f]{12}$/.test(id)) { return res.status(400).json({ error: "Bad id" }); }

        if (act === "get" && req.method === "GET") {
            const until = await me.adm.premiumUntil(me.key);
            if (!(until > Date.now()) && !me.w.owner) {
                return res.status(403).json({ code: "PREMIUM_ONLY", error: "Downloading saved subtitles is for Premium members." });
            }
            const [packed, metaRaw] = await redis([["GET", srtKey(id)], ["HGET", metaKey, id]]);
            if (!packed) { return res.status(404).json({ error: "This subtitle is no longer saved." }); }
            const meta = parse(metaRaw) || {};
            const srt = zlib.gunzipSync(Buffer.from(packed, "base64")).toString("utf8");
            return res.status(200).json({ filename: meta.filename || "subtitle.Sinhala.SinSubz.srt", srt });
        }

        if (act === "del" && (req.method === "POST" || req.method === "DELETE")) {
            await redis([["HDEL", metaKey, id], ["DEL", srtKey(id)]]);
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: "Unknown request" });
    } catch (e) {
        return res.status(500).json({ error: "Could not do that" });
    }
}

module.exports = { profile, mytr };
