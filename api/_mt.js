/* SinSubz: machine-translation FALLBACK (Microsoft Translator). Used only when every Gemini key says its daily
   quota is gone (QUOTA_EXHAUSTED). Quality is lower than Gemini (word-for-word, no scene context), but the person
   still gets a subtitle instead of "limit reached". Off until AZURE_TRANSLATOR_KEY is set.

   Env: AZURE_TRANSLATOR_KEY      (Azure portal -> your Translator resource -> Keys and Endpoint)
        AZURE_TRANSLATOR_REGION   (e.g. southeastasia; "global" is not accepted for regional resources)
        AZURE_TRANSLATOR_ENDPOINT (optional, default https://api.cognitive.microsofttranslator.com)
        MT_FALLBACK=off           (switch the fallback off without removing the key) */
"use strict";

const ENDPOINT = () => (process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com").replace(/\/+$/, "");

function enabled() {
    return !!process.env.AZURE_TRANSLATOR_KEY && String(process.env.MT_FALLBACK || "").toLowerCase() !== "off";
}

// items: [{ index, text }]  ->  [{ index, text }]   (same indexes, same order). Throws on failure.
async function translateLines(items, language) {
    const to = language === "ta" ? "ta" : "si";
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

module.exports = { enabled, translateLines };
