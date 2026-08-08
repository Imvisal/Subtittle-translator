const fileInput = document.getElementById("subtitleFile");
const fileName = document.getElementById("fileName");
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

let subtitles = [];


// ========================================
// FILE UPLOAD
// ========================================

fileInput.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {
        fileName.textContent = "No file selected";
        preview.value = "";
        subtitles = [];
        return;
    }

    // Show file name
    fileName.textContent = file.name;

    // Check SRT
    if (!file.name.toLowerCase().endsWith(".srt")) {

        alert("Please select an .srt file.");

        this.value = "";
        fileName.textContent = "No file selected";
        preview.value = "";
        subtitles = [];

        return;
    }

    // Read file
    const reader = new FileReader();

    reader.onload = function (event) {

        const content = event.target.result;

        // Show original subtitle
        preview.value = content;

        // Parse SRT
        subtitles = parseSRT(content);

        console.log(
            "Loaded subtitles:",
            subtitles.length
        );

        if (subtitles.length === 0) {
            alert("Could not read subtitle blocks.");
        }
    };

    reader.onerror = function () {
        alert("Could not read the subtitle file.");
    };

    reader.readAsText(file, "UTF-8");
});


// ========================================
// PARSE SRT
// ========================================

function parseSRT(srt) {

    const blocks = srt
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
        .split(/\n\s*\n/);

    const result = [];

    blocks.forEach(block => {

        const lines = block.split("\n");

        if (lines.length < 3) {
            return;
        }

        const number = lines[0].trim();
        const timestamp = lines[1].trim();

        const text = lines
            .slice(2)
            .join("\n")
            .trim();

        if (!number || !timestamp || !text) {
            return;
        }

        result.push({
            number: number,
            timestamp: timestamp,
            text: text
        });
    });

    return result;
}


// ========================================
// BUILD SRT
// ========================================

function buildSRT(data) {

    return data.map(sub => {

        return (
            sub.number +
            "\n" +
            sub.timestamp +
            "\n" +
            sub.text
        );

    }).join("\n\n");
}


// ========================================
// PROGRESS
// ========================================

function updateProgress(percent, message) {

    progressContainer.style.display = "block";

    progressFill.style.width =
        percent + "%";

    progressPercent.textContent =
        Math.round(percent) + "%";

    progressText.textContent =
        message;
}


// ========================================
// TRANSLATE ONE CHUNK
// ========================================

async function translateChunk(chunk) {

    const maxRetries = 4;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {

        try {

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
                    "Invalid server response: " +
                    raw.substring(0, 200)
                );
            }

            if (response.ok) {
                return data.subtitles;
            }

            const message =
                data.error ||
                "Translation failed";

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
                        `Retrying... ${attempt}/${maxRetries}`
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, delay)
                    );

                    continue;
                }
            }

            throw new Error(message);

        } catch (error) {

            if (attempt >= maxRetries) {
                throw error;
            }

            const delay =
                Math.pow(2, attempt) * 1000;

            await new Promise(resolve =>
                setTimeout(resolve, delay)
            );
        }
    }

    throw new Error("Translation failed.");
}


// ========================================
// TRANSLATE BUTTON
// ========================================

translateBtn.addEventListener("click", async function () {

    if (!subtitles.length) {

        alert(
            "Please upload an SRT subtitle first."
        );

        return;
    }

    translateBtn.disabled = true;

    translateBtn.textContent =
        "Translating...";

    downloadBtn.disabled = true;

    updateProgress(
        0,
        "Preparing translation..."
    );

    try {

        // 50 subtitles per request
        const chunkSize = 50;

        // 2 requests at the same time
        const concurrency = 2;

        const chunks = [];

        for (
            let i = 0;
            i < subtitles.length;
            i += chunkSize
        ) {

            chunks.push(
                subtitles.slice(
                    i,
                    i + chunkSize
                )
            );
        }

        const translatedChunks =
            new Array(chunks.length);

        let completed = 0;


        async function processChunk(index) {

            const result =
                await translateChunk(
                    chunks[index]
                );

            translatedChunks[index] =
                result;

            completed++;

            const percent =
                (completed /
                chunks.length) * 100;

            updateProgress(
                percent,
                `Translated ${completed} / ${chunks.length} parts`
            );
        }


        // Process chunks
        for (
            let i = 0;
            i < chunks.length;
            i += concurrency
        ) {

            const requests = [];

            for (
                let j = i;
                j < Math.min(
                    i + concurrency,
                    chunks.length
                );
                j++
            ) {

                requests.push(
                    processChunk(j)
                );
            }

            await Promise.all(requests);
        }


        // Combine all chunks
        subtitles =
            translatedChunks.flat();


        // Show translated SRT
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

        alert(
            "Translation error:\n\n" +
            error.message
        );

    } finally {

        translateBtn.disabled = false;

        translateBtn.textContent =
            "Translate Subtitle";

        downloadBtn.disabled = false;
    }
});


// ========================================
// DOWNLOAD
// ========================================

downloadBtn.addEventListener("click", function () {

    if (!subtitles.length) {

        alert(
            "Please upload an SRT file first."
        );

        return;
    }

    const srt =
        buildSRT(subtitles);

    const blob =
        new Blob(
            [srt],
            {
                type:
                    "application/x-subrip;charset=utf-8"
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
