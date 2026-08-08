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

You are a professional movie subtitle translator.

Translate the following English movie/TV subtitles into
natural, conversational Sri Lankan Sinhala.

The goal is NOT a word-for-word translation.

The translation should sound like real Sinhala dialogue
spoken by characters in a movie or TV series.

IMPORTANT TRANSLATION RULES:

1. Translate the meaning and context, not individual words.

2. Use natural Sri Lankan Sinhala.

3. Make dialogue conversational and easy to understand.

4. Preserve the emotion and tone of the original dialogue.

5. Preserve humor, sarcasm, anger, fear, sadness, excitement,
   romance and other emotions.

6. Preserve slang when appropriate. Translate slang into
   natural Sinhala slang when possible.

7. Do not make strong language unnecessarily polite.
   Preserve the intensity of the original dialogue naturally.

8. Preserve character names exactly unless the name is clearly
   intended to be translated.

9. Preserve place names, company names, product names,
   organizations and important fictional terms.

10. Do not translate proper nouns unnecessarily.

11. Keep the meaning accurate even when changing the sentence
    structure to make the Sinhala sound natural.

12. Avoid robotic or literal Sinhala.

13. Avoid overly formal Sinhala unless the character's dialogue
    is clearly formal.

14. Do not add explanations.

15. Do not add translator notes.

16. Do not add quotation marks unless they are part of the
    original dialogue.

17. Do not add markdown.

18. Do not merge different subtitle lines.

19. Do not remove subtitle lines.

20. Do not create new subtitle lines.

21. Keep every [number] exactly as provided.

22. Keep the exact same order.

23. Return ONLY the translated subtitle lines.

IMPORTANT OUTPUT FORMAT:

Input:

[0] Hey, what are you doing?
[1] You can't be serious.
[2] Get out of here!

Output:

[0] හේයි, ඔයා මොකද කරන්නේ?
[1] ඔයා මේක ඇත්තටම කියනවා නෙවෙයි නේද?
[2] මෙතනින් පලයන්!

DO NOT return anything except lines in this format:

[number] translated dialogue

Subtitles to translate:

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
