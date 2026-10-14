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

        const apiKey =
            process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is missing"
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


        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },

                body: JSON.stringify({

                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ],

                    generationConfig: {
                        responseMimeType:
                            "application/json",

                        maxOutputTokens:
                            8192
                    }

                })
            }
        );


        const raw =
            await response.text();


        console.log(
            "Gemini status:",
            response.status
        );


        console.log(
            "Gemini raw response:",
            raw.substring(0, 1000)
        );


        let data;

        try {

            data = JSON.parse(raw);

        } catch (error) {

            console.error(
                "Gemini response was not JSON:",
                raw
            );

            return res.status(502).json({
                error:
                    "Gemini returned an invalid response.",
                details:
                    raw.substring(0, 500)
            });

        }


        if (!response.ok) {

            const message =
                data?.error?.message ||
                "Gemini API error";

            return res.status(
                response.status
            ).json({
                error: message
            });

        }


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
