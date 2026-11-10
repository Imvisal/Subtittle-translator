/* SinSubz: "Ready" Sinhala translations made by the owner's scheduled runner (GitHub Actions, see
   scripts/auto-translate.js). Everybody can list and download them from the home page.
   Served through /api/stats (?ready=...), so it is not a serverless function of its own.

   GET  /api/stats?ready=list                      -> { items: [ { id, t, y, p, type, eps: [ { s, e, n, ts } ] } ] }
   GET  /api/stats?ready=get&id=tt123&s=1&e=2      -> the .srt file (download)   (movies: s and e left out)
   POST /api/stats?ready=put   x-admin-key         -> { imdb, title, year, poster, type, season, episode, filename, srt }
   POST /api/stats?ready=del   x-admin-key         -> { imdb, season, episode }   (no season/episode = the whole title)

   Redis keys
     rdy:idx                 hash  imdb -> JSON { id, t, y, p, type, eps: { "1x2": { s, e, f (filename), n (lines), ts } } }
     rdy:srt:<imdb>:<s>:<e>  string  gzip + base64 of the .srt text (no expiry) */
"use strict";

const zlib = require("zlib");
const { hasRedis, redis, clean } = require("./_google");

const MAX_SRT = 700000;
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const https = u => { const s = String(u || ""); return /^https:\/\/[^\s"'<>]{4,400}$/.test(s) ? s : ""; };
const num = v => (/^\d{1,4}$/.test(String(v == null ? "" : v)) ? Number(v) : 0);
const imdbOk = v => /^tt\d{5,10}$/.test(String(v || ""));
const q = req => { try { return Object.fromEntries(new URL(req.url, "http://x").searchParams); } catch (e) { return {}; } };
const srtKey = (id, s, e) => "rdy:srt:" + id + ":" + s + ":" + e;

function isAdmin(req) { return require("./_admin.js").isAdmin(req); }

module.exports = async function ready(req, res) {
    const act = String(q(req).ready || "");
    try {
        if (!hasRedis()) { return res.status(act === "list" ? 200 : 503).json(act === "list" ? { items: [] } : { error: "Database not connected" }); }

        if (act === "list" && req.method === "GET") {
            res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
            const [flat] = await redis([["HGETALL", "rdy:idx"]]);
            const items = [];
            for (let i = 0; flat && i < flat.length; i += 2) {
                const m = parse(flat[i + 1]);
                if (!m) { continue; }
                const eps = Object.values(m.eps || {}).map(x => ({ s: x.s, e: x.e, n: x.n, ts: x.ts }))
                    .sort((a, b) => a.s - b.s || a.e - b.e);
                items.push({ id: m.id, t: m.t, y: m.y, p: m.p, type: m.type, eps, ts: Math.max(0, ...eps.map(x => x.ts || 0)) });
            }
            items.sort((a, b) => b.ts - a.ts);
            return res.status(200).json({ items });
        }

        if (act === "get" && req.method === "GET") {
            const p = q(req);
            if (!imdbOk(p.id)) { return res.status(400).json({ error: "Bad id" }); }
            const s = num(p.s), e = num(p.e);
            const [packed, idx] = await redis([["GET", srtKey(p.id, s, e)], ["HGET", "rdy:idx", p.id]]);
            if (!packed) { return res.status(404).json({ error: "Not found" }); }
            const meta = parse(idx) || {};
            const ep = (meta.eps || {})[s + "x" + e] || {};
            const name = String(ep.f || (p.id + ".Sinhala.SinSubz.srt")).replace(/[^\w .()\-\[\]]+/g, "_");
            const text = zlib.gunzipSync(Buffer.from(packed, "base64")).toString("utf8");
            res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
            res.setHeader("Content-Disposition", 'attachment; filename="' + name + '"');
            res.setHeader("Cache-Control", "public, s-maxage=300");
            return res.status(200).send("﻿" + text);
        }

        if ((act === "put" || act === "del") && req.method === "POST") {
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const b = req.body && typeof req.body === "object" ? req.body : {};
            if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Bad imdb id" }); }
            const s = num(b.season), e = num(b.episode);

            if (act === "del") {
                if (!s && !e) {
                    const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
                    const m = parse(raw);
                    const cmds = [["HDEL", "rdy:idx", b.imdb]];
                    Object.values((m && m.eps) || {}).forEach(x => cmds.push(["DEL", srtKey(b.imdb, x.s, x.e)]));
                    await redis(cmds);
                } else {
                    const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
                    const m = parse(raw);
                    if (m && m.eps) {
                        delete m.eps[s + "x" + e];
                        await redis([["DEL", srtKey(b.imdb, s, e)], Object.keys(m.eps).length ? ["HSET", "rdy:idx", b.imdb, JSON.stringify(m)] : ["HDEL", "rdy:idx", b.imdb]]);
                    }
                }
                return res.status(200).json({ ok: true });
            }

            const srt = String(b.srt || "");
            if (srt.length < 200 || srt.length > MAX_SRT || srt.indexOf("-->") < 0) { return res.status(400).json({ error: "Bad subtitle" }); }
            const title = clean(b.title, 100);
            if (!title) { return res.status(400).json({ error: "Missing title" }); }
            const type = b.type === "tv" ? "tv" : "movie";
            if (type === "tv" && !(s && e)) { return res.status(400).json({ error: "Missing season / episode" }); }
            const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
            const m = parse(raw) || { id: b.imdb, eps: {} };
            m.t = clean(b.title, 100); m.y = clean(b.year, 8); m.type = type;
            m.p = https(b.poster) || m.p || "";
            m.eps = m.eps || {};
            m.eps[s + "x" + e] = {
                s, e, f: clean(b.filename, 140).replace(/[\\/:*?"<>|]+/g, "_") || (title + ".Sinhala.SinSubz.srt"),
                n: num(b.count) || (srt.match(/-->/g) || []).length, ts: Date.now()
            };
            const packed = zlib.gzipSync(Buffer.from(srt, "utf8")).toString("base64");
            await redis([["SET", srtKey(b.imdb, s, e), packed], ["HSET", "rdy:idx", b.imdb, JSON.stringify(m)]]);
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
};
