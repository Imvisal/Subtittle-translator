module.exports = async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const { text } = req.body || {};

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Subtitle text is required"
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured in Vercel."
            });
        }

        const prompt = `
Translate the following English movie subtitle into natural Sri Lankan Sinhala.

Rules:
- Translate only the dialogue.
- Keep the meaning natural and conversational.
- Do not add explanations.
- Return only the translated subtitle.
- Preserve the original line breaks.

Subtitle:

${text}
`;

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
            encodeURIComponent(apiKey),
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
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

        console.log("Gemini status:", response.status);
        console.log("Gemini response:", raw.substring(0, 1000));

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Gemini API error",
                details: raw
            });
        }

        const data = JSON.parse(raw);

        const translated =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!translated) {
            return res.status(500).json({
                error: "Gemini returned no translation.",
                details: data
            });
        }

        return res.status(200).json({
            translation: translated
        });

    } catch (error) {

        console.error("SERVER ERROR:", error);

        return res.status(500).json({
            error: error.message || "Server error"
        });
    }
};
