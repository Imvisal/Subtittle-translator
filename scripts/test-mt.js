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

    console.log(pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
})();
