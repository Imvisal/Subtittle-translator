module.exports = async function handler(req, res) {

    try {

        // ========================================
        // METHOD
        // ========================================

        if (req.method !== "POST") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ========================================
        // REQUEST DATA
        // ========================================

        const {
            subtitles,
            language = "si",
            memory = ""
        } = req.body || {};


        if (
            !Array.isArray(subtitles) ||
            subtitles.length === 0
        ) {

            return res.status(400).json({
                error: "No subtitles received"
            });

        }


        // ========================================
        // API KEY
        // ========================================

        const apiKey =
            process.env.GEMINI_API_KEY;


        if (!apiKey) {

            return res.status(500).json({
                error: "GEMINI_API_KEY is missing"
            });

        }


        // ========================================
        // LANGUAGE
        // ========================================

        let targetLanguage =
            "natural Sri Lankan Sinhala";

        if (language === "ta") {

            targetLanguage =
                "natural Sri Lankan Tamil";

        }


        // ========================================
        // DIALOGUE
        // ========================================

        const dialogue =
            subtitles
                .map((sub, index) => {

                    return `[${index}] ${sub.text}`;

                })
                .join("\n");


        // ========================================
        // MEMORY
        // ========================================

        let memorySection = "";

        if (
            memory &&
            memory.trim()
        ) {

            memorySection = `

PREVIOUS TRANSLATION CONTEXT:

The following subtitles were translated immediately
before this chunk.

Use them ONLY as context to maintain consistency
in names, slang, character speech style and repeated
phrases.

Do NOT translate or return these previous subtitles.

${memory}

END PREVIOUS TRANSLATION CONTEXT.

`;

        }


        // ========================================
        // PROMPT
        // ========================================

        const prompt = `

You are a professional movie and TV subtitle translator.

Translate the following English subtitles into
${targetLanguage}.

Your translation must sound like natural dialogue
spoken by real Sri Lankan people.

Do NOT translate word-for-word.

Translate the meaning, emotion and context.

${memorySection}

TRANSLATION RULES:

1. Use natural conversational Sinhala.

2. Preserve the original meaning.

3. Preserve emotion and tone.

4. Preserve humor and sarcasm.

5. Preserve anger, fear, sadness, romance and excitement.

6. Use natural Sri Lankan expressions where appropriate.

7. Preserve slang naturally.

8. Do not make strong language unnecessarily polite.

9. Preserve the intensity of the original dialogue.

10. Keep character names consistent.

11. Keep place names consistent.

12. Keep company, product and organization names
    when they should remain in English.

13. Do not unnecessarily translate proper nouns.

14. Keep repeated phrases consistent with previous
    translations.

15. Keep the speaking style of characters consistent.

16. Do not add explanations.

17. Do not add translator notes.

18. Do not add markdown.

19. Do not add quotation marks unless they belong
    to the original dialogue.

20. Do not merge subtitle lines.

21. Do not remove subtitle lines.

22. Do not create extra subtitle lines.

23. Keep every [number] exactly.

24. Keep the exact same order.

25. Return ONLY the translated subtitle lines.

OUTPUT FORMAT:

[0] translated dialogue
[1] translated dialogue
[2] translated dialogue

Nothing else.

SUBTITLES:

${dialogue}

`;


        // ========================================
        // GEMINI API
        // ========================================

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


        // ========================================
        // RESPONSE
        // ========================================

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


        // ========================================
        // GEMINI ERROR
        // ========================================

        if (!response.ok) {

            const message =
                data?.error?.message ||
                "Gemini API error";


            console.error(
                "Gemini API error:",
                response.status,
                message
            );


            return res.status(
                response.status
            ).json({

                error: message,

                status:
                    response.status

            });

        }


        // ========================================
        // GET TEXT
        // ========================================

        const result =
            data
                ?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;


        if (!result) {

            return res.status(500).json({

                error:
                    "Gemini returned no translation."

            });

        }


        // ========================================
        // PARSE
        // ========================================

        const translations = {};


        result
            .split("\n")
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


                const translatedText =
                    match[2].trim();


                translations[index] =
                    translatedText;

            });


        // ========================================
        // OUTPUT
        // ========================================

        const output =
            subtitles.map(
                (sub, index) => {

                    return {

                        ...sub,

                        text:
                            translations[index] ||
                            sub.text

                    };

                }
            );


        // ========================================
        // RETURN
        // ========================================

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
