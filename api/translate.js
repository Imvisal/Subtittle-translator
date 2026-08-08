// ============================================================
// SUBLANKA AI
// API TRANSLATOR
// Gemini Subtitle Translation
// ============================================================

module.exports = async function handler(req, res) {

    try {

        // ======================================================
        // METHOD CHECK
        // ======================================================

        if (req.method !== "POST") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ======================================================
        // REQUEST DATA
        // ======================================================

        const {
            subtitles,
            language = "si",
            memory = "",
            glossary = ""
        } = req.body || {};


        // ======================================================
        // SUBTITLE CHECK
        // ======================================================

        if (
            !Array.isArray(subtitles) ||
            subtitles.length === 0
        ) {

            return res.status(400).json({
                error: "No subtitles received"
            });

        }


        // ======================================================
        // API KEY
        // ======================================================

        const apiKey =
            process.env.GEMINI_API_KEY;


        if (!apiKey) {

            return res.status(500).json({
                error: "GEMINI_API_KEY is missing"
            });

        }


        // ======================================================
        // TARGET LANGUAGE
        // ======================================================

        const targetLanguage =
            language === "ta"
                ? "natural Sri Lankan Tamil"
                : "natural Sri Lankan Sinhala";


        // ======================================================
        // PREPARE SUBTITLES
        // ======================================================

        const dialogue =
            subtitles
                .map((sub, index) => {

                    const lines =
                        String(sub.text || "")
                            .split(/\r?\n/)
                            .filter(
                                line =>
                                    line.trim() !== ""
                            );


                    return (
                        `[${index}|${lines.length}]\n` +
                        lines
                            .map(
                                line =>
                                    `- ${line}`
                            )
                            .join("\n")
                    );

                })
                .join("\n\n");


        // ======================================================
        // MEMORY
        // ======================================================

        const memorySection =
            memory &&
            memory.trim()
                ? `
PREVIOUS TRANSLATION CONTEXT:

${memory}

Use this only to maintain consistency.
Do not return these previous lines.
`
                : "";


        // ======================================================
        // GLOSSARY
        // ======================================================

        const glossarySection =
            glossary &&
            glossary.trim()
                ? `
TERMINOLOGY / CHARACTER GLOSSARY:

${glossary}

Keep names and terminology consistent.
`
                : "";


        // ======================================================
        // PROMPT
        // ======================================================

        const prompt = `
You are a professional movie and TV subtitle translator.

Translate the English subtitles into ${targetLanguage}.

The translation must sound natural and conversational,
like subtitles used in Sri Lankan movies and TV series.

============================================================
MOST IMPORTANT RULE
============================================================

NEVER lose dialogue.

Every subtitle contains a number and an exact dialogue
line count.

Example input:

[27|2]
- It doesn't look like him.
- It's him.

The "2" means there are EXACTLY TWO dialogue lines.

You MUST return:

[27|2]
- මූව දකිද්දී එයා වගේ නැහැ.
- එයා තමයි.

NOT:

[27|2]
- මූව දකිද්දී එයා වගේ නැහැ.

The second line MUST NOT disappear.

============================================================
STRICT RULES
============================================================

1. Keep every [number|LINE_COUNT] exactly.

2. Do not remove subtitles.

3. Do not skip subtitles.

4. Do not add subtitles.

5. Keep the exact subtitle order.

6. Keep EXACTLY the same number of dialogue lines.

7. Never merge two dialogue lines.

8. Never split one dialogue line.

9. Translate every dialogue line.

10. Preserve the meaning.

11. Preserve jokes.

12. Preserve sarcasm.

13. Preserve emotion.

14. Preserve character personality.

15. Preserve important names.

16. Do not translate character names unnecessarily.

17. Do not invent dialogue.

18. Do not add explanations.

19. Do not add comments.

20. Do not add Markdown.

21. Do not add quotation marks unless they exist
    in the original dialogue.

22. Return ONLY the requested subtitle format.

============================================================
LINE COUNT EXAMPLES
============================================================

Input:

[0|1]
- Hello.

Output:

[0|1]
- හෙලෝ.

------------------------------------------------------------

Input:

[1|2]
- How are you?
- I'm fine.

Output:

[1|2]
- ඔයාට කොහොමද?
- මම හොඳින්.

------------------------------------------------------------

Input:

[2|3]
- First line.
- Second line.
- Third line.

Output:

[2|3]
- පළවෙනි පේළිය.
- දෙවැනි පේළිය.
- තුන්වැනි පේළිය.

============================================================
OUTPUT FORMAT
============================================================

Return ONLY this format:

[number|LINE_COUNT]
- translated dialogue line
- translated dialogue line

Do NOT return anything before or after the subtitles.

${memorySection}

${glossarySection}

============================================================
SUBTITLES TO TRANSLATE
============================================================

${dialogue}
`;


        // ======================================================
        // GEMINI API
        // ======================================================

        const response =
            await fetch(

                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",

                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            apiKey

                    },

                    body:
                        JSON.stringify({

                            contents: [

                                {

                                    parts: [

                                        {

                                            text:
                                                prompt

                                        }

                                    ]

                                }

                            ],

                            generationConfig: {

                                temperature: 0.2,

                                topP: 0.8,

                                maxOutputTokens: 8192

                            }

                        })

                }

            );


        // ======================================================
        // READ RESPONSE
        // ======================================================

        const raw =
            await response.text();


        let data;


        try {

            data =
                JSON.parse(raw);

        } catch {

            console.error(
                "Gemini raw response:",
                raw
            );


            return res.status(
                response.status || 500
            ).json({

                error:
                    "Gemini returned invalid JSON."

            });

        }


        // ======================================================
        // GEMINI ERROR
        // ======================================================

        if (!response.ok) {

            const message =
                data?.error?.message ||
                "Gemini API error";


            console.error(
                "Gemini API error:",
                message
            );


            return res.status(
                response.status
            ).json({

                error:
                    message

            });

        }


        // ======================================================
        // GET GENERATED TEXT
        // ======================================================

        const result =
            data
                ?.candidates?.[0]
                ?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();


        if (!result) {

            return res.status(500).json({

                error:
                    "Gemini returned no translation"

            });

        }


        console.log(
            "Gemini response received."
        );


        // ======================================================
        // PARSER
        // ======================================================

        const translatedMap = {};


        const lines =
            result
                .replace(
                    /```(?:text|txt|srt)?/gi,
                    ""
                )
                .replace(
                    /```/g,
                    ""
                )
                .split(/\r?\n/)
                .map(
                    line =>
                        line.trim()
                )
                .filter(
                    line =>
                        line.length > 0
                );


        let currentIndex =
            null;

        let expectedLineCount =
            0;

        let currentLines =
            [];


        function saveCurrentSubtitle() {

            if (
                currentIndex === null
            ) {

                return;

            }


            translatedMap[
                currentIndex
            ] = {

                lineCount:
                    expectedLineCount,

                lines:
                    [
                        ...currentLines
                    ]

            };


            currentIndex =
                null;

            expectedLineCount =
                0;

            currentLines =
                [];

        }


        // ======================================================
        // READ GEMINI LINES
        // ======================================================

        for (
            const line of lines
        ) {


            // --------------------------------------------------
            // HEADER
            // --------------------------------------------------

            const header =
                line.match(
                    /^\[(\d+)\|(\d+)\]$/
                );


            if (header) {

                saveCurrentSubtitle();


                currentIndex =
                    Number(
                        header[1]
                    );


                expectedLineCount =
                    Number(
                        header[2]
                    );


                currentLines =
                    [];


                continue;

            }


            // --------------------------------------------------
            // IGNORE TEXT BEFORE FIRST HEADER
            // --------------------------------------------------

            if (
                currentIndex === null
            ) {

                continue;

            }


            // --------------------------------------------------
            // DIALOGUE
            // --------------------------------------------------

            let dialogueLine =
                line
                    .replace(
                        /^[-•]\s*/,
                        ""
                    )
                    .trim();


            if (
                !dialogueLine
            ) {

                continue;

            }


            currentLines.push(
                dialogueLine
            );

        }


        // ======================================================
        // SAVE LAST
        // ======================================================

        saveCurrentSubtitle();


        // ======================================================
        // VALIDATION
        // ======================================================

        const missing = [];

        const invalidLineCount = [];

        const emptyTranslations = [];


        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {

            const source =
                subtitles[i];


            const translated =
                translatedMap[i];


            // --------------------------------------------------
            // MISSING
            // --------------------------------------------------

            if (!translated) {

                missing.push(
                    i
                );

                continue;

            }


            // --------------------------------------------------
            // SOURCE LINE COUNT
            // --------------------------------------------------

            const sourceLines =
                String(
                    source.text || ""
                )
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            const expected =
                sourceLines.length;


            // --------------------------------------------------
            // LINE COUNT HEADER
            // --------------------------------------------------

            if (
                translated.lineCount !==
                expected
            ) {

                invalidLineCount.push({

                    index:
                        i,

                    subtitle:
                        source.number,

                    expected:
                        expected,

                    received:
                        translated.lineCount

                });

                continue;

            }


            // --------------------------------------------------
            // ACTUAL LINES
            // --------------------------------------------------

            if (
                translated.lines.length !==
                expected
            ) {

                invalidLineCount.push({

                    index:
                        i,

                    subtitle:
                        source.number,

                    expected:
                        expected,

                    received:
                        translated.lines.length

                });

                continue;

            }


            // --------------------------------------------------
            // EMPTY
            // --------------------------------------------------

            if (
                translated.lines.some(
                    line =>
                        !line ||
                        !line.trim()
                )
            ) {

                emptyTranslations.push(
                    i
                );

            }

        }


        // ======================================================
        // INVALID RESPONSE
        // ======================================================

        if (
            missing.length > 0 ||
            invalidLineCount.length > 0 ||
            emptyTranslations.length > 0
        ) {

            console.error(
                "Subtitle validation failed:",
                {

                    missing,

                    invalidLineCount,

                    emptyTranslations

                }
            );


            return res.status(422).json({

                error:
                    "Subtitle validation failed.",

                missing,

                invalidLineCount,

                emptyTranslations

            });

        }


        // ======================================================
        // BUILD FINAL OUTPUT
        // ======================================================

        const output =
            subtitles.map(
                (sub, index) => {

                    const translated =
                        translatedMap[
                            index
                        ];


                    return {

                        // ORIGINAL NUMBER
                        number:
                            sub.number,

                        // ORIGINAL TIMESTAMP
                        timestamp:
                            sub.timestamp,

                        // TRANSLATED DIALOGUE
                        text:
                            translated.lines
                                .join("\n")

                    };

                }
            );


        // ======================================================
        // FINAL SAFETY CHECK
        // ======================================================

        if (
            output.length !==
            subtitles.length
        ) {

            return res.status(422).json({

                error:
                    "Subtitle count changed."

            });

        }


        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {

            const original =
                subtitles[i];

            const translated =
                output[i];


            // --------------------------------------------------
            // NUMBER
            // --------------------------------------------------

            if (
                String(
                    original.number
                ) !==
                String(
                    translated.number
                )
            ) {

                return res.status(422).json({

                    error:
                        `Subtitle number changed at ${original.number}`

                });

            }


            // --------------------------------------------------
            // TIMESTAMP
            // --------------------------------------------------

            if (
                original.timestamp !==
                translated.timestamp
            ) {

                return res.status(422).json({

                    error:
                        `Timestamp changed at ${original.number}`

                });

            }


            // --------------------------------------------------
            // LINE COUNT
            // --------------------------------------------------

            const originalLines =
                String(
                    original.text || ""
                )
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            const translatedLines =
                String(
                    translated.text || ""
                )
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            if (
                originalLines.length !==
                translatedLines.length
            ) {

                return res.status(422).json({

                    error:
                        `Dialogue line count changed at subtitle ${original.number}`

                });

            }

        }


        // ======================================================
        // SUCCESS
        // ======================================================

        return res.status(200).json({

            subtitles:
                output

        });


    } catch (error) {

        console.error(
            "Translation server error:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Server error"

        });

    }

};
