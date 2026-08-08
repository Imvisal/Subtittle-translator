module.exports = async function handler(req, res) {

    try {

        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const { subtitles, language = "si" } =
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
                : "natural Sri Lankan Sinhala";


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
- Use natural conversational Sri Lankan language.
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
