// Tests for the Microsoft Translator fallback (api/_mt.js). Run: node scripts/test-mt.js   (no network: fetch is mocked)
"use strict";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

(async () => {
    delete process.env.AZURE_TRANSLATOR_KEY;
    const mt = require("../api/_mt.js");
    ok(!mt.enabled(), "off without a key");

    process.env.AZURE_TRANSLATOR_KEY = "k"; process.env.AZURE_TRANSLATOR_REGION = "southeastasia";
    ok(mt.enabled(), "on with a key");
    process.env.MT_FALLBACK = "off"; ok(!mt.enabled(), "MT_FALLBACK=off switches it off"); delete process.env.MT_FALLBACK;

    let seen = null;
    global.fetch = async (url, opt) => {
        seen = { url, headers: opt.headers, body: JSON.parse(opt.body) };
        return { ok: true, json: async () => seen.body.map(b => ({ translations: [{ text: "SI:" + b.Text }] })) };
    };
    const items = [{ index: 0, text: "<i>Hello</i>\nthere" }, { index: 1, text: "{\\an8}Bye" }, { index: 2, text: "" }];
    const out = await mt.translateLines(items, "si");
    ok(/to=si/.test(seen.url) && /from=en/.test(seen.url), "url has from/to");
    ok(seen.headers["Ocp-Apim-Subscription-Key"] === "k" && seen.headers["Ocp-Apim-Subscription-Region"] === "southeastasia", "headers");
    ok(seen.body[0].Text === "Hello\nthere" && seen.body[1].Text === "Bye", "tags stripped, newline kept");
    ok(out.length === 3 && out[0].index === 0 && out[1].text === "SI:Bye", "same order/indexes");
    ok(out[2].text === "SI:" || out[2].text === "", "empty line stays harmless");

    // many lines are sent in parts of 100
    let calls = 0;
    global.fetch = async (url, opt) => { calls++; const b = JSON.parse(opt.body); return { ok: true, json: async () => b.map(x => ({ translations: [{ text: x.Text }] })) }; };
    const many = Array.from({ length: 250 }, (_, i) => ({ index: i, text: "l" + i }));
    const o2 = await mt.translateLines(many, "ta");
    ok(calls === 3 && o2.length === 250 && o2[249].text === "l249", "250 lines -> 3 requests");

    // errors are thrown (the caller then falls back to the normal "limit reached")
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    let threw = false; try { await mt.translateLines(items, "si"); } catch (e) { threw = /401/.test(e.message); }
    ok(threw, "HTTP error throws");
    global.fetch = async () => ({ ok: true, json: async () => [{ translations: [{ text: "x" }] }] });
    threw = false; try { await mt.translateLines(items, "si"); } catch (e) { threw = true; }
    ok(threw, "wrong reply length throws");

    // ---- Cloudflare Workers AI (used first when its two settings exist) ----
    delete process.env.AZURE_TRANSLATOR_KEY;
    ok(!mt.enabled(), "off again without any key");
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc1"; process.env.CLOUDFLARE_API_TOKEN = "tok";
    ok(mt.enabled(), "on with Cloudflare settings");
    let cf = [];
    global.fetch = async (url, opt) => {
        const b = JSON.parse(opt.body); cf.push({ url, auth: opt.headers.Authorization, b });
        return { ok: true, json: async () => ({ success: true, result: { translated_text: "SI(" + b.text + ")" } }) };
    };
    const o3 = await mt.translateLines([{ index: 5, text: "<i>Hi</i>\nfriend" }, { index: 6, text: "Bye" }, { index: 7, text: "" }], "si");
    ok(cf.length === 3, "3 non-empty lines -> 3 requests, got " + cf.length);
    ok(/accounts\/acc1\/ai\/run\/@cf\/meta\/m2m100/.test(cf[0].url) && cf[0].auth === "Bearer tok", "cloudflare url + token");
    ok(cf[0].b.source_lang === "en" && cf[0].b.target_lang === "si", "languages");
    ok(o3[0].index === 5 && o3[0].text === "SI(Hi)\nSI(friend)", "line breaks kept: " + JSON.stringify(o3[0].text));
    ok(o3[1].text === "SI(Bye)" && o3[2].text === "", "other lines");
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    threw = false; try { await mt.translateLines([{ index: 0, text: "x" }], "si"); } catch (e) { threw = /429/.test(e.message); }
    ok(threw, "Cloudflare error throws");

    // ---- admin test endpoint ----
    process.env.ADMIN_KEY = "adm";
    global.fetch = async (url, opt) => ({ ok: true, json: async () => ({ result: { translated_text: "සිං " + JSON.parse(opt.body).text } }) });
    const call = async (key) => { let st = 0, body = null; const res = { status(s) { st = s; return this; }, json(b) { body = b; return this; } };
        await mt.testHandler({ method: "POST", headers: key ? { "x-admin-key": key } : {}, url: "/api/stats?mttest=1" }, res); return { st, body }; };
    ok((await call("")).st === 401, "test endpoint needs the admin key");
    const good = await call("adm");
    ok(good.st === 200 && good.body.provider === "cloudflare" && good.body.lines.length === 7 && /^සිං /.test(good.body.lines[0].si), "test endpoint translates the samples");
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const none = await call("adm");
    ok(none.body.provider === "none" && /No machine-translation/.test(none.body.error), "test endpoint says what is missing");

    console.log(pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
})();
