module.exports = async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const { subtitles } = req.body || {};

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

        // Send only the dialogue to Gemini
        const dialogue = subtitles.map((sub, index) => {
            return `[${index}] ${sub.text}`;
        }).join("\n");

        const prompt = `
Translate these English movie subtitles into natural Sri Lankan Sinhala.

IMPORTANT:
- Translate ONLY the dialogue.
- Keep every [number] exactly.
- Do not remove any number.
- Do not add any number.
- Keep the same order.
- Do not add explanations.
- Do not add quotation marks.
- Use natural conversational Sinhala.
- Return ONLY the translated lines.

Example:

[0] Hello, how are you?
[1] I am fine.

Return:

[0] හෙලෝ, ඔයාට කොහොමද?
[1] මම හොඳින්.

Subtitles:

${dialogue}
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

        if (!response.ok) {
            let message = "Gemini API error";

            try {
                const errorData = JSON.parse(raw);
                message = errorData?.error?.message || message;
            } catch {}

            return res.status(500).json({
                error: message
            });
        }

        const data = JSON.parse(raw);

        const result =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!result) {
            return res.status(500).json({
                error: "Gemini returned no translation"
            });
        }

        const translations = {};

        result.split("\n").forEach(line => {

            const match = line.match(
                /^\[(\d+)\]\s*(.*)$/
            );

            if (!match) return;

            const index = Number(match[1]);

            translations[index] = match[2].trim();
        });

        const output = subtitles.map((sub, index) => ({
            ...sub,
            text: translations[index] || sub.text
        }));

        return res.status(200).json({
            subtitles: output
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: error.message || "Server error"
        });
    }
};
