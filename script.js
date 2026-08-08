// ============================================================
// SUBLANKA AI - SCRIPT.JS
// ============================================================


// ============================================================
// ELEMENTS
// ============================================================

const fileInput =
    document.getElementById("subtitleFile");

const fileNameElement =
    document.getElementById("fileName");

const languageSelect =
    document.getElementById("language");

const translateBtn =
    document.getElementById("translateBtn");

const downloadBtn =
    document.getElementById("downloadBtn");

const preview =
    document.getElementById("preview");

const progressContainer =
    document.getElementById("progressContainer");

const progressFill =
    document.getElementById("progressFill");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");


// ============================================================
// SETTINGS
// ============================================================

const CHUNK_SIZE = 25;

const MAX_RETRIES = 5;

const RETRY_DELAY = 3000;

const QUOTA_DELAY = 60000;

const REQUEST_DELAY = 1200;

const STORAGE_KEY =
    "sublanka_translation_job_v6";


// ============================================================
// VARIABLES
// ============================================================

let subtitles = [];

let translatedChunks = [];

let currentChunk = 0;

let totalChunks = 0;

let currentFileName = "";

let translating = false;


// ============================================================
// WAIT
// ============================================================

function wait(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}


// ============================================================
// PROGRESS
// ============================================================

function updateProgress(
    percent,
    message
) {

    const value =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );


    if (progressContainer) {

        progressContainer.style.display =
            "block";

    }


    if (progressFill) {

        progressFill.style.width =
            value + "%";

    }


    if (progressPercent) {

        progressPercent.textContent =
            Math.round(value) + "%";

    }


    if (progressText) {

        progressText.textContent =
            message;

    }

}


// ============================================================
// PARSE SRT
// ============================================================

function parseSRT(content) {

    const clean =
        content
            .replace(/\uFEFF/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();


    if (!clean) {

        return [];

    }


    const blocks =
        clean.split(
            /\n\s*\n/
        );


    const result = [];


    for (
        const block
        of blocks
    ) {

        const lines =
            block.split("\n");


        if (
            lines.length < 3
        ) {

            continue;

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

            continue;

        }


        if (
            !timestamp.includes("-->")
        ) {

            continue;

        }


        result.push({

            number,

            timestamp,

            text

        });

    }


    return result;

}


// ============================================================
// BUILD SRT
// ============================================================

function buildSRT(data) {

    return data
        .map(sub => {

            return [

                sub.number,

                sub.timestamp,

                sub.text

            ].join("\n");

        })
        .join("\n\n");

}


// ============================================================
// CHUNKS
// ============================================================

function createChunks() {

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


    return chunks;

}


// ============================================================
// SAVE
// ============================================================

function saveProgress() {

    try {

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify({

                fileName:
                    currentFileName,

                subtitles,

                translatedChunks,

                currentChunk,

                totalChunks,

                language:
                    languageSelect
                        ? languageSelect.value
                        : "si",

                savedAt:
                    Date.now()

            })

        );

    } catch (error) {

        console.error(
            "Save failed:",
            error
        );

    }

}


// ============================================================
// RESTORE
// ============================================================

function restoreProgress() {

    try {

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (!saved) {

            return false;

        }


        const data =
            JSON.parse(saved);


        if (
            !Array.isArray(
                data.subtitles
            )
        ) {

            return false;

        }


        subtitles =
            data.subtitles;


        translatedChunks =
            data.translatedChunks || [];


        currentChunk =
            data.currentChunk || 0;


        totalChunks =
            data.totalChunks ||
            Math.ceil(
                subtitles.length /
                CHUNK_SIZE
            );


        currentFileName =
            data.fileName ||
            "";


        if (languageSelect) {

            languageSelect.value =
                data.language ||
                "si";

        }


        if (fileNameElement) {

            fileNameElement.textContent =
                currentFileName;

        }


        if (preview) {

            preview.value =
                buildSRT(
                    mergeChunks()
                );

        }


        const completed =
            Math.min(

                currentChunk *
                CHUNK_SIZE,

                subtitles.length

            );


        updateProgress(

            totalChunks
                ? (
                    currentChunk /
                    totalChunks
                ) * 100
                : 0,

            `Saved: ${completed}/${subtitles.length} subtitles`

        );


        if (translateBtn) {

            translateBtn.textContent =
                "Resume Translation";

        }


        return true;


    } catch (error) {

        console.error(
            "Restore failed:",
            error
        );


        return false;

    }

}


// ============================================================
// CLEAR JOB
// ============================================================

function clearSavedJob() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


// ============================================================
// MERGE CHUNKS
// ============================================================

function mergeChunks() {

    const result = [];


    for (
        let i = 0;
        i < subtitles.length;
        i += CHUNK_SIZE
    ) {

        const chunkIndex =
            Math.floor(
                i / CHUNK_SIZE
            );


        const chunk =
            translatedChunks[
                chunkIndex
            ];


        if (
            Array.isArray(chunk)
        ) {

            result.push(
                ...chunk
            );

        } else {

            result.push(
                ...subtitles.slice(
                    i,
                    i + CHUNK_SIZE
                )
            );

        }

    }


    return result;

}


// ============================================================
// VALIDATE CHUNK
// ============================================================

function validateChunk(
    original,
    translated
) {

    if (
        !Array.isArray(
            translated
        )
    ) {

        return false;

    }


    if (
        translated.length !==
        original.length
    ) {

        return false;

    }


    for (
        let i = 0;
        i < original.length;
        i++
    ) {

        const source =
            original[i];

        const result =
            translated[i];


        if (!result) {

            return false;

        }


        // Number must stay original
        if (
            String(
                source.number
            ) !==
            String(
                result.number
            )
        ) {

            return false;

        }


        // Timestamp must stay original
        if (
            source.timestamp !==
            result.timestamp
        ) {

            return false;

        }


        // Text must exist
        if (
            !result.text ||
            !result.text.trim()
        ) {

            return false;

        }


        // Line count
        const sourceLines =
            source.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim()
                );


        const resultLines =
            result.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim()
                );


        if (
            sourceLines.length !==
            resultLines.length
        ) {

            console.warn(
                "Line count mismatch:",
                source.number
            );

            return false;

        }

    }


    return true;

}


// ============================================================
// TRANSLATE CHUNK
// ============================================================

async function translateChunk(
    chunk,
    chunkNumber
) {

    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            updateProgress(

                (
                    currentChunk /
                    totalChunks
                ) * 100,

                `Translating chunk ${chunkNumber}/${totalChunks}...`

            );


            const response =
                await fetch(
                    "/api/translate",
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                subtitles:
                                    chunk,

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
                    "Invalid server response."
                );

            }


            // ---------------------------------------------
            // SUCCESS
            // ---------------------------------------------

            if (
                response.ok &&
                Array.isArray(
                    data.subtitles
                )
            ) {

                if (
                    validateChunk(
                        chunk,
                        data.subtitles
                    )
                ) {

                    return data.subtitles;

                }


                throw new Error(
                    "Translation validation failed."
                );

            }


            // ---------------------------------------------
            // QUOTA
            // ---------------------------------------------

            const errorMessage =
                data.error ||
                "Translation failed";


            const lower =
                errorMessage.toLowerCase();


            if (
                response.status === 429 ||
                lower.includes("quota") ||
                lower.includes("rate limit") ||
                lower.includes("too many requests")
            ) {

                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    "Quota limit — waiting 60 seconds..."

                );


                await wait(
                    QUOTA_DELAY
                );


                continue;

            }


            // ---------------------------------------------
            // VALIDATION
            // ---------------------------------------------

            if (
                response.status === 422
            ) {

                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Translation check failed — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(
                    RETRY_DELAY
                );


                continue;

            }


            // ---------------------------------------------
            // SERVER ERROR
            // ---------------------------------------------

            if (
                response.status >= 500
            ) {

                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Server error — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(
                    RETRY_DELAY
                );


                continue;

            }


            throw new Error(
                errorMessage
            );


        } catch (error) {

            console.error(
                `Chunk ${chunkNumber}:`,
                error
            );


            if (
                attempt >=
                MAX_RETRIES
            ) {

                throw error;

            }


            updateProgress(

                (
                    currentChunk /
                    totalChunks
                ) * 100,

                `Retrying chunk ${chunkNumber}...`

            );


            await wait(
                RETRY_DELAY
            );

        }

    }


    throw new Error(
        `Chunk ${chunkNumber} failed.`
    );

}


// ============================================================
// FILE SELECT
// ============================================================

if (fileInput) {

    fileInput.addEventListener(
        "change",
        function () {

            const file =
                this.files?.[0];


            if (!file) {

                return;

            }


            if (
                !file.name
                    .toLowerCase()
                    .endsWith(".srt")
            ) {

                alert(
                    "Please select an .srt subtitle file."
                );

                this.value =
                    "";

                return;

            }


            currentFileName =
                file.name;


            if (fileNameElement) {

                fileNameElement.textContent =
                    file.name;

            }


            const reader =
                new FileReader();


            reader.onload =
                function (event) {

                    const content =
                        event.target.result;


                    const parsed =
                        parseSRT(
                            content
                        );


                    if (
                        parsed.length === 0
                    ) {

                        alert(
                            "No valid subtitles found."
                        );

                        return;

                    }


                    subtitles =
                        parsed;


                    translatedChunks =
                        [];


                    currentChunk =
                        0;


                    totalChunks =
                        Math.ceil(

                            subtitles.length /
                            CHUNK_SIZE

                        );


                    clearSavedJob();


                    if (preview) {

                        preview.value =
                            buildSRT(
                                subtitles
                            );

                    }


                    updateProgress(

                        0,

                        `Ready: ${subtitles.length} subtitles`

                    );


                    if (translateBtn) {

                        translateBtn.disabled =
                            false;

                        translateBtn.textContent =
                            "Translate Subtitle";

                    }


                    if (downloadBtn) {

                        downloadBtn.disabled =
                            true;

                    }


                    console.log(
                        "Loaded:",
                        file.name
                    );

                    console.log(
                        "Subtitles:",
                        subtitles.length
                    );

                    console.log(
                        "Chunks:",
                        totalChunks
                    );

                };


            reader.onerror =
                function () {

                    alert(
                        "Could not read subtitle file."
                    );

                };


            reader.readAsText(
                file,
                "UTF-8"
            );

        }
    );

}


// ============================================================
// TRANSLATE BUTTON
// ============================================================

if (translateBtn) {

    translateBtn.addEventListener(
        "click",
        async function () {

            if (translating) {

                return;

            }


            if (
                subtitles.length === 0
            ) {

                alert(
                    "Please select an SRT file first."
                );

                return;

            }


            translating =
                true;


            translateBtn.disabled =
                true;


            if (downloadBtn) {

                downloadBtn.disabled =
                    true;

            }


            translateBtn.textContent =
                "Translating...";


            try {

                const chunks =
                    createChunks();


                totalChunks =
                    chunks.length;


                // ------------------------------------------
                // RESUME
                // ------------------------------------------

                for (
                    let i =
                        currentChunk;

                    i <
                    totalChunks;

                    i++
                ) {

                    currentChunk =
                        i;


                    const result =
                        await translateChunk(

                            chunks[i],

                            i + 1

                        );


                    translatedChunks[i] =
                        result;


                    currentChunk =
                        i + 1;


                    // --------------------------------------
                    // SAVE
                    // --------------------------------------

                    saveProgress();


                    // --------------------------------------
                    // PREVIEW
                    // --------------------------------------

                    if (preview) {

                        preview.value =
                            buildSRT(
                                mergeChunks()
                            );

                    }


                    // --------------------------------------
                    // PROGRESS
                    // --------------------------------------

                    const completed =
                        Math.min(

                            currentChunk *
                            CHUNK_SIZE,

                            subtitles.length

                        );


                    const percent =
                        (
                            currentChunk /
                            totalChunks
                        ) * 100;


                    updateProgress(

                        percent,

                        `Translated ${completed}/${subtitles.length} subtitles`

                    );


                    // --------------------------------------
                    // DELAY
                    // --------------------------------------

                    if (
                        currentChunk <
                        totalChunks
                    ) {

                        await wait(
                            REQUEST_DELAY
                        );

                    }

                }


                // ==========================================
                // COMPLETE
                // ==========================================

                if (preview) {

                    preview.value =
                        buildSRT(
                            mergeChunks()
                        );

                }


                updateProgress(

                    100,

                    "Translation complete!"

                );


                translateBtn.textContent =
                    "Translation Complete ✓";


                if (downloadBtn) {

                    downloadBtn.disabled =
                        false;

                }


                saveProgress();


                alert(
                    "Translation completed successfully!"
                );


            } catch (error) {

                console.error(
                    "Translation error:",
                    error
                );


                updateProgress(

                    totalChunks
                        ? (
                            currentChunk /
                            totalChunks
                        ) * 100
                        : 0,

                    `Stopped at ${currentChunk}/${totalChunks}. Progress saved.`

                );


                translateBtn.textContent =
                    "Resume Translation";


                alert(

                    "Translation stopped.\n\n" +
                    error.message +
                    "\n\n" +
                    "Your progress has been saved."

                );

            } finally {

                translating =
                    false;


                translateBtn.disabled =
                    false;


                if (
                    currentChunk >=
                    totalChunks &&
                    totalChunks > 0
                ) {

                    translateBtn.textContent =
                        "Translation Complete ✓";

                }

            }

        }
    );

}


// ============================================================
// DOWNLOAD
// ============================================================

if (downloadBtn) {

    downloadBtn.addEventListener(
        "click",
        function () {

            if (
                subtitles.length === 0
            ) {

                alert(
                    "No subtitle loaded."
                );

                return;

            }


            if (
                currentChunk <
                totalChunks
            ) {

                alert(
                    "Please wait until translation is complete."
                );

                return;

            }


            const finalData =
                mergeChunks();


            if (
                !validateChunk(
                    subtitles,
                    finalData
                )
            ) {

                alert(
                    "Subtitle validation failed. Download cancelled."
                );

                return;

            }


            const srt =
                buildSRT(
                    finalData
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


            const originalName =
                currentFileName
                    .replace(
                        /\.srt$/i,
                        ""
                    );


            link.href =
                url;


            link.download =
                `${originalName} - Sinhala Sub - SubLanka AI.srt`;


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            URL.revokeObjectURL(
                url
            );

        }
    );

}


// ============================================================
// PAGE LOAD
// ============================================================

window.addEventListener(
    "DOMContentLoaded",
    function () {

        restoreProgress();

    }
);
