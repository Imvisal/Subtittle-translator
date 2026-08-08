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
            memory = ""
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

        const dialogue = subtitles
            .map((sub, index) => {
                return `[${index}] ${sub.text}`;
            })
            .join("\n");

        const memorySection =
            memory && memory.trim()
                ? `
PREVIOUS TRANSLATION CONTEXT:

${memory}

Use this only to maintain consistency in:
- character speech style
- repeated phrases
- slang
- names
- terminology

Do not return these previous lines.

END PREVIOUS CONTEXT.
`
                : "";

        const prompt = `
You are a professional movie and TV subtitle translator.

Translate the following English dialogue into ${targetLanguage}.

The result must sound like natural spoken Sri Lankan Sinhala,
not a word-for-word machine translation.

${memorySection}

RULES:

1. Translate the meaning and context naturally.
2. Preserve emotion, humor, sarcasm and tone.
3. Preserve character personality and speaking style.
4. Use natural conversational Sinhala.
5. Do not unnecessarily make dialogue formal.
6. Preserve slang naturally.
7. Do not unnecessarily sanitize strong language.
8. Keep character names consistent.
9. Keep fictional names, places, brands and organizations consistent.
10. Do not invent names or information.
11. Do not add information that is not present.
12. Do not remove important meaning.
13. Keep jokes and wordplay as close to the original meaning as possible.
14. Keep repeated phrases consistent with previous context.
15. Do not add explanations.
16. Do not add translator notes.
17. Do not use Markdown.
18. Do not use quotation marks unless they are part of the dialogue.
19. Do not merge lines.
20. Do not split lines.
21. Do not skip any line.
22. Return exactly one output line for every input [number].
23. Keep every [number] exactly.
24. Return the lines in exactly the same order.

OUTPUT FORMAT:

[0] translated dialogue
[1] translated dialogue
[2] translated dialogue

IMPORTANT:
Return ONLY the [number] + translated dialogue.
Nothing else.

SUBTITLES:

${dialogue}
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
                    ]
                })
            }
        );

        const raw = await response.text();

        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            return res.status(response.status || 500).json({
                error: "Gemini returned invalid JSON."
            });
        }

        if (!response.ok) {
            const message =
                data?.error?.message ||
                "Gemini API error";

            return res.status(response.status).json({
                error: message,
                status: response.status
            });
        }

        const result =
            data?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;

        if (!result) {
            return res.status(500).json({
                error: "Gemini returned no translation"
            });
        }

        // =========================================
        // PARSE AI OUTPUT
        // =========================================

        const translations = {};

        result
            .split(/\r?\n/)
            .forEach(line => {

                const match =
                    line.match(
                        /^\[(\d+)\]\s*(.*)$/
                    );

                if (!match) {
                    return;
                }

                const index =
                    Number(match[1]);

                const text =
                    match[2].trim();

                if (!Number.isInteger(index)) {
                    return;
                }

                if (!text) {
                    return;
                }

                translations[index] =
                    text;
            });


        // =========================================
        // STRICT VALIDATION
        // =========================================

        const missing = [];

        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {
            if (
                !Object.prototype.hasOwnProperty.call(
                    translations,
                    i
                )
            ) {
                missing.push(i);
            }
        }

        if (missing.length > 0) {

            console.error(
                "Missing translations:",
                missing
            );

            return res.status(422).json({
                error:
                    `Translation incomplete. Missing ${missing.length} subtitle(s).`,
                missing
            });
        }


        // =========================================
        // IMPORTANT:
        // ORIGINAL NUMBER + TIMESTAMP ARE ALWAYS
        // TAKEN FROM THE SOURCE SRT.
        // =========================================

        const output =
            subtitles.map(
                (sub, index) => {

                    return {
                        ...sub,

                        text:
                            translations[index]
                    };

                }
            );


        // =========================================
        // FINAL SERVER VALIDATION
        // =========================================

        if (
            output.length !==
            subtitles.length
        ) {

            return res.status(422).json({
                error:
                    "Subtitle count validation failed."
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
                        `Subtitle number mismatch at ${i}`
                });

            }

            if (
                output[i].timestamp !==
                subtitles[i].timestamp
            ) {

                return res.status(422).json({
                    error:
                        `Timestamp mismatch at ${i}`
                });

            }

            if (
                !output[i].text ||
                !output[i].text.trim()
            ) {

                return res.status(422).json({
                    error:
                        `Empty translation at ${i}`
                });

            }

        }


        return res.status(200).json({
            subtitles: output
        });

    } catch (error) {

        console.error(
            "Server error:",
            error
        );

        return res.status(500).json({
            error:
                error.message ||
                "Server error"
        });
    }
};
