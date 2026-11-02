/* SinSubz — admin panel data + signed-in user records.

   Served by api/stats.js (so it is NOT a 13th serverless function; Hobby allows 12 and files that
   start with "_" are not counted):

     POST /api/stats?user=1        header "Authorization: Bearer <Firebase ID token>"  { platform? }
                                   -> 204. Records that this Google account used the site
                                      (name, email, photo, first / last seen, platform).
     GET  /api/stats?admin=1       header "x-admin-key: <ADMIN_KEY>"
                                   -> everything admin.html shows (counts, last 14 days, recent
                                      translations, signed-in users)

   Redis keys written here:
     u:info        hash  uidKey -> JSON { n, e, p, f, l, pl }   (name, email, photo, first, last, platform)
     u:tc          hash  uidKey -> number of translations saved while signed in (written by stats.js)
     u:dau:<day>   set   uidKey of every account seen that day (kept 60 days)
     u:rl:<uidKey> a ping is stored at most once per 15 minutes per account
   uidKey = first 24 hex characters of sha256(Firebase uid), the raw uid is never stored. */
"use strict";

const { hasRedis, redis, verifyGoogleUser, clean, sha } = require("./_google");

const PING_EVERY_S = 15 * 60;
const MAX_USERS_SHOWN = 300;
const DAYS = 14;

const hits = new Map();
function limited(ip, max) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < 60000);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 2000) {
        for (const [k, v] of hits) { if (!v.some(t => now - t < 60000)) { hits.delete(k); } }
    }
    return list.length > max;
}

function clientIp(req) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

function isAdmin(req) {
    const want = process.env.ADMIN_KEY;
    const got = String(req.headers["x-admin-key"] || "");
    if (!want || !got) { return false; }
    const a = sha(want), b = sha(got);
    return a.length === b.length && require("crypto").timingSafeEqual(a, b);
}

// day in Sri Lanka time (UTC+5:30), "YYYY-MM-DD"
function dayKey(offsetDays) {
    return new Date(Date.now() + 5.5 * 3600e3 - (offsetDays || 0) * 86400e3).toISOString().slice(0, 10);
}

const uidKeyOf = uid => sha(uid).toString("hex").slice(0, 24);

function pairs(flat) {
    const out = {};
    if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) { out[flat[i]] = flat[i + 1]; } }
    return out;
}

function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---------------------------------------------------------------- user ping
async function ping(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(204).end(); }
    if (limited(clientIp(req), 20)) { return res.status(429).json({ error: "Too many requests" }); }

    try {
        const who = await verifyGoogleUser(req).catch(() => null);
        if (!who) { return res.status(401).json({ error: "Please sign in with Google first." }); }

        const key = uidKeyOf(who.uid);
        const today = dayKey(0);
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const platform = ["web", "android", "windows"].includes(body.platform) ? body.platform : "web";

        // seen today (cheap, every call)
        await redis([["SADD", "u:dau:" + today, key], ["EXPIRE", "u:dau:" + today, 60 * 86400]]);

        // the profile is only rewritten every 15 minutes
        const [fresh] = await redis([["SET", "u:rl:" + key, "1", "NX", "EX", PING_EVERY_S]]);
        if (fresh !== "OK") { return res.status(204).end(); }

        const [oldRaw] = await redis([["HGET", "u:info", key]]);
        const old = parse(oldRaw) || {};
        const now = Date.now();
        const rec = {
            n: clean(who.name, 60) || old.n || "",
            e: clean(who.email, 120),
            p: /^https:\/\//i.test(who.photo || "") ? String(who.photo).slice(0, 300) : (old.p || ""),
            f: old.f || now,
            l: now,
            pl: platform
        };
        await redis([["HSET", "u:info", key, JSON.stringify(rec)]]);
        return res.status(204).end();
    } catch (e) {
        return res.status(204).end();      // never break the page for a counter
    }
}

// ---------------------------------------------------------------- admin overview
async function overview(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!process.env.ADMIN_KEY) { return res.status(503).json({ error: "ADMIN_KEY is not set in Vercel" }); }
    if (limited("a:" + clientIp(req), 30)) { return res.status(429).json({ error: "Too many tries. Wait a minute." }); }
    if (!isAdmin(req)) { return res.status(401).json({ error: "Wrong admin key" }); }
    if (!hasRedis()) { return res.status(200).json({ enabled: false }); }

    try {
        const days = [];
        for (let i = 0; i < DAYS; i++) { days.push(dayKey(i)); }

        const cmds = [
            ["GET", "stats:translated"],          // 0
            ["SCARD", "stats:movies"],            // 1
            ["SCARD", "stats:series"],            // 2
            ["SCARD", "stats:episodes"],          // 3
            ["GET", "stats:synced"],              // 4
            ["GET", "stats:merged"],              // 5
            ["HLEN", "u:info"],                   // 6
            ["LLEN", "cm:ids"],                   // 7
            ["LLEN", "contact:msgs"],             // 8
            ["LRANGE", "stats:recent", 0, 39],    // 9
            ["HGETALL", "u:info"],                // 10
            ["HGETALL", "u:tc"]                   // 11
        ];
        days.forEach(d => { cmds.push(["HGETALL", "stats:d:" + d], ["SCARD", "u:dau:" + d]); });

        const r = await redis(cmds);

        // saved library titles (SCAN; a few rounds is plenty)
        let cursor = "0", libTitles = 0;
        for (let i = 0; i < 6; i++) {
            const [scan] = await redis([["SCAN", cursor, "MATCH", "lib:t:*", "COUNT", 1000]]);
            if (!Array.isArray(scan)) { break; }
            cursor = String(scan[0]);
            libTitles += (scan[1] || []).length;
            if (cursor === "0") { break; }
        }

        const info = pairs(r[10]);
        const tc = pairs(r[11]);
        const users = Object.keys(info).map(k => {
            const u = parse(info[k]) || {};
            return { id: k.slice(0, 8), name: u.n || "", email: u.e || "", photo: u.p || "", first: u.f || 0, last: u.l || 0, platform: u.pl || "web", translated: Number(tc[k]) || 0 };
        }).sort((a, b) => b.last - a.last);

        const daily = days.map((d, i) => {
            const h = pairs(r[12 + i * 2]);
            return { day: d, translated: Number(h.translated) || 0, synced: Number(h.synced) || 0, users: Number(r[13 + i * 2]) || 0 };
        }).reverse();

        const today = daily[daily.length - 1];
        const startOfToday = Date.parse(dayKey(0) + "T00:00:00+05:30");

        return res.status(200).json({
            enabled: true,
            totals: {
                translated: Number(r[0]) || 0,
                movies: Number(r[1]) || 0,
                series: Number(r[2]) || 0,
                episodes: Number(r[3]) || 0,
                synced: Number(r[4]) || 0,
                merged: Number(r[5]) || 0,
                users: Number(r[6]) || 0,
                comments: Number(r[7]) || 0,
                messages: Number(r[8]) || 0,
                libraryTitles: libTitles
            },
            today: { translated: today.translated, activeUsers: today.users, newUsers: users.filter(u => u.first >= startOfToday).length },
            daily: daily,
            recent: (r[9] || []).map(parse).filter(Boolean),
            users: users.slice(0, MAX_USERS_SHOWN),
            usersShown: Math.min(users.length, MAX_USERS_SHOWN)
        });
    } catch (e) {
        return res.status(200).json({ enabled: false, error: String((e && e.message) || e).slice(0, 80) });
    }
}

module.exports = { ping, overview, dayKey, uidKeyOf };
