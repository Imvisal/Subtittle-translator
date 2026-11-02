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
        case "SCAN": return ["0", Object.keys(db.hash).filter(x => x.startsWith("lib:t:"))];
        default: throw new Error("unsupported " + cmd);
    }
}

const users = { "tok-visal": { localId: "uid-1", displayName: "Visal", email: "v@example.com", photoUrl: "https://lh3.example/p1.jpg", emailVerified: true },
                "tok-nimal": { localId: "uid-2", displayName: "Nimal", email: "n@example.com", emailVerified: true } };
global.fetch = async (url, opt) => {
    if (String(url).startsWith("http://redis.test")) {
        const out = JSON.parse(opt.body).map(c => ({ result: run(c) }));
        return { ok: true, status: 200, json: async () => out };
    }
    if (String(url).includes("identitytoolkit")) {
        const u = users[JSON.parse(opt.body).idToken];
        return { ok: !!u, status: u ? 200 : 400, json: async () => ({ users: u ? [u] : [] }) };
    }
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
