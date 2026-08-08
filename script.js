// ============================================
// SubLanka AI
// Reliable Subtitle Translator
// ============================================


// ============================================
// ELEMENTS
// ============================================

const fileInput = document.getElementById("subtitleFile");
const fileName = document.getElementById("fileName");
const preview = document.getElementById("preview");

const translateBtn = document.getElementById("translateBtn");
const downloadBtn = document.getElementById("downloadBtn");

const languageSelect = document.getElementById("language");

const progressContainer =
    document.getElementById("progressContainer");

const progressFill =
    document.getElementById("progressFill");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");


// ============================================
// SETTINGS
// ============================================

// Number of subtitle blocks per Gemini request
const CHUNK_SIZE = 30;

// IMPORTANT:
// Only one request at a time.
// This avoids hitting the Gemini quota too quickly.
const CONCURRENCY = 1;

// Maximum retries for temporary errors
const MAX_RETRIES = 10;

// Wait 60 seconds after quota/rate-limit error
const QUOTA_WAIT = 60000;

// Small delay between successful requests
const REQUEST_DELAY = 1500;


// ============================================
// DATA
// ============================================

let subtitles = [];

let translating = false;


// ============================================
// FILE UPLOAD
// ============================================

fileInput.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {

        fileName.textContent =
            "No file selected";

        preview.value = "";

        subtitles = [];

        return;
    }


    // Check extension

    if (
        !file.name
            .toLowerCase()
            .endsWith(".srt")
    ) {

        alert(
            "Please select an .srt subtitle file."
        );

        fileInput.value = "";

        fileName.textContent =
            "No file selected";

        preview.value = "";

        subtitles = [];

        return;
    }


    // Show file name

    fileName.textContent =
        file.name;


    // Read file

    const reader =
        new FileReader();


    reader.onload = function (event) {

        const content =
            event.target.result;


        // Show original subtitle

        preview.value =
            content;


        // Parse subtitle

        subtitles =
            parseSRT(content);


        console.log(
            "Loaded subtitles:",
            subtitles.length
        );


        if (subtitles.length === 0) {

            alert(
                "No valid subtitle blocks were found."
            );

            return;
        }


        // Reset progress

        progressContainer.style.display =
            "none";

        progressFill.style.width =
            "0%";

        progressText.textContent =
            "Ready";

        progressPercent.textContent =
            "0%";
    };


    reader.onerror = function () {

        alert(
            "Could not read the subtitle file."
        );
    };


    reader.readAsText(
        file,
        "UTF-8"
    );

});


// ============================================
// PARSE SRT
// ============================================

function parseSRT(srt) {

    const cleanText =
        srt
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();


    if (!cleanText) {
        return [];
    }


    const blocks =
        cleanText.split(
            /\n\s*\n/
        );


    const result = [];


    blocks.forEach(block => {

        const lines =
            block.split("\n");


        if (lines.length < 3) {
            return;
        }


        const number =
            lines[0].trim();


        const timestamp =
            lines[1].trim();


        const text =
            lines
                .slice(2)
                .join("\n")
                .trim();


        if (
            !number ||
            !timestamp ||
            !text
        ) {
            return;
        }


        if (
            !timestamp.includes("-->")
        ) {
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


// ============================================
// BUILD SRT
// ============================================

function buildSRT(data) {

    return data
        .map(subtitle => {

            return (
                subtitle.number +
                "\n" +
                subtitle.timestamp +
                "\n" +
                subtitle.text
            );

        })
        .join("\n\n");
}


// ============================================
// PROGRESS
// ============================================

function updateProgress(
    percent,
    message
) {

    progressContainer.style.display =
        "block";


    const safePercent =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );


    progressFill.style.width =
        safePercent + "%";


    progressPercent.textContent =
        Math.round(
            safePercent
        ) + "%";


    progressText.textContent =
        message;
}


// ============================================
// WAIT
// ============================================

function wait(ms) {

    return new Promise(resolve => {

        setTimeout(
            resolve,
            ms
        );

    });
}


// ============================================
// TRANSLATE ONE CHUNK
// ============================================

async function translateChunk(
    chunk,
    chunkNumber,
    totalChunks,
    completedChunks
) {

    let attempt = 0;


    while (
        attempt < MAX_RETRIES
    ) {

        attempt++;


        try {

            console.log(
                `Translating chunk ${chunkNumber}/${totalChunks}, attempt ${attempt}`
            );


            const response =
                await fetch(
                    "/api/translate",
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body: JSON.stringify({

                            subtitles: chunk,

                            language:
                                languageSelect
                                    ? languageSelect.value
                                    : "si"

                        })

                    }
                );


            const raw =
                await response.text();


            let data;


            try {

                data =
                    JSON.parse(raw);

            } catch {

                throw new Error(
                    "Server returned invalid JSON:\n" +
                    raw.substring(0, 300)
                );
            }


            // ====================================
            // SUCCESS
            // ====================================

            if (
                response.ok &&
                Array.isArray(
                    data.subtitles
                )
            ) {

                return data.subtitles;
            }


            // ====================================
            // ERROR MESSAGE
            // ====================================

            const errorMessage =
                data.error ||
                "Unknown translation error";


            // ====================================
            // QUOTA / RATE LIMIT
            // ====================================

            if (
                response.status === 429 ||
                errorMessage
                    .toLowerCase()
                    .includes("quota") ||
                errorMessage
                    .toLowerCase()
                    .includes("rate limit") ||
                errorMessage
                    .toLowerCase()
                    .includes("too many requests")
            ) {

                updateProgress(

                    (
                        completedChunks /
                        totalChunks
                    ) * 100,

                    `Quota limit reached — waiting 60 seconds...`

                );


                console.log(
                    "Gemini quota reached. Waiting 60 seconds."
                );


                // Wait a full minute

                await wait(
                    QUOTA_WAIT
                );


                // Try same chunk again

                continue;
            }


            // ====================================
            // TEMPORARY SERVER ERRORS
            // ====================================

            const temporaryError =
                response.status === 500 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504;


            if (temporaryError) {

                const delay =
                    Math.min(
                        10000,
                        2000 * attempt
                    );


                updateProgress(

                    (
                        completedChunks /
                        totalChunks
                    ) * 100,

                    `Temporary server error — retry ${attempt}/${MAX_RETRIES}...`

                );


                await wait(
                    delay
                );


                continue;
            }


            // ====================================
            // OTHER ERROR
            // ====================================

            throw new Error(
                errorMessage
            );

        } catch (error) {

            console.error(
                "Chunk error:",
                error
            );


            // If it is a normal network error,
            // retry it.

            if (
                attempt < MAX_RETRIES
            ) {

                updateProgress(

                    (
                        completedChunks /
                        totalChunks
                    ) * 100,

                    `Connection error — retry ${attempt}/${MAX_RETRIES}...`

                );


                await wait(
                    3000
                );


                continue;
            }


            throw error;
        }
    }


    throw new Error(
        `Chunk ${chunkNumber} failed after ${MAX_RETRIES} attempts.`
    );
}


// ============================================
// TRANSLATE ALL
// ============================================

translateBtn.addEventListener(
    "click",
    async function () {

        // Prevent duplicate translation

        if (translating) {
            return;
        }


        // Check subtitles

        if (
            !subtitles ||
            subtitles.length === 0
        ) {

            alert(
                "Please upload an SRT file first."
            );

            return;
        }


        translating = true;


        translateBtn.disabled =
            true;

        downloadBtn.disabled =
            true;

        translateBtn.textContent =
            "Translating...";


        // ====================================
        // CREATE CHUNKS
        // ====================================

        const chunks = [];


        for (
            let i = 0;
            i < subtitles.length;
            i += CHUNK_SIZE
        ) {

            chunks.push(
                subtitles.slice(
                    i,
                    i + CHUNK_SIZE
                )
            );
        }


        const totalChunks =
            chunks.length;


        const translatedChunks =
            new Array(
                totalChunks
            );


        let completedChunks = 0;


        updateProgress(
            0,
            `Preparing ${totalChunks} parts...`
        );


        try {


            // =================================
            // SEQUENTIAL TRANSLATION
            // =================================

            for (
                let i = 0;
                i < totalChunks;
                i += CONCURRENCY
            ) {


                const batch = [];


                for (
                    let j = i;
                    j <
                    Math.min(
                        i + CONCURRENCY,
                        totalChunks
                    );
                    j++
                ) {

                    batch.push(

                        translateChunk(

                            chunks[j],

                            j + 1,

                            totalChunks,

                            completedChunks

                        ).then(
                            result => {

                                translatedChunks[j] =
                                    result;

                                completedChunks++;


                                const percent =
                                    (
                                        completedChunks /
                                        totalChunks
                                    ) * 100;


                                const translatedCount =
                                    Math.min(

                                        completedChunks *
                                        CHUNK_SIZE,

                                        subtitles.length

                                    );


                                updateProgress(

                                    percent,

                                    `Translated ${translatedCount} / ${subtitles.length} subtitles`

                                );

                            }
                        )

                    );
                }


                // Wait until current request finishes

                await Promise.all(
                    batch
                );


                // Small delay

                if (
                    i + CONCURRENCY <
                    totalChunks
                ) {

                    await wait(
                        REQUEST_DELAY
                    );
                }
            }


            // ====================================
            // COMBINE
            // ====================================

            subtitles =
                translatedChunks.flat();


            // ====================================
            // SHOW RESULT
            // ====================================

            preview.value =
                buildSRT(
                    subtitles
                );


            // ====================================
            // COMPLETE
            // ====================================

            updateProgress(
                100,
                "Translation complete!"
            );


            translateBtn.textContent =
                "Translation Complete ✓";


            alert(
                "Sinhala subtitle translation completed successfully!"
            );


        } catch (error) {

            console.error(
                "Translation failed:",
                error
            );


            updateProgress(

                (
                    completedChunks /
                    totalChunks
                ) * 100,

                "Translation stopped"

            );


            alert(
                "Translation failed:\n\n" +
                error.message
            );

        } finally {

            translating =
                false;


            translateBtn.disabled =
                false;


            downloadBtn.disabled =
                false;


            setTimeout(
                () => {

                    translateBtn.textContent =
                        "Translate Subtitle";

                },
                2000
            );
        }

    }
);


// ============================================
// DOWNLOAD
// ============================================

downloadBtn.addEventListener(
    "click",
    function () {

        if (
            !subtitles ||
            subtitles.length === 0
        ) {

            alert(
                "Please upload an SRT file first."
            );

            return;
        }


        const srt =
            buildSRT(
                subtitles
            );


        const blob =
            new Blob(
                [srt],
                {

                    type:
                        "application/x-subrip;charset=utf-8"

                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            "Sinhala-Subtitle.srt";


        document.body.appendChild(
            link
        );


        link.click();


        document.body.removeChild(
            link
        );


        URL.revokeObjectURL(
            url
        );

    }
);
