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
    ["ට්‍රයි එක", "උත්සාහය"]
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

// "-latest" aliases always point at a model that is still available,
// so they keep working when Google retires a fixed model name.
const DEFAULT_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-flash-latest"
];

function getKeys() {
    const list = [];

    if (process.env.GEMINI_API_KEYS) {
        list.push(...process.env.GEMINI_API_KEYS.split(","));
    }

    list.push(process.env.GEMINI_API_KEY);

    for (let i = 2; i <= 10; i++) {
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

async function generateWithFallback(prompt) {
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
    let sawBusy = false;

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

        for (let k = 0; k < keys.length; k++) {

            const id = k + "|" + model;

            if ((cooldowns.get(id) || 0) > Date.now()) {
                sawQuota = true;
                continue;
            }

            const response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/" +
                model + ":generateContent",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": keys[k]
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            maxOutputTokens: 8192
                        }
                    })
                }
            );

            const raw = await response.text();

            console.log("Gemini", model, "key#" + (k + 1), "status:", response.status);

            let data = null;

            try {
                data = JSON.parse(raw);
            } catch (error) {
                // handled below
            }

            if (response.ok && data) {
                modelBusyUntil.delete(model);
                return { data };
            }

            const message =
                data?.error?.message ||
                raw.substring(0, 300) ||
                "Gemini API error";

            lastStatus = response.status;
            lastMessage = message;

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

                cooldowns.set(
                    id,
                    isDailyQuotaMessage(message)
                        ? nextPacificMidnight()
                        : Date.now() + 60 * 1000
                );

                continue;
            }

            // model overloaded / temporary -> try the next one, short pause
            // (overload is per MODEL, not per key, so skip the other keys and
            // go straight to the next model instead of waiting on every key)
            if (response.status === 503 || response.status === 500) {
                sawBusy = true;
                modelBusyUntil.set(model, Date.now() + MODEL_BUSY_MS);
                break;
            }

            // bad / blocked key -> skip that key for a while
            if (
                response.status === 403 ||
                (response.status === 400 && /api key/i.test(message))
            ) {
                cooldowns.set(id, Date.now() + 60 * 60 * 1000);
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

    if (sawQuota) {
        return {
            status: 429,
            code: "QUOTA_EXHAUSTED",
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

    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const { subtitles, language = "si", style = "natural" } =
            req.body || {};

        if (
            !Array.isArray(subtitles) ||
            subtitles.length === 0
        ) {
            return res.status(400).json({
                error: "No subtitles received"
            });
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
  විශ්වාසද? -> ෂුවර්ද? / හරියටම ද?     ස්තුතියි -> තැන්ක්ස් / ස්තූතියි (casual)
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
- Tone: ${styleNote}
- Preserve names, emotions, jokes and meaning.
- You may change line breaks naturally.
- Return ONLY valid JSON.
- Do not use markdown.

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

        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {

            const generated =
                await generateWithFallback(buildPrompt(pending));

            if (generated.error) {

                // a failed RETRY must not throw away lines that already worked
                if (attempt > 1) break;

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
                console.error("Model JSON parse error:", modelText);
            }

            if (!result || !Array.isArray(result.translations)) {

                if (attempt > 1) break;

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

                translationMap.set(item.index, checkGlitch ? polishSinhala(text) : text);
                dirtyCandidates.delete(item.index);
                stillPending.delete(item.index);

            }

            // lines the model skipped entirely (first pass only is an error)
            if (attempt === 1) {

                const missing = [];

                for (let i = 0; i < subtitles.length; i++) {
                    if (!translationMap.has(i) && !dirtyCandidates.has(i)) {
                        missing.push(i);
                    }
                }

                if (missing.length > 0) {

                    console.error("Missing translations:", missing);

                    return res.status(422).json({
                        error: "Some subtitles were not translated.",
                        missing
                    });

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

        // retries ran out: strip the stray characters from what is left
        for (const item of pending) {

            const candidate = dirtyCandidates.get(item.index);

            translationMap.set(
                item.index,
                (candidate && cleanGlitch(candidate)) ||
                    String(subtitles[item.index].text || "")
            );

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


        return res.status(200).json({
            subtitles: output
        });


    } catch (error) {

        console.error(
            "SERVER ERROR:",
            error
        );

        return res.status(500).json({

            error:
                error.message ||
                "Server error"

        });

    }

};
