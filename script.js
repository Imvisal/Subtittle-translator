// ============================================================
// SUBLANKA AI
// SCRIPT.JS
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

// Smaller chunks = more reliable Gemini responses
const CHUNK_SIZE = 15;

// Maximum retry attempts per chunk
const MAX_RETRIES = 5;

// Normal retry delay
const RETRY_DELAY = 4000;

// Rate-limit delay
const QUOTA_DELAY = 60000;

// Small delay between successful chunks
const REQUEST_DELAY = 1000;

// Local storage key
const STORAGE_KEY =
    "sublanka_ai_translation_v8";


// ============================================================
// STATE
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
// UPDATE PROGRESS
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
            `${value}%`;

    }


    if (progressPercent) {

        progressPercent.textContent =
            `${Math.round(value)}%`;

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
// CREATE CHUNKS
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
// MERGE TRANSLATED CHUNKS
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
// SAVE PROGRESS
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
            "Could not save progress:",
            error
        );

    }

}


// ============================================================
// CLEAR SAVED JOB
// ============================================================

function clearSavedJob() {

    try {

        localStorage.removeItem(
            STORAGE_KEY
        );

    } catch (error) {

        console.error(error);

    }

}


// ============================================================
// RESTORE SAVED JOB
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
            ) ||
            data.subtitles.length === 0
        ) {

            return false;

        }


        subtitles =
            data.subtitles;


        translatedChunks =
            Array.isArray(
                data.translatedChunks
            )
                ? data.translatedChunks
                : [];


        currentChunk =
            Number(
                data.currentChunk || 0
            );


        totalChunks =
            Number(
                data.totalChunks ||
                Math.ceil(
                    subtitles.length /
                    CHUNK_SIZE
                )
            );


        currentFileName =
            data.fileName || "";


        if (languageSelect) {

            languageSelect.value =
                data.language || "si";

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


        const percent =
            totalChunks > 0
                ? (
                    currentChunk /
                    totalChunks
                ) * 100
                : 0;


        updateProgress(

            percent,

            `Saved: ${completed}/${subtitles.length} subtitles`

        );


        if (translateBtn) {

            translateBtn.disabled =
                false;


            if (
                currentChunk >=
                totalChunks
            ) {

                translateBtn.textContent =
                    "Translation Complete ✓";

            } else {

                translateBtn.textContent =
                    "Resume Translation";

            }

        }


        if (downloadBtn) {

            downloadBtn.disabled =
                currentChunk <
                totalChunks;

        }


        return true;


    } catch (error) {

        console.error(
            "Restore error:",
            error
        );


        return false;

    }

}


// ============================================================
// VALIDATE CHUNK
// ============================================================
//
// IMPORTANT:
// We DO NOT check dialogue line count.
// Gemini may naturally change line breaks.
// Number + timestamp are preserved from original SRT.
// ============================================================

function validateChunk(
    original,
    translated
) {

    if (
        !Array.isArray(translated)
    ) {

        console.error(
            "Translated data is not an array."
        );

        return false;

    }


    if (
        translated.length !==
        original.length
    ) {

        console.error(

            "Length mismatch:",
            original.length,
            translated.length

        );

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

            console.error(
                "Missing result:",
                i
            );

            return false;

        }


        // Original number
        if (
            String(source.number) !==
            String(result.number)
        ) {

            console.error(
                "Number mismatch:",
                i
            );

            return false;

        }


        // Original timestamp
        if (
            source.timestamp !==
            result.timestamp
        ) {

            console.error(
                "Timestamp mismatch:",
                i
            );

            return false;

        }


        // Translation must exist
        if (
            typeof result.text !==
            "string" ||
            !result.text.trim()
        ) {

            console.error(
                "Empty translation:",
                i
            );

            return false;

        }

    }


    return true;

}


// ============================================================
// TRANSLATE ONE CHUNK
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

            const completedBefore =
                Math.min(

                    currentChunk *
                    CHUNK_SIZE,

                    subtitles.length

                );


            const basePercent =
                totalChunks > 0
                    ? (
                        currentChunk /
                        totalChunks
                    ) * 100
                    : 0;


            updateProgress(

                basePercent,

                `Translating chunk ${chunkNumber}/${totalChunks}...`

            );


            console.log(
                `Sending chunk ${chunkNumber}, attempt ${attempt}`
            );


            // --------------------------------------------------
            // API CALL
            // --------------------------------------------------

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


            console.log(
                "API status:",
                response.status
            );


            let data;


            try {

                data =
                    JSON.parse(raw);

            } catch {

                console.error(
                    "Invalid API response:",
                    raw
                );


                throw new Error(
                    "Server returned invalid JSON."
                );

            }


            // --------------------------------------------------
            // SUCCESS
            // --------------------------------------------------

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

                    console.log(
                        `Chunk ${chunkNumber} success`
                    );


                    return data.subtitles;

                }


                throw new Error(
                    "Translation validation failed."
                );

            }


            // --------------------------------------------------
            // ERROR MESSAGE
            // --------------------------------------------------

            const errorMessage =
                data?.error ||
                `HTTP ${response.status}`;


            const lower =
                String(
                    errorMessage
                ).toLowerCase();


            console.error(
                `Chunk ${chunkNumber} error:`,
                errorMessage
            );


            // --------------------------------------------------
            // QUOTA / RATE LIMIT
            // --------------------------------------------------

            if (

                response.status === 429 ||

                lower.includes("quota") ||

                lower.includes("rate limit") ||

                lower.includes("too many requests") ||

                lower.includes("resource exhausted")

            ) {

                if (
                    attempt >=
                    MAX_RETRIES
                ) {

                    throw new Error(
                        `Quota/rate limit reached after ${MAX_RETRIES} attempts.\n\n${errorMessage}`
                    );

                }


                updateProgress(

                    basePercent,

                    `Rate limit — waiting 60 seconds... (${attempt}/${MAX_RETRIES})`

                );


                await wait(
                    QUOTA_DELAY
                );


                continue;

            }


            // --------------------------------------------------
            // VALIDATION ERROR
            // --------------------------------------------------

            if (
                response.status === 422
            ) {

                if (
                    attempt >=
                    MAX_RETRIES
                ) {

                    throw new Error(
                        errorMessage
                    );

                }


                updateProgress(

                    basePercent,

                    `Translation check failed — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(
                    RETRY_DELAY
                );


                continue;

            }


            // --------------------------------------------------
            // SERVER ERROR
            // --------------------------------------------------

            if (
                response.status >= 500
            ) {

                if (
                    attempt >=
                    MAX_RETRIES
                ) {

                    throw new Error(
                        errorMessage
                    );

                }


                updateProgress(

                    basePercent,

                    `Server error — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(
                    RETRY_DELAY
                );


                continue;

            }


            // --------------------------------------------------
            // OTHER ERROR
            // --------------------------------------------------

            throw new Error(
                errorMessage
            );


        } catch (error) {

            console.error(
                `Chunk ${chunkNumber}, attempt ${attempt}:`,
                error
            );


            if (
                attempt >=
                MAX_RETRIES
            ) {

                throw new Error(

                    `Chunk ${chunkNumber} failed.\n\n${error.message}`

                );

            }


            updateProgress(

                totalChunks > 0
                    ? (
                        currentChunk /
                        totalChunks
                    ) * 100
                    : 0,

                `Retrying chunk ${chunkNumber}... (${attempt}/${MAX_RETRIES})`

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


            // --------------------------------------------------
            // EXTENSION
            // --------------------------------------------------

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


            // --------------------------------------------------
            // FILE NAME
            // --------------------------------------------------

            currentFileName =
                file.name;


            if (fileNameElement) {

                fileNameElement.textContent =
                    file.name;

            }


            // --------------------------------------------------
            // READ FILE
            // --------------------------------------------------

            const reader =
                new FileReader();


            reader.onload =
                function (event) {

                    try {

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
                                "No valid SRT subtitles found."
                            );


                            return;

                        }


                        // --------------------------------------
                        // NEW JOB
                        // --------------------------------------

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


                        // --------------------------------------
                        // PREVIEW
                        // --------------------------------------

                        if (preview) {

                            preview.value =
                                buildSRT(
                                    subtitles
                                );

                        }


                        // --------------------------------------
                        // PROGRESS
                        // --------------------------------------

                        updateProgress(

                            0,

                            `Ready: ${subtitles.length} subtitles`

                        );


                        // --------------------------------------
                        // BUTTONS
                        // --------------------------------------

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
                            "File:",
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


                    } catch (error) {

                        console.error(
                            error
                        );


                        alert(
                            "Could not process SRT file."
                        );

                    }

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

            // --------------------------------------------------
            // ALREADY RUNNING
            // --------------------------------------------------

            if (translating) {

                return;

            }


            // --------------------------------------------------
            // NO FILE
            // --------------------------------------------------

            if (
                subtitles.length === 0
            ) {

                alert(
                    "Please select an SRT file first."
                );


                return;

            }


            // --------------------------------------------------
            // START
            // --------------------------------------------------

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


                // ------------------------------------------------
                // TRANSLATE CHUNKS
                // ------------------------------------------------

                for (
                    let i =
                        currentChunk;

                    i <
                    totalChunks;

                    i++
                ) {

                    currentChunk =
                        i;


                    // --------------------------------------------
                    // TRANSLATE
                    // --------------------------------------------

                    const translated =
                        await translateChunk(

                            chunks[i],

                            i + 1

                        );


                    // --------------------------------------------
                    // SAVE CHUNK
                    // --------------------------------------------

                    translatedChunks[i] =
                        translated;


                    // --------------------------------------------
                    // NEXT CHUNK
                    // --------------------------------------------

                    currentChunk =
                        i + 1;


                    // --------------------------------------------
                    // SAVE PROGRESS
                    // --------------------------------------------

                    saveProgress();


                    // --------------------------------------------
                    // LIVE PREVIEW
                    // --------------------------------------------

                    if (preview) {

                        preview.value =
                            buildSRT(
                                mergeChunks()
                            );

                    }


                    // --------------------------------------------
                    // PROGRESS
                    // --------------------------------------------

                    const completed =
                        Math.min(

                            currentChunk *
                            CHUNK_SIZE,

                            subtitles.length

                        );


                    const percent =
                        totalChunks > 0
                            ? (
                                currentChunk /
                                totalChunks
                            ) * 100
                            : 0;


                    updateProgress(

                        percent,

                        `Translated ${completed}/${subtitles.length} subtitles`

                    );


                    // --------------------------------------------
                    // DELAY
                    // --------------------------------------------

                    if (
                        currentChunk <
                        totalChunks
                    ) {

                        await wait(
                            REQUEST_DELAY
                        );

                    }

                }


                // ------------------------------------------------
                // COMPLETE
                // ------------------------------------------------

                if (preview) {

                    preview.value =
                        buildSRT(
                            mergeChunks()
                        );

                }


                updateProgress(

                    100,

                    `Translation complete — ${subtitles.length} subtitles`

                );


                translateBtn.textContent =
                    "Translation Complete ✓";


                if (downloadBtn) {

                    downloadBtn.disabled =
                        false;

                }


                saveProgress();


                console.log(
                    "Translation complete."
                );


                alert(
                    "Translation completed successfully!"
                );


            } catch (error) {

                console.error(
                    "Translation stopped:",
                    error
                );


                saveProgress();


                const completed =
                    Math.min(

                        currentChunk *
                        CHUNK_SIZE,

                        subtitles.length

                    );


                const percent =
                    totalChunks > 0
                        ? (
                            currentChunk /
                            totalChunks
                        ) * 100
                        : 0;


                updateProgress(

                    percent,

                    `Stopped at ${completed}/${subtitles.length}. Progress saved.`

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

            // --------------------------------------------------
            // CHECK
            // --------------------------------------------------

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


            // --------------------------------------------------
            // FINAL DATA
            // --------------------------------------------------

            const finalData =
                mergeChunks();


            if (
                finalData.length !==
                subtitles.length
            ) {

                alert(
                    "Subtitle data is incomplete. Download cancelled."
                );


                return;

            }


            // --------------------------------------------------
            // BUILD SRT
            // --------------------------------------------------

            const srt =
                buildSRT(
                    finalData
                );


            // --------------------------------------------------
            // BLOB
            // --------------------------------------------------

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


            // --------------------------------------------------
            // DOWNLOAD LINK
            // --------------------------------------------------

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


            console.log(
                "Subtitle downloaded."
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
