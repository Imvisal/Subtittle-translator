// ============================================
// SubLanka AI - Subtitle Translator
// ============================================


// --------------------------------------------
// ELEMENTS
// --------------------------------------------

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


// --------------------------------------------
// DATA
// --------------------------------------------

let subtitles = [];

let isTranslating = false;


// --------------------------------------------
// SETTINGS
// --------------------------------------------

// Smaller chunks = safer
const CHUNK_SIZE = 30;

// Start with 1 request at a time.
// After everything works reliably, change to 2.
const CONCURRENCY = 1;

// Maximum retries for temporary Gemini errors
const MAX_RETRIES = 4;


// --------------------------------------------
// FILE UPLOAD
// --------------------------------------------

fileInput.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {

        fileName.textContent =
            "No file selected";

        preview.value = "";

        subtitles = [];

        return;
    }


    // Check file type

    if (!file.name.toLowerCase().endsWith(".srt")) {

        alert(
            "Please select an SRT (.srt) subtitle file."
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


        // Parse SRT

        subtitles =
            parseSRT(content);


        console.log(
            "Subtitle blocks:",
            subtitles.length
        );


        if (subtitles.length === 0) {

            alert(
                "Could not detect subtitle blocks in this SRT file."
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


// --------------------------------------------
// PARSE SRT
// --------------------------------------------

function parseSRT(srt) {

    const cleanSRT =
        srt
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();


    if (!cleanSRT) {
        return [];
    }


    const blocks =
        cleanSRT.split(
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


        // Validate timestamp

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


// --------------------------------------------
// BUILD SRT
// --------------------------------------------

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


// --------------------------------------------
// PROGRESS BAR
// --------------------------------------------

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


// --------------------------------------------
// WAIT FUNCTION
// --------------------------------------------

function wait(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


// --------------------------------------------
// TRANSLATE ONE CHUNK
// --------------------------------------------

async function translateChunk(
    chunk,
    chunkNumber,
    totalChunks,
    completedChunks
) {

    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            console.log(
                `Chunk ${chunkNumber}/${totalChunks} - Attempt ${attempt}`
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

            } catch (error) {

                throw new Error(
                    "Invalid server response: " +
                    raw.substring(
                        0,
                        300
                    )
                );
            }


            // SUCCESS

            if (
                response.ok &&
                Array.isArray(
                    data.subtitles
                )
            ) {

                return data.subtitles;
            }


            // ERROR

            const errorMessage =
                data.error ||
                "Translation failed.";


            // Temporary errors
            // 429 = rate limit
            // 500 = server error
            // 502/503/504 = temporary server problem

            const temporaryError =
                response.status === 429 ||
                response.status === 500 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504;


            if (
                temporaryError &&
                attempt < MAX_RETRIES
            ) {

                const delay =
                    Math.pow(
                        2,
                        attempt
                    ) * 1000;


                const currentPercent =
                    (
                        completedChunks /
                        totalChunks
                    ) * 100;


                updateProgress(
                    currentPercent,
                    `Chunk ${chunkNumber}/${totalChunks} busy — retrying ${attempt}/${MAX_RETRIES}...`
                );


                console.log(
                    `Retrying chunk ${chunkNumber} in ${delay}ms`
                );


                await wait(
                    delay
                );


                continue;
            }


            throw new Error(
                errorMessage
            );

        } catch (error) {


            console.error(
                `Chunk ${chunkNumber} error:`,
                error
            );


            // Retry network errors

            if (
                attempt < MAX_RETRIES
            ) {

                const delay =
                    Math.pow(
                        2,
                        attempt
                    ) * 1000;


                const currentPercent =
                    (
                        completedChunks /
                        totalChunks
                    ) * 100;


                updateProgress(
                    currentPercent,
                    `Connection problem — retrying ${attempt}/${MAX_RETRIES}...`
                );


                await wait(
                    delay
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


// --------------------------------------------
// TRANSLATE BUTTON
// --------------------------------------------

translateBtn.addEventListener(
    "click",
    async function () {


        // Prevent double click

        if (isTranslating) {
            return;
        }


        // Check subtitle

        if (
            !subtitles ||
            subtitles.length === 0
        ) {

            alert(
                "Please upload an SRT subtitle first."
            );

            return;
        }


        isTranslating = true;


        translateBtn.disabled =
            true;

        downloadBtn.disabled =
            true;

        translateBtn.textContent =
            "Translating...";


        // ------------------------------------
        // CREATE CHUNKS
        // ------------------------------------

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


        let translatedChunks =
            new Array(
                totalChunks
            );


        let completedChunks = 0;


        updateProgress(
            0,
            `Preparing ${totalChunks} translation parts...`
        );


        try {


            // --------------------------------
            // PROCESS CHUNKS
            // --------------------------------

            for (
                let i = 0;
                i < totalChunks;
                i += CONCURRENCY
            ) {


                const currentBatch =
                    [];


                // Add requests to current batch

                for (
                    let j = i;
                    j <
                    Math.min(
                        i + CONCURRENCY,
                        totalChunks
                    );
                    j++
                ) {

                    currentBatch.push(

                        translateChunk(
                            chunks[j],

                            j + 1,

                            totalChunks,

                            completedChunks
                        )

                        .then(result => {

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

                        })

                    );
                }


                // Wait for current batch

                await Promise.all(
                    currentBatch
                );


                // Small delay between batches

                if (
                    i + CONCURRENCY <
                    totalChunks
                ) {

                    await wait(
                        500
                    );
                }
            }


            // --------------------------------
            // COMBINE TRANSLATIONS
            // --------------------------------

            subtitles =
                translatedChunks.flat();


            // --------------------------------
            // UPDATE PREVIEW
            // --------------------------------

            preview.value =
                buildSRT(
                    subtitles
                );


            // --------------------------------
            // COMPLETE
            // --------------------------------

            updateProgress(
                100,
                "Translation complete!"
            );


            translateBtn.textContent =
                "Translation Complete ✓";


            alert(
                "Sinhala subtitle translation completed!"
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


            isTranslating =
                false;


            translateBtn.disabled =
                false;


            downloadBtn.disabled =
                false;


            // Restore button

            setTimeout(() => {

                translateBtn.textContent =
                    "Translate Subtitle";

            }, 1500);

        }

    }
);


// --------------------------------------------
// DOWNLOAD SRT
// --------------------------------------------

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
