module.exports = async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const {
            subtitles,
            language = "si",
            memory = "",
            glossary = ""
        } = req.body || {};

        if (!Array.isArray(subtitles) || subtitles.length === 0) {
            return res.status(400).json({
                error: "No subtitles received"
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is missing"
            });
        }

        const targetLanguage =
            language === "ta"
                ? "natural Sri Lankan Tamil"
                : "natural Sri Lankan Sinhala";


        // =====================================================
        // IMPORTANT:
        // SEND EACH SUBTITLE WITH ITS EXACT LINE COUNT
        // =====================================================

        const dialogue = subtitles
            .map((sub, index) => {

                const lines =
                    sub.text
                        .split(/\r?\n/)
                        .filter(line => line.trim() !== "");

                return (
                    `[${index}|${lines.length}]\n` +
                    lines
                        .map(line => `- ${line}`)
                        .join("\n")
                );

            })
            .join("\n\n");


        const memorySection =
            memory && memory.trim()
                ? `
PREVIOUS TRANSLATION CONTEXT:

${memory}

Use this only to maintain consistency.
Do not return these previous lines.
`
                : "";


        const glossarySection =
            glossary && glossary.trim()
                ? `
TERMINOLOGY / CHARACTER GLOSSARY:

${glossary}

Keep these names and terms consistent.
`
                : "";


        // =====================================================
        // PROMPT
        // =====================================================

        const prompt = `
You are a professional movie and TV subtitle translator.

Translate the English subtitles into ${targetLanguage}.

Your priority is:

1. Preserve ALL subtitle content.
2. Preserve the exact number of dialogue lines inside every subtitle.
3. Preserve the exact subtitle order.
4. Translate naturally for Sri Lankan viewers.
5. Preserve emotion, humor, sarcasm and character personality.
6. Never invent information.
7. Never remove dialogue.
8. Never merge separate dialogue lines.
9. Never split one dialogue line into multiple lines.

${memorySection}

${glossarySection}

====================================================
VERY IMPORTANT LINE PRESERVATION RULE
====================================================

Every subtitle has this format:

[number|LINE_COUNT]

For example:

[27|2]
- It doesn't look like him.
- It's him.

The "2" means this subtitle contains EXACTLY 2 dialogue lines.

Your response MUST also contain EXACTLY 2 translated lines:

[27|2]
- මූව දකිද්දී එයා වගේ නැහැ.
- එයා තමයි.

If the input is:

[10|1]
- Hello.

Return:

[10|1]
- හෙලෝ.

If the input is:

[20|3]
- First line.
- Second line.
- Third line.

Return exactly 3 translated lines.

====================================================
STRICT RULES
====================================================

- Keep every [number|LINE_COUNT] exactly.
- Do not remove any subtitle.
- Do not add any subtitle.
- Do not skip any subtitle.
- Do not change the order.
- Do not merge dialogue lines.
- Do not split dialogue lines.
- Keep EXACTLY the same number of dialogue lines.
- Do not add explanations.
- Do not add notes.
- Do not add Markdown.
- Do not add quotation marks unless they exist in the original dialogue.
- Keep character names consistent.
- Keep proper nouns consistent.
- Preserve jokes and sarcasm.
- Preserve strong language when it is part of the original.
- Use natural conversational Sinhala.
- Do not translate names unnecessarily.
- Do not invent names.
- Do not invent dialogue.

====================================================
OUTPUT FORMAT
====================================================

Return ONLY:

[number|LINE_COUNT]
- translated line
- translated line

Nothing else.

====================================================
SUBTITLES
====================================================

${dialogue}
`;


        // =====================================================
        // GEMINI REQUEST
        // =====================================================

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
                    ]
                })
            }
        );


        const raw =
            await response.text();


        let data;

        try {

            data =
                JSON.parse(raw);

        } catch {

            return res.status(
                response.status || 500
            ).json({
                error:
                    "Gemini returned invalid JSON."
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


        const result =
            data?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;


        if (!result) {

            return res.status(500).json({
                error:
                    "Gemini returned no translation"
            });

        }


        // =====================================================
        // PARSE AI RESPONSE
        // =====================================================

        const translatedMap = {};

        const blocks =
            result
                .trim()
                .split(/\n\s*\n/);


        blocks.forEach(block => {

            const lines =
                block
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean);


            if (lines.length === 0) {
                return;
            }


            // -----------------------------------------------
            // Header
            // -----------------------------------------------

            const header =
                lines[0].match(
                    /^\[(\d+)\|(\d+)\]$/
                );


            if (!header) {
                return;
            }


            const index =
                Number(header[1]);


            const lineCount =
                Number(header[2]);


            // -----------------------------------------------
            // Translation lines
            // -----------------------------------------------

            const translatedLines =
                lines
                    .slice(1)
                    .map(line => {

                        return line
                            .replace(
                                /^-\s?/,
                                ""
                            )
                            .trim();

                    });


            translatedMap[index] = {

                lineCount,

                lines:
                    translatedLines

            };

        });


        // =====================================================
        // STRICT VALIDATION
        // =====================================================

        const missing = [];

        const invalidLineCount = [];


        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {

            const source =
                subtitles[i];


            const sourceLines =
                source.text
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            const translated =
                translatedMap[i];


            // -----------------------------------------------
            // Missing subtitle
            // -----------------------------------------------

            if (!translated) {

                missing.push(i);

                continue;

            }


            // -----------------------------------------------
            // LINE COUNT
            // -----------------------------------------------

            if (
                translated.lineCount !==
                sourceLines.length
            ) {

                invalidLineCount.push({
                    index: i,
                    expected:
                        sourceLines.length,
                    received:
                        translated.lineCount
                });

                continue;

            }


            // -----------------------------------------------
            // ACTUAL RETURNED LINES
            // -----------------------------------------------

            if (
                translated.lines.length !==
                sourceLines.length
            ) {

                invalidLineCount.push({
                    index: i,
                    expected:
                        sourceLines.length,
                    received:
                        translated.lines.length
                });

                continue;

            }


            // -----------------------------------------------
            // EMPTY LINE
            // -----------------------------------------------

            if (
                translated.lines.some(
                    line =>
                        !line ||
                        !line.trim()
                )
            ) {

                invalidLineCount.push({
                    index: i,
                    expected:
                        sourceLines.length,
                    received:
                        translated.lines.length
                });

            }

        }


        // =====================================================
        // REJECT BAD RESPONSE
        // =====================================================

        if (
            missing.length > 0 ||
            invalidLineCount.length > 0
        ) {

            console.error(
                "Translation validation failed",
                {
                    missing,
                    invalidLineCount
                }
            );


            return res.status(422).json({

                error:
                    "Translation incomplete or dialogue line count changed.",

                missing,

                invalidLineCount

            });

        }


        // =====================================================
        // BUILD OUTPUT
        // =====================================================

        const output =
            subtitles.map(
                (sub, index) => {

                    const translated =
                        translatedMap[index];


                    // IMPORTANT:
                    // ORIGINAL NUMBER + TIMESTAMP
                    // ARE ALWAYS PRESERVED.

                    return {

                        ...sub,

                        text:
                            translated.lines
                                .join("\n")

                    };

                }
            );


        // =====================================================
        // FINAL VALIDATION
        // =====================================================

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

            if (
                output[i].number !==
                subtitles[i].number
            ) {

                return res.status(422).json({
                    error:
                        `Subtitle number changed at ${i}`
                });

            }


            if (
                output[i].timestamp !==
                subtitles[i].timestamp
            ) {

                return res.status(422).json({
                    error:
                        `Timestamp changed at ${i}`
                });

            }


            const originalLines =
                subtitles[i]
                    .text
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim()
                    );


            const outputLines =
                output[i]
                    .text
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim()
                    );


            if (
                originalLines.length !==
                outputLines.length
            ) {

                return res.status(422).json({
                    error:
                        `Dialogue line count changed at subtitle ${i}`
                });

            }

        }


        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({
            subtitles: output
        });


    } catch (error) {

        console.error(
            "Translation API error:",
            error
        );


        return res.status(500).json({
            error:
                error.message ||
                "Server error"
        });

    }
};
