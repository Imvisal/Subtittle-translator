const fileInput = document.getElementById("subtitleFile");
const preview = document.getElementById("preview");
const translateBtn = document.getElementById("translateBtn");
const downloadBtn = document.getElementById("downloadBtn");

const progressContainer =
    document.getElementById("progressContainer");

const progressFill =
    document.getElementById("progressFill");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");


// =====================================
// CURRENT SUBTITLE DATA
// =====================================

let subtitles = [];


// =====================================
// READ SRT
// =====================================

fileInput.addEventListener("change", () => {

    const file = fileInput.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(event) {

        const text = event.target.result;

        preview.value = text;

        subtitles = parseSRT(text);

        console.log("Subtitles:", subtitles.length);
    };

    reader.readAsText(file, "UTF-8");
});


// =====================================
// PARSE SRT
// =====================================

function parseSRT(srt) {

    const blocks = srt
        .replace(/\r\n/g, "\n")
        .trim()
        .split(/\n\s*\n/);

    return blocks.map(block => {

        const lines = block.split("\n");

        const number = lines[0];
        const timestamp = lines[1];

        const text = lines
            .slice(2)
            .join("\n");

        return {
            number,
            timestamp,
            text
        };
    });
}


// =====================================
// BUILD SRT
// =====================================

function buildSRT(data) {

    return data.map(sub => {

        return `${sub.number}
${sub.timestamp}
${sub.text}`;

    }).join("\n\n");
}


// =====================================
// PROGRESS
// =====================================

function updateProgress(percent, message) {

    progressContainer.style.display = "block";

    progressFill.style.width = percent + "%";

    progressPercent.textContent =
        Math.round(percent) + "%";

    progressText.textContent = message;
}


// =====================================
// TRANSLATE
// =====================================

translateBtn.addEventListener("click", async () => {

    if (!subtitles.length) {

        alert("Please upload an SRT file first.");

        return;
    }

    translateBtn.disabled = true;

    translateBtn.textContent = "Translating...";

    progressContainer.style.display = "block";

    const chunkSize = 50;

    const totalChunks =
        Math.ceil(subtitles.length / chunkSize);

    let translated = [];

    try {

        for (let i = 0; i < subtitles.length; i += chunkSize) {

            const chunk =
                subtitles.slice(i, i + chunkSize);

            const chunkNumber =
                Math.floor(i / chunkSize) + 1;

            updateProgress(
                (i / subtitles.length) * 100,
                `Translating ${chunkNumber}/${totalChunks}...`
            );


            const response = await fetch(
                "/api/translate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        subtitles: chunk
                    })
                }
            );


            const raw =
                await response.text();


            let data;

            try {

                data = JSON.parse(raw);

            } catch {

                throw new Error(
                    "Server returned invalid response: " +
                    raw.substring(0, 300)
                );
            }


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Translation failed"
                );
            }


            translated =
                translated.concat(data.subtitles);


            // Show progress
            const percent =
                ((i + chunk.length) /
                subtitles.length) * 100;


            updateProgress(
                percent,
                `Translated ${i + chunk.length} / ${subtitles.length}`
            );


            // Small delay to avoid hammering the API
            await new Promise(resolve =>
                setTimeout(resolve, 300)
            );
        }


        subtitles = translated;

        preview.value =
            buildSRT(subtitles);


        updateProgress(
            100,
            "Translation complete!"
        );


        alert(
            "Sinhala subtitle translation completed!"
        );


    } catch (error) {

        console.error(error);

        updateProgress(
            0,
            "Translation failed"
        );

        alert(error.message);

    } finally {

        translateBtn.disabled = false;

        translateBtn.textContent =
            "Translate Subtitle";
    }
});


// =====================================
// DOWNLOAD
// =====================================

downloadBtn.addEventListener("click", () => {

    if (!subtitles.length) {

        alert(
            "Please upload and translate an SRT file first."
        );

        return;
    }


    const srt =
        buildSRT(subtitles);


    const blob =
        new Blob(
            [srt],
            {
                type: "text/plain;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href = url;

    link.download =
        "Sinhala-Subtitle.srt";


    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
});
async function translateChunk(chunk) {

    const maxRetries = 4;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {

        try {

            const response = await fetch("/api/translate", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    subtitles: chunk
                })
            });

            const raw = await response.text();

            let data;

            try {
                data = JSON.parse(raw);
            } catch {
                throw new Error(raw);
            }

            if (response.ok) {
                return data.subtitles;
            }

            const errorMessage =
                data.error || "Translation failed";

            // Retry temporary errors
            if (
                response.status === 429 ||
                response.status === 500 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504
            ) {

                if (attempt < maxRetries) {

                    const delay =
                        Math.pow(2, attempt) * 1000;

                    updateProgress(
                        0,
                        `Temporary error. Retrying (${attempt}/${maxRetries})...`
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, delay)
                    );

                    continue;
                }
            }

            throw new Error(errorMessage);

        } catch (error) {

            if (attempt === maxRetries) {
                throw error;
            }

            const delay =
                Math.pow(2, attempt) * 1000;

            await new Promise(resolve =>
                setTimeout(resolve, delay)
            );
        }
    }

    throw new Error("Translation failed");
}
