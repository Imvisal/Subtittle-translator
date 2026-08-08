// ============================================================
// SUBLANKA AI - TRANSLATE API
// ============================================================

module.exports = async function handler(req, res) {

    try {

        // ------------------------------------------------------
        // METHOD
        // ------------------------------------------------------

        if (req.method !== "POST") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ------------------------------------------------------
        // REQUEST
        // ------------------------------------------------------

        const {
            subtitles,
            language = "si",
            memory = "",
            glossary = ""
        } = req.body || {};


        if (
            !Array.isArray(subtitles) ||
            subtitles.length === 0
        ) {

            return res.status(400).json({
                error: "No subtitles received"
            });

        }


        // ------------------------------------------------------
        // API KEY
        // ------------------------------------------------------

        const apiKey =
            process.env.GEMINI_API_KEY;


        if (!apiKey) {

            return res.status(500).json({
                error: "GEMINI_API_KEY is missing"
            });

        }


        // ------------------------------------------------------
        // LANGUAGE
        // ------------------------------------------------------

        const targetLanguage =
            language === "ta"
                ? "natural Sri Lankan Tamil"
                : "natural Sri Lankan Sinhala";


        // ------------------------------------------------------
        // PREPARE DIALOGUE
        // ------------------------------------------------------

        const input =
            subtitles.map((sub, index) => {

                return {
                    index,
                    text: String(sub.text || "")
                };

            });


        // ------------------------------------------------------
        // MEMORY
        // ------------------------------------------------------

        let memoryText = "";

        if (
            memory &&
            String(memory).trim()
        ) {

            memoryText = `

Previous translation context:
${memory}

Use this only for terminology and character consistency.
Do not translate the previous context again.

`;

        }


        // ------------------------------------------------------
        // GLOSSARY
        // ------------------------------------------------------

        let glossaryText = "";

        if (
            glossary &&
            String(glossary).trim()
        ) {

            glossaryText = `

Glossary:
${glossary}

Keep these names and terms consistent.

`;

        }


        // ------------------------------------------------------
        // PROMPT
        // ------------------------------------------------------

        const prompt = `

You are a professional English movie and TV subtitle translator.

Translate the following subtitle dialogue into
${targetLanguage}.

IMPORTANT:

- Translate ONLY the dialogue.
- Do not translate subtitle numbers.
- Do not translate timestamps.
- Do not create timestamps.
- Do not create subtitle numbers.
- Do not add explanations.
- Do not remove any input item.
- Do not add extra items.
- Keep every input index exactly.
- Keep the exact number of dialogue lines inside each subtitle.
- Do not merge separate dialogue lines.
- Do not split dialogue lines.
- Keep character names consistent.
- Use natural conversational Sri Lankan language.
- Preserve jokes, sarcasm, emotion and meaning.
- Do not make the translation unnecessarily formal.

Each input object contains:

index = original subtitle position
text = original dialogue

Return one translation object for EVERY input object.

The output must contain:

index
text

The index MUST remain exactly the same.

The text must contain the same number of non-empty dialogue lines
as the original text.

${memoryText}

${glossaryText}

SUBTITLES:

${JSON.stringify(input)}

`;


        // ------------------------------------------------------
        // JSON SCHEMA
        // ------------------------------------------------------

        const responseSchema = {

            type: "OBJECT",

            properties: {

                translations: {

                    type: "ARRAY",

                    items: {

                        type: "OBJECT",

                        properties: {

                            index: {
                                type: "INTEGER"
                            },

                            text: {
                                type: "STRING"
                            }

                        },

                        required: [
                            "index",
                            "text"
                        ]

                    }

                }

            },

            required: [
                "translations"
            ]

        };


        // ------------------------------------------------------
        // GEMINI REQUEST
        // ------------------------------------------------------

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

                        ],

                        generationConfig: {

                            responseMimeType:
                                "application/json",

                            responseSchema:
                                responseSchema,

                            maxOutputTokens:
                                8192

                        }

                    })

                }

            );


        // ------------------------------------------------------
        // READ RESPONSE
        // ------------------------------------------------------

        const raw =
            await response.text();


        let data;


        try {

            data =
                JSON.parse(raw);

        } catch {

            console.error(
                "Invalid Gemini response:",
                raw
            );

            return res.status(500).json({

                error:
                    "Gemini returned invalid response."

            });

        }


        // ------------------------------------------------------
        // API ERROR
        // ------------------------------------------------------

        if (!response.ok) {

            const message =
                data?.error?.message ||
                "Gemini API error";


            console.error(
                "Gemini error:",
                message
            );


            return res.status(
                response.status
            ).json({

                error:
                    message

            });

        }


        // ------------------------------------------------------
        // GET MODEL TEXT
        // ------------------------------------------------------

        const resultText =
            data
                ?.candidates?.[0]
                ?.content?.parts?.[0]
                ?.text;


        if (!resultText) {

            return res.status(500).json({

                error:
                    "Gemini returned no translation."

            });

        }


        // ------------------------------------------------------
        // PARSE JSON
        // ------------------------------------------------------

        let result;


        try {

            result =
                JSON.parse(
                    resultText
                );

        } catch (error) {

            console.error(
                "Gemini JSON parse error:",
                resultText
            );

            return res.status(422).json({

                error:
                    "Gemini returned invalid translation JSON."

            });

        }


        // ------------------------------------------------------
        // CHECK ARRAY
        // ------------------------------------------------------

        if (
            !Array.isArray(
                result.translations
            )
        ) {

            return res.status(422).json({

                error:
                    "Translation list missing."

            });

        }


        // ------------------------------------------------------
        // CREATE MAP
        // ------------------------------------------------------

        const translationMap =
            new Map();


        for (
            const item
            of result.translations
        ) {

            if (
                typeof item.index !==
                "number"
            ) {

                continue;

            }


            if (
                typeof item.text !==
                "string"
            ) {

                continue;

            }


            translationMap.set(
                item.index,
                item.text.trim()
            );

        }


        // ------------------------------------------------------
        // VALIDATE
        // ------------------------------------------------------

        const missing = [];

        const lineErrors = [];


        for (
            let i = 0;
            i < subtitles.length;
            i++
        ) {

            const source =
                subtitles[i];


            const translated =
                translationMap.get(i);


            // Missing
            if (
                translated === undefined
            ) {

                missing.push(i);

                continue;

            }


            // Original lines
            const originalLines =
                String(
                    source.text || ""
                )
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            // Translated lines
            const translatedLines =
                String(
                    translated
                )
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim() !== ""
                    );


            // Line count
            if (
                originalLines.length !==
                translatedLines.length
            ) {

                lineErrors.push({

                    index: i,

                    expected:
                        originalLines.length,

                    received:
                        translatedLines.length

                });

            }

        }


        // ------------------------------------------------------
        // VALIDATION FAILED
        // ------------------------------------------------------

        if (
            missing.length > 0 ||
            lineErrors.length > 0
        ) {

            console.error(
                "Translation validation:",
                {
                    missing,
                    lineErrors
                }
            );


            return res.status(422).json({

                error:
                    "Translation validation failed.",

                missing,

                lineErrors

            });

        }


        // ------------------------------------------------------
        // BUILD OUTPUT
        // ------------------------------------------------------

        const output =
            subtitles.map(
                (sub, index) => {

                    return {

                        number:
                            sub.number,

                        timestamp:
                            sub.timestamp,

                        text:
                            translationMap.get(
                                index
                            )

                    };

                }
            );


        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------

        return res.status(200).json({

            subtitles:
                output

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
