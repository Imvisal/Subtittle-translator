const { GoogleGenAI } = require("@google/genai");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                error: "Subtitle text is required"
            });
        }

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

        const prompt = `
Translate this English subtitle into natural Sri Lankan Sinhala.

Rules:
- Translate only the dialogue.
- Do not add explanations.
- Keep the meaning natural.
- Do not translate subtitle numbers.
- Do not translate timestamps.
- Return only the translated text.

${text}
`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        res.status(200).json({
            translation: response.text
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Translation failed"
        });
    }
};
