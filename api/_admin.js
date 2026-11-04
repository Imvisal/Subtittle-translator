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

        // extra panels (indexes continue after the per-day pairs)
        const X = 12 + DAYS * 2;
        cmds.push(
            ["LRANGE", "contact:msgs", 0, 99],                 // X     newest contact messages
            ["GET", "admin:inbox_seen"],                       // X+1   when the inbox was last opened
            ["LRANGE", "cm:ids", 0, 7],                        // X+2   newest comment ids
            ["SMEMBERS", "u:blocked"],                         // X+3   blocked accounts
            ["ZREVRANGE", "stats:top", 0, 9, "WITHSCORES"]     // X+4   most translated titles (all time)
        );
        for (let i = 0; i < 7; i++) { cmds.push(["ZREVRANGE", "stats:top:" + days[i], 0, 29, "WITHSCORES"]); }   // X+5..X+11
        days.forEach(d => { cmds.push(["HGETALL", "h:d:" + d]); });                                              // X+12..X+25
        for (let i = 0; i < 7; i++) { cmds.push(["HGETALL", "h:k:" + days[i]]); }                                // X+26..X+32
        cmds.push(["GET", "prem:cfg"], ["HGETALL", "prem:req"]);
        const PLI = cmds.length - 2;
        cmds.push(["HGETALL", "u:prem"]);                                                                        // premium accounts
        const PRI = cmds.length - 1;
        cmds.push(["GET", "an:cur"]);                                                                            // current announcement
        const ANI = cmds.length - 1;
        cmds.push(["HGETALL", "q:" + pacificDay()]);                                                             // Gemini requests used today (Pacific day)
        const QI = cmds.length - 1;

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
        const blocked = new Set(Array.isArray(r[X + 3]) ? r[X + 3] : []);
        const prem = pairs(r[PRI]);
        const users = Object.keys(info).map(k => {
            const u = parse(info[k]) || {};
            return { id: k.slice(0, 8), k: k, blocked: blocked.has(k), name: u.n || "", email: u.e || "", photo: u.p || "", first: u.f || 0, last: u.l || 0, platform: u.pl || "web", translated: Number(tc[k]) || 0, premium: Number(prem[k]) > Date.now() ? Number(prem[k]) : 0 };
        }).sort((a, b) => b.last - a.last);

        const platforms = { web: 0, android: 0, windows: 0 };
        users.forEach(u => { platforms[u.platform] = (platforms[u.platform] || 0) + 1; });
        const startOf = d => Date.parse(d + "T00:00:00+05:30");

        const daily = days.map((d, i) => {
            const h = pairs(r[12 + i * 2]);
            const from = startOf(d), to = from + 86400e3;
            return {
                day: d,
                translated: Number(h.translated) || 0,
                synced: Number(h.synced) || 0,
                users: Number(r[13 + i * 2]) || 0,
                newUsers: users.filter(u => u.first >= from && u.first < to).length,
                libHit: Number(h.libhit) || 0,
                libMiss: Number(h.libmiss) || 0
            };
        }).reverse();

        // most translated titles
        const zpairs = flat => {
            const out = [];
            if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) { out.push([String(flat[i]), Number(flat[i + 1]) || 0]); } }
            return out;
        };
        const weekMap = new Map();
        for (let i = 0; i < 7; i++) { zpairs(r[X + 5 + i]).forEach(([n, c]) => weekMap.set(n, (weekMap.get(n) || 0) + c)); }
        const topWeek = [...weekMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => ({ n, c }));
        const topAll = zpairs(r[X + 4]).map(([n, c]) => ({ n, c }));

        // errors + API key health (counters written by api/translate.js)
        const healthDaily = days.map((d, i) => {
            const h = pairs(r[X + 12 + i]);
            return { day: d, ok: Number(h.ok) || 0, json: Number(h.json) || 0, quota: Number(h.quota) || 0, busy: Number(h.busy) || 0, other: Number(h.other) || 0, salvaged: Number(h.salvaged) || 0 };
        }).reverse();
        const keyMap = {};
        for (let i = 0; i < 7; i++) {
            const h = pairs(r[X + 26 + i]);
            Object.keys(h).forEach(f => {
                const [n, kind] = f.split(":");
                keyMap[n] = keyMap[n] || { n: Number(n), ok: 0, q429: 0, bad: 0, err: 0, today: 0 };
                const v = Number(h[f]) || 0;
                if (kind === "ok") { keyMap[n].ok += v; if (i === 0) { keyMap[n].today += v; } }
                else if (kind === "429") { keyMap[n].q429 += v; }
                else if (kind === "bad") { keyMap[n].bad += v; }
                else { keyMap[n].err += v; }
            });
        }
        const keyHealth = Object.values(keyMap).sort((a, b) => a.n - b.n);

        // inbox + comments
        const seen = Number(r[X + 1]) || 0;
        const msgs = (r[X] || []).map(parse).filter(Boolean);
        const unread = msgs.filter(m => Date.parse(m.t) > seen).length;
        const recentMessages = msgs.slice(0, 5).map(m => ({ id: m.id, t: m.t, name: m.name || "", email: m.email || "", text: String(m.message || "").slice(0, 160), unread: Date.parse(m.t) > seen }));
        const cids = Array.isArray(r[X + 2]) ? r[X + 2] : [];
        let recentComments = [];
        if (cids.length) {
            const [raws] = await redis([["MGET", ...cids.map(id => "cm:c:" + id)]]);
            recentComments = (raws || []).map(parse).filter(Boolean).map(c => ({ id: c.id, t: c.t, name: c.name || "", text: String(c.text || "").slice(0, 160), film: c.film || "" }));
        }

        const today = daily[daily.length - 1];
        const startOfToday = Date.parse(dayKey(0) + "T00:00:00+05:30");

        return res.status(200).json({
            announcement: parse(r[ANI]),
            plan: (function () {
                const reqs = Object.values(pairs(r[PLI + 1])).map(parse).filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 30);
                return { config: parse(r[PLI]) || { price: "", bank: "", enabled: false }, requests: reqs, pending: reqs.filter(x => x.status === "pending").length };
            })(),
            quota: (function () {
                const used = pairs(r[QI]);
                const limit = Math.max(1, Number(process.env.GEMINI_DAILY_LIMIT) || 1000);
                const n = Math.max(geminiKeys().length, 1);
                const list = [];
                for (let i = 1; i <= n; i++) {
                    const u = Number(used[String(i)]) || 0, dead = Number(used[i + ":x"]) > 0;
                    list.push({ n: i, used: u, exhausted: dead, left: dead ? 0 : Math.max(0, Math.round((1 - u / limit) * 100)) });
                }
                return { limit: limit, resetAt: pacificResetAt(), keys: list };
            })(),
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
            usersShown: Math.min(users.length, MAX_USERS_SHOWN),
            platforms: platforms,
            top: { week: topWeek, all: topAll },
            health: { daily: healthDaily, keys: keyHealth },
            inbox: { total: msgs.length, unread: unread, recent: recentMessages },
            comments: recentComments
        });
    } catch (e) {
        return res.status(200).json({ enabled: false, error: String((e && e.message) || e).slice(0, 80) });
    }
}

// ---------------------------------------------------------------- admin: health check
function geminiKeys() {
    const list = [];
    if (process.env.GEMINI_API_KEYS) { list.push(...process.env.GEMINI_API_KEYS.split(",")); }
    list.push(process.env.GEMINI_API_KEY);
    for (let i = 2; i <= 10; i++) { list.push(process.env["GEMINI_API_KEY_" + i]); }
    return [...new Set(list.map(k => (k || "").trim()).filter(Boolean))];
}

async function probe(name, run) {
    const t0 = Date.now();
    try {
        const note = await run();
        return { name: name, ok: true, ms: Date.now() - t0, note: note || "OK" };
    } catch (e) {
        return { name: name, ok: false, ms: Date.now() - t0, note: String((e && e.message) || e).slice(0, 80) };
    }
}

async function health(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!process.env.ADMIN_KEY) { return res.status(503).json({ error: "ADMIN_KEY is not set in Vercel" }); }
    if (limited("h:" + clientIp(req), 6)) { return res.status(429).json({ error: "Too many tries. Wait a minute." }); }
    if (!isAdmin(req)) { return res.status(401).json({ error: "Wrong admin key" }); }

    const get = (url, init) => fetch(url, Object.assign({ signal: AbortSignal.timeout(7000) }, init || {}));
    const checks = [];

    geminiKeys().forEach((key, i) => {
        checks.push(probe("Gemini key #" + (i + 1), async () => {
            const r = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": key } });
            if (!r.ok) { throw new Error("HTTP " + r.status + (r.status === 400 || r.status === 403 ? " (key rejected)" : "")); }
        }));
    });
    if (!geminiKeys().length) { checks.push(Promise.resolve({ name: "Gemini keys", ok: false, ms: 0, note: "none set" })); }

    checks.push(probe("TMDB", async () => {
        const k = process.env.TMDB_API_KEY;
        if (!k) { throw new Error("TMDB_API_KEY not set"); }
        const tok = k.length > 40;
        const r = await get("https://api.themoviedb.org/3/configuration" + (tok ? "" : "?api_key=" + encodeURIComponent(k)), tok ? { headers: { Authorization: "Bearer " + k } } : {});
        if (!r.ok) { throw new Error("HTTP " + r.status); }
    }));
    checks.push(probe("OMDb", async () => {
        const k = process.env.OMDB_API_KEY;
        if (!k) { throw new Error("OMDB_API_KEY not set"); }
        const r = await get("https://www.omdbapi.com/?apikey=" + encodeURIComponent(k) + "&i=tt0111161");
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.Response === "False") { throw new Error(String(d.Error || "HTTP " + r.status)); }
    }));
    checks.push(probe("SubDL", async () => {
        const k = process.env.SUBDL_API_KEY;
        if (!k) { throw new Error("SUBDL_API_KEY not set"); }
        const r = await get("https://api.subdl.com/api/v1/subtitles?api_key=" + encodeURIComponent(k) + "&imdb_id=tt0111161&type=movie&languages=EN");
        if (!r.ok) { throw new Error("HTTP " + r.status); }
    }));
    checks.push(probe("Redis database", async () => {
        const [pong] = await redis([["PING"]]);
        if (pong !== "PONG") { throw new Error("no answer"); }
    }));

    return res.status(200).json({ checked: Date.now(), results: await Promise.all(checks) });
}

// Gemini's daily quota resets at midnight in California (Pacific time), not at midnight in Sri Lanka.
function pacificParts(ms) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(ms));
    const g = t => parts.find(p => p.type === t).value;
    return { day: g("year") + "-" + g("month") + "-" + g("day"), secs: (Number(g("hour")) % 24) * 3600 + Number(g("minute")) * 60 + Number(g("second")) };
}
function pacificDay() { return pacificParts(Date.now()).day; }
function pacificResetAt() { return Date.now() + (86400 - pacificParts(Date.now()).secs) * 1000; }

// ---------------------------------------------------------------- login required to translate
// Verified Google user for this request (cached 5 min per token so a film's ~35 chunks do not ask Google 35 times).
const authCache = new Map();
async function authUser(req) {
    const h = String((req.headers && req.headers.authorization) || "");
    if (!/^Bearer\s+/i.test(h)) { return null; }
    const ck = sha(h).toString("hex").slice(0, 32);
    const hit = authCache.get(ck);
    if (hit && hit.exp > Date.now()) { return hit.who; }
    const who = await verifyGoogleUser(req).catch(() => null);
    if (who) {
        authCache.set(ck, { who: who, exp: Date.now() + 5 * 60 * 1000 });
        if (authCache.size > 2000) { for (const [k, v] of authCache) { if (v.exp < Date.now()) { authCache.delete(k); } } }
    }
    return who;
}

// The Windows app has no Google sign-in yet, so it is let through (the per-IP daily limit still applies to it).
function loginRequired(who, req) {
    if (who) { return false; }
    if (String(process.env.REQUIRE_LOGIN || "1") === "0") { return false; }
    const ua = String((req.headers && req.headers["user-agent"]) || "");
    if (/Electron\//.test(ua)) { return false; }
    // Android apps older than 1.1.31 cannot send a Google token yet: let them through until the new app is out.
    // Set LOGIN_EXEMPT_ANDROID=0 in Vercel when people have updated.
    if (String(process.env.LOGIN_EXEMPT_ANDROID || "1") !== "0" && /;\s*wv\)/.test(ua)) { return false; }
    return true;
}

// ---------------------------------------------------------------- premium
// Hash u:prem: uidKey -> expiry time in ms. The owner gives premium from the admin panel (days from today,
// or added to the time still left). Premium accounts get higher daily limits and no ads in the Android app.
const premCache = new Map();            // uidKey -> { until, exp }
async function premiumUntil(uidKey) {
    try {
        const hit = premCache.get(uidKey);
        if (hit && hit.exp > Date.now()) { return hit.until; }
        const [v] = await redis([["HGET", "u:prem", uidKey]]);
        const until = Number(v) || 0;
        premCache.set(uidKey, { until: until, exp: Date.now() + 60 * 1000 });
        if (premCache.size > 3000) { for (const [k, e] of premCache) { if (e.exp < Date.now()) { premCache.delete(k); } } }
        return until;
    } catch (e) { return 0; }
}
function envNum(name, dflt) {
    const v = process.env[name];
    return v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : dflt;
}

// ---------------------------------------------------------------- Premium purchase by bank transfer
// prem:cfg        JSON { price, bank, enabled }   (set in the admin panel, the bank text is shown to everyone)
// prem:req        hash id -> JSON request (no photo)   prem:slip:<id>  slip photo as a data URL (kept 90 days, deleted when handled)
// prem:rl:<key>   at most 3 requests a day per account.  Approving adds 30 days to u:prem (same as "Give premium").
function cleanPlanCfg(c) {
    c = c && typeof c === "object" ? c : {};
    return {
        price: clean(c.price, 40),
        holder: clean(c.holder, 80), bankName: clean(c.bankName, 80), branch: clean(c.branch, 80), account: clean(c.account, 40),
        bank: String(c.bank || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 600).trim(),
        enabled: c.enabled !== false
    };
}

// GET /api/stats?plan=1 -> price, bank details and the signed-in user's own request / premium status
async function planPublic(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(200).json({ enabled: false }); }
    try {
        const who = await authUser(req);
        const key = who ? uidKeyOf(who.uid) : "";
        const cmds = [["GET", "prem:cfg"]];
        if (key) { cmds.push(["HGET", "u:prem", key], ["HGETALL", "prem:req"]); }
        const r = await redis(cmds);
        const cfg = Object.assign({ price: "", bank: "", enabled: false }, parse(r[0]) || {});
        const out = {
            enabled: !!(cfg.enabled && (cfg.bank || cfg.account)), price: cfg.price, bank: cfg.bank || "",
            holder: cfg.holder || "", bankName: cfg.bankName || "", branch: cfg.branch || "", account: cfg.account || "", days: 30,
            movies: envNum("PREMIUM_MOVIES_PER_DAY", 10), episodes: envNum("PREMIUM_EPISODES_PER_DAY", 30),
            freeMovies: envNum("LIMIT_MOVIES_PER_DAY", 2), freeEpisodes: envNum("LIMIT_EPISODES_PER_DAY", 5),
            signedIn: !!who
        };
        if (who) {
            const until = Number(r[1]) || 0;
            out.until = until > Date.now() ? until : 0;
            const mine = Object.values(pairs(r[2])).map(parse).filter(x => x && x.uk === key).sort((a, b) => b.t - a.t)[0];
            out.request = mine ? { t: mine.t, status: mine.status, ref: mine.ref } : null;
        }
        return res.status(200).json(out);
    } catch (e) {
        return res.status(200).json({ enabled: false });
    }
}

// POST /api/stats?plan=1  { ref, slip: "data:image/jpeg;base64,..." }
async function planSubmit(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!hasRedis()) { return res.status(503).json({ error: "Not available right now." }); }
    if (limited("p:" + clientIp(req), 10)) { return res.status(429).json({ error: "Too many requests. Wait a minute." }); }
    try {
        const who = await authUser(req);
        if (!who) { return res.status(401).json({ error: "Please sign in with Google first." }); }
        const key = uidKeyOf(who.uid);
        const b = req.body && typeof req.body === "object" ? req.body : {};
        const ref = clean(b.ref, 80);
        if (ref.length < 3) { return res.status(400).json({ error: "Write the transfer reference or the name on the transfer." }); }
        const slip = String(b.slip || "");
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(slip) || slip.length > 700000) {
            return res.status(400).json({ error: "Upload a photo of the slip (JPG or PNG, a small file)." });
        }
        const [all] = await redis([["HGETALL", "prem:req"]]);
        if (Object.values(pairs(all)).map(parse).some(x => x && x.uk === key && x.status === "pending")) {
            return res.status(409).json({ error: "You already have a request waiting for approval." });
        }
        const [n] = await redis([["INCR", "prem:rl:" + key], ["EXPIRE", "prem:rl:" + key, 86400]]);
        if (Number(n) > 3) { return res.status(429).json({ error: "Too many requests today. Try again tomorrow." }); }
        const id = require("crypto").randomBytes(6).toString("hex");
        const rec = { id: id, uk: key, name: clean(who.name, 60), email: clean(who.email, 120), ref: ref, t: Date.now(), status: "pending" };
        await redis([["SET", "prem:slip:" + id, slip, "EX", 90 * 86400], ["HSET", "prem:req", id, JSON.stringify(rec)]]);
        return res.status(200).json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: "Could not send. Try again." });
    }
}

// GET /api/stats?me=1 : the signed-in user's own plan (the apps hide ads and show a badge when premium).
async function me(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
        const who = await authUser(req);
        if (!who) { return res.status(200).json({ signedIn: false, premium: false }); }
        const until = hasRedis() ? await premiumUntil(uidKeyOf(who.uid)) : 0;
        const premium = until > Date.now();
        return res.status(200).json({
            signedIn: true, premium: premium, until: premium ? until : 0,
            movies: premium ? envNum("PREMIUM_MOVIES_PER_DAY", 10) : envNum("LIMIT_MOVIES_PER_DAY", 2),
            episodes: premium ? envNum("PREMIUM_EPISODES_PER_DAY", 30) : envNum("LIMIT_EPISODES_PER_DAY", 5)
        });
    } catch (e) {
        return res.status(200).json({ signedIn: false, premium: false });
    }
}

// ---------------------------------------------------------------- daily limit per user
// One user (signed-in Google account, otherwise the visitor's IP address) may translate
// LIMIT_MOVIES_PER_DAY films (default 2) and LIMIT_EPISODES_PER_DAY TV episodes (default 5) per Sri Lanka day.
// A film / episode counts ONCE however many requests it needs (a film is ~35). "0" in the env var = no limit.
// The owner account is exempt. Used by api/translate.js. Never throws: if the database is down, translating still works.
const limitCache = new Map();           // "<user>|<job>" -> expiry ms (skip the database for the rest of a running job)

function jobName(raw) {
    return String(raw || "").replace(/\.(Sinhala\.SinSubz|synced)(\.srt)?$/i, "").replace(/\.srt$/i, "")
        .replace(/[._]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
}

async function checkDailyLimit(req, rawJob, knownWho) {
    try {
        if (!hasRedis()) { return { ok: true }; }
        const job = jobName(rawJob) || "untitled";
        const isEpisode = /\bs\d{1,2}\s?e\d{1,3}\b/i.test(job) || /\b\d{1,2}x\d{2}\b/i.test(job);

        const who = knownWho !== undefined ? knownWho : await authUser(req);
        if (who && who.owner) { return { ok: true }; }
        const isPrem = who ? (await premiumUntil(uidKeyOf(who.uid))) > Date.now() : false;
        const maxMovies = isPrem ? envNum("PREMIUM_MOVIES_PER_DAY", 10) : envNum("LIMIT_MOVIES_PER_DAY", 2);
        const maxEps = isPrem ? envNum("PREMIUM_EPISODES_PER_DAY", 30) : envNum("LIMIT_EPISODES_PER_DAY", 5);
        const max = isEpisode ? maxEps : maxMovies;
        if (!(max > 0)) { return { ok: true }; }
        const user = who ? "u" + uidKeyOf(who.uid) : "i" + sha(clientIp(req)).toString("hex").slice(0, 20);

        const cacheKey = user + "|" + job + "|" + dayKey(0);
        if ((limitCache.get(cacheKey) || 0) > Date.now()) { return { ok: true }; }

        const setKey = "lim:" + dayKey(0) + ":" + user + ":" + (isEpisode ? "e" : "m");
        const [already] = await redis([["SISMEMBER", setKey, job]]);
        if (Number(already) !== 1) {
            const [count] = await redis([["SCARD", setKey]]);
            if ((Number(count) || 0) >= max) {
                await redis([["HINCRBY", "stats:d:" + dayKey(0), "limited", 1]]).catch(() => null);
                return {
                    ok: false, isEpisode: isEpisode, max: max,
                    message: "Daily limit reached: you can translate " + maxMovies + " films and " + maxEps +
                        " TV episodes per day." + (isPrem ? " Please try again tomorrow." : " Premium members get more every day. Please try again tomorrow.")
                };
            }
            await redis([["SADD", setKey, job], ["EXPIRE", setKey, 2 * 86400]]);
        }
        limitCache.set(cacheKey, Date.now() + 30 * 60 * 1000);
        if (limitCache.size > 3000) { for (const [k, v] of limitCache) { if (v < Date.now()) { limitCache.delete(k); } } }
        return { ok: true };
    } catch (e) {
        return { ok: true };
    }
}

// ---------------------------------------------------------------- announcements
// The apps fetch /announcement.json; vercel.json rewrites that to /api/stats?announcement=1.
function cleanAnnouncement(a) {
    a = a && typeof a === "object" ? a : {};
    const https = u => (/^https:\/\/\S{3,500}$/i.test(String(u || "").trim()) ? String(u).trim() : "");
    const id = String(a.id || "").trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(id)) { return { error: "ID must be 1-40 letters, digits, - _ ." }; }
    const title = clean(a.title, 100);
    const body = String(a.body || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 600).trim();
    if (!title && !body) { return { error: "Write a title or a message" }; }
    const expires = String(a.expires || "").trim();
    if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) { return { error: "Expires must look like 2026-12-31" }; }
    if (a.image && !https(a.image)) { return { error: "Image must be an https link" }; }
    if (a.url && !https(a.url)) { return { error: "Link must be an https link" }; }
    const platforms = (Array.isArray(a.platforms) ? a.platforms : []).filter(p => p === "android" || p === "windows");
    return { value: {
        enabled: a.enabled !== false, id: id, title: title, body: body,
        image: https(a.image), url: https(a.url),
        openLabel: clean(a.openLabel, 30) || "Open", laterLabel: clean(a.laterLabel, 30) || "Not now",
        platforms: platforms.length ? platforms : ["android", "windows"], expires: expires
    } };
}

async function publicAnnouncement(req, res) {
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    if (!hasRedis()) { return res.status(200).json({ enabled: false }); }
    try {
        const [raw] = await redis([["GET", "an:cur"]]);
        return res.status(200).json(parse(raw) || { enabled: false });
    } catch (e) {
        return res.status(200).json({ enabled: false });
    }
}

// ---------------------------------------------------------------- admin: actions
async function action(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!process.env.ADMIN_KEY) { return res.status(503).json({ error: "ADMIN_KEY is not set in Vercel" }); }
    if (limited("x:" + clientIp(req), 30)) { return res.status(429).json({ error: "Too many tries. Wait a minute." }); }
    if (!isAdmin(req)) { return res.status(401).json({ error: "Wrong admin key" }); }
    if (!hasRedis()) { return res.status(503).json({ error: "Database not connected" }); }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const what = String(body.action || "");
    const id = clean(body.id, 40);

    try {
        if (what === "block" || what === "unblock") {
            if (!/^[0-9a-f]{24}$/.test(id)) { return res.status(400).json({ error: "Bad id" }); }
            await redis([[what === "block" ? "SADD" : "SREM", "u:blocked", id]]);
            return res.status(200).json({ ok: true });
        }
        if (what === "premium" || what === "premiumOff") {
            if (!/^[0-9a-f]{24}$/.test(id)) { return res.status(400).json({ error: "Bad id" }); }
            if (what === "premiumOff") {
                await redis([["HDEL", "u:prem", id]]);
                premCache.delete(id);
                return res.status(200).json({ ok: true });
            }
            const days = Math.floor(Number(body.days));
            if (!(days >= 1 && days <= 3650)) { return res.status(400).json({ error: "Days must be 1 to 3650" }); }
            const [cur] = await redis([["HGET", "u:prem", id]]);
            const from = Math.max(Date.now(), Number(cur) || 0);
            const until = from + days * 86400e3;
            await redis([["HSET", "u:prem", id, String(until)]]);
            premCache.delete(id);
            return res.status(200).json({ ok: true, until: until });
        }
        if (what === "planConfig") {
            await redis([["SET", "prem:cfg", JSON.stringify(cleanPlanCfg(body.config))]]);
            return res.status(200).json({ ok: true });
        }
        if (what === "planSlip") {
            if (!/^[0-9a-f]{12}$/.test(id)) { return res.status(400).json({ error: "Bad id" }); }
            const [slip] = await redis([["GET", "prem:slip:" + id]]);
            return res.status(200).json({ slip: slip || "" });
        }
        if (what === "planApprove" || what === "planReject") {
            if (!/^[0-9a-f]{12}$/.test(id)) { return res.status(400).json({ error: "Bad id" }); }
            const [raw] = await redis([["HGET", "prem:req", id]]);
            const rq = parse(raw);
            if (!rq) { return res.status(404).json({ error: "Request not found" }); }
            if (rq.status !== "pending") { return res.status(409).json({ error: "Already " + rq.status }); }
            if (what === "planApprove") {
                const days = Math.min(Math.max(Math.round(Number(body.days) || 30), 1), 366);
                const [cur] = await redis([["HGET", "u:prem", rq.uk]]);
                const until = Math.max(Date.now(), Number(cur) || 0) + days * 86400e3;
                await redis([["HSET", "u:prem", rq.uk, String(until)]]);
                premCache.delete(rq.uk);
                rq.status = "approved"; rq.until = until;
            } else { rq.status = "rejected"; }
            rq.done = Date.now();
            await redis([["HSET", "prem:req", id, JSON.stringify(rq)], ["DEL", "prem:slip:" + id]]);
            return res.status(200).json({ ok: true });
        }
        if (what === "announce") {
            const c = cleanAnnouncement(body.announcement);
            if (c.error) { return res.status(400).json({ error: c.error }); }
            await redis([["SET", "an:cur", JSON.stringify(c.value)]]);
            return res.status(200).json({ ok: true });
        }
        if (what === "announceStop") {
            const [raw] = await redis([["GET", "an:cur"]]);
            const cur = parse(raw);
            if (cur) { cur.enabled = false; await redis([["SET", "an:cur", JSON.stringify(cur)]]); }
            return res.status(200).json({ ok: true });
        }
        if (what === "deleteComment") {
            if (!id) { return res.status(400).json({ error: "Bad id" }); }
            await redis([["DEL", "cm:c:" + id, "cm:r:" + id], ["LREM", "cm:ids", 1, id]]);
            return res.status(200).json({ ok: true });
        }
        if (what === "inboxSeen") {
            await redis([["SET", "admin:inbox_seen", String(Date.now())]]);
            return res.status(200).json({ ok: true });
        }
        return res.status(400).json({ error: "Unknown action" });
    } catch (e) {
        return res.status(500).json({ error: "Could not do that" });
    }
}

module.exports = { planPublic, planSubmit, me, premiumUntil, authUser, loginRequired, checkDailyLimit, pacificDay, ping, overview, health, action, publicAnnouncement, cleanAnnouncement, dayKey, uidKeyOf };
