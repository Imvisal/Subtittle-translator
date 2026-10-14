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

const DEFAULT_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
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

    // best model first, and every key is tried on it before moving on
    for (const model of models) {
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
                return { data };
            }

            const message =
                data?.error?.message ||
                raw.substring(0, 300) ||
                "Gemini API error";

            lastStatus = response.status;
            lastMessage = message;

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
            if (response.status === 503 || response.status === 500) {
                cooldowns.set(id, Date.now() + 15 * 1000);
                continue;
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

    if (sawQuota) {
        return {
            status: 429,
            code: "QUOTA_EXHAUSTED",
            error:
                "Today's free translation limit has been reached. " +
                "Please try again later."
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


        const prompt = `
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
- Keep subtitles short and easy to read quickly on screen.
- Write Sinhala in Sinhala script only (no Singlish/English letters),
  except proper names which can be transliterated into Sinhala.
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

${JSON.stringify(input)}
`;


        const generated =
            await generateWithFallback(prompt);

        if (generated.error) {

            return res.status(
                generated.status || 500
            ).json({
                error: generated.error,
                code: generated.code
            });

        }

        const data = generated.data;


        const modelText =
            data
                ?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;


        if (!modelText) {

            return res.status(502).json({
                error:
                    "Gemini returned no translation."
            });

        }


        let result;

        try {

            result =
                JSON.parse(modelText);

        } catch (error) {

            console.error(
                "Model JSON parse error:",
                modelText
            );

            return res.status(502).json({
                error:
                    "Gemini translation was not valid JSON."
            });

        }


        if (
            !Array.isArray(
                result.translations
            )
        ) {

            return res.status(502).json({
                error:
                    "Translation list is missing."
            });

        }


        const translationMap =
            new Map();


        for (
            const item
            of result.translations
        ) {

            if (
                typeof item.index !== "number"
            ) {
                continue;
            }

            if (
                typeof item.text !== "string"
            ) {
                continue;
            }

            if (
                !item.text.trim()
            ) {
                continue;
            }

            translationMap.set(
                item.index,
                item.text.trim()
            );

        }


        const missing = [];


        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {

            if (
                !translationMap.has(i)
            ) {

                missing.push(i);

            }

        }


        if (
            missing.length > 0
        ) {

            console.error(
                "Missing translations:",
                missing
            );

            return res.status(422).json({

                error:
                    "Some subtitles were not translated.",

                missing

            });

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
