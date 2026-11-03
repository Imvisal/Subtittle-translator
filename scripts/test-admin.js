// node scripts/test-admin.js   fake Redis + fake Google: stats counters, user pings, admin panel data
"use strict";
process.env.KV_REST_API_URL = "http://redis.test";
process.env.KV_REST_API_TOKEN = "t";
process.env.ADMIN_KEY = "secret-key-123";

const db = { kv: {}, hash: {}, set: {}, list: {}, ttl: {} };
const realFetch = global.fetch;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

function run(c) {
    const [cmd, k, ...a] = c;
    switch (cmd) {
        case "GET": return db.kv[k] == null ? null : db.kv[k];
        case "SET": { const nx = a.includes("NX"); if (nx && db.kv[k] != null) return null; db.kv[k] = String(a[0]); return "OK"; }
        case "INCR": db.kv[k] = String((Number(db.kv[k]) || 0) + 1); return Number(db.kv[k]);
        case "EXPIRE": db.ttl[k] = a[0]; return 1;
        case "SADD": { const s = (db.set[k] = db.set[k] || new Set()); const had = s.has(a[0]); s.add(a[0]); return had ? 0 : 1; }
        case "SCARD": return db.set[k] ? db.set[k].size : 0;
        case "HSET": { (db.hash[k] = db.hash[k] || {})[a[0]] = a[1]; return 1; }
        case "HGET": return (db.hash[k] || {})[a[0]] == null ? null : db.hash[k][a[0]];
        case "HLEN": return Object.keys(db.hash[k] || {}).length;
        case "HINCRBY": { const h = (db.hash[k] = db.hash[k] || {}); h[a[0]] = String((Number(h[a[0]]) || 0) + Number(a[1])); return Number(h[a[0]]); }
        case "HGETALL": return Object.entries(db.hash[k] || {}).flat();
        case "LPUSH": (db.list[k] = db.list[k] || []).unshift(a[0]); return db.list[k].length;
        case "LTRIM": db.list[k] = (db.list[k] || []).slice(a[0], a[1] + 1); return "OK";
        case "LRANGE": return (db.list[k] || []).slice(a[0], a[1] + 1);
        case "LLEN": return (db.list[k] || []).length;
        case "ZINCRBY": { const z = (db.z = db.z || {}); const m = (z[k] = z[k] || {}); m[a[1]] = (m[a[1]] || 0) + Number(a[0]); return String(m[a[1]]); }
        case "ZREVRANGE": { const m = (db.z || {})[k] || {}; return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(a[0], a[1] + 1).flatMap(([n, c]) => [n, String(c)]); }
        case "SMEMBERS": return db.set[k] ? [...db.set[k]] : [];
        case "SISMEMBER": return db.set[k] && db.set[k].has(a[0]) ? 1 : 0;
        case "SREM": return db.set[k] && db.set[k].delete(a[0]) ? 1 : 0;
        case "MGET": return [k, ...a].map(x => (db.kv[x] == null ? null : db.kv[x]));
        case "DEL": [k, ...a].forEach(x => { delete db.kv[x]; delete db.list[x]; }); return 1;
        case "LREM": { const l = db.list[k] || []; const i = l.indexOf(String(a[1])); if (i >= 0) l.splice(i, 1); return i >= 0 ? 1 : 0; }
        case "PING": return "PONG";
        case "SCAN": return ["0", Object.keys(db.hash).filter(x => x.startsWith("lib:t:"))];
        default: throw new Error("unsupported " + cmd);
    }
}

const users = { "tok-visal": { localId: "uid-1", displayName: "Visal", email: "v@example.com", photoUrl: "https://lh3.example/p1.jpg", emailVerified: true },
                "tok-base": { localId: "uid-9", displayName: "Base", email: "b@example.com", emailVerified: true },
                "tok-nimal": { localId: "uid-2", displayName: "Nimal", email: "n@example.com", emailVerified: true } };
global.fetch = async (url, opt) => {
    if (String(url).startsWith("http://redis.test")) {
        const out = JSON.parse(opt.body).map(c => ({ result: run(c) }));
        return { ok: true, status: 200, json: async () => out };
    }
    if (String(url).includes("generativelanguage.googleapis.com/v1beta/models?")) {
        const bad = opt && opt.headers && opt.headers["x-goog-api-key"] === "bad-gemini";
        return { ok: !bad, status: bad ? 400 : 200, json: async () => ({}) };
    }
    if (String(url).includes("api.themoviedb.org")) { return { ok: true, status: 200, json: async () => ({}) }; }
    if (String(url).includes("omdbapi.com")) { return { ok: true, status: 200, json: async () => ({ Response: "True" }) }; }
    if (String(url).includes("api.subdl.com")) { return { ok: false, status: 403, json: async () => ({}) }; }
    if (String(url).includes("identitytoolkit")) {
        const u = users[JSON.parse(opt.body).idToken];
        return { ok: !!u, status: u ? 200 : 400, json: async () => ({ users: u ? [u] : [] }) };
    }
    if (String(url).includes("generativelanguage")) { return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) }; }
    return realFetch(url, opt);
};

const stats = require("../api/stats.js");
let ipN = 0;
function call(method, url, { headers = {}, body } = {}) {
    return new Promise(resolve => {
        const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
            json(o) { resolve({ code: this.code, body: o, headers: this.headers }); }, end() { resolve({ code: this.code, body: null, headers: this.headers }); } };
        const req = { method, url, headers: Object.assign({ "x-forwarded-for": "9.9.9." + (++ipN) }, headers), body, socket: {} };
        Promise.resolve(stats(req, res)).catch(e => resolve({ code: 500, body: String(e) }));
    });
}

(async () => {
    // translations: one anonymous, two from signed-in users
    await call("POST", "/api/stats", { body: { type: "translated", name: "Zootopia.2.2025.Sinhala.SinSubz.srt".replace(/\.srt$/, "") } });
    await call("POST", "/api/stats", { headers: { authorization: "Bearer tok-visal" }, body: { type: "translated", name: "The.Mentalist.S01E01.Sinhala.SinSubz" } });
    await call("POST", "/api/stats", { headers: { authorization: "Bearer tok-visal" }, body: { type: "translated", name: "Verity.2026.Sinhala.SinSubz" } });
    await call("POST", "/api/stats", { headers: { authorization: "Bearer bad-token" }, body: { type: "translated", name: "Fake.Movie.Sinhala.SinSubz" } });
    await call("POST", "/api/stats", { body: { type: "synced", name: "x.synced" } });

    // user pings
    ok((await call("POST", "/api/stats?user=1", { headers: { authorization: "Bearer tok-visal" }, body: { platform: "web" } })).code === 204, "ping ok");
    ok((await call("POST", "/api/stats?user=1", { headers: { authorization: "Bearer tok-nimal" }, body: { platform: "android" } })).code === 204, "ping 2");
    ok((await call("POST", "/api/stats?user=1", { headers: { authorization: "Bearer tok-visal" }, body: { platform: "web" } })).code === 204, "second ping within 15 min is skipped");
    ok((await call("POST", "/api/stats?user=1", { headers: { authorization: "Bearer nope" } })).code === 401, "bad token refused");
    ok((await call("POST", "/api/stats?user=1", {})).code === 401, "no token refused");
    ok(Object.keys(db.hash["u:info"]).length === 2, "two accounts stored, not three");
    ok(!JSON.stringify(db).includes("uid-1"), "raw Firebase uid is never stored");

    // admin panel
    ok((await call("GET", "/api/stats?admin=1")).code === 401, "admin: no key");
    ok((await call("GET", "/api/stats?admin=1", { headers: { "x-admin-key": "wrong" } })).code === 401, "admin: wrong key");
    const r = await call("GET", "/api/stats?admin=1", { headers: { "x-admin-key": "secret-key-123" } });
    ok(r.code === 200 && r.body.enabled, "admin: right key");
    const b = r.body;
    ok(b.totals.translated === 4, "translated total 4 (got " + b.totals.translated + ")");
    ok(b.totals.users === 2, "2 users");
    ok(b.today.translated === 4 && b.today.activeUsers === 2 && b.today.newUsers === 2, "today numbers " + JSON.stringify(b.today));
    ok(b.daily.length === 14 && b.daily[13].translated === 4 && b.daily[13].synced === 1, "14 days, last = today");
    ok(b.recent.length === 4 && b.recent[0].n === "Fake Movie", "recent list newest first: " + JSON.stringify(b.recent[0]));
    const v = b.users.find(u => u.email === "v@example.com");
    ok(v && v.translated === 2 && v.name === "Visal" && v.photo.startsWith("https://"), "Visal has 2 translations and a photo");
    ok(b.users.find(u => u.email === "n@example.com").platform === "android", "platform kept");
    ok(b.totals.movies === 3 && b.totals.series === 1 && b.totals.episodes === 1, "movies/series/episodes: " + JSON.stringify(b.totals));
    ok(!JSON.stringify(b).includes("uid-"), "no raw uid in the admin answer");
    ok(r.headers["Cache-Control"] === "no-store", "admin answer is not cached");

    // the public GET still works and shows no personal data
    const pub = await call("GET", "/api/stats");
    ok(pub.code === 200 && pub.body.translated === 4 && !("users" in pub.body), "public counters unchanged");

    // ---- new panels ----
    const day = require("../api/_admin.js").dayKey(0);
    ok(b.top.all.length === 4 && b.top.all[0].c === 1, "top titles all-time: " + JSON.stringify(b.top.all));
    ok(b.top.week.some(x => x.n === "the mentalist"), "top titles week counts the series as one title");
    ok(b.platforms.web === 1 && b.platforms.android === 1 && b.platforms.windows === 0, "platform split " + JSON.stringify(b.platforms));
    ok(b.daily[13].newUsers === 2, "new accounts per day");

    // health counters (what translate.js writes) show up per day and per key
    db.hash["h:d:" + day] = { ok: "5", json: "2", salvaged: "1", quota: "1" };
    db.hash["h:k:" + day] = { "1:ok": "4", "2:ok": "1", "1:429": "3", "3:bad": "1" };
    db.hash["stats:d:" + day].libhit = "6"; db.hash["stats:d:" + day].libmiss = "2";
    let r2 = await call("GET", "/api/stats?admin=1", { headers: { "x-admin-key": "secret-key-123" } });
    const hh = r2.body.health;
    ok(hh.daily[13].ok === 5 && hh.daily[13].json === 2 && hh.daily[13].quota === 1 && hh.daily[13].salvaged === 1, "health daily " + JSON.stringify(hh.daily[13]));
    const k1 = hh.keys.find(k => k.n === 1), k3 = hh.keys.find(k => k.n === 3);
    ok(k1.ok === 4 && k1.today === 4 && k1.q429 === 3 && k3.bad === 1, "per-key health " + JSON.stringify(hh.keys));
    ok(r2.body.daily[13].libHit === 6 && r2.body.daily[13].libMiss === 2, "library hit/miss per day");

    // inbox + comments
    db.list["contact:msgs"] = [JSON.stringify({ id: "m1", t: new Date().toISOString(), name: "Kasun", email: "k@example.com", message: "hello admin" })];
    db.list["cm:ids"] = ["c1"]; db.kv["cm:c:c1"] = JSON.stringify({ id: "c1", t: Date.now(), name: "Nimal", text: "nice site", film: "Verity", uid: "uid-2" });
    r2 = await call("GET", "/api/stats?admin=1", { headers: { "x-admin-key": "secret-key-123" } });
    ok(r2.body.inbox.total === 1 && r2.body.inbox.unread === 1 && r2.body.inbox.recent[0].text === "hello admin", "inbox unread " + JSON.stringify(r2.body.inbox));
    ok(r2.body.comments.length === 1 && r2.body.comments[0].text === "nice site", "latest comments");
    const AK = { "x-admin-key": "secret-key-123" };
    ok((await call("POST", "/api/stats?admin=1", { headers: AK, body: { action: "inboxSeen" } })).code === 200, "inboxSeen");
    await new Promise(r => setTimeout(r, 5));
    r2 = await call("GET", "/api/stats?admin=1", { headers: AK });
    ok(r2.body.inbox.unread === 0, "after inboxSeen nothing is unread");

    // admin actions need the key; block / unblock / delete comment
    ok((await call("POST", "/api/stats?admin=1", { body: { action: "block", id: "a".repeat(24) } })).code === 401, "action without key refused");
    ok((await call("POST", "/api/stats?admin=1", { headers: AK, body: { action: "block", id: "nope" } })).code === 400, "bad id refused");
    const nk = r2.body.users.find(u => u.email === "n@example.com").k;
    ok((await call("POST", "/api/stats?admin=1", { headers: AK, body: { action: "block", id: nk } })).code === 200, "block");
    r2 = await call("GET", "/api/stats?admin=1", { headers: AK });
    ok(r2.body.users.find(u => u.email === "n@example.com").blocked === true, "user shows as blocked");
    ok((await call("POST", "/api/stats?admin=1", { headers: AK, body: { action: "unblock", id: nk } })).code === 200, "unblock");
    ok((await call("POST", "/api/stats?admin=1", { headers: AK, body: { action: "deleteComment", id: "c1" } })).code === 200, "delete comment");
    ok(db.kv["cm:c:c1"] == null && !(db.list["cm:ids"] || []).includes("c1"), "comment really removed");

    // health check button (fake Google / TMDB / OMDb / SubDL)
    process.env.GEMINI_API_KEY = "good-gemini"; process.env.GEMINI_API_KEY_2 = "bad-gemini";
    process.env.TMDB_API_KEY = "t"; process.env.OMDB_API_KEY = "o"; process.env.SUBDL_API_KEY = "s";
    ok((await call("GET", "/api/stats?health=1")).code === 401, "health needs the key");
    const hc = await call("GET", "/api/stats?health=1", { headers: AK });
    const byName = Object.fromEntries((hc.body.results || []).map(x => [x.name, x]));
    ok(hc.code === 200 && byName["Gemini key #1"].ok && !byName["Gemini key #2"].ok, "gemini keys checked separately");
    ok(byName["TMDB"].ok && byName["OMDb"].ok && !byName["SubDL"].ok && byName["Redis database"].ok, "other services checked");
    ok(!JSON.stringify(hc.body).includes("good-gemini") && !JSON.stringify(hc.body).includes("bad-gemini"), "keys never appear in the answer");

    // ---- announcements from the panel ----
    {
        const A = { "x-admin-key": "secret-key-123" };
        const act = body => call("POST", "/api/stats?admin=1", { headers: A, body });
        ok((await call("GET", "/api/stats?announcement=1")).body.enabled === false, "no announcement yet");
        ok((await call("POST", "/api/stats?admin=1", { body: { action: "announce", announcement: { id: "a1", title: "Hi" } } })).code === 401, "announce needs the key");
        ok((await act({ action: "announce", announcement: { id: "bad id!", title: "Hi" } })).code === 400, "bad id refused");
        ok((await act({ action: "announce", announcement: { id: "a1", title: "Hi", image: "http://x.com/a.png" } })).code === 400, "http image refused");
        ok((await act({ action: "announce", announcement: { id: "a1" } })).code === 400, "empty message refused");
        ok((await act({ action: "announce", announcement: { id: "tg-10", title: "Join us", body: "Telegram", url: "https://t.me/sinsubz", platforms: ["android", "bogus"], expires: "2026-12-31" } })).code === 200, "announcement saved");
        const pub = await call("GET", "/api/stats?announcement=1");
        ok(pub.body.enabled === true && pub.body.id === "tg-10" && pub.body.platforms.join() === "android" && /s-maxage/.test(pub.headers["Cache-Control"]), "public announcement served: " + JSON.stringify(pub.body));
        const ov = (await call("GET", "/api/stats?admin=1", { headers: A })).body;
        ok(ov.announcement && ov.announcement.id === "tg-10", "panel gets the current announcement");
        await act({ action: "announceStop" });
        ok((await call("GET", "/api/stats?announcement=1")).body.enabled === false, "announcement stopped");
    }

    // ---- Gemini quota estimate ----
    {
        process.env.GEMINI_API_KEY = "k1"; process.env.GEMINI_API_KEY_2 = "k2";
        const day = require("../api/_admin.js").pacificDay();
        db.hash["q:" + day] = { "1": "250", "2": "10", "2:x": "1" };
        process.env.GEMINI_DAILY_LIMIT = "1000";
        const q = (await call("GET", "/api/stats?admin=1", { headers: { "x-admin-key": "secret-key-123" } })).body.quota;
        ok(q.keys.length === 2 && q.keys[0].left === 75 && q.keys[0].used === 250, "key 1: 250 of 1000 used -> 75% left " + JSON.stringify(q.keys[0]));
        ok(q.keys[1].exhausted && q.keys[1].left === 0, "key 2: Google said finished -> 0%");
        ok(q.resetAt > Date.now() && q.resetAt - Date.now() <= 86400e3, "reset time is within a day");
    }

    // ---- daily limit: 2 films + 5 episodes per user ----
    {
        const translate = require("../api/translate.js");
        const t = (job, headers) => new Promise(resolve => {
            const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
            translate({ method: "POST", url: "/api/translate", headers: Object.assign({ "x-forwarded-for": "6.6.6.6", authorization: "Bearer tok-base" }, headers), body: { subtitles: [{ number: 1, timestamp: "00:00:01,000 --> 00:00:02,000", text: "Hi" }], job }, socket: {} }, res);
        });
        const lim = r => r.code === 429 && r.body.code === "DAILY_LIMIT";
        ok(!lim(await t("Movie.One.2025.Sinhala.SinSubz")), "film 1 allowed");
        ok(!lim(await t("Movie.One.2025")), "same film again (more chunks / re-run) still allowed");
        ok(!lim(await t("Movie.Two.2025")), "film 2 allowed");
        const third = await t("Movie.Three.2025");
        ok(lim(third) && /2 films and 5 TV episodes/.test(third.body.error), "film 3 refused: " + JSON.stringify(third.body));
        ok(!lim(await t("Movie.Two.2025")), "film 2 can still be continued after the limit");
        for (let i = 1; i <= 5; i++) { ok(!lim(await t("Show.S01E0" + i)), "episode " + i + " allowed"); }
        ok(lim(await t("Show.S01E06")), "episode 6 refused");
        ok(!lim(await t("Movie.One.2025", { "x-forwarded-for": "6.6.6.7" })), "another visitor has their own count");
        ok(!lim(await t("Movie.Five", { authorization: "Bearer tok-nimal", "x-forwarded-for": "6.6.6.8" })), "signed-in film 1");
        await t("Movie.Six", { authorization: "Bearer tok-nimal", "x-forwarded-for": "6.6.6.9" });
        ok(lim(await t("Movie.Seven", { authorization: "Bearer tok-nimal", "x-forwarded-for": "6.6.6.10" })), "signed-in account is counted across different IPs");
        ok(!lim(await t("Movie.Eight", { authorization: "Bearer tok-visal", "x-forwarded-for": "6.6.6.11" })), "other account fine");
        // ---- sign-in required ----
        const nolog = (headers, ua) => new Promise(resolve => {
            const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
            translate({ method: "POST", url: "/api/translate", headers: Object.assign({ "x-forwarded-for": "4.4.4." + (++ipN) }, ua ? { "user-agent": ua } : {}, headers), body: { subtitles: [{ number: 1, timestamp: "00:00:01,000 --> 00:00:02,000", text: "Hi" }], job: "Login.Test" }, socket: {} }, res);
        });
        let r1 = await nolog({});
        ok(r1.code === 401 && r1.body.code === "LOGIN_REQUIRED", "no token -> 401 LOGIN_REQUIRED");
        r1 = await nolog({ authorization: "Bearer garbage" });
        ok(r1.code === 401 && r1.body.code === "LOGIN_REQUIRED", "invalid token -> 401");
        r1 = await nolog({}, "Mozilla/5.0 SinSubz Electron/30.0.0");
        ok(r1.code !== 401, "Windows (Electron) app is let through");
        ok((await nolog({ authorization: "Bearer tok-visal" })).code !== 401, "signed-in user passes");
        const wv = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
        ok((await nolog({}, wv)).code !== 401, "old Android app (WebView) is let through for now");
        process.env.LOGIN_EXEMPT_ANDROID = "0";
        ok((await nolog({}, wv)).code === 401, "LOGIN_EXEMPT_ANDROID=0 requires login in the app too");
        delete process.env.LOGIN_EXEMPT_ANDROID;
        process.env.REQUIRE_LOGIN = "0";
        ok((await nolog({})).code !== 401, "REQUIRE_LOGIN=0 turns it off");
        delete process.env.REQUIRE_LOGIN;
        process.env.LIMIT_MOVIES_PER_DAY = "0";
        ok(!lim(await t("Movie.Nine")), "0 = no limit");
        delete process.env.LIMIT_MOVIES_PER_DAY;
    }

    // brute force
    let blocked = false;
    for (let i = 0; i < 40; i++) { const x = await (async () => { ipN = 5000; return call("GET", "/api/stats?admin=1", { headers: { "x-forwarded-for": "7.7.7.7", "x-admin-key": "guess" + i } }); })(); if (x.code === 429) blocked = true; }
    ok(blocked, "many wrong keys from one address get 429");

    // ADMIN_KEY missing
    delete process.env.ADMIN_KEY;
    ok((await call("GET", "/api/stats?admin=1", { headers: { "x-forwarded-for": "8.8.8.8", "x-admin-key": "x" } })).code === 503, "no ADMIN_KEY -> 503");

    console.log(pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
})();
