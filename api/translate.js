// ------------------------------------------------------------------
// Gemini key + model fallback
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   GEMINI_API_KEY            (existing key, still works)
//   GEMINI_API_KEY_2 ... _10  (extra keys, each from a DIFFERENT Google project)
//   GEMINI_API_KEYS           (optional, comma separated list instead)
//   GEMINI_MODELS             (optional, comma separated, best model first)
//
// Daily quota is per Google Cloud PROJECT, so extra keys only help when
// they are created in different projects.
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Request limits + simple per-IP rate limit
// ------------------------------------------------------------------
const MAX_LINES = 100;
const MAX_LINE_CHARS = 1500;
const MAX_TOTAL_CHARS = 40000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 90; // one 2-hour movie at 40 lines/chunk is ~35 requests
const rateHits = new Map();

function clientIp(req) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

function isRateLimited(ip) {
    const now = Date.now();
    const hits = (rateHits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);

    hits.push(now);
    rateHits.set(ip, hits);

    if (rateHits.size > 5000) {
        for (const [key, list] of rateHits) {
            if (!list.some(t => now - t < RATE_WINDOW_MS)) rateHits.delete(key);
        }
    }

    return hits.length > RATE_MAX_REQUESTS;
}

// ------------------------------------------------------------------
// Glitch guard
// Small Gemini models sometimes slip a random character from another
// script (Tamil, Hebrew, Georgian, Ethiopic, Hangul ...) or a stray Latin
// letter into the middle of a Sinhala word. Those lines are detected here
// so the chunk can be translated again instead of reaching the .srt file.
// ------------------------------------------------------------------

// Greek ... Malayalam, Thai ... Ethiopic/Georgian/etc, Hiragana ... CJK, Hangul
const FOREIGN_SCRIPT = /[\u0370-\u0D7F\u0E00-\u1FFF\u3040-\u9FFF\uAC00-\uD7AF]/;
// Latin letter glued directly to a Sinhala letter, e.g. "කොහomත්"
const LATIN_IN_SINHALA = /[\u0D80-\u0DFF][A-Za-z]|[A-Za-z][\u0D80-\u0DFF]/;

function hasGlitch(text) {
    return FOREIGN_SCRIPT.test(text) || LATIN_IN_SINHALA.test(text);
}

// Last resort when retries still leave a glitch: drop the stray characters.
function cleanGlitch(text) {
    return text
        .replace(new RegExp(FOREIGN_SCRIPT.source, "g"), "")
        .replace(/([\u0D80-\u0DFF])[A-Za-z]+(?=[\u0D80-\u0DFF])/g, "$1")
        .replace(/ {2,}/g, " ")
        .trim();
}

// Deterministic fixes for bookish forms the model still lets through.
// (?<!SINHALA) / (?!SINHALA) make sure only WHOLE words are replaced.
const SI = "\\u0D80-\\u0DFF";
const BOOKISH = [
    ["ඇසෙයි", "ඇහෙනවා"],
    ["ඇසේ", "ඇහෙනවා"],
    ["ඔබේ", "ඔයාගේ"],
    ["ඔබට", "ඔයාට"],
    ["ඔබ", "ඔයා"],
    ["ඇයට", "එයාට"],
    ["ඇයගේ", "එයාගේ"],
    ["ඇය", "එයා"],
    ["ඔහුට", "එයාට"],
    ["ඔහුගේ", "එයාගේ"],
    ["ඔහු", "එයා"],
    ["මෙම", "මේ"],
    ["එම", "ඒ"],
    ["ට්‍රයි එකක්", "උත්සාහයක්"],
    ["ට්‍රයි එක", "උත්සාහය"],
    // "ට්‍රයි කරමු / කළා / කරලා ..." -> "උත්සාහ කරමු ..."
    ["ට්‍රයි(?= (?:කර|කළ|කල))", "උත්සාහ"],
    ["ෂුවර්ද", "විශ්වාසද"],
    ["ෂුවර් (?=නෑ|නැහැ)", "විශ්වාස "],
    ["ෂුවර්", "විශ්වාසයි"]
].map(([from, to]) => [new RegExp("(?<![" + SI + "])" + from + "(?![" + SI + "])", "g"), to]);

function polishSinhala(text) {
    let out = text;

    for (const [re, to] of BOOKISH) out = out.replace(re, to);

    return out
        // dash belongs OUTSIDE the italic tag: <i>- text</i> -> - <i>text</i>
        .replace(/<i>\s*-\s*/g, "- <i>")
        // "(Zeros)" style English tails after a Sinhala word
        .replace(new RegExp("([" + SI + "])\\s*\\([A-Za-z][A-Za-z ]*\\)", "g"), "$1");
}

// one spoken form of "no / cannot" through the whole file: නැහැ -> නෑ, බැහැ -> බෑ
// (not when the word continues with more Sinhala letters, and not for the formal style)
function unifyNegation(text) {
    return String(text).replace(/(?<![඀-෿])(නැ|බැ)හැ(?![඀-෿])/g, function (m, a) { return a === "නැ" ? "නෑ" : "බෑ"; });
}

// "-latest" aliases always point at a model that is still available,
// so they keep working when Google retires a fixed model name.
const DEFAULT_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    // last resorts: each model has its OWN quota, so these still work when the three above are all cooling
    // (a name Google has retired just answers 404 and is skipped for an hour)
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
];

function getKeys() {
    const list = [];

    if (process.env.GEMINI_API_KEYS) {
        list.push(...process.env.GEMINI_API_KEYS.split(","));
    }

    list.push(process.env.GEMINI_API_KEY);

    for (let i = 2; i <= 30; i++) {
        list.push(process.env["GEMINI_API_KEY_" + i]);
    }

    return [...new Set(
        list.map(k => (k || "").trim()).filter(Boolean)
    )];
}

function getModels() {
    const fromEnv = (process.env.GEMINI_MODELS || "")
        .split(",")
        .map(m => m.trim())
        .filter(Boolean);

    return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

// key|model -> time (ms) until which we skip that combo.
// Lives as long as the serverless instance stays warm (best effort).
const cooldowns = new Map();

// Per key+model call counter (one-minute window). Shared through Redis when available, per instance otherwise.
const KEY_MAX_PER_MIN = Math.max(1, parseInt(process.env.KEY_MAX_PER_MIN, 10) || 20);
const keyUse = new Map();
const KEY_TIMEOUT_MS = Math.max(3000, parseInt(process.env.KEY_TIMEOUT_MS, 10) || 20000);
async function keyBusy(id) {
    const w = Math.floor(Date.now() / 60000);
    const cur = keyUse.get(id);
    const n = (cur && cur.w === w ? cur.n : 0) + 1;
    keyUse.set(id, { w: w, n: n });
    if (n > KEY_MAX_PER_MIN) return true;
    try { return await require("./_google").overLimit("kuse", id, KEY_MAX_PER_MIN, 60); } catch (e) { return false; }
}

// The same cooldowns, shared by every serverless instance through Redis (a cold instance used to learn the hard way,
// by getting its own 429, that a key was already cooling). Best effort: Redis problems never block a translation.
async function loadSharedCooldowns(keys, models) {
    try {
        const g = require("./_google");
        if (!g.hasRedis()) { return; }
        const ids = [];
        keys.forEach((_, k) => models.forEach(m => ids.push(k + "|" + m)));
        const r = await g.redis([["MGET"].concat(ids.map(i => "gcd:" + i))]);
        (r[0] || []).forEach((v, i) => {
            const t = Number(v);
            if (t > Date.now()) { cooldowns.set(ids[i], Math.max(cooldowns.get(ids[i]) || 0, t)); }
        });
    } catch (e) { /* ignore */ }
}
function shareCooldown(id, until) {
    try {
        const g = require("./_google");
        if (!g.hasRedis()) { return; }
        g.redis([["SET", "gcd:" + id, String(until), "EX", Math.max(1, Math.ceil((until - Date.now()) / 1000))]]).catch(() => { /* ignore */ });
    } catch (e) { /* ignore */ }
}

// model -> time (ms) until which that whole model is treated as "busy" (503).
// Without this every request wastes seconds on a model that is overloaded.
const modelBusyUntil = new Map();
const MODEL_BUSY_MS = 3 * 60 * 1000;

// Google daily quotas reset at midnight Pacific time.
function nextPacificMidnight() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false
    }).formatToParts(now);

    const get = t => Number(parts.find(p => p.type === t).value) % 24;
    const secondsPassed = get("hour") * 3600 + get("minute") * 60 + get("second");

    return now.getTime() + (86400 - secondsPassed) * 1000;
}

function isDailyQuotaMessage(message) {
    return /per\s*day|perday|daily/i.test(message || "");
}

// ------------------------------------------------------------------
// Health counters for the admin panel (best effort, never breaks translating).
//   h:d:<day>  hash  ok / json / quota / busy / other / salvaged
//   h:k:<day>  hash  "<keyNumber>:ok|429|bad|err"   (the key itself is never stored)
// ------------------------------------------------------------------
async function track(day, fields, keyFields) {
    try {
        const g = require("./_google");
        if (!g.hasRedis()) return;
        const cmds = [];
        Object.keys(fields || {}).forEach(f => cmds.push(["HINCRBY", "h:d:" + day, f, fields[f]]));
        Object.keys(keyFields || {}).forEach(f => cmds.push(["HINCRBY", "h:k:" + day, f, keyFields[f]]));
        if (!cmds.length) return;
        cmds.push(["EXPIRE", "h:d:" + day, 35 * 86400], ["EXPIRE", "h:k:" + day, 35 * 86400]);
        await Promise.race([g.redis(cmds), new Promise(r => setTimeout(r, 1500))]);
    } catch (e) { /* ignore */ }
}

// requests used per key in the current Pacific day (Gemini's quota day); "<key>:x" = Google said the day's quota is gone
async function trackQuota(k, exhausted) {
    try {
        const g = require("./_google");
        if (!g.hasRedis()) return;
        const day = require("./_admin.js").pacificDay();
        await Promise.race([g.redis([["HINCRBY", "q:" + day, exhausted ? (k + 1) + ":x" : String(k + 1), 1], ["EXPIRE", "q:" + day, 3 * 86400]]), new Promise(r => setTimeout(r, 1500))]);
    } catch (e) { /* ignore */ }
}

function today() {
    return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
}

async function generateWithFallback(prompt) {
    const trail = [];
    const out = await generateInner(prompt, trail);
    if (out && typeof out === "object") { out.trail = trail; }
    return out;
}

async function generateInner(prompt, trail) {
    const keys = getKeys();
    const models = getModels();

    if (keys.length === 0) {
        return {
            status: 500,
            error: "GEMINI_API_KEY is missing"
        };
    }

    let lastStatus = 500;
    let lastMessage = "Gemini API error";
    let sawQuota = false;
    let sawDaily = false;
    let sawBusy = false;
    // Sticky keys: always start from key #1 and only move on to the next one while the earlier ones are cooling
    // (set GEMINI_KEY_ROTATE=1 to spread requests over all keys again).
    const startKey = process.env.GEMINI_KEY_ROTATE === "1" ? Math.floor(Math.random() * keys.length) : 0;

    await loadSharedCooldowns(keys, models);

    // Two passes: if every model was only "busy" (503), wait a moment and retry once.
    for (let pass = 0; pass < 2; pass++) {
    sawBusy = false;

    // best model first, and every key is tried on it before moving on
    for (const model of models) {

        // skip a model that just returned 503 (second pass tries everything again)
        if (pass === 0 && (modelBusyUntil.get(model) || 0) > Date.now()) {
            sawBusy = true;
            continue;
        }

        for (let n = 0; n < keys.length; n++) {

            // keys are tried in order: use one as long as it works, the next only while it cools
            const k = (startKey + n) % keys.length;
            const id = k + "|" + model;

            if ((cooldowns.get(id) || 0) > Date.now()) {
                trail.push("#" + (k + 1) + " " + model.replace(/^gemini-/, "") + " cooling");
                sawQuota = true;
                if ((cooldowns.get(id) || 0) > Date.now() + 5 * 60 * 1000) sawDaily = true;   // long cooldown = daily quota
                continue;
            }

            // a key that already served KEY_MAX_PER_MIN calls this minute rests until the next minute (before Google 429s it)
            if (await keyBusy(id)) {
                trail.push("#" + (k + 1) + " " + model.replace(/^gemini-/, "") + " full");
                continue;
            }

            // a key that does not answer within KEY_TIMEOUT_MS (default 20 s) is dropped for a while and the next key is tried
            const ctl = new AbortController();
            const slowTimer = setTimeout(() => ctl.abort(), KEY_TIMEOUT_MS);
            let response, raw;
            try {
            response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/" +
                model + ":generateContent",
                {
                    signal: ctl.signal,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": keys[k]
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.3,
                            maxOutputTokens: 16384
                        }
                    })
                }
            );

            raw = await response.text();
            } catch (e) {
                clearTimeout(slowTimer);
                if (ctl.signal.aborted) {
                    cooldowns.set(id, Date.now() + 60 * 1000);
                    trail.push("#" + (k + 1) + " " + model.replace(/^gemini-/, "") + " slow");
                    lastStatus = 504; lastMessage = "Gemini key too slow";
                    continue;
                }
                throw e;
            }
            clearTimeout(slowTimer);

            console.log("Gemini", model, "key#" + (k + 1), "status:", response.status);

            let data = null;

            try {
                data = JSON.parse(raw);
            } catch (error) {
                // handled below
            }

            if (response.ok && data) {
                modelBusyUntil.delete(model);
                await track(today(), null, { [(k + 1) + ":ok"]: 1 });
                await trackQuota(k, false);
                return { data, key: k + 1, model };
            }

            const message =
                data?.error?.message ||
                raw.substring(0, 300) ||
                "Gemini API error";

            lastStatus = response.status;
            lastMessage = message;
            trail.push("#" + (k + 1) + " " + model.replace(/^gemini-/, "") + " " + response.status + (response.status === 429 ? (isDailyQuotaMessage(message) ? " daily" : " per-min") : ""));

            console.warn(
                "Gemini failed:",
                model,
                "key#" + (k + 1),
                response.status,
                message.substring(0, 300)
            );

            // quota / rate limit -> skip this key+model and try the next one
            if (response.status === 429) {
                sawQuota = true;
                await track(today(), null, { [(k + 1) + ":429"]: 1 });
                if (isDailyQuotaMessage(message)) { sawDaily = true; await trackQuota(k, true); }

                const coolUntil = isDailyQuotaMessage(message) ? nextPacificMidnight() : Date.now() + 60 * 1000;
                cooldowns.set(id, coolUntil);
                shareCooldown(id, coolUntil);

                continue;
            }

            // model overloaded / temporary -> try the next one, short pause
            // (overload is per MODEL, not per key, so skip the other keys and
            // go straight to the next model instead of waiting on every key)
            if (response.status === 503 || response.status === 500) {
                sawBusy = true;
                await track(today(), null, { [(k + 1) + ":err"]: 1 });
                modelBusyUntil.set(model, Date.now() + MODEL_BUSY_MS);
                break;
            }

            // bad / blocked key -> skip that key for a while
            if (
                response.status === 403 ||
                (response.status === 400 && /api key/i.test(message))
            ) {
                cooldowns.set(id, Date.now() + 60 * 60 * 1000);
                await track(today(), null, { [(k + 1) + ":bad"]: 1 });
                continue;
            }

            // model name not found -> try the next model
            if (response.status === 404) {
                cooldowns.set(id, Date.now() + 60 * 60 * 1000);
                continue;
            }

            // anything else (bad request etc.) will not fix itself
            return { status: response.status, error: message };
        }
    }

        if (!sawBusy || sawQuota) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await track(today(), { [sawQuota ? "quota" : (sawBusy ? "busy" : "other")]: 1 });

    // only per-minute limits were hit: the day's quota is NOT gone, so don't say so (the page waits and retries)
    if (sawQuota && !sawDaily) {
        return {
            status: 429,
            code: "RATE_LIMITED",
            detail: lastMessage,
            error: "Many people are translating right now. Retrying in a moment..."
        };
    }

    if (sawQuota) {
        return {
            status: 429,
            code: "QUOTA_EXHAUSTED",
            detail: lastMessage,
            error:
                "Today's free translation limit has been reached. " +
                "Please try again later."
        };
    }

    if (sawBusy) {
        return {
            status: 503,
            error:
                "Gemini is very busy right now (not a limit problem). " +
                "Please try again in a minute."
        };
    }

    return { status: lastStatus, error: lastMessage };
}

module.exports = async function handler(req, res) {

    // /api/translate?lib=... -> library of finished translations (api/_library.js). It lives behind this
    // file so it does not count as another serverless function (the Hobby plan allows 12).
    if (/[?&]lib=/.test(String(req.url || ""))) {
        return require("./_library.js")(req, res);
    }

    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        // ---- abuse protection (best effort, per warm serverless instance) ----
        // the owner's scheduled runner (GitHub Actions, scripts/auto-translate.js) sends the admin key
        const isRunner = require("./_admin.js").isAdmin(req);

        // The runner only gets the share of the daily Gemini quota above RUNNER_RESERVE_PCT (default 70% is kept for visitors)
        if (isRunner) {
            // last hour before the Pacific-midnight reset (about 12:30-13:30 in Sri Lanka): what is left would be lost anyway,
            // so the runner may use almost all of it (keeps RUNNER_LAST_HOUR_RESERVE_PCT, default 8%). Any other time: 70% stays for visitors.
            const pacHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date())) % 24;
            const lastHour = pacHour === 23;
            const reserve = Number(process.env.RUNNER_RESERVE_PCT);
            const reserveLast = Number(process.env.RUNNER_LAST_HOUR_RESERVE_PCT);
            const keep = lastHour ? (Number.isFinite(reserveLast) ? reserveLast : 8) : (Number.isFinite(reserve) ? reserve : 70);
            if (keep > 0 && (await require("./_admin.js").quotaLeftPct()) <= keep) {
                return res.status(429).json({ error: "Gemini quota is reserved for visitors now (auto-runner stops).", code: "RUNNER_RESERVE" });
            }
        }

        if (!isRunner && (isRateLimited(clientIp(req)) || await require("./_google").overLimit("tr", clientIp(req), RATE_MAX_REQUESTS, 60))) {
            return res.status(429).json({
                error: "Too many requests. Please wait a minute and try again."
            });
        }

        const { subtitles, language = "si", style = "natural" } =
            req.body || {};

        // optional extra context: show / movie title + neighbouring original lines
        const title = String((req.body && req.body.title) || "")
            .replace(/[\r\n]+/g, " ").slice(0, 150).trim();

        const cleanCtx = list => (Array.isArray(list) ? list : [])
            .slice(0, 5)
            .map(t => String(t || "").replace(/\s+/g, " ").slice(0, 300))
            .filter(Boolean);

        const ctxBefore = cleanCtx(req.body && req.body.context && req.body.context.before);
        const ctxAfter = cleanCtx(req.body && req.body.context && req.body.context.after);

        if (
            !Array.isArray(subtitles) ||
            subtitles.length === 0
        ) {
            return res.status(400).json({
                error: "No subtitles received"
            });
        }


        // ---- Google sign-in required + daily limit per user (see api/_admin.js) ----
        let limitDone = null;
        let logCtx = { u: "", job: "" };
        {
            const adm = require("./_admin.js");
            const who = isRunner ? { uid: "runner", owner: true, email: "auto-runner" } : await adm.authUser(req);
            logCtx = { u: adm.whoLabel(who, req), job: String((req.body && req.body.job) || title || "").slice(0, 80) };
            if (adm.loginRequired(who, req)) {
                await adm.logEvent({ type: "login", lvl: "warn", u: logCtx.u, msg: "Sign-in required (refused)" });
                return res.status(401).json({
                    error: "Please sign in with Google to translate.",
                    code: "LOGIN_REQUIRED"
                });
            }
            const lim = await adm.checkDailyLimit(
                req, (req.body && req.body.job) || title, who,
                { idx: req.body && req.body.chunk, total: req.body && req.body.chunks }
            );
            limitDone = lim.done || null;
            if (!lim.ok) {
                await adm.logEvent({ type: "limit", lvl: "warn", u: logCtx.u, job: logCtx.job, msg: (lim.code || "DAILY_LIMIT") + " refused" });
                return res.status(429).json({ error: lim.message, code: lim.code || "DAILY_LIMIT" });
            }
        }

        // ---- input limits: nobody should burn the free quota with huge bodies ----
        if (subtitles.length > MAX_LINES) {
            return res.status(413).json({
                error: "Too many subtitle lines in one request (max " + MAX_LINES + ")."
            });
        }

        let totalChars = 0;

        for (const sub of subtitles) {
            const len = String((sub && sub.text) || "").length;
            totalChars += len;

            if (len > MAX_LINE_CHARS || totalChars > MAX_TOTAL_CHARS) {
                return res.status(413).json({
                    error: "Subtitle text is too long for one request."
                });
            }
        }

        if (!["si", "ta"].includes(language)) {
            return res.status(400).json({ error: "Unsupported language" });
        }

        const targetLanguage =
            language === "ta"
                ? "natural Sri Lankan Tamil"
                : "SPOKEN Sri Lankan Sinhala (කතා කරන භාෂාව / ව්‍යවහාර භාෂාව)";

        const styleNotes = {
            natural:
                "Everyday spoken tone, like real people talking in a Sri Lankan film or teledrama.",
            casual:
                "Very relaxed street-level spoken Sinhala, friendly and short.",
            comedy:
                "Spoken Sinhala with a playful, funny tone. Keep jokes landing the way a Sri Lankan viewer would find them funny.",
            action:
                "Short, sharp, punchy spoken Sinhala. Intense lines stay tight.",
            anime:
                "Dramatic spoken Sinhala with strong emotion, still colloquial.",
            literal:
                "Stay close to the original meaning, but still in spoken Sinhala, not bookish.",
            formal:
                "Polite and respectful spoken Sinhala (still conversational, not textbook-written Sinhala). Use ඔයා with respectful titles; ඔබ only for very formal speeches."
        };

        const styleNote =
            styleNotes[style] || styleNotes.natural;


        const input = subtitles.map((sub, index) => ({
            index: index,
            text: String(sub.text || "")
        }));


        const buildPrompt = (inputItems) => `
You are a professional English movie and TV subtitle translator.

Translate the following English subtitle dialogue into
${targetLanguage}.

Rules:

- Translate ONLY the dialogue.
- Do not translate subtitle numbers.
- Do not translate timestamps.
- Do not add explanations.
- Do not skip any subtitle.
- Do not add any subtitle.
- Keep every index exactly.
- Write the way Sri Lankans actually SPEAK, not the way they write.
- Use spoken forms (කතා කරන වචන), NOT literary/written Sinhala (ලිඛිත භාෂාව).
  Examples: "මම යනවා" not "මම යමි"; "මොකද්ද?" not "කුමක්ද?";
  "ඕනේ" not "අවශ්‍යයි"; "කොහොමද?" not "කෙසේද?";
  "ඇයි?" not "මන්ද?"; "හරි" not "එසේය"; "ඉන්නවා" not "සිටිමි";
  "මේක" not "මෙය"; "ඒක" not "එය"; "දැන්ම" not "වහාම".
- Avoid stiff verb endings like -මි, -යි, -න්නෙමි, -ඇත. Use -නවා / -නේ / -ද / -ලා.
- NEVER use stiff, bookish pronouns/forms in normal dialogue:
  "ඔබ", "ඔබට", "ඔබේ", "මට", "මගේ" (written style), "ඇය", "ඔහු", "එම", "මෙම".
  Use what people really say: "ඔයා", "ඔයාට", "ඔයාගේ", "මම/මං", "මට" only where natural,
  "එයා", "එයාට", "අර මනුස්සයා", "මේ", "අර".
  ("ඔබ" is allowed ONLY for very formal speeches, royal/religious/news-style lines.)

PRONOUNS & RELATIONSHIPS (most important rule):
Before translating each line, work out WHO is talking to WHOM and what the
relationship and mood are, using the surrounding subtitles as context
(friends, lovers, family, boss/employee, strangers, enemies, police/criminal,
kid/parent, anger, teasing, begging, etc.). Then choose the pronoun, verb
ending and vocabulary that real Sri Lankans use in exactly that situation.
Keep the SAME pronoun for the same pair of people through the whole scene.

  English "you" ->
    friends, couples, siblings, coworkers, normal adults ......... ඔයා / ඔයාට / ඔයාගේ
    very close friends, teasing, casual (guy to guy) ............ උඹ / උඹට / උඹේ  (or උබ, උඹල)
    angry, insulting, fighting, villain threatening someone ..... තෝ / තොට / තොගේ  (or තෝව)
    respectful: elders, teachers, boss, doctor, strangers ....... ඔයා + respectful words
                                                                (සර්, මැඩම්, අංකල්, ආන්ටි, නෝනා, මහත්තයා)
    to a child / loved one, soft tone ........................... ඔයා / පුතා / දුව / සුදූ / බබා
  English "I" ->
    normal ........ මම   |   close/casual/angry ........ මං   |   very rough ........ මං (with තෝ/උඹ)

  Example: "I told you."
    normal / friendly .............. මම ඔයාට කිව්වනේ.
    close friends / casual ......... මං උඹට කිව්වනේ.
    angry / rough .................. මං තොට කිව්වා නේද!
    never ........................... මම ඔබට පැවසුවෙමි.

  Example: "Where were you?"  ->  ඔයා කොහෙද හිටියේ? / උඹ කොහෙද හිටියේ? / තෝ කොහෙද හිටියේ?
  Example: "Don't lie to me." ->  මට බොරු කියන්න එපා. / මට බොරු කියන්නෙපා. / තෝ මට බොරු කියන්න එපා!

Make verbs match the chosen pronoun and mood:
  polite/normal: කිව්වා, කරන්න, එන්න, යමු, බලන්න
  casual:        කිව්වනේ, කරපන්, වරෙන්, යමු, බලපන්, හරි නේ, නේද, නේ
  rough:         කිව්වා නේද, කරපන් බන්, ඕක නවත්තපන්, පලයන්, වරෙන් මෙහාට, ගහන්නේ
Use natural sentence-final particles (නේ, නෙ, නේද, නැද්ද, බං, මචං, අනේ, ඕයි, අයියෝ, හා, හරි, ඉතින්)
only where a real person would say them. Do not overuse them.

Names, titles & address:
  Use the way Sri Lankans address people: අම්මා, තාත්තා, අක්කා, අයියා, නංගි, මල්ලි,
  සර්, මැඩම්, මචං, බං, ඇන්ටි, අංකල්. Do not translate "Mr./Mrs." stiffly:
  use "සර්/මැඩම්/මහත්තයා/නෝනා" where it sounds natural.

Meaning over words:
  Translate the MEANING and the feeling, not word-by-word.
  Idioms, jokes, slang and swearing should become the closest natural Sinhala
  equivalent (not a literal translation). Keep the strength of insults the same
  (do not soften or make them stiff).
IDIOMS AND SET PHRASES - NEVER word-by-word. Pick the meaning that fits the scene and the tone:
  "Oh come on" / "Come on" when annoyed or not believing -> අයියෝ, ඉතින්! / අනේ එපා කියන්න! / ඔහොම කියන්න එපා!
  "Come on!" when urging -> ඉක්මන් කරන්න! / යං! / පුළුවන් ඔයාට!      "Come on in" -> ඇතුළට එන්න
    ("එන්න" only when someone is really being asked to come to a place)
  "Give me a break" -> අනේ මට පාඩුවේ ඉන්න දෙන්න      "No way" -> බෑ බෑ! / ඇත්තමද?
  "You've got to be kidding" -> ඔයා විහිළු කරනවනේ?      "Are you out of your mind?" -> ඔයාට පිස්සුද?
  "What the hell / What the heck" -> මොකක්ද මේ! (mild) / මොන මගුලක්ද (strong, only if the English is strong)
  "Hang on / Hold on" -> ටිකක් ඉන්න      "Get out of here!" (disbelief) -> හාහ්, හරි යන්න! / ඇත්තටම?
  "Cut it out / Knock it off" -> නවත්තන්න      "Shut up" -> කට වහගන්න (rude) / ඇති, නවත්තන්න (friendly)
  "Nice try" -> හොඳ උත්සාහයක්, ඒත් බෑ      "Tell me about it" -> ඒක නම් ඇත්ත / මට කියන්නත් එපා
  "You bet" -> අනිවා      "Piece of cake" -> ගොඩක් ලේසියි      "It's on me" -> මම ගෙවන්නම්
  "Long time no see" -> ගොඩක් කාලෙකින් නේ දැක්කේ      "Look who's here" -> අනේ බලන්න කවුද ආවේ
  "Fair enough" -> හරි, ඒක ඇත්ත      "Good for you" -> හොඳයි, සුබයි      "My bad" -> මගේ වැරැද්ද
  "Whatever" -> ඕනෙ එකක්      "Seriously?" -> ඇත්තටම? / හැබෑටමද?      "Who cares" -> කාටද වැඩේ
  "For God's sake" -> දෙයියනේ!      "Oh my God" -> අනේ දෙයියනේ      "Thank God" -> හොඳවෙලාවට / දෙයියන්ට පින්
  "Holy crap / Holy shit" -> අම්මෝ!      "Hell yeah" -> අනිවා!      "Watch out" -> පරිස්සම!
  "Take it easy" -> සන්සුන් වෙන්න      "How come?" -> ඒ කොහොමද? / ඇයි එහෙම?      "Let's roll" -> අපි යමු
  "I'm sorry for your loss" -> ඔයාගේ අහිමිවීම ගැන මම කණගාටුයි      "Don't mention it" -> කමක් නෑ
  "Dude / man" used to address someone -> මචං / (leave it out when it adds nothing)
  If a phrase is not in this list and a word-by-word reading sounds odd or silly in Sinhala, it is an idiom:
  translate what the person MEANS in that scene, in the way a Sri Lankan would say it.
SOUND CUES / DESCRIPTIONS in [square brackets] or (parentheses):
  Keep the brackets, but write them SHORT and SPOKEN, never bookish.
  Use -නවා / -වෙනවා endings and everyday words, not -යි / -ඇසේ / -ඇසෙයි.
    [laughs]            ->  [හිනාවෙනවා]          NOT  [සිනාසෙයි]
    [screams]           ->  [කෑගහනවා]           NOT  [කෑගසයි]
    [crying]            ->  [අඬනවා]              NOT  [හඬයි]
    [sighs]             ->  [සුසුම් ගන්නවා]      NOT  [සුසුම්ලයි]
    [groans]            ->  [ගොඳුරනවා]  or  [කෙඳිරිගානවා]
    [thunder rumbling]  ->  [ගිගුරුම් සද්දයක්]   NOT  [ගිගුරුම් හඬක් ඇසේ]
    [phone ringing]     ->  [ෆෝන් එක වදිනවා]
    [tense music]       ->  [බය හිතෙන සංගීතයක්]
    [speaking another language] -> [වෙන භාෂාවකින් කතා කරනවා]
  Only translate cues and speaker labels that exist in the English line.
  NEVER invent a cue, a speaker name, or a language tag such as [ඉංග්‍රීසියෙන්] or
  [තායි භාෂාවෙන්] that is not in the original English text.

BOOKISH WORDS to avoid  ->  say this instead:
  සිනාසෙයි / සිනාසෙමින් -> හිනාවෙනවා / හිනාවෙමින්     කෑගසයි -> කෑගහනවා
  ඇසේ / ඇසෙයි -> ඇහෙනවා     මහත්වරුනි -> මහත්තයලා     කරුණාකරලා -> අනේ / softener
  ව්‍යසනය -> විනාශය / අනතුර     අන්තර්ජාලය -> ඉන්ටර්නෙට් එක     භයානක -> බයංකර / භයානක (both ok)
  විශ්වාසද? -> විශ්වාසද? / හරියටම ද?  (never write ෂුවර් / ට්‍රයි: say විශ්වාසයි / උත්සාහ කරමු)     ස්තුතියි -> තැන්ක්ස් / ස්තූතියි (casual)
  MORE SPOKEN-STYLE WORDS (how people really talk, not how a book writes):
  සුව වෙයි / සුවපත් වෙයි -> හොඳ වෙයි / හොඳ වෙනවා     සුවය ලැබීම -> හොඳ වීම     ඉතා / අතිශයින් -> හරිම / ගොඩක් / නියමයි
  පවසයි / පවසනවා -> කියනවා     ප්‍රශ්න කරයි -> අහනවා     ලබා දෙනවා -> දෙනවා     සිතයි -> හිතනවා
  කළ යුතුය -> කරන්න ඕනේ     නොහැක / නොහැකිය -> බෑ / බැහැ     අවශ්‍යයි -> ඕනේ
  Write sentences the way a Sri Lankan would SAY them: "එයාලා කියනවා රුබී හොඳ වෙයි කියලා", never "රුබීට සුව වෙයි යැයි ඔවුහු පවසති".
  Everyday English loanwords (ඉන්ටර්නෙට්, ෆෝන්, කැමරා, ෆොටෝ, ඔකේ) are FINE and normal in spoken Sinhala.


SUBTITLE READABILITY & ENGLISH WORDS:
- Reading speed matters: aim for at most ~17 Sinhala characters per second of
  screen time. Short original lines must stay short. When an English line is long,
  keep only the meaning that matters and cut filler ("you know", "well", repeats).
- Max about 42 characters per line. If a cue is longer, split it into 2 lines at a
  natural pause. Never use more than 2 lines.
- If the original has a leading "-" (two speakers), keep "- " at the start of EACH
  speaker's line. If the line is italic (<i>...</i>), put the dash OUTSIDE the tag:
  "- <i>text</i>".
- Translate English words into natural Sinhala wherever a common Sinhala word exists
  (Depression -> මානසික අවපීඩනය, try -> උත්සාහ කරනවා, doctors -> දොස්තර මහත්තුරු / දොස්තරලා).
  Do NOT write "try එකක්" / "ට්‍රයි එකක්" style half-English phrases.
  Well-known loanwords (ෆෝන්, ලොකර්, ඉන්ටර්නෙට්) and brand names are fine, in Sinhala letters.
- Abbreviations (PSAT, OCD, STEM, DNA, FBI) are written in Sinhala letters too
  (පීඑස්ඒටී, ඕසීඩී, ස්ටෙම්). Never put the English word in brackets next to a
  Sinhala word like "සීවල (Zeros)": write only the Sinhala.
  Only real passwords, usernames and codes stay in English letters.
  Do not write an English verb or adjective in Sinhala letters when a normal Sinhala word exists
  ("engaged" -> විවාහ ගිවිස ගත්ත, NOT "එන්ගේජ් වුණා"; "cancel" -> අවලංගු කරනවා; "arrest" -> අත්අඩංගුවට ගන්නවා).
- Interjections stay simple: "Mm-hm" -> "හ්ම්", "Uh" -> "ඒ...", "Huh?" -> "හා?".

- Keep subtitles short and easy to read quickly on screen.
- Write Sinhala in Sinhala script only, plus normal punctuation and digits.
  NEVER output characters from any other script (no Tamil, Hindi, Malayalam,
  Arabic, Hebrew, Georgian, Ethiopic, Korean, Chinese, Japanese, Cyrillic, Greek).
  Never put an English letter inside a Sinhala word. Re-read each line and fix
  any stray character before answering.
  Proper names are transliterated into Sinhala and spelled the SAME way every time:
  pick ONE Sinhala spelling for each person's name and never vary it
  (also keep short forms like "Shy" / "Jax" consistent with the full name).
  A character name is ALWAYS transliterated by sound. Never replace it with a Sinhala or
  English word that merely sounds similar ("Bogo" is a name, not "beef"; "Judy" is not "Judith").
  Use ONE form of "no / cannot" through the whole file: either නැහැ / බැහැ or නෑ / බෑ, not both.
- Human feel (important, so it does not read like machine translation):
  1. Keep the original punctuation: "!" stays "!", "?" stays "?", "..." stays "...". Do not turn every line into a flat statement ending in a full stop.
  2. Use "ඔයාලා" / "ඔබලා" only when "you" clearly means several people; for one person use "ඔයා".
  3. Do not overuse "තමයි", "කරනවා" or the same sentence ending on line after line. Vary the ending the way people really talk, and drop words a speaker would skip.
  4. When the speaker's gender is clear from the scene or context, use ඔහු / ඇය (or the name) correctly. Do not default to one.
  5. Prefer ONE short line per subtitle. Use 2 lines only when the text is really long.
- Tone: ${styleNote}
- Preserve names, emotions, jokes and meaning.
- You may change line breaks naturally.
- Return ONLY valid JSON.
- Do not use markdown.

${title ? "TITLE OF THE FILM / SHOW: " + title + "\n(Use it to understand genre, setting, slang and character names. Do not translate or output it.)\n" : ""}${(ctxBefore.length || ctxAfter.length) ? `CONTEXT ONLY - do NOT translate or return these lines. They show who is speaking and the mood around the lines you must translate. Keep the same pronouns and name spellings as the flow of this conversation:
LINES JUST BEFORE: ${JSON.stringify(ctxBefore)}
LINES JUST AFTER: ${JSON.stringify(ctxAfter)}
` : ""}
Return exactly this format:

{
  "translations": [
    {
      "index": 0,
      "text": "translated text"
    }
  ]
}

SUBTITLES:

${JSON.stringify(inputItems)}
`;


        const checkGlitch = language !== "ta";
        const MAX_TRIES = 3;

        // index -> final text
        const translationMap = new Map();

        // index -> latest (glitchy) candidate, used only if retries never fix it
        const dirtyCandidates = new Map();

        // lines still to be translated. First pass = every line,
        // retries = only the lines that came back with stray characters.
        let pending = input;
        let usedKey = 0, usedModel = "", usedTries = 0;

        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {

            const generated =
                await generateWithFallback(buildPrompt(pending));

            if (!generated.error) { usedKey = generated.key; usedModel = generated.model; usedTries = attempt; }

            if (generated.error) {

                // a failed RETRY must not throw away lines that already worked
                if (attempt > 1) break;

                await require("./_admin.js").logEvent({ type: "gemini", lvl: generated.status === 429 ? "warn" : "error", u: logCtx.u, job: logCtx.job, msg: (generated.code || "ERR") + " " + (generated.status || 500) + " | tried: " + ((generated.trail || []).join(", ") || "none") + " | " + String(generated.detail || generated.error || "").slice(0, 150) });
                return res.status(
                    generated.status || 500
                ).json({
                    error: generated.error,
                    code: generated.code
                });

            }

            const modelText =
                generated.data
                    ?.candidates?.[0]
                    ?.content?.parts?.[0]
                    ?.text;

            let result = null;

            try {
                result = modelText ? JSON.parse(modelText) : null;
            } catch (error) {
                await track(today(), { json: 1 });
                console.error(
                    "Model JSON parse error: finish=",
                    generated.data?.candidates?.[0]?.finishReason,
                    "len=", (modelText || "").length,
                    "tail=", (modelText || "").slice(-120)
                );

                // cut-off / slightly broken JSON: keep every complete {"index","text"} item
                const salvaged = [];
                const re = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")\s*\}/g;
                let m;

                while ((m = re.exec(modelText || "")) !== null) {
                    try {
                        salvaged.push({ index: Number(m[1]), text: JSON.parse(m[2]) });
                    } catch (e) { /* skip */ }
                }

                if (salvaged.length > 0) {
                    await track(today(), { salvaged: 1 });
                    console.warn("Salvaged", salvaged.length, "item(s) from broken JSON");
                    result = { translations: salvaged };
                }
            }

            if (!result || !Array.isArray(result.translations)) {

                // broken / cut-off JSON: ask again (a different key is picked each time)
                if (attempt < MAX_TRIES) continue;

                if (translationMap.size > 0) break;

                await require("./_admin.js").logEvent({ type: "json", lvl: "error", u: logCtx.u, job: logCtx.job, msg: modelText ? "Invalid JSON from Gemini" : "Empty reply from Gemini" });
                return res.status(502).json({
                    error: modelText
                        ? "Gemini translation was not valid JSON."
                        : "Gemini returned no translation."
                });

            }

            const stillPending = new Set(pending.map(item => item.index));

            for (const item of result.translations) {

                if (typeof item.index !== "number") continue;
                if (typeof item.text !== "string") continue;
                if (!stillPending.has(item.index)) continue;

                const text = item.text.trim();

                if (!text) continue;

                if (checkGlitch && hasGlitch(text)) {
                    dirtyCandidates.set(item.index, text);
                    continue;
                }

                const polished = checkGlitch ? polishSinhala(text) : text;
                translationMap.set(item.index, style === "formal" ? polished : unifyNegation(polished));
                dirtyCandidates.delete(item.index);
                stillPending.delete(item.index);

            }

            // Lines the model skipped entirely stay in stillPending, so the next attempt
            // asks for ONLY those lines (a cheap request) instead of failing the whole chunk
            // and making the browser re-send all 40 lines.
            if (attempt === 1) {

                const skipped = [];

                for (let i = 0; i < subtitles.length; i++) {
                    if (!translationMap.has(i) && !dirtyCandidates.has(i)) {
                        skipped.push(i);
                    }
                }

                if (skipped.length > 0) {
                    console.warn("Model skipped line(s), asking again for only these:", skipped);
                }

            }

            pending = input.filter(item => stillPending.has(item.index));

            if (pending.length === 0) {
                break;
            }

            console.warn(
                `Glitch characters in ${pending.length} line(s), attempt ${attempt}/${MAX_TRIES}`
            );

        }

        // retries ran out: strip the stray characters from what is left.
        // A line the model never produced at all is a real failure (the browser retries the chunk).
        const neverReturned = [];

        for (const item of pending) {

            const candidate = dirtyCandidates.get(item.index);
            const cleaned = candidate && cleanGlitch(candidate);

            if (cleaned) {
                translationMap.set(item.index, cleaned);
            } else {
                neverReturned.push(item.index);
            }

        }

        if (neverReturned.length > 0) {

            console.error("Missing translations:", neverReturned);
            await require("./_admin.js").logEvent({ type: "missing", lvl: "error", u: logCtx.u, job: logCtx.job, msg: neverReturned.length + " lines not translated" });

            return res.status(422).json({
                error: "Some subtitles were not translated.",
                missing: neverReturned
            });

        }

        for (let i = 0; i < subtitles.length; i++) {

            if (!translationMap.has(i)) {

                return res.status(422).json({
                    error: "Some subtitles were not translated.",
                    missing: [i]
                });

            }

        }


        const output =
            subtitles.map(
                (sub, index) => ({

                    number:
                        sub.number,

                    timestamp:
                        sub.timestamp,

                    text:
                        translationMap.get(
                            index
                        )

                })
            );


        await track(today(), { ok: 1 });
        if (limitDone) { await limitDone(); }     // this chunk is translated: counts toward the film / episode
        await require("./_admin.js").logEvent({ type: "ok", lvl: "info", u: logCtx.u, job: logCtx.job, msg: "Translated " + subtitles.length + " lines | key #" + (usedKey || "?") + " " + String(usedModel || "").replace(/^gemini-/, "") + (usedTries > 1 ? " (try " + usedTries + ")" : "") });

        return res.status(200).json({
            subtitles: output
        });


    } catch (error) {

        console.error(
            "SERVER ERROR:",
            error
        );
        try { await require("./_admin.js").logEvent({ type: "server", lvl: "error", msg: String((error && error.message) || error) }); } catch (e) { /* ignore */ }

        return res.status(500).json({

            error:
                error.message ||
                "Server error"

        });

    }

};
