/* SinSubz: machine-translation FALLBACK. Used only when every Gemini key says its daily quota is gone
   (QUOTA_EXHAUSTED). Quality is lower than Gemini (word-for-word, no scene context), but the person still gets a
   subtitle instead of "limit reached". Two providers, the first one that is set up is used:
     1) Cloudflare Workers AI (m2m100, free daily allowance, no card):
        CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN   (token with "Workers AI" permission)
     2) Microsoft Translator (needs an Azure account + card):
        AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION
   MT_FALLBACK=off switches the fallback off without removing the keys.

   Env: AZURE_TRANSLATOR_KEY      (Azure portal -> your Translator resource -> Keys and Endpoint)
        AZURE_TRANSLATOR_REGION   (e.g. southeastasia; "global" is not accepted for regional resources)
        AZURE_TRANSLATOR_ENDPOINT (optional, default https://api.cognitive.microsofttranslator.com)
        MT_FALLBACK=off           (switch the fallback off without removing the key) */
"use strict";

const ENDPOINT = () => (process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com").replace(/\/+$/, "");

/* Machine translation writes bookish Sinhala. This swaps the most common written forms for the way people talk
   (the same rules the Gemini prompt asks for: ඔයා not ඔබ, මේක not මෙය, මොකද්ද not කුමක්ද ...). Only for Sinhala MT output. */
const SPOKEN = [
    ["ඔබගේ", "ඔයාගේ"], ["ඔබේ", "ඔයාගේ"], ["ඔබෙන්", "ඔයාගෙන්"], ["ඔබව", "ඔයාව"], ["ඔබට", "ඔයාට"], ["ඔබ", "ඔයා"],
    ["මෙයට", "මේකට"], ["එයට", "ඒකට"], ["මෙය", "මේක"], ["එය", "ඒක"],
    ["මෙම", "මේ"], ["එම", "ඒ"],
    ["කුමක්ද", "මොකද්ද"], ["කුමක්", "මොකක්"], ["කුමක", "මොකක"],
    ["කෙසේද", "කොහොමද"], ["කෙසේ", "කොහොමද"],
    ["ඔහුට", "එයාට"], ["ඇයට", "එයාට"], ["ඔහුගේ", "එයාගේ"], ["ඇයගේ", "එයාගේ"], ["ඔහු", "එයා"], ["ඇය", "එයා"],
    ["අවශ්‍යයි", "ඕනේ"], ["අවශ්‍ය නැත", "ඕනේ නෑ"], ["වහාම", "දැන්ම"],
    ["නොහැකි", "බැරි"], ["කරුණාකර", "අනේ"]
];
const SIN = "඀-෿";
function spokenSinhala(text) {
    let t = String(text == null ? "" : text);
    for (const [from, to] of SPOKEN) {
        t = t.replace(new RegExp("(?<![" + SIN + "])" + from + "(?![" + SIN + "])", "g"), to);
    }
    return t;
}

const hasCloudflare = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
const hasAzure = () => !!process.env.AZURE_TRANSLATOR_KEY;

function enabled() {
    return (hasCloudflare() || hasAzure()) && String(process.env.MT_FALLBACK || "").toLowerCase() !== "off";
}

// Cloudflare Workers AI: one text per request, so a few run at the same time.
async function cloudflareLines(items, to) {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID) + "/ai/run/@cf/meta/m2m100-1.2b";
    const clean = t => String(t == null ? "" : t).replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "");
    const out = new Array(items.length);
    let next = 0, firstError = null;

    async function worker() {
        while (!firstError) {
            const i = next++;
            if (i >= items.length) { return; }
            const text = clean(items[i].text);
            if (!text.trim()) { out[i] = ""; continue; }
            // keep line breaks: translate each line of the cue on its own, then join again
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            const done = [];
            for (const line of lines) {
                const ctl = new AbortController();
                const timer = setTimeout(() => ctl.abort(), 20000);
                try {
                    const res = await fetch(url, {
                        method: "POST", signal: ctl.signal,
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.CLOUDFLARE_API_TOKEN },
                        body: JSON.stringify({ text: line, source_lang: "en", target_lang: to })
                    });
                    if (!res.ok) { throw new Error("Cloudflare AI " + res.status); }
                    const data = await res.json();
                    const t = data && data.result && data.result.translated_text;
                    if (typeof t !== "string") { throw new Error("Cloudflare AI: bad reply"); }
                    done.push(t.trim());
                } catch (e) { firstError = firstError || e; return; }
                finally { clearTimeout(timer); }
            }
            out[i] = done.join("\n");
        }
    }
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    if (firstError) { throw firstError; }
    return items.map((it, k) => ({ index: it.index, text: out[k] || String(it.text || "") }));
}

// items: [{ index, text }]  ->  [{ index, text }]   (same indexes, same order). Throws on failure.
async function translateLines(items, language) {
    const out = await translateLinesRaw(items, language);
    return language === "ta" ? out : out.map(o => ({ index: o.index, text: spokenSinhala(o.text) }));
}

async function translateLinesRaw(items, language) {
    const to = language === "ta" ? "ta" : "si";
    if (hasCloudflare()) { return cloudflareLines(items, to); }
    const clean = t => String(t == null ? "" : t).replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "");
    const body = items.map(it => ({ Text: clean(it.text) }));
    const headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY
    };
    if (process.env.AZURE_TRANSLATOR_REGION) { headers["Ocp-Apim-Subscription-Region"] = process.env.AZURE_TRANSLATOR_REGION; }

    const out = [];
    // Azure: max 1000 items / 50,000 characters per request
    for (let i = 0; i < body.length; i += 100) {
        const part = body.slice(i, i + 100);
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        let res;
        try {
            res = await fetch(ENDPOINT() + "/translate?api-version=3.0&from=en&to=" + to + "&textType=plain", {
                method: "POST", headers, body: JSON.stringify(part), signal: ctl.signal
            });
        } finally { clearTimeout(timer); }
        if (!res.ok) { throw new Error("Azure Translator " + res.status); }
        const data = await res.json();
        if (!Array.isArray(data) || data.length !== part.length) { throw new Error("Azure Translator: bad reply"); }
        data.forEach(d => out.push(String((d && d.translations && d.translations[0] && d.translations[0].text) || "")));
    }
    return items.map((it, k) => ({ index: it.index, text: out[k] || String(it.text || "") }));
}

function provider() {
    if (String(process.env.MT_FALLBACK || "").toLowerCase() === "off") { return "off"; }
    return hasCloudflare() ? "cloudflare" : (hasAzure() ? "azure" : "none");
}

const SAMPLE = [
    "Where were you last night?",
    "I told you not to come here!",
    "Don't lie to me. I know everything.",
    "Come on, we have to go. Now!",
    "You're out of your mind if you think I'll help you.",
    "Hey, buddy. Long time no see.",
    "I can't believe you did this to me."
];

// admin only: POST /api/stats?mttest=1  -> translates 7 sample lines with the fallback and shows what came back
async function testHandler(req, res) {
    if (!require("./_admin.js").isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
    const info = { provider: provider(), lines: [] };
    if (!enabled()) { info.error = "No machine-translation settings found (set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in Vercel and redeploy)."; return res.status(200).json(info); }
    const b = req.body && typeof req.body === "object" ? req.body : {};
    let lines = SAMPLE;
    if (typeof b.srt === "string" && b.srt.length > 20) {
        // the first 30 cues of an uploaded .srt
        const cues = b.srt.slice(0, 300000).replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n{2,}/).map(block => {
            const ls = block.split("\n").filter(Boolean);
            const k = ls.findIndex(l => /-->/.test(l));
            return k < 0 ? "" : ls.slice(k + 1).join("\n").trim();
        }).filter(Boolean);
        if (cues.length) { lines = cues.slice(0, 30); }
        info.total = cues.length;
    }
    const t0 = Date.now();
    try {
        const out = await translateLines(lines.map((text, index) => ({ index, text })), "si");
        info.ms = Date.now() - t0;
        info.lines = out.map(o => ({ en: lines[o.index], si: o.text }));
    } catch (e) {
        info.ms = Date.now() - t0;
        info.error = String((e && e.message) || e).slice(0, 200);
    }
    return res.status(200).json(info);
}

module.exports = { enabled, translateLines, provider, testHandler, spokenSinhala };
