module.exports = async function handler(req, res) {

    try {

        // ========================================
        // METHOD CHECK
        // ========================================

        if (req.method !== "POST") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ========================================
        // GET DATA
        // ========================================

        const {
            subtitles,
            language = "si"
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
                error:
                    "GEMINI_API_KEY is missing"
            });

        }


        // ========================================
        // LANGUAGE
        // ========================================

        let targetLanguage = "Sri Lankan Sinhala";

        if (language === "ta") {
            targetLanguage = "Sri Lankan Tamil";
        }


        // ========================================
        // PREPARE DIALOGUE
        // ========================================

        const dialogue =
            subtitles
                .map((sub, index) => {

                    return `[${index}] ${sub.text}`;

                })
                .join("\n");


        // ========================================
        // PROMPT
        // ========================================

        const prompt = `

Translate these English movie subtitles into natural ${targetLanguage}.

IMPORTANT RULES:

1. Translate ONLY the dialogue.
2. Keep every [number] exactly.
3. Do not remove any [number].
4. Do not add any [number].
5. Keep the exact same order.
6. Return every subtitle line.
7. Do not add explanations.
8. Do not add quotation marks.
9. Do not add markdown.
10. Do not add comments.
11. Use natural conversational ${targetLanguage}.
12. Preserve names, places and important movie terms naturally.
13. Do not translate the [number] markers.
14. Return ONLY the translated lines.

Example:

[0] Hello, how are you?
[1] I am fine.

Return:

[0] හෙලෝ, ඔයාට කොහොමද?
[1] මම හොඳින්.

Subtitles:

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
        // READ RESPONSE
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
                "Gemini API:",
                response.status,
                message
            );


            // IMPORTANT:
            // Keep original status code.
            // This allows script.js to detect 429.

            return res.status(
                response.status
            ).json({

                error: message,

                status:
                    response.status

            });

        }


        // ========================================
        // GET MODEL OUTPUT
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
        // PARSE TRANSLATIONS
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


                const text =
                    match[2]
                        .trim();


                translations[index] =
                    text;

            });


        // ========================================
        // CREATE OUTPUT
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
