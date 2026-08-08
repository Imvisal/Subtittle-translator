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
                error: "GEMINI_API_KEY is missing in Vercel."
            });
        }

        const prompt = `
Translate this English movie subtitle into natural Sri Lankan Sinhala.

Rules:
- Translate only the dialogue.
- Keep the meaning accurate and natural.
- Use conversational Sinhala.
- Do not add explanations.
- Do not add quotation marks.
- Preserve line breaks.
- Return ONLY the translation.

Subtitle:

${text}
`;

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
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

        console.log("Gemini HTTP:", response.status);
        console.log("Gemini response:", raw);

        if (!response.ok) {
            let errorMessage = "Gemini API request failed.";

            try {
                const errorData = JSON.parse(raw);

                errorMessage =
                    errorData?.error?.message ||
                    errorMessage;

            } catch {
                errorMessage = raw || errorMessage;
            }

            return res.status(500).json({
                error: errorMessage
            });
        }

        const data = JSON.parse(raw);

        const translation =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!translation) {
            return res.status(500).json({
                error: "Gemini returned an empty translation."
            });
        }

        return res.status(200).json({
            translation: translation.trim()
        });

    } catch (error) {

        console.error("SERVER ERROR:", error);

        return res.status(500).json({
            error: error.message || "Server error"
        });
    }
};
