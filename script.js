// ============================================================
// SUBLANKA AI - FULL SCRIPT.JS
// ============================================================


// ============================================================
// ELEMENTS
// ============================================================

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


// ============================================================
// SETTINGS
// ============================================================

const CHUNK_SIZE = 30;

const MAX_RETRIES = 10;

const REQUEST_DELAY = 1500;

const QUOTA_WAIT = 60000;

const STORAGE_KEY =
    "sublanka_ai_translation_v5";


// ============================================================
// VARIABLES
// ============================================================

let subtitles = [];

let translatedChunks = [];

let translationMemory = [];

let glossary = {};

let currentChunk = 0;

let totalChunks = 0;

let translating = false;

let currentFileName = "";


// ============================================================
// WAIT
// ============================================================

function wait(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });

}


// ============================================================
// PROGRESS
// ============================================================

function updateProgress(percent, message) {

    if (progressContainer) {

        progressContainer.style.display =
            "block";

    }

    const safePercent =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );

    if (progressFill) {

        progressFill.style.width =
            safePercent + "%";

    }

    if (progressPercent) {

        progressPercent.textContent =
            Math.round(
                safePercent
            ) + "%";

    }

    if (progressText) {

        progressText.textContent =
            message;

    }

}


// ============================================================
// TIMESTAMP → MILLISECONDS
// ============================================================

function timestampToMs(value) {

    const match =
        value.match(
            /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/
        );

    if (!match) {

        return null;

    }

    return (
        Number(match[1]) * 3600000 +
        Number(match[2]) * 60000 +
        Number(match[3]) * 1000 +
        Number(match[4])
    );

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


// ============================================================
// BUILD SRT
// ============================================================

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
// SOURCE VALIDATION
// ============================================================

function analyzeSourceSRT(data) {

    const warnings = [];

    const seenNumbers =
        new Set();

    let previousEnd = null;


    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        const sub =
            data[i];


        // --------------------------------------------
        // Duplicate number
        // --------------------------------------------

        if (
            seenNumbers.has(
                String(sub.number)
            )
        ) {

            warnings.push(
                `Duplicate subtitle number: ${sub.number}`
            );

        }


        seenNumbers.add(
            String(sub.number)
        );


        // --------------------------------------------
        // Timestamp
        // --------------------------------------------

        const parts =
            sub.timestamp.split("-->");


        if (
            parts.length !== 2
        ) {

            warnings.push(
                `Invalid timestamp: ${sub.number}`
            );

            continue;

        }


        const start =
            timestampToMs(
                parts[0].trim()
            );

        const end =
            timestampToMs(
                parts[1].trim()
            );


        if (
            start === null ||
            end === null
        ) {

            warnings.push(
                `Invalid timestamp: ${sub.number}`
            );

            continue;

        }


        if (
            end < start
        ) {

            warnings.push(
                `End time before start: ${sub.number}`
            );

        }


        // --------------------------------------------
        // Overlap
        // --------------------------------------------

        if (
            previousEnd !== null &&
            start < previousEnd
        ) {

            warnings.push(
                `Timestamp overlap near ${sub.number}`
            );

        }


        previousEnd =
            end;

    }


    return warnings;

}


// ============================================================
// NUMBER SEQUENCE CHECK
// ============================================================

function checkNumberSequence(data) {

    const numbers =
        data
            .map(sub => Number(sub.number))
            .filter(
                Number.isFinite
            );


    const missing = [];

    const duplicates = [];


    if (
        numbers.length === 0
    ) {

        return {
            missing,
            duplicates
        };

    }


    const min =
        Math.min(
            ...numbers
        );

    const max =
        Math.max(
            ...numbers
        );


    const counts = {};


    numbers.forEach(number => {

        counts[number] =
            (counts[number] || 0) + 1;

    });


    for (
        let i = min;
        i <= max;
        i++
    ) {

        if (!counts[i]) {

            missing.push(i);

        }

        if (
            counts[i] > 1
        ) {

            duplicates.push(i);

        }

    }


    return {
        missing,
        duplicates
    };

}


// ============================================================
// BUILD GLOSSARY
// ============================================================

function buildGlossary(data) {

    const allText =
        data
            .map(sub => sub.text)
            .join("\n")
            .toLowerCase();


    const glossaryData = {};


    const names = [

        "Michael Scott",
        "Jim Halpert",
        "Pam Beesly",
        "Dwight Schrute",
        "Ryan Howard",
        "Stanley Hudson",
        "Angela Martin",
        "Kevin Malone",
        "Oscar Martinez",
        "Jan Levinson",
        "David Wallace",
        "Todd Packer",
        "Dunder Mifflin"

    ];


    names.forEach(name => {

        if (
            allText.includes(
                name.toLowerCase()
            )
        ) {

            glossaryData[name] =
                name;

        }

    });


    const terms = {

        "Regional Manager":
            "ප්‍රාදේශීය කළමනාකරු",

        "Assistant Regional Manager":
            "සහකාර ප්‍රාදේශීය කළමනාකරු",

        "Assistant to the Regional Manager":
            "ප්‍රාදේශීය කළමනාකරුගේ සහයක",

        "Dunder Mifflin":
            "ඩන්ඩර් මිෆ්ලින්",

        "prank":
            "ප්‍රෑන්ක්",

        "downsizing":
            "සේවක අඩු කිරීම"

    };


    Object.keys(terms)
        .forEach(term => {

            if (
                allText.includes(
                    term.toLowerCase()
                )
            ) {

                glossaryData[term] =
                    terms[term];

            }

        });


    return glossaryData;

}


// ============================================================
// GLOSSARY → TEXT
// ============================================================

function glossaryToText() {

    const entries =
        Object.entries(
            glossary
        );


    if (
        entries.length === 0
    ) {

        return "";

    }


    return entries
        .map(
            ([english, sinhala]) =>
                `${english} = ${sinhala}`
        )
        .join("\n");

}


// ============================================================
// MERGE TRANSLATED CHUNKS
// ============================================================

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

        console.warn(
            "Subtitle count mismatch"
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


        // --------------------------------------------
        // NUMBER
        // --------------------------------------------

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


        // --------------------------------------------
        // TIMESTAMP
        // --------------------------------------------

        if (
            result.timestamp !==
            source.timestamp
        ) {

            console.warn(
                "Timestamp mismatch:",
                source.timestamp,
                result.timestamp
            );

            return false;

        }


        // --------------------------------------------
        // DIALOGUE LINE COUNT
        // --------------------------------------------

        const sourceLines =
            source.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim() !== ""
                );


        const resultLines =
            result.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim() !== ""
                );


        if (
            sourceLines.length !==
            resultLines.length
        ) {

            console.warn(
                "Dialogue line count mismatch:",
                source.number,
                "Expected:",
                sourceLines.length,
                "Received:",
                resultLines.length
            );

            return false;

        }


        // --------------------------------------------
        // EMPTY TEXT
        // --------------------------------------------

        if (
            resultLines.some(
                line =>
                    !line.trim()
            )
        ) {

            return false;

        }

    }


    return true;

}


// ============================================================
// FINAL VALIDATION
// ============================================================

function finalValidation() {

    const result =
        mergeTranslated();


    const errors = [];


    if (
        result.length !==
        subtitles.length
    ) {

        errors.push(
            "Subtitle count changed."
        );

    }


    for (
        let i = 0;
        i < subtitles.length;
        i++
    ) {

        const source =
            subtitles[i];

        const output =
            result[i];


        if (!output) {

            errors.push(
                `Missing subtitle ${source.number}`
            );

            continue;

        }


        if (
            String(output.number) !==
            String(source.number)
        ) {

            errors.push(
                `Number changed at ${source.number}`
            );

        }


        if (
            output.timestamp !==
            source.timestamp
        ) {

            errors.push(
                `Timestamp changed at ${source.number}`
            );

        }


        const sourceLines =
            source.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim()
                );


        const outputLines =
            output.text
                .split(/\r?\n/)
                .filter(
                    line =>
                        line.trim()
                );


        if (
            sourceLines.length !==
            outputLines.length
        ) {

            errors.push(
                `Dialogue line count changed at ${source.number}`
            );

        }


        if (
            outputLines.length === 0
        ) {

            errors.push(
                `Empty translation at ${source.number}`
            );

        }

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


// ============================================================
// SAVE STATE
// ============================================================

function saveState() {

    try {

        const state = {

            version: 5,

            fileName:
                currentFileName,

            subtitles,

            translatedChunks,

            translationMemory,

            glossary,

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


// ============================================================
// LOAD STATE
// ============================================================

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
            JSON.parse(
                saved
            );


        if (
            !Array.isArray(
                state.subtitles
            )
        ) {

            return false;

        }


        subtitles =
            state.subtitles;


        translatedChunks =
            state.translatedChunks || [];


        translationMemory =
            state.translationMemory || [];


        glossary =
            state.glossary || {};


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


        if (preview) {

            preview.value =
                buildSRT(
                    mergeTranslated()
                );

        }


        const completed =
            Math.min(
                currentChunk *
                CHUNK_SIZE,
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
            "Load error:",
            error
        );

        return false;

    }

}


// ============================================================
// CLEAR SAVED STATE
// ============================================================

function clearSavedState() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


// ============================================================
// FILE SELECT
// ============================================================

if (!fileInput) {

    console.error(
        "SubLanka AI: #subtitleFile not found."
    );

} else {

    fileInput.addEventListener(
        "change",
        function () {

            const file =
                this.files &&
                this.files[0];


            if (!file) {

                return;

            }


            // --------------------------------------------
            // CHECK SRT
            // --------------------------------------------

            if (
                !file.name
                    .toLowerCase()
                    .endsWith(".srt")
            ) {

                alert(
                    "Please select an SRT (.srt) file."
                );

                this.value =
                    "";

                return;

            }


            // --------------------------------------------
            // SAVE FILE NAME
            // --------------------------------------------

            currentFileName =
                file.name;


            if (fileName) {

                fileName.textContent =
                    file.name;

            }


            // --------------------------------------------
            // READ FILE
            // --------------------------------------------

            const reader =
                new FileReader();


            reader.onload =
                function (event) {

                    try {

                        const content =
                            event.target.result;


                        // ------------------------------------
                        // PARSE
                        // ------------------------------------

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


                        // ------------------------------------
                        // NEW JOB
                        // ------------------------------------

                        subtitles =
                            parsed;


                        translatedChunks =
                            [];


                        translationMemory =
                            [];


                        currentChunk =
                            0;


                        totalChunks =
                            Math.ceil(
                                subtitles.length /
                                CHUNK_SIZE
                            );


                        // ------------------------------------
                        // GLOSSARY
                        // ------------------------------------

                        glossary =
                            buildGlossary(
                                subtitles
                            );


                        // ------------------------------------
                        // CLEAR OLD JOB
                        // ------------------------------------

                        clearSavedState();


                        // ------------------------------------
                        // SHOW ORIGINAL
                        // ------------------------------------

                        if (preview) {

                            preview.value =
                                buildSRT(
                                    subtitles
                                );

                        }


                        // ------------------------------------
                        // SOURCE CHECK
                        // ------------------------------------

                        const warnings =
                            analyzeSourceSRT(
                                subtitles
                            );


                        const numberCheck =
                            checkNumberSequence(
                                subtitles
                            );


                        // ------------------------------------
                        // PROGRESS
                        // ------------------------------------

                        updateProgress(

                            0,

                            `Ready: ${subtitles.length} subtitles`

                        );


                        // ------------------------------------
                        // ENABLE BUTTON
                        // ------------------------------------

                        if (translateBtn) {

                            translateBtn.disabled =
                                false;

                            translateBtn.textContent =
                                "Translate Subtitle";

                        }


                        if (downloadBtn) {

                            downloadBtn.disabled =
                                false;

                        }


                        // ------------------------------------
                        // DEBUG
                        // ------------------------------------

                        console.log(
                            "================================"
                        );

                        console.log(
                            "SUBTITLE LOADED"
                        );

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

                        console.log(
                            "Missing:",
                            numberCheck.missing
                        );

                        console.log(
                            "Duplicates:",
                            numberCheck.duplicates
                        );

                        console.log(
                            "Warnings:",
                            warnings
                        );

                        console.log(
                            "Glossary:",
                            glossary
                        );

                        console.log(
                            "================================"
                        );


                    } catch (error) {

                        console.error(
                            "SRT processing error:",
                            error
                        );

                        alert(
                            "Could not process this SRT file."
                        );

                    }

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

            console.log(
                `Chunk ${chunkNumber}/${totalChunks} - Attempt ${attempt}`
            );


            // --------------------------------------------
            // MEMORY
            // --------------------------------------------

            const memoryText =
                translationMemory
                    .map(sub => {

                        return (
                            `[${sub.number}] ${sub.text}`
                        );

                    })
                    .join("\n");


            // --------------------------------------------
            // GLOSSARY
            // --------------------------------------------

            const glossaryText =
                glossaryToText();


            // --------------------------------------------
            // API REQUEST
            // --------------------------------------------

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
                                    memoryText,

                                glossary:
                                    glossaryText

                            })

                    }
                );


            const raw =
                await response.text();


            let data;


            try {

                data =
                    JSON.parse(
                        raw
                    );

            } catch {

                throw new Error(
                    "Invalid server response."
                );

            }


            // --------------------------------------------
            // SUCCESS
            // --------------------------------------------

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


            // --------------------------------------------
            // 422 VALIDATION
            // --------------------------------------------

            if (
                response.status === 422
            ) {

                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Subtitle check failed — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(

                    Math.min(
                        10000,
                        attempt * 1500
                    )

                );


                continue;

            }


            // --------------------------------------------
            // QUOTA
            // --------------------------------------------

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

                    "Quota reached — waiting 60 seconds..."

                );


                await wait(
                    QUOTA_WAIT
                );


                continue;

            }


            // --------------------------------------------
            // SERVER ERROR
            // --------------------------------------------

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

                    `Server error — retry ${attempt}/${MAX_RETRIES}`

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

                `Retrying chunk ${chunkNumber}...`

            );


            await wait(
                3000
            );

        }

    }


    throw new Error(
        `Chunk ${chunkNumber} failed after ${MAX_RETRIES} attempts.`
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
                !subtitles ||
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


            const chunks =
                createChunks();


            totalChunks =
                chunks.length;


            let startChunk =
                currentChunk;


            if (
                translatedChunks.length === 0
            ) {

                startChunk =
                    0;

            }


            try {

                // =========================================
                // CHUNK LOOP
                // =========================================

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


                    // -------------------------------------
                    // TRANSLATE
                    // -------------------------------------

                    const result =
                        await translateChunk(
                            chunk,
                            i + 1
                        );


                    // -------------------------------------
                    // VALIDATE
                    // -------------------------------------

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


                    // -------------------------------------
                    // SAVE CHUNK
                    // -------------------------------------

                    translatedChunks[i] =
                        result;


                    // -------------------------------------
                    // MEMORY
                    // -------------------------------------

                    translationMemory =
                        result.slice(
                            -20
                        );


                    // -------------------------------------
                    // COMPLETE
                    // -------------------------------------

                    currentChunk =
                        i + 1;


                    // -------------------------------------
                    // AUTO SAVE
                    // -------------------------------------

                    saveState();


                    // -------------------------------------
                    // LIVE PREVIEW
                    // -------------------------------------

                    if (preview) {

                        preview.value =
                            buildSRT(
                                mergeTranslated()
                            );

                    }


                    // -------------------------------------
                    // PROGRESS
                    // -------------------------------------

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


                    // -------------------------------------
                    // REQUEST DELAY
                    // -------------------------------------

                    if (
                        currentChunk <
                        totalChunks
                    ) {

                        await wait(
                            REQUEST_DELAY
                        );

                    }

                }


                // =========================================
                // FINAL VALIDATION
                // =========================================

                const check =
                    finalValidation();


                if (
                    !check.valid
                ) {

                    console.error(
                        "Final errors:",
                        check.errors
                    );


                    throw new Error(

                        "Final subtitle validation failed:\n" +
                        check.errors
                            .slice(0, 10)
                            .join("\n")

                    );

                }


                // =========================================
                // FINAL PREVIEW
                // =========================================

                if (preview) {

                    preview.value =
                        buildSRT(
                            mergeTranslated()
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
                    "Progress has been saved. " +
                    "Click Resume Translation to continue."

                );


            } finally {

                translating =
                    false;


                translateBtn.disabled =
                    false;


                if (downloadBtn) {

                    downloadBtn.disabled =
                        false;

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


// ============================================================
// DOWNLOAD
// ============================================================

if (downloadBtn) {

    downloadBtn.addEventListener(
        "click",
        function () {

            if (
                !subtitles ||
                subtitles.length === 0
            ) {

                alert(
                    "Please select an SRT file first."
                );

                return;

            }


            // --------------------------------------------
            // FINAL CHECK
            // --------------------------------------------

            const check =
                finalValidation();


            if (
                !check.valid
            ) {

                alert(

                    "Subtitle validation failed.\n\n" +
                    check.errors
                        .slice(0, 10)
                        .join("\n")

                );

                return;

            }


            const finalData =
                mergeTranslated();


            const srt =
                buildSRT(
                    finalData
                );


            // --------------------------------------------
            // CREATE FILE
            // --------------------------------------------

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


            // --------------------------------------------
            // FILE NAME
            // --------------------------------------------

            const originalName =
                currentFileName
                    .replace(
                        /\.srt$/i,
                        ""
                    );


            link.download =
                `${originalName} - Sinhala Sub - SubLanka AI.srt`;


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


// ============================================================
// PAGE LOAD - RESTORE
// ============================================================

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
