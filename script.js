// ============================================
// SubLanka AI
// Advanced Subtitle Translator
// ============================================


// ============================================
// ELEMENTS
// ============================================

const fileInput = document.getElementById("subtitleFile");
const fileName = document.getElementById("fileName");
const preview = document.getElementById("preview");

const translateBtn =
    document.getElementById("translateBtn");

const downloadBtn =
    document.getElementById("downloadBtn");

const languageSelect =
    document.getElementById("language");

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

const CHUNK_SIZE = 30;

const CONCURRENCY = 1;

const MAX_RETRIES = 10;

const QUOTA_WAIT = 60000;

const REQUEST_DELAY = 1500;


// ============================================
// STORAGE
// ============================================

const STORAGE_KEY =
    "sublanka_translation_state";


// ============================================
// VARIABLES
// ============================================

let subtitles = [];

let translatedChunks = [];

let translationMemory = [];

let currentChunk = 0;

let totalChunks = 0;

let translating = false;

let currentFileName = "";


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
// PARSE SRT
// ============================================

function parseSRT(srt) {

    const clean =
        srt
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

            number,

            timestamp,

            text

        });

    });


    return result;
}


// ============================================
// BUILD SRT
// ============================================

function buildSRT(data) {

    return data
        .map(sub => {

            return (
                sub.number +
                "\n" +
                sub.timestamp +
                "\n" +
                sub.text
            );

        })
        .join("\n\n");
}


// ============================================
// CREATE CHUNKS
// ============================================

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


// ============================================
// VALIDATE CHUNK
// ============================================

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


    // Number of subtitles must match

    if (
        translated.length !==
        original.length
    ) {

        console.warn(
            "Subtitle count mismatch",
            {
                expected:
                    original.length,

                received:
                    translated.length
            }
        );

        return false;
    }


    // Check every subtitle

    for (
        let i = 0;
        i < original.length;
        i++
    ) {

        if (
            !translated[i]
        ) {

            return false;
        }


        if (
            translated[i].number !==
            original[i].number
        ) {

            return false;
        }


        if (
            translated[i].timestamp !==
            original[i].timestamp
        ) {

            return false;
        }


        if (
            !translated[i].text ||
            !translated[i].text.trim()
        ) {

            return false;
        }

    }


    return true;
}


// ============================================
// SAVE STATE
// ============================================

function saveState() {

    try {

        const state = {

            version: 1,

            fileName:
                currentFileName,

            subtitles,

            translatedChunks,

            translationMemory,

            currentChunk,

            totalChunks,

            language:
                languageSelect
                    ? languageSelect.value
                    : "si",

            savedAt:
                Date.now()

        };


        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );


        console.log(
            "Progress saved:",
            currentChunk,
            "/",
            totalChunks
        );

    } catch (error) {

        console.error(
            "Could not save progress:",
            error
        );

    }
}


// ============================================
// LOAD SAVED STATE
// ============================================

function loadState() {

    try {

        const saved =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (!saved) {
            return false;
        }


        const state =
            JSON.parse(saved);


        if (
            !state.subtitles ||
            !Array.isArray(
                state.subtitles
            )
        ) {

            return false;
        }


        subtitles =
            state.subtitles;


        translatedChunks =
            state.translatedChunks ||
            [];


        translationMemory =
            state.translationMemory ||
            [];


        currentChunk =
            state.currentChunk ||
            0;


        totalChunks =
            state.totalChunks ||
            Math.ceil(
                subtitles.length /
                CHUNK_SIZE
            );


        currentFileName =
            state.fileName ||
            "Saved subtitle";


        if (fileName) {

            fileName.textContent =
                currentFileName +
                " • Saved progress";

        }


        if (languageSelect) {

            languageSelect.value =
                state.language ||
                "si";

        }


        // Show current result

        const completed =
            translatedChunks
                .filter(Boolean)
                .flat();


        if (completed.length > 0) {

            preview.value =
                buildSRT(
                    mergeTranslated()
                );

        }


        const completedCount =
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

            `Saved progress: ${completedCount} / ${subtitles.length} subtitles`

        );


        return true;

    } catch (error) {

        console.error(
            "Could not load saved state:",
            error
        );


        return false;
    }
}


// ============================================
// MERGE TRANSLATED CHUNKS
// ============================================

function mergeTranslated() {

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


        if (chunk) {

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


// ============================================
// CLEAR SAVED STATE
// ============================================

function clearSavedState() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


// ============================================
// FILE UPLOAD
// ============================================

fileInput.addEventListener(
    "change",
    function () {

        const file =
            this.files[0];


        if (!file) {

            fileName.textContent =
                "No file selected";

            preview.value = "";

            subtitles = [];

            return;
        }


        if (
            !file.name
                .toLowerCase()
                .endsWith(".srt")
        ) {

            alert(
                "Please select an SRT (.srt) file."
            );

            fileInput.value = "";

            return;
        }


        currentFileName =
            file.name;


        fileName.textContent =
            file.name;


        const reader =
            new FileReader();


        reader.onload =
            function (event) {

                const content =
                    event.target.result;


                subtitles =
                    parseSRT(
                        content
                    );


                if (
                    subtitles.length === 0
                ) {

                    alert(
                        "No valid subtitles found."
                    );

                    return;
                }


                preview.value =
                    content;


                // New file = new translation

                translatedChunks = [];

                translationMemory = [];

                currentChunk = 0;

                totalChunks =
                    Math.ceil(
                        subtitles.length /
                        CHUNK_SIZE
                    );


                // Remove old saved job

                clearSavedState();


                updateProgress(
                    0,
                    `Ready: ${subtitles.length} subtitles`
                );


                console.log(
                    "Loaded:",
                    subtitles.length,
                    "subtitles"
                );

            };


        reader.onerror =
            function () {

                alert(
                    "Could not read the subtitle file."
                );

            };


        reader.readAsText(
            file,
            "UTF-8"
        );

    }
);


// ============================================
// TRANSLATE CHUNK
// ============================================

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

            console.log(
                `Chunk ${chunkNumber}/${totalChunks} - attempt ${attempt}`
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

                            subtitles:
                                chunk,

                            language:
                                languageSelect
                                    ? languageSelect.value
                                    : "si",

                            memory:
                                translationMemory
                                    .map(
                                        sub =>
                                            `[${sub.number}] ${sub.text}`
                                    )
                                    .join("\n")

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
                    "Invalid server response: " +
                    raw.substring(
                        0,
                        300
                    )
                );

            }


            // =================================
            // SUCCESS
            // =================================

            if (
                response.ok &&
                Array.isArray(
                    data.subtitles
                )
            ) {

                // Validate result

                if (
                    !validateChunk(
                        chunk,
                        data.subtitles
                    )
                ) {

                    throw new Error(
                        "Subtitle validation failed. Retrying chunk."
                    );

                }


                return data.subtitles;

            }


            const errorMessage =
                data.error ||
                "Translation failed";


            // =================================
            // QUOTA
            // =================================

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
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Quota reached — waiting 60 seconds...`

                );


                await wait(
                    QUOTA_WAIT
                );


                continue;

            }


            // =================================
            // TEMPORARY ERROR
            // =================================

            if (
                response.status === 500 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504
            ) {

                const delay =
                    Math.min(
                        15000,
                        attempt * 3000
                    );


                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Temporary error — retry ${attempt}/${MAX_RETRIES}...`

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

                `Retrying chunk ${chunkNumber}... ${attempt}/${MAX_RETRIES}`

            );


            await wait(
                3000
            );

        }

    }


    throw new Error(
        `Chunk ${chunkNumber} failed.`
    );
}


// ============================================
// TRANSLATE BUTTON
// ============================================

translateBtn.addEventListener(
    "click",
    async function () {

        if (translating) {
            return;
        }


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


        const chunks =
            createChunks();


        totalChunks =
            chunks.length;


        // =====================================
        // DETERMINE START POINT
        // =====================================

        let startChunk =
            currentChunk;


        // If no saved progress,
        // start from beginning

        if (
            !translatedChunks.length
        ) {

            startChunk = 0;

        }


        updateProgress(

            (
                startChunk /
                totalChunks
            ) * 100,

            startChunk > 0

                ? `Resuming from part ${startChunk + 1}/${totalChunks}...`

                : `Starting translation...`

        );


        try {


            // =================================
            // PROCESS ONE CHUNK AT A TIME
            // =================================

            for (
                let i = startChunk;
                i < totalChunks;
                i++
            ) {


                currentChunk =
                    i;


                const chunk =
                    chunks[i];


                updateProgress(

                    (
                        i /
                        totalChunks
                    ) * 100,

                    `Translating part ${i + 1}/${totalChunks}...`

                );


                // =================================
                // TRANSLATE
                // =================================

                const result =
                    await translateChunk(
                        chunk,
                        i + 1
                    );


                // =================================
                // VALIDATION
                // =================================

                if (
                    !validateChunk(
                        chunk,
                        result
                    )
                ) {

                    throw new Error(
                        `Validation failed for chunk ${i + 1}.`
                    );

                }


                // =================================
                // SAVE CHUNK
                // =================================

                translatedChunks[i] =
                    result;


                // =================================
                // UPDATE MEMORY
                // =================================

                translationMemory =
                    result.slice(
                        -15
                    );


                // =================================
                // MARK COMPLETE
                // =================================

                currentChunk =
                    i + 1;


                // =================================
                // AUTO SAVE
                // =================================

                saveState();


                // =================================
                // PROGRESS
                // =================================

                const percent =
                    (
                        currentChunk /
                        totalChunks
                    ) * 100;


                const translatedCount =
                    Math.min(

                        currentChunk *
                        CHUNK_SIZE,

                        subtitles.length

                    );


                updateProgress(

                    percent,

                    `Translated ${translatedCount} / ${subtitles.length} subtitles`

                );


                // =================================
                // DELAY
                // =================================

                if (
                    currentChunk <
                    totalChunks
                ) {

                    await wait(
                        REQUEST_DELAY
                    );

                }

            }


            // =====================================
            // COMPLETE
            // =====================================

            const finalSubtitle =
                mergeTranslated();


            // Final validation

            if (
                finalSubtitle.length !==
                subtitles.length
            ) {

                throw new Error(
                    "Final subtitle count validation failed."
                );

            }


            preview.value =
                buildSRT(
                    finalSubtitle
                );


            updateProgress(
                100,
                "Translation complete!"
            );


            translateBtn.textContent =
                "Translation Complete ✓";


            // Save final state

            saveState();


            alert(
                "Translation completed successfully!"
            );


        } catch (error) {

            console.error(
                "Translation stopped:",
                error
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

                `Stopped at ${currentChunk}/${totalChunks}. Progress saved.`

            );


            alert(

                "Translation stopped.\n\n" +

                error.message +

                "\n\nYour progress has been saved. " +

                "Click Translate again to resume."

            );


        } finally {

            translating =
                false;


            translateBtn.disabled =
                false;


            downloadBtn.disabled =
                false;


            if (
                currentChunk >=
                totalChunks &&
                totalChunks > 0
            ) {

                translateBtn.textContent =
                    "Translation Complete ✓";

            } else {

                translateBtn.textContent =
                    "Resume Translation";

            }

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


        const finalData =
            mergeTranslated();


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


// ============================================
// LOAD SAVED PROGRESS ON PAGE LOAD
// ============================================

window.addEventListener(
    "DOMContentLoaded",
    function () {

        const restored =
            loadState();


        if (restored) {

            translateBtn.textContent =
                "Resume Translation";

            console.log(
                "Saved translation restored."
            );

        }

    }
);
