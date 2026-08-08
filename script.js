// ============================================
// SubLanka AI - Subtitle Translator
// Resume + Auto Save + Validation + Memory
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

const CHUNK_SIZE = 30;
const MAX_RETRIES = 10;
const QUOTA_WAIT = 60000;
const REQUEST_DELAY = 1500;

const STORAGE_KEY = "sublanka_ai_translation";


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

function updateProgress(percent, message) {

    if (progressContainer) {
        progressContainer.style.display = "block";
    }

    const safe =
        Math.max(
            0,
            Math.min(100, percent)
        );

    if (progressFill) {
        progressFill.style.width =
            safe + "%";
    }

    if (progressPercent) {
        progressPercent.textContent =
            Math.round(safe) + "%";
    }

    if (progressText) {
        progressText.textContent =
            message;
    }
}


// ============================================
// WAIT
// ============================================

function wait(ms) {

    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });

}


// ============================================
// PARSE SRT
// ============================================

function parseSRT(content) {

    const clean =
        content
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();

    if (!clean) {
        return [];
    }

    const blocks =
        clean.split(/\n\s*\n/);

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

        if (!number || !timestamp || !text) {
            return;
        }

        if (!timestamp.includes("-->")) {
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
// VALIDATE TRANSLATION
// ============================================

function validateChunk(original, translated) {

    if (!Array.isArray(translated)) {
        return false;
    }

    if (
        translated.length !==
        original.length
    ) {

        console.warn(
            "Subtitle count mismatch",
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
            return false;
        }

        // Number must stay the same
        if (
            String(result.number) !==
            String(source.number)
        ) {

            console.warn(
                "Number mismatch:",
                source.number,
                result.number
            );

            return false;
        }

        // Timestamp must stay the same
        if (
            result.timestamp !==
            source.timestamp
        ) {

            console.warn(
                "Timestamp changed:",
                source.timestamp,
                result.timestamp
            );

            return false;
        }

        // Translation cannot be empty
        if (
            !result.text ||
            !result.text.trim()
        ) {

            return false;
        }

    }

    return true;
}


// ============================================
// MERGE CHUNKS
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
            translatedChunks[chunkIndex];

        if (chunk) {

            result.push(...chunk);

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
// SAVE PROGRESS
// ============================================

function saveState() {

    try {

        const state = {

            version: 2,

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
            "Save error:",
            error
        );

    }
}


// ============================================
// LOAD SAVED PROGRESS
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
            !Array.isArray(state.subtitles)
        ) {

            return false;
        }

        subtitles =
            state.subtitles;

        translatedChunks =
            state.translatedChunks || [];

        translationMemory =
            state.translationMemory || [];

        currentChunk =
            state.currentChunk || 0;

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
                " • Saved";

        }

        if (languageSelect) {

            languageSelect.value =
                state.language ||
                "si";

        }

        const existing =
            mergeTranslated();

        if (preview) {

            preview.value =
                buildSRT(existing);

        }

        const completed =
            Math.min(
                currentChunk * CHUNK_SIZE,
                subtitles.length
            );

        const percent =
            totalChunks
                ? (
                    currentChunk /
                    totalChunks
                ) * 100
                : 0;

        updateProgress(
            percent,
            `Saved: ${completed} / ${subtitles.length} subtitles`
        );

        return true;

    } catch (error) {

        console.error(
            "Load state error:",
            error
        );

        return false;
    }
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

if (fileInput) {

    fileInput.addEventListener(
        "change",
        function () {

            const file =
                this.files[0];

            if (!file) {
                return;
            }

            if (
                !file.name
                    .toLowerCase()
                    .endsWith(".srt")
            ) {

                alert(
                    "Please select an SRT file."
                );

                fileInput.value = "";

                return;
            }

            currentFileName =
                file.name;

            if (fileName) {

                fileName.textContent =
                    file.name;

            }

            const reader =
                new FileReader();

            reader.onload =
                function (event) {

                    const content =
                        event.target.result;

                    subtitles =
                        parseSRT(content);

                    if (
                        subtitles.length === 0
                    ) {

                        alert(
                            "No valid subtitles found."
                        );

                        return;
                    }

                    // New file = new job
                    translatedChunks = [];
                    translationMemory = [];
                    currentChunk = 0;

                    totalChunks =
                        Math.ceil(
                            subtitles.length /
                            CHUNK_SIZE
                        );

                    clearSavedState();

                    if (preview) {

                        preview.value =
                            content;

                    }

                    updateProgress(
                        0,
                        `Ready: ${subtitles.length} subtitles`
                    );

                    if (translateBtn) {

                        translateBtn.textContent =
                            "Translate Subtitle";

                    }

                    if (downloadBtn) {

                        downloadBtn.disabled =
                            false;

                    }

                };

            reader.readAsText(
                file,
                "UTF-8"
            );

        }
    );

}


// ============================================
// TRANSLATE ONE CHUNK
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
                `Translating chunk ${chunkNumber}/${totalChunks}`,
                `Attempt ${attempt}`
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

                        body:
                            JSON.stringify({

                                subtitles:
                                    chunk,

                                language:
                                    languageSelect
                                        ? languageSelect.value
                                        : "si",

                                memory:
                                    translationMemory
                                        .map(sub => {

                                            return (
                                                `[${sub.number}] ${sub.text}`
                                            );

                                        })
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
                    "Invalid server response."
                );

            }


            // ==================================
            // SUCCESS
            // ==================================

            if (
                response.ok &&
                Array.isArray(
                    data.subtitles
                )
            ) {

                if (
                    !validateChunk(
                        chunk,
                        data.subtitles
                    )
                ) {

                    throw new Error(
                        "Subtitle validation failed."
                    );

                }

                return data.subtitles;

            }


            const errorMessage =
                data.error ||
                "Translation failed";


            // ==================================
            // QUOTA / RATE LIMIT
            // ==================================

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

                    "Quota limit reached — waiting 60 seconds..."
                );

                await wait(
                    QUOTA_WAIT
                );

                continue;
            }


            // ==================================
            // SERVER TEMPORARY ERROR
            // ==================================

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

                    `Temporary error — retry ${attempt}/${MAX_RETRIES}`
                );

                await wait(delay);

                continue;
            }


            throw new Error(
                errorMessage
            );

        } catch (error) {

            console.error(
                "Chunk error:",
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

            await wait(3000);

        }

    }

    throw new Error(
        `Chunk ${chunkNumber} failed.`
    );

}


// ============================================
// TRANSLATE BUTTON
// ============================================

if (translateBtn) {

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

            translateBtn.disabled = true;

            if (downloadBtn) {
                downloadBtn.disabled = true;
            }

            translateBtn.textContent =
                "Translating...";


            const chunks =
                createChunks();

            totalChunks =
                chunks.length;


            // =================================
            // RESUME
            // =================================

            let startChunk =
                currentChunk;

            if (
                !translatedChunks.length
            ) {

                startChunk = 0;

            }


            if (startChunk > 0) {

                updateProgress(

                    (
                        startChunk /
                        totalChunks
                    ) * 100,

                    `Resuming from chunk ${startChunk + 1}...`

                );

            } else {

                updateProgress(
                    0,
                    "Starting translation..."
                );

            }


            try {

                // =================================
                // CHUNK LOOP
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

                        `Translating ${i + 1}/${totalChunks}...`

                    );


                    // =================================
                    // API
                    // =================================

                    const result =
                        await translateChunk(
                            chunk,
                            i + 1
                        );


                    // =================================
                    // VALIDATE
                    // =================================

                    if (
                        !validateChunk(
                            chunk,
                            result
                        )
                    ) {

                        throw new Error(
                            `Validation failed at chunk ${i + 1}.`
                        );

                    }


                    // =================================
                    // SAVE TRANSLATED CHUNK
                    // =================================

                    translatedChunks[i] =
                        result;


                    // =================================
                    // MEMORY
                    // =================================

                    translationMemory =
                        result.slice(-15);


                    // =================================
                    // MARK COMPLETE
                    // =================================

                    currentChunk =
                        i + 1;


                    // =================================
                    // SAVE
                    // =================================

                    saveState();


                    // =================================
                    // UPDATE PREVIEW
                    // =================================

                    if (preview) {

                        preview.value =
                            buildSRT(
                                mergeTranslated()
                            );

                    }


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


                // =================================
                // FINAL OUTPUT
                // =================================

                const finalSubtitle =
                    mergeTranslated();


                if (
                    finalSubtitle.length !==
                    subtitles.length
                ) {

                    throw new Error(
                        "Final subtitle validation failed."
                    );

                }


                if (preview) {

                    preview.value =
                        buildSRT(
                            finalSubtitle
                        );

                }


                updateProgress(
                    100,
                    "Translation complete!"
                );


                translateBtn.textContent =
                    "Translation Complete ✓";


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
                    totalChunks
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
                    "\n\n" +
                    "Your progress is saved. " +
                    "Click Resume Translation to continue."

                );


            } finally {

                translating = false;

                translateBtn.disabled = false;

                if (downloadBtn) {
                    downloadBtn.disabled = false;
                }


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

}


// ============================================
// DOWNLOAD SRT
// ============================================

if (downloadBtn) {

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


            const originalName =
    currentFileName
        .replace(/\.srt$/i, "");

const downloadName =
    `${originalName} - Sinhala Sub - SubLanka AI.srt`;

link.download =
    downloadName;

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

}


// ============================================
// RESTORE SAVED JOB
// ============================================

window.addEventListener(
    "DOMContentLoaded",
    function () {

        const restored =
            loadState();


        if (restored) {

            if (translateBtn) {

                translateBtn.textContent =
                    "Resume Translation";

            }

            console.log(
                "Saved translation restored."
            );

        }

    }
);
