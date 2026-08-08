// ============================================================
// SUBLANKA AI
// Advanced Subtitle Translator
// ============================================================


// ============================================================
// ELEMENTS
// ============================================================

const fileInput =
    document.getElementById("subtitleFile");

const fileName =
    document.getElementById("fileName");

const preview =
    document.getElementById("preview");

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


// ============================================================
// SETTINGS
// ============================================================

const CHUNK_SIZE = 30;

const MAX_RETRIES = 10;

const QUOTA_WAIT = 60000;

const REQUEST_DELAY = 1500;

const STORAGE_KEY =
    "sublanka_ai_translation_v3";


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
// TIME CONVERSION
// ============================================================

function timestampToMs(timestamp) {

    const match =
        timestamp.match(
            /(\d{2}):(\d{2}):(\d{2}),(\d{3})/
        );

    if (!match) {

        return null;

    }

    const hours =
        Number(match[1]);

    const minutes =
        Number(match[2]);

    const seconds =
        Number(match[3]);

    const milliseconds =
        Number(match[4]);

    return (
        hours * 3600000 +
        minutes * 60000 +
        seconds * 1000 +
        milliseconds
    );

}


// ============================================================
// PARSE SRT
// ============================================================

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
// CHECK SOURCE SRT
// ============================================================

function analyzeSourceSRT(data) {

    const warnings = [];

    const numbers = new Set();

    let previousEnd = null;

    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        const sub =
            data[i];

        const number =
            Number(sub.number);

        // ----------------------------------------
        // Duplicate number
        // ----------------------------------------

        if (
            numbers.has(number)
        ) {

            warnings.push(
                `Duplicate subtitle number: ${sub.number}`
            );

        }

        numbers.add(number);


        // ----------------------------------------
        // Timestamp
        // ----------------------------------------

        const parts =
            sub.timestamp.split("-->");

        if (
            parts.length !== 2
        ) {

            warnings.push(
                `Invalid timestamp at subtitle ${sub.number}`
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
                `Invalid timestamp at subtitle ${sub.number}`
            );

            continue;

        }

        if (
            end < start
        ) {

            warnings.push(
                `End time before start time at subtitle ${sub.number}`
            );

        }

        // ----------------------------------------
        // Overlap warning
        // ----------------------------------------

        if (
            previousEnd !== null &&
            start < previousEnd
        ) {

            warnings.push(
                `Timestamp overlap near subtitle ${sub.number}`
            );

        }

        previousEnd =
            end;

    }

    return warnings;

}


// ============================================================
// CHECK NUMBER SEQUENCE
// ============================================================

function checkNumberSequence(data) {

    const missing = [];

    const duplicates = [];

    const seen = new Set();

    const numericNumbers =
        data
            .map(sub => Number(sub.number))
            .filter(Number.isFinite);

    if (
        numericNumbers.length === 0
    ) {

        return {
            missing,
            duplicates
        };

    }

    const min =
        Math.min(
            ...numericNumbers
        );

    const max =
        Math.max(
            ...numericNumbers
        );

    for (
        let i = min;
        i <= max;
        i++
    ) {

        const count =
            numericNumbers.filter(
                number =>
                    number === i
            ).length;

        if (count === 0) {

            missing.push(i);

        }

        if (count > 1) {

            duplicates.push(i);

        }

    }

    return {
        missing,
        duplicates
    };

}


// ============================================================
// VALIDATE TRANSLATED CHUNK
// ============================================================

function validateChunk(
    original,
    translated
) {

    if (
        !Array.isArray(translated)
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

        // ----------------------------------------
        // NUMBER
        // ----------------------------------------

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

        // ----------------------------------------
        // TIMESTAMP
        // ----------------------------------------

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

        // ----------------------------------------
        // TEXT
        // ----------------------------------------

        if (
            !result.text ||
            !result.text.trim()
        ) {

            return false;

        }

    }

    return true;

}


// ============================================================
// BUILD GLOSSARY
// ============================================================

function buildGlossary(data) {

    const text =
        data
            .map(sub => sub.text)
            .join("\n")
            .toLowerCase();

    const result = {};


    // ========================================================
    // IMPORTANT NAMES
    // ========================================================

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
        "Dunder Mifflin",
        "David Wallace",
        "Todd Packer"

    ];


    names.forEach(name => {

        if (
            text.includes(
                name.toLowerCase()
            )
        ) {

            result[name] =
                name;

        }

    });


    // ========================================================
    // OFFICE TERMS
    // ========================================================

    const terms = {

        "Regional Manager":
            "ප්‍රාදේශීය කළමනාකරු",

        "Assistant Regional Manager":
            "සහකාර ප්‍රාදේශීය කළමනාකරු",

        "Assistant to the Regional Manager":
            "ප්‍රාදේශීය කළමනාකරුගේ සහයක",

        "Dunder Mifflin":
            "ඩන්ඩර් මිෆ්ලින්",

        "office":
            "ඔෆිස් එක",

        "boss":
            "බොස්",

        "prank":
            "ප්‍රෑන්ක්",

        "downsizing":
            "සේවක අඩු කිරීම"

    };


    Object.keys(terms)
        .forEach(term => {

            if (
                text.includes(
                    term.toLowerCase()
                )
            ) {

                result[term] =
                    terms[term];

            }

        });


    return result;

}


// ============================================================
// GLOSSARY TEXT
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

        const translated =
            result[i];

        if (!translated) {

            errors.push(
                `Missing subtitle ${source.number}`
            );

            continue;

        }

        if (
            String(
                translated.number
            ) !==
            String(
                source.number
            )
        ) {

            errors.push(
                `Number changed at ${source.number}`
            );

        }

        if (
            translated.timestamp !==
            source.timestamp
        ) {

            errors.push(
                `Timestamp changed at ${source.number}`
            );

        }

        if (
            !translated.text ||
            !translated.text.trim()
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

            version: 3,

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
            "Could not save progress:",
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
            JSON.parse(saved);

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
            "Could not load state:",
            error
        );

        return false;

    }

}


// ============================================================
// CLEAR STATE
// ============================================================

function clearSavedState() {

    localStorage.removeItem(
        STORAGE_KEY
    );

}


// ============================================================
// FILE UPLOAD
// ============================================================

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

                fileInput.value =
                    "";

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


                    // ========================================
                    // NEW JOB
                    // ========================================

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


                    // ========================================
                    // GLOSSARY
                    // ========================================

                    glossary =
                        buildGlossary(
                            subtitles
                        );


                    // ========================================
                    // SOURCE CHECK
                    // ========================================

                    const sourceWarnings =
                        analyzeSourceSRT(
                            subtitles
                        );


                    const numberCheck =
                        checkNumberSequence(
                            subtitles
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


                    if (
                        sourceWarnings.length > 0 ||
                        numberCheck.missing.length > 0 ||
                        numberCheck.duplicates.length > 0
                    ) {

                        console.warn(
                            "Source SRT warnings:",
                            {
                                sourceWarnings,
                                missing:
                                    numberCheck.missing,
                                duplicates:
                                    numberCheck.duplicates
                            }
                        );

                    }


                    if (translateBtn) {

                        translateBtn.textContent =
                            "Translate Subtitle";

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
                `Chunk ${chunkNumber}/${totalChunks}`,
                `Attempt ${attempt}`
            );


            // ==================================================
            // CONTEXT
            // ==================================================

            const memoryText =
                translationMemory
                    .map(sub => {

                        return (
                            `[${sub.number}] ${sub.text}`
                        );

                    })
                    .join("\n");


            const glossaryText =
                glossaryToText();


            // ==================================================
            // API
            // ==================================================

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


            // ==================================================
            // SUCCESS
            // ==================================================

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


            // ==================================================
            // INCOMPLETE
            // ==================================================

            if (
                response.status === 422
            ) {

                updateProgress(

                    (
                        currentChunk /
                        totalChunks
                    ) * 100,

                    `Incomplete translation — retry ${attempt}/${MAX_RETRIES}`

                );


                await wait(

                    Math.min(
                        10000,
                        attempt * 1500
                    )

                );


                continue;

            }


            // ==================================================
            // QUOTA
            // ==================================================

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


            // ==================================================
            // TEMPORARY ERROR
            // ==================================================

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
                    "Please upload an SRT file first."
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
                !translatedChunks.length
            ) {

                startChunk =
                    0;

            }


            try {

                // =================================================
                // CHUNK LOOP
                // =================================================

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


                    // =============================================
                    // TRANSLATE
                    // =============================================

                    const result =
                        await translateChunk(
                            chunk,
                            i + 1
                        );


                    // =============================================
                    // VALIDATE
                    // =============================================

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


                    // =============================================
                    // SAVE CHUNK
                    // =============================================

                    translatedChunks[i] =
                        result;


                    // =============================================
                    // MEMORY
                    // =============================================

                    translationMemory =
                        result.slice(
                            -20
                        );


                    // =============================================
                    // CURRENT CHUNK
                    // =============================================

                    currentChunk =
                        i + 1;


                    // =============================================
                    // AUTO SAVE
                    // =============================================

                    saveState();


                    // =============================================
                    // LIVE PREVIEW
                    // =============================================

                    if (preview) {

                        preview.value =
                            buildSRT(
                                mergeTranslated()
                            );

                    }


                    // =============================================
                    // PROGRESS
                    // =============================================

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


                    // =============================================
                    // DELAY
                    // =============================================

                    if (
                        currentChunk <
                        totalChunks
                    ) {

                        await wait(
                            REQUEST_DELAY
                        );

                    }

                }


                // =================================================
                // FINAL VALIDATION
                // =================================================

                const finalCheck =
                    finalValidation();


                if (
                    !finalCheck.valid
                ) {

                    console.error(
                        "Final validation errors:",
                        finalCheck.errors
                    );


                    throw new Error(
                        "Final subtitle validation failed:\n" +
                        finalCheck.errors
                            .slice(0, 10)
                            .join("\n")
                    );

                }


                const finalSubtitle =
                    mergeTranslated();


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
// DOWNLOAD SRT
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
                    "Please upload an SRT file first."
                );

                return;

            }


            const finalCheck =
                finalValidation();


            if (
                !finalCheck.valid
            ) {

                alert(
                    "Subtitle validation failed.\n\n" +
                    finalCheck.errors
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


            // =====================================================
            // FILENAME
            // =====================================================

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
// RESTORE SAVED TRANSLATION
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
