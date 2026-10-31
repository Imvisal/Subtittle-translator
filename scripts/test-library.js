/* Tests for library.js (browser helpers) and api/_library.js (server, against a fake Redis).
   Run:  node scripts/test-library.js          (no network, no real Redis) */
"use strict";

const assert = require("assert");
const http = require("http");
const L = require("../library.js");

let failed = 0;
function test(name, fn) {
    return Promise.resolve().then(fn).then(
        () => console.log("PASS " + name),
        e => { failed++; console.log("FAIL " + name + "\n     " + (e && e.message)); }
    );
}

// ---------- tiny fake Upstash (only the commands the library uses) ----------
const store = new Map();            // key -> Map(field -> value)
function runCommand(c) {
    const [cmd, key, a, b] = c;
    const hash = store.get(key);
    switch (cmd) {
        case "HGETALL": { const out = []; if (hash) { for (const [f, v] of hash) { out.push(f, v); } } return out; }
        case "HLEN": return hash ? hash.size : 0;
        case "HSETNX": {
            if (!store.has(key)) { store.set(key, new Map()); }
            const h = store.get(key);
            if (h.has(a)) { return 0; }
            h.set(a, b); return 1;
        }
        case "HDEL": return hash && hash.delete(a) ? 1 : 0;
        case "DEL": return store.delete(key) ? 1 : 0;
        default: throw new Error("unsupported " + cmd);
    }
}

function startFakeRedis() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            let body = "";
            req.on("data", d => body += d);
            req.on("end", () => {
                const cmds = JSON.parse(body || "[]");
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(cmds.map(c => ({ result: runCommand(c) }))));
            });
        });
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

// ---------- call the handler like Vercel does ----------
function call(handler, method, url, body, headers) {
    return new Promise(resolve => {
        const req = { method, url, body, headers: Object.assign({ "x-forwarded-for": "1.2.3.4" }, headers || {}), socket: {} };
        const res = {
            code: 200, h: {},
            setHeader(k, v) { this.h[k] = v; },
            status(c) { this.code = c; return this; },
            json(o) { resolve({ code: this.code, body: o }); },
            end(t) { resolve({ code: this.code, body: t ? JSON.parse(t) : null }); }
        };
        handler(req, res);
    });
}

function pairsOf(n, tag) {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ s: i * 3000, e: i * 3000 + 2000, en: "This is line number " + i + " " + tag, si: "මේක " + i + " වෙනි පේළිය " + tag });
    }
    return out;
}

(async function main() {

    // ============ library.js ============
    await test("titleKey: movie / series / bad input", () => {
        assert.strictEqual(L.titleKey({ imdbID: "tt0111161", type: "movie" }, null, null, "natural"), "tt0111161:natural");
        assert.strictEqual(L.titleKey({ imdbID: "tt0903747", type: "series" }, 1, 7, "natural"), "tt0903747:s1e7:natural");
        assert.strictEqual(L.titleKey({ imdbID: "tt0111161", type: "movie" }, null, null, "Formal Style!"), "tt0111161:formalstyle");
        assert.strictEqual(L.titleKey({ imdbID: "TT0111161" }), "tt0111161:natural");
        assert.strictEqual(L.titleKey({ imdbID: "abc" }, 1, 1), "");
        assert.strictEqual(L.titleKey({}, 1, 1), "");
        assert.strictEqual(L.titleKey({ imdbID: "tt0903747", type: "series" }, "x", 1), "");
        assert.strictEqual(L.titleKey({ imdbID: "tt0903747", type: "series" }, 1, undefined), "");
    });

    await test("hashCues: same words = same hash, other words = other hash", () => {
        const a = [{ text: "Hello there, <i>friend</i>." }, { text: "How ARE you?" }];
        const b = [{ text: "hello there friend" }, { text: "how are you" }];          // tags / case / punctuation differ
        const c = [{ text: "hello there friend" }, { text: "how are you today" }];
        assert.strictEqual(L.hashCues(a), L.hashCues(b));
        assert.notStrictEqual(L.hashCues(a), L.hashCues(c));
        assert.ok(/^[a-f0-9]{16}$/.test(L.hashCues(a)));
    });

    await test("cueTimes + startKey", () => {
        assert.deepStrictEqual(L.cueTimes("00:01:02,500 --> 00:01:04,000"), { s: 62500, e: 64000 });
        assert.deepStrictEqual(L.cueTimes("01:00:00.5 --> 01:00:01.25"), { s: 3600500, e: 3601250 });
        assert.deepStrictEqual(L.cueTimes("junk"), { s: 0, e: 0 });
        assert.strictEqual(L.startKey("00:00:01,000 --> 00:00:02,000"), "00:00:01,000");
    });

    await test("buildPairs: pairs by start time, skips cues without Sinhala, cleans control chars", () => {
        const en = [
            { timestamp: "00:00:01,000 --> 00:00:02,000", text: "One" },
            { timestamp: "00:00:03,000 --> 00:00:04,000", text: "Two\u0001" },
            { timestamp: "00:00:05,000 --> 00:00:06,000", text: "Three" }
        ];
        const si = [
            { timestamp: "00:00:01,000 --> 00:00:02,400", text: "එක" },          // end was extended: still pairs by start
            { timestamp: "00:00:03,000 --> 00:00:04,000", text: "දෙක\u0002" }
        ];
        const p = L.buildPairs(en, si);
        assert.strictEqual(p.length, 2);
        assert.deepStrictEqual(p[0], { s: 1000, e: 2000, en: "One", si: "එක" });
        assert.ok(!/[\u0001\u0002]/.test(p[1].en + p[1].si));
    });

    await test("save(): refuses short / incomplete translations without calling the network", async () => {
        const realFetch = global.fetch;
        global.fetch = () => { throw new Error("must not be called"); };
        try {
            assert.strictEqual(await L.save("tt0111161:natural", "0123456789abcdef", pairsOf(5, "x"), 5), false);
            assert.strictEqual(await L.save("tt0111161:natural", "0123456789abcdef", pairsOf(30, "x"), 100), false);   // < 90 % done
            assert.strictEqual(await L.save("", "0123456789abcdef", pairsOf(30, "x"), 30), false);
        } finally {
            global.fetch = realFetch;
        }
    });

    // ============ api/_library.js ============
    const redis = await startFakeRedis();
    process.env.KV_REST_API_URL = "http://127.0.0.1:" + redis.address().port;
    process.env.KV_REST_API_TOKEN = "test-token";
    process.env.ADMIN_KEY = "owner-secret";
    const api = require("../api/_library.js");

    const KEY = "tt0903747:s1e7:natural";
    const H1 = "aaaaaaaaaaaaaaaa", H2 = "bbbbbbbbbbbbbbbb";
    const ip = n => ({ "x-forwarded-for": "10.0.0." + n });

    await test("save + exact lookup round trip", async () => {
        const saved = await call(api, "POST", "/api/translate?lib=save", { k: KEY, h: H1, pairs: pairsOf(60, "one") }, ip(1));
        assert.strictEqual(saved.code, 204);
        const got = await call(api, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H1, null, ip(1));
        assert.strictEqual(got.code, 200);
        assert.strictEqual(got.body.enabled, true);
        assert.strictEqual(got.body.entries.length, 1);
        assert.strictEqual(got.body.entries[0].h, H1);
        assert.strictEqual(got.body.entries[0].pairs.length, 60);
        assert.strictEqual(got.body.entries[0].pairs[7].si, "මේක 7 වෙනි පේළිය one");
    });

    await test("another release of the same title gets the saved copy", async () => {
        const got = await call(api, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H2, null, ip(2));
        assert.strictEqual(got.body.entries.length, 1);
        assert.strictEqual(got.body.entries[0].h, H1);
    });

    await test("first write wins (same English hash is never overwritten)", async () => {
        const again = await call(api, "POST", "/api/translate?lib=save", { k: KEY, h: H1, pairs: pairsOf(60, "TWO") }, ip(3));
        assert.strictEqual(again.code, 204);
        const got = await call(api, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H1, null, ip(3));
        assert.strictEqual(got.body.entries[0].pairs[0].si, "මේක 0 වෙනි පේළිය one");
    });

    await test("unknown title -> empty list", async () => {
        const got = await call(api, "GET", "/api/translate?lib=get&k=tt1111111:natural&h=" + H1, null, ip(4));
        assert.strictEqual(got.code, 200);
        assert.deepStrictEqual(got.body.entries, []);
    });

    await test("bad input is refused (key, hash, shape, not Sinhala, too few lines)", async () => {
        let n = 40;                                  // a new IP each time: this test is not about the rate limit
        const bad = async (body, code) => {
            const r = await call(api, "POST", "/api/translate?lib=save", body, ip(n++));
            assert.strictEqual(r.code, code, JSON.stringify(body).slice(0, 60) + " -> " + r.code);
        };
        await bad({ k: "nope", h: H1, pairs: pairsOf(60, "x") }, 400);
        await bad({ k: KEY, h: "xyz", pairs: pairsOf(60, "x") }, 400);
        await bad({ k: KEY, h: H2, pairs: "not a list" }, 400);
        await bad({ k: KEY, h: H2, pairs: pairsOf(5, "x") }, 400);
        await bad({ k: KEY, h: H2, pairs: pairsOf(60, "x").map(p => ({ ...p, si: "Only English here" })) }, 400);
        await bad({ k: KEY, h: H2, pairs: pairsOf(60, "x").map(p => ({ ...p, si: "ස\u0000ස" })) }, 400);
        await bad({ k: KEY, h: H2, pairs: pairsOf(60, "x").map((p, i) => i ? p : { ...p, e: -5 }) }, 400);
        const get = await call(api, "GET", "/api/translate?lib=get&k=bad%20key&h=" + H1, null, ip(5));
        assert.strictEqual(get.code, 400);
    });

    await test("at most 6 saved copies per title", async () => {
        for (let i = 0; i < 8; i++) {
            const h = String(i).repeat(16);
            await call(api, "POST", "/api/translate?lib=save", { k: "tt2222222:natural", h, pairs: pairsOf(30, "c" + i) }, ip(20 + i));
        }
        assert.strictEqual(store.get("lib:t:tt2222222:natural").size, 6);
    });

    await test("admin delete needs the key; then the copy is gone", async () => {
        const no = await call(api, "DELETE", "/api/translate?lib=del&k=" + KEY + "&h=" + H1, null, ip(6));
        assert.strictEqual(no.code, 401);
        const wrong = await call(api, "DELETE", "/api/translate?lib=del&k=" + KEY + "&h=" + H1, null, Object.assign(ip(6), { "x-admin-key": "nope" }));
        assert.strictEqual(wrong.code, 401);
        const ok = await call(api, "DELETE", "/api/translate?lib=del&k=" + KEY + "&h=" + H1, null, Object.assign(ip(6), { "x-admin-key": "owner-secret" }));
        assert.strictEqual(ok.code, 204);
        const got = await call(api, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H1, null, ip(6));
        assert.deepStrictEqual(got.body.entries, []);
    });

    await test("per-IP limit on saves (6 / minute)", async () => {
        let last = 0;
        for (let i = 0; i < 8; i++) {
            const r = await call(api, "POST", "/api/translate?lib=save", { k: "tt3333333:natural", h: String(i + 1).repeat(16), pairs: pairsOf(30, "r") }, ip(99));
            last = r.code;
        }
        assert.strictEqual(last, 429);
    });

    await test("Redis unreachable -> library quietly off, never an error", async () => {
        redis.close();
        const got = await call(api, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H1, null, ip(7));
        assert.strictEqual(got.code, 200);
        assert.strictEqual(got.body.enabled, false);
        const saved = await call(api, "POST", "/api/translate?lib=save", { k: KEY, h: H1, pairs: pairsOf(60, "x") }, ip(7));
        assert.strictEqual(saved.code, 204);
    });

    await test("no Redis configured -> { enabled:false }", async () => {
        delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
        delete require.cache[require.resolve("../api/_library.js")];
        const off = require("../api/_library.js");
        const got = await call(off, "GET", "/api/translate?lib=get&k=" + KEY + "&h=" + H1, null, ip(8));
        assert.deepStrictEqual(got.body, { enabled: false });
        const saved = await call(off, "POST", "/api/translate?lib=save", { k: KEY, h: H1, pairs: pairsOf(60, "x") }, ip(8));
        assert.strictEqual(saved.code, 204);
    });

    console.log(failed ? "\nSOME TESTS FAILED (" + failed + ")" : "\nALL TESTS PASSED");
    process.exit(failed ? 1 : 0);

})();
