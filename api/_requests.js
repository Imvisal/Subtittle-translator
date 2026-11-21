/* SinSubz: "Request a title" - signed-in visitors ask for a film / TV series to be translated; the owner approves in Admin.
   Served through /api/stats (?req=...), so it is not a serverless function of its own.
   POST ?req=add   { imdb, title, year, poster, type }   (Google sign-in)  -> { status: "sent" | "again" | "ready" | "queued" }
   GET  ?req=list                                          (admin)          -> { items: [ { imdb, title, year, poster, type, votes, at } ] }  most asked first
   POST ?req=drop  { imdb }                                (admin)          approved or rejected: removes it from the list
   Redis: rq:p (hash imdb -> JSON)   rq:u:<imdb> (set of hashed user ids, one vote each) */
"use strict";

const { hasRedis, redis, clean, verifyGoogleUser, overLimit } = require("./_google");

const MAX_PENDING = 300;
const DAILY_PER_USER = 5;
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const imdbOk = v => /^tt\d{5,10}$/.test(String(v || ""));
const q = req => { try { return Object.fromEntries(new URL(req.url, "http://x").searchParams); } catch (e) { return {}; } };
async function body(req) {
    if (req.body && typeof req.body === "object") { return req.body; }
    return parse(typeof req.body === "string" ? req.body : "") || {};
}

module.exports = async function (req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(503).json({ error: "Not available right now" }); }
    const act = q(req).req;
    const A = require("./_admin.js");

    if (act === "list" && req.method === "GET") {
        if (!A.isAdmin(req)) { return res.status(401).json({ error: "Admin key needed" }); }
        const flat = (await redis([["HGETALL", "rq:p"]]))[0] || [];
        const items = [];
        for (let i = 0; i < flat.length; i += 2) { const m = parse(flat[i + 1]); if (m) { items.push(m); } }
        if (items.length) {
            const counts = await redis(items.map(m => ["SCARD", "rq:u:" + m.imdb]));
            items.forEach((m, i) => { m.votes = Number(counts[i]) || 1; });
        }
        items.sort((a, b) => b.votes - a.votes || (a.at || 0) - (b.at || 0));
        return res.status(200).json({ items });
    }

    if (act === "drop" && req.method === "POST") {
        if (!A.isAdmin(req)) { return res.status(401).json({ error: "Admin key needed" }); }
        const b = await body(req);
        if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Bad id" }); }
        await redis([["HDEL", "rq:p", b.imdb], ["DEL", "rq:u:" + b.imdb]]);
        return res.status(200).json({ ok: true });
    }

    if (act === "add" && req.method === "POST") {
        const who = /^Bearer\s+/i.test(String(req.headers.authorization || "")) ? await verifyGoogleUser(req).catch(() => null) : null;
        if (!who) { return res.status(401).json({ error: "Please sign in with Google first." }); }
        const uk = A.uidKeyOf(who.uid);
        if (await overLimit("rqu", uk, DAILY_PER_USER, 86400)) { return res.status(429).json({ error: "You can send " + DAILY_PER_USER + " requests a day. Try again tomorrow." }); }
        const b = await body(req);
        if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Pick a title from the search results." }); }
        const [inReady, rawList, have] = await redis([["HEXISTS", "rdy:idx", b.imdb], ["GET", "aq:list"], ["HEXISTS", "rq:p", b.imdb]]);
        if (Number(inReady)) { return res.status(200).json({ status: "ready" }); }
        const list = parse(rawList);
        if (Array.isArray(list) && list.some(x => x && x.imdb === b.imdb)) { return res.status(200).json({ status: "queued" }); }
        if (!Number(have)) {
            if ((Number((await redis([["HLEN", "rq:p"]]))[0]) || 0) >= MAX_PENDING) { return res.status(503).json({ error: "The request list is full right now. Please try later." }); }
            const poster = /^https:\/\/image\.tmdb\.org\//.test(String(b.poster || "")) ? String(b.poster).slice(0, 200) : "";
            const rec = { imdb: b.imdb, title: clean(b.title, 120), year: String(b.year || "").replace(/\D/g, "").slice(0, 4), poster, type: b.type === "movie" ? "movie" : "tv", at: Date.now() };
            await redis([["HSETNX", "rq:p", b.imdb, JSON.stringify(rec)]]);
        }
        const added = Number((await redis([["SADD", "rq:u:" + b.imdb, uk], ["EXPIRE", "rq:u:" + b.imdb, 90 * 86400]]))[0]);
        // remember the e-mail so we can tell the person when the Sinhala subtitle is ready (kept 120 days, never shown anywhere)
        if (who.email) { await redis([["HSET", "rq:m:" + b.imdb, uk, who.email], ["EXPIRE", "rq:m:" + b.imdb, 120 * 86400]]); }
        return res.status(200).json({ status: added ? "sent" : "again" });
    }
    return res.status(404).json({ error: "Not found" });
};

// Called when a title becomes ready: one e-mail to everyone who requested it (needs RESEND_API_KEY + USER_MAIL_FROM), then forgotten.
module.exports.mailRequesters = async function (m) {
    try {
        if (!hasRedis() || !m || !m.id) { return 0; }
        const key = "rq:m:" + m.id;
        const flat = (await redis([["HGETALL", key]]))[0] || [];
        if (!flat.length) { return 0; }
        await redis([["DEL", key]]);
        const A = require("./_admin.js");
        const url = "https://sinsubs.site" + (m.type === "tv" ? "/tv/" : "/film/") + (m.slug || m.id);
        let n = 0;
        for (let i = 1; i < flat.length && n < 40; i += 2) {
            const ok = await A.mailUser(flat[i], "Your Sinhala subtitle is ready: " + (m.t || "your request"),
                "Hi,\n\nYou asked for a Sinhala subtitle for \"" + (m.t || "this title") + "\" on SinSubz. It is ready now:\n" + url + "\n\nEnjoy!\nSinSubz");
            if (ok) { n++; }
        }
        return n;
    } catch (e) { return 0; }
};
