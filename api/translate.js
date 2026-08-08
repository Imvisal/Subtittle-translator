const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

function parseSRT(srt) {
    const blocks = srt
        .replace(/\r\n/g, "\n")
        .trim()
        .split(/\n\s*\n/);

    return blocks.map(block => {
        const lines = block.split("\n");

        const number = lines[0];
        const timestamp = lines[1];

        const text = lines.slice(2).join("\n");

        return {
            number,
            timestamp,
            text
        };
    });
}

function buildSRT(subtitles) {
    return subtitles.map(sub => {
        return `${sub.number}
${sub.timestamp}
${sub.text}`;
    }).join("\n\n");
}

module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {

        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Subtitle text is required"
            });
        }

        const subtitles = parseSRT(text);

        const dialogue = subtitles
            .map((sub, index) => `[${index}] ${sub.text}`)
            .join("\n");

        const prompt = `
Translate the following English movie subtitles into natural Sri Lankan Sinhala.

IMPORTANT RULES:

1. Translate ONLY the dialogue.
2. Keep the [number] exactly as it is.
3. Do NOT add explanations.
4. Do NOT remove any [number].
5. Keep the same order.
6. Make Sinhala natural and conversational.
7. Preserve the meaning of jokes, slang and emotions.
8. Return ONLY the translated lines.

Example:

[0] Hello, how are you?
[1] I'm fine.

Return:

[0] හෙලෝ, ඔයාට කොහොමද?
[1] මම හොඳින්.

Subtitles:

${dialogue}
`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const result = response.text.trim();

        const translatedLines = result
            .split("\n")
            .filter(line => line.trim());

        translatedLines.forEach(line => {

            const match = line.match(/^\[(\d+)\]\s*(.*)$/);

            if (!match) return;

            const index = Number(match[1]);
            const translatedText = match[2];

            if (subtitles[index]) {
                subtitles[index].text = translatedText;
            }
        });

        const finalSRT = buildSRT(subtitles);

        res.status(200).json({
            translation: finalSRT
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Translation failed"
        });
    }
};
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
