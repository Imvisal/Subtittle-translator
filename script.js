"use strict";

/*
========================================================
SUBLANKA AI — COMPLETE script.js
========================================================

Features:
- SRT upload
- SRT preview
- Sinhala translation
- Movie / TV search
- Search animation
- Sinhala subtitle availability
- TV Season / Episode
- English subtitle search
- English subtitle download
- Automatic Sinhala translation
- Friendly translation progress
- Sinhala SRT download
- TMDB category system
- Category cards hide when searching
- Category cards show when category tab clicked
========================================================
*/


// ========================================================
// DOM ELEMENTS
// ========================================================

const searchInput =
    document.getElementById("searchInput");

const searchBtn =
    document.getElementById("searchBtn");

const searchResults =
    document.getElementById("searchResults");

const searchStatus =
    document.getElementById("searchStatus");

const fileInput =
    document.getElementById("fileInput") ||
    document.getElementById("srtFile") ||
    document.getElementById("subtitleFile");

const fileName =
    document.getElementById("fileName") ||
    document.getElementById("fileNameDisplay");

const translateBtn =
    document.getElementById("translateBtn") ||
    document.getElementById("translateButton");

const languageSelect =
    document.getElementById("languageSelect") ||
    document.getElementById("language");

const subtitlePreview =
    document.getElementById("subtitlePreview") ||
    document.getElementById("preview");


// ========================================================
// GLOBAL STATE
// ========================================================

let uploadedSubtitles = [];

let uploadedFileName = "subtitle";

let isTranslating = false;

// Subtitle editor settings
let selectedTranslationStyle = "natural";
let subtitleEditorPage = 0;

const SUBTITLE_EDITOR_PAGE_SIZE = 40;


// ========================================================
// CATEGORY STATE
// ========================================================

const categoryChips =
    document.querySelectorAll(".category-chip");

let categoryResultsContainer = null;


// ========================================================
// SEARCH EVENTS
// ========================================================

if (searchBtn) {

    searchBtn.addEventListener(
        "click",
        searchMovies
    );

}


if (searchInput) {

    searchInput.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Enter") {

                searchMovies();

            }

        }
    );

}


// ========================================================
// FILE UPLOAD
// ========================================================

if (fileInput) {

    fileInput.addEventListener(
        "change",
        handleFileUpload
    );

}


// ========================================================
// TRANSLATE BUTTON
// ========================================================

if (translateBtn) {

    translateBtn.addEventListener(
        "click",
        function () {

            const translationSection =
                document.querySelector(
                    ".settings-section"
                );

            if (translationSection) {

                translationSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            }

            setTimeout(
                function () {

                    translateUploadedSubtitle();

                },
                350
            );

        }
    );

}


// ========================================================
// HANDLE FILE UPLOAD
// ========================================================

async function handleFileUpload(event) {

    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }


    if (
        !file.name
            .toLowerCase()
            .endsWith(".srt")
    ) {

        alert(
            "Please select an SRT subtitle file."
        );

        return;

    }


    uploadedFileName =
        file.name.replace(
            /\.srt$/i,
            ""
        );


    if (fileName) {

        fileName.textContent =
            file.name;

    }


    try {

        const text =
            await file.text();

        uploadedSubtitles =
            parseSRT(text);


        if (!uploadedSubtitles.length) {

            alert(
                "This SRT file could not be read."
            );

            return;

        }


        showSRTPreview(
            uploadedSubtitles
        );


        if (translateBtn) {

            translateBtn.disabled = false;

        }


    } catch (error) {

        console.error(
            "FILE ERROR:",
            error
        );

        alert(
            "Could not read subtitle file."
        );

    }

}


// ========================================================
// SHOW SRT PREVIEW
// ========================================================

// ========================================================
// STRUCTURED SUBTITLE EDITOR
// ========================================================

function showSRTPreview(subtitles) {
    if (!subtitlePreview) return;

    // Hide the old raw-text preview.
    subtitlePreview.style.display = "none";

    let workspace = document.getElementById(
        "subtitleEditorWorkspace"
    );

    if (!workspace) {
        workspace = document.createElement("section");
        workspace.id = "subtitleEditorWorkspace";
        workspace.className = "sublanka-editor";

        workspace.innerHTML = `
            <div class="se-header">
                <div class="se-tabs">
                    <button type="button"
                        class="se-tab active"
                        data-tab="editor">
                        ✏️ Subtitle Editor
                    </button>

                    <button type="button"
                        class="se-tab"
                        data-tab="raw">
                        📄 SRT Preview
                    </button>
                </div>

                <button
                    type="button"
                    id="seSettingsButton"
                    class="se-settings-button"
                    title="Translation settings"
                    aria-label="Translation settings">
                    ⚙️
                </button>
            </div>

            <div id="seSettingsPanel" class="se-settings" hidden>
                <h3>⚙️ AI Translation Settings</h3>

                <label for="seTranslationStyle">
                    Translation style
                </label>

                <select id="seTranslationStyle">
                    <option value="natural">Natural Sinhala</option>
                    <option value="comedy">Comedy / Funny</option>
                    <option value="action">Action / Intense</option>
                    <option value="formal">Formal Sinhala</option>
                    <option value="casual">Casual / Everyday</option>
                    <option value="literal">Closer to original meaning</option>
                    <option value="anime">Anime / Dramatic</option>
                </select>

                <p class="se-help">
                    The selected style is sent with each translation request.
                </p>
            </div>

            <div class="se-sync">
                <div>
                    <strong>Subtitle Sync</strong>
                    <p>Adjust all subtitle timings together.</p>
                </div>

                <label for="seSyncOffset">
                    Offset in seconds
                    <input
                        id="seSyncOffset"
                        type="number"
                        step="0.1"
                        value="0">
                </label>

                <button type="button" id="seApplySync">
                    Apply Sync
                </button>
            </div>

            <div id="seEditorPane">
                <div class="se-search-row">
                    <input
                        type="search"
                        id="seSearch"
                        placeholder="Search subtitles or numbers...">

                    <span id="seSubtitleCount"></span>
                </div>

                <div id="seEditorList" class="se-editor-list"></div>

                <div class="se-pagination">
                    <button type="button" id="sePrevPage">
                        ← Previous
                    </button>

                    <span id="sePageLabel"></span>

                    <button type="button" id="seNextPage">
                        Next →
                    </button>
                </div>
            </div>

            <pre id="seRawPane" class="se-raw-pane" hidden></pre>
        `;

        injectSubtitleEditorStyles();

        // Insert the editor where the old preview was.
        subtitlePreview.insertAdjacentElement(
            "afterend",
            workspace
        );

        bindSubtitleEditorEvents(workspace);
    }

    subtitleEditorPage = 0;
    renderSubtitleEditor();
}

// ========================================================
// EDITOR DESIGN
// ========================================================

function injectSubtitleEditorStyles() {
    if (document.getElementById("sublankaEditorStyles")) return;

    const style = document.createElement("style");
    style.id = "sublankaEditorStyles";

    style.textContent = `
        .sublanka-editor {
            margin: 24px 0;
            padding: 20px;
            border: 1px solid rgba(129,102,255,.3);
            border-radius: 18px;
            background: linear-gradient(145deg,#10162b,#191337);
            color: #f8fafc;
            font-family: inherit;
            box-sizing: border-box;
            width: 100%;
        }

        .sublanka-editor * {
            box-sizing: border-box;
        }

        .se-header, .se-tabs, .se-sync,
        .se-search-row, .se-pagination,
        .se-row-heading, .se-time-fields {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .se-header, .se-sync, .se-search-row,
        .se-pagination, .se-row-heading {
            justify-content: space-between;
        }

        .se-tabs {
            flex-wrap: wrap;
        }

        .se-tab, .se-settings-button,
        .se-pagination button, #seApplySync {
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            padding: 10px 14px;
            color: #e5e7eb;
            background: rgba(255,255,255,.05);
            cursor: pointer;
            font: inherit;
        }

        .se-tab.active {
            background: linear-gradient(120deg,#7657ff,#bd39e7);
            border-color: transparent;
            color: white;
        }

        .se-settings-button {
            font-size: 20px;
            min-width: 44px;
        }

        .se-settings {
            margin-top: 16px;
            padding: 16px;
            background: rgba(255,255,255,.045);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 12px;
        }

        .se-settings h3 {
            margin: 0 0 14px;
        }

        .se-settings label, .se-sync label {
            display: flex;
            flex-direction: column;
            gap: 7px;
            color: #cbd5e1;
            font-size: 13px;
        }

        .se-settings select, .se-sync input,
        .se-search-row input, .se-time-fields input,
        .se-subtitle-text {
            width: 100%;
            min-width: 0;
            border: 1px solid rgba(255,255,255,.13);
            border-radius: 9px;
            padding: 10px;
            background: #0b1020;
            color: #f8fafc;
            font: inherit;
        }

        .se-settings select {
            margin-top: 8px;
        }

        .se-help, .se-sync p {
            font-size: 12px;
            line-height: 1.5;
            color: #a5b4cf;
            margin: 8px 0 0;
        }

        .se-sync {
            align-items: flex-end;
            flex-wrap: wrap;
            margin: 18px 0;
            padding: 14px;
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 12px;
            background: rgba(255,255,255,.035);
        }

        .se-sync > div {
            flex: 1 1 160px;
        }

        .se-sync label {
            width: 125px;
        }

        #seApplySync {
            background: #4f46e5;
            border-color: transparent;
        }

        .se-search-row {
            flex-wrap: wrap;
            margin-bottom: 12px;
        }

        .se-search-row input {
            flex: 1 1 220px;
        }

        #seSubtitleCount {
            color: #a5b4cf;
            font-size: 12px;
        }

        .se-editor-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 650px;
            overflow-y: auto;
            padding-right: 3px;
        }

        .se-subtitle-row {
            padding: 14px;
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 12px;
            background: rgba(255,255,255,.035);
        }

        .se-row-heading {
            align-items: flex-start;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .se-row-number {
            color: #c4b5fd;
            font-weight: 700;
            font-size: 13px;
            padding-top: 8px;
        }

        .se-time-fields {
            flex: 1 1 360px;
            flex-wrap: wrap;
        }

        .se-time-fields input {
            flex: 1 1 135px;
            font-size: 12px;
        }

        .se-subtitle-text {
            display: block;
            min-height: 72px;
            resize: vertical;
            line-height: 1.6;
        }

        .se-pagination {
            margin-top: 16px;
            flex-wrap: wrap;
        }

        #sePageLabel {
            font-size: 13px;
            color: #cbd5e1;
        }

        .se-pagination button:disabled {
            opacity: .4;
            cursor: not-allowed;
        }

        .se-raw-pane {
            margin-top: 16px;
            max-height: 650px;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            padding: 14px;
            border-radius: 12px;
            background: #080d1b;
            color: #e2e8f0;
            font: 13px/1.7 monospace;
        }

        @media(max-width:600px) {
            .sublanka-editor {
                padding: 12px;
            }

            .se-sync label {
                width: 100%;
            }

            .se-row-heading {
                flex-direction: column;
            }

            .se-time-fields {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);
}


// ========================================================
// DRAW EDITABLE SUBTITLE ROWS
// ========================================================

function renderSubtitleEditor() {
    const list = document.getElementById("seEditorList");
    if (!list) return;

    const searchText = (
        document.getElementById("seSearch")?.value || ""
    ).trim().toLowerCase();

    const filtered = uploadedSubtitles
        .map((subtitle, index) => ({ subtitle, index }))
        .filter(({ subtitle }) => {
            return (
                String(subtitle.number).includes(searchText) ||
                String(subtitle.text).toLowerCase().includes(searchText)
            );
        });

    const pageCount = Math.max(
        1,
        Math.ceil(filtered.length / SUBTITLE_EDITOR_PAGE_SIZE)
    );

    subtitleEditorPage = Math.min(
        subtitleEditorPage,
        pageCount - 1
    );

    const start = subtitleEditorPage * SUBTITLE_EDITOR_PAGE_SIZE;
    const pageItems = filtered.slice(
        start,
        start + SUBTITLE_EDITOR_PAGE_SIZE
    );

    list.innerHTML = pageItems.map(({ subtitle, index }) => {
        const times = String(subtitle.timestamp || "")
            .split("-->")
            .map(value => value.trim());

        const startTime = times[0] || "00:00:00,000";
        const endTime = times[1] || "00:00:00,000";

        return `
            <article class="se-subtitle-row" data-index="${index}">
                <div class="se-row-heading">
                    <span class="se-row-number">
                        Subtitle ${escapeHTML(subtitle.number)}
                    </span>

                    <div class="se-time-fields">
                        <input
                            class="se-start-time"
                            aria-label="Subtitle start time"
                            title="Start time"
                            value="${escapeAttribute(startTime)}">

                        <input
                            class="se-end-time"
                            aria-label="Subtitle end time"
                            title="End time"
                            value="${escapeAttribute(endTime)}">
                    </div>
                </div>

                <textarea
                    class="se-subtitle-text"
                    aria-label="Edit subtitle text"
                    spellcheck="true">${escapeHTML(subtitle.text)}</textarea>
            </article>
        `;
    }).join("");

    const count = document.getElementById("seSubtitleCount");
    if (count) {
        count.textContent =
            `${filtered.length} subtitles · ${uploadedSubtitles.length} total`;
    }

    const pageLabel = document.getElementById("sePageLabel");
    if (pageLabel) {
        pageLabel.textContent =
            `Page ${subtitleEditorPage + 1} / ${pageCount}`;
    }

    const prev = document.getElementById("sePrevPage");
    const next = document.getElementById("seNextPage");

    if (prev) prev.disabled = subtitleEditorPage <= 0;
    if (next) next.disabled = subtitleEditorPage >= pageCount - 1;

    const rawPane = document.getElementById("seRawPane");
    if (rawPane) {
        rawPane.textContent = buildSRT(uploadedSubtitles);
    }
}

// ========================================================
// EDITOR TAB AND SETTINGS EVENTS
// ========================================================

function bindSubtitleEditorEvents(workspace) {
    const settingsButton =
        workspace.querySelector("#seSettingsButton");

    const settingsPanel =
        workspace.querySelector("#seSettingsPanel");

    const styleSelect =
        workspace.querySelector("#seTranslationStyle");

    const search = workspace.querySelector("#seSearch");
    const list = workspace.querySelector("#seEditorList");

    settingsButton?.addEventListener("click", function () {
        settingsPanel.hidden = !settingsPanel.hidden;
    });

    styleSelect?.addEventListener("change", function () {
        selectedTranslationStyle = styleSelect.value;
    });

    search?.addEventListener("input", function () {
        subtitleEditorPage = 0;
        renderSubtitleEditor();
    });

    // Keep edits in uploadedSubtitles while typing.
    list?.addEventListener("input", function (event) {
        const row = event.target.closest(".se-subtitle-row");
        if (!row) return;

        const index = Number(row.dataset.index);
        const subtitle = uploadedSubtitles[index];

        if (!subtitle) return;

        const textInput = row.querySelector(".se-subtitle-text");
        const startInput = row.querySelector(".se-start-time");
        const endInput = row.querySelector(".se-end-time");

        if (event.target === textInput) {
            subtitle.text = textInput.value;
        }

        if (
            event.target === startInput ||
            event.target === endInput
        ) {
            subtitle.timestamp =
                `${startInput.value.trim()} --> ${endInput.value.trim()}`;
        }

        // Keep the raw SRT preview in sync.
        const rawPane = document.getElementById("seRawPane");
        if (rawPane) {
            rawPane.textContent = buildSRT(uploadedSubtitles);
        }
    });

    workspace.querySelector("#sePrevPage")?.addEventListener(
        "click",
        function () {
            if (subtitleEditorPage > 0) {
                subtitleEditorPage--;
                renderSubtitleEditor();
            }
        }
    );

    workspace.querySelector("#seNextPage")?.addEventListener(
        "click",
        function () {
            subtitleEditorPage++;
            renderSubtitleEditor();
        }
    );

    workspace.querySelectorAll(".se-tab").forEach(function (button) {
        button.addEventListener("click", function () {
            const tab = button.dataset.tab;

            workspace.querySelectorAll(".se-tab").forEach(btn => {
                btn.classList.toggle("active", btn === button);
            });

            const editorPane = workspace.querySelector("#seEditorPane");
            const rawPane = workspace.querySelector("#seRawPane");

            if (tab === "raw") {
                rawPane.textContent = buildSRT(uploadedSubtitles);
                rawPane.hidden = false;
                editorPane.hidden = true;
            } else {
                rawPane.hidden = true;
                editorPane.hidden = false;
            }
        });
    });

    workspace.querySelector("#seApplySync")?.addEventListener(
        "click",
        function () {
            const input = workspace.querySelector("#seSyncOffset");
            const seconds = Number(input.value);

            if (!Number.isFinite(seconds)) {
                alert("Enter a valid sync offset in seconds.");
                return;
            }

            const shifted = shiftAllSubtitleTimes(seconds);

            if (!shifted) {
                alert(
                    "Some subtitle timestamps are invalid. " +
                    "Please check the start and end times."
                );
                return;
            }

            // Apply once, then reset the offset field.
            input.value = "0";
            renderSubtitleEditor();

            const rawPane = document.getElementById("seRawPane");
            if (rawPane) {
                rawPane.textContent = buildSRT(uploadedSubtitles);
            }

            alert(
                `Sync adjustment applied: ${
                    seconds > 0 ? "+" : ""
                }${seconds} seconds`
            );
        }
    );
}


// ========================================================
// SHIFT ALL SUBTITLE TIMESTAMPS
// ========================================================

function shiftAllSubtitleTimes(seconds) {
    const offsetMilliseconds = Math.round(seconds * 1000);

    // Validate every timestamp before changing anything.
    const converted = [];

    for (const subtitle of uploadedSubtitles) {
        const parts = String(subtitle.timestamp || "")
            .split("-->")
            .map(part => part.trim());

        if (parts.length !== 2) return false;

        const start = srtTimeToMilliseconds(parts[0]);
        const end = srtTimeToMilliseconds(parts[1]);

        if (
            start === null ||
            end === null ||
            start + offsetMilliseconds < 0 ||
            end + offsetMilliseconds < 0
        ) {
            return false;
        }

        converted.push({
            start: millisecondsToSrtTime(
                start + offsetMilliseconds
            ),
            end: millisecondsToSrtTime(
                end + offsetMilliseconds
            )
        });
    }

    uploadedSubtitles.forEach((subtitle, index) => {
        subtitle.timestamp =
            `${converted[index].start} --> ${converted[index].end}`;
    });

    return true;
}


function srtTimeToMilliseconds(value) {
    const match = String(value).trim().match(
        /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/
    );

    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Number(
        match[4].padEnd(3, "0")
    );

    if (
        minutes > 59 ||
        seconds > 59
    ) {
        return null;
    }

    return (
        hours * 3600000 +
        minutes * 60000 +
        seconds * 1000 +
        milliseconds
    );
}


function millisecondsToSrtTime(value) {
    const total = Math.max(0, Math.round(value));

    const hours = Math.floor(total / 3600000);
    const minutes = Math.floor((total % 3600000) / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const milliseconds = total % 1000;

    return (
        String(hours).padStart(2, "0") + ":" +
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0") + "," +
        String(milliseconds).padStart(3, "0")
    );
}

// ========================================================
// UPLOADED SRT PROGRESS BAR
// ========================================================

function createUploadProgressUI() {
    let container = document.getElementById(
        "uploadTranslationProgress"
    );

    if (!container) {
        container = document.createElement("div");
        container.id = "uploadTranslationProgress";

        container.style.cssText = `
            display: none;
            box-sizing: border-box;
            width: 100%;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid rgba(129,102,255,.35);
            border-radius: 16px;
            background: linear-gradient(135deg,#111827,#191337);
            color: #fff;
            font-family: inherit;
        `;

        container.innerHTML = `
            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:12px;
                margin-bottom:14px;
            ">
                <strong>🇱🇰 Translating to Sinhala</strong>

                <span id="uploadTranslatePercent" style="
                    color:#38bdf8;
                    font-size:22px;
                    font-weight:700;
                ">0%</span>
            </div>

            <div style="
                width:100%;
                height:12px;
                background:#374151;
                border-radius:20px;
                overflow:hidden;
            ">
                <div id="uploadTranslateFill" style="
                    width:0%;
                    height:100%;
                    background:linear-gradient(90deg,#06b6d4,#8b5cf6);
                    border-radius:20px;
                    transition:width .3s ease;
                "></div>
            </div>

            <p id="uploadTranslateStatus" style="
                margin:12px 0 0;
                color:#cbd5e1;
                font-size:13px;
            ">Preparing translation...</p>
        `;

        // Insert above the Translation Language section.
        const settingsSection =
            document.querySelector(".settings-section");

        const languageElement =
            languageSelect?.closest(".settings-card") ||
            languageSelect?.parentElement?.parentElement?.parentElement;

        const target = settingsSection || languageElement;

        if (target?.parentElement) {
            target.parentElement.insertBefore(container, target);
        } else if (fileInput?.parentElement) {
            fileInput.parentElement.appendChild(container);
        } else {
            document.body.appendChild(container);
        }
    }

    return {
        container,
        fill: document.getElementById("uploadTranslateFill"),
        percent: document.getElementById("uploadTranslatePercent"),
        status: document.getElementById("uploadTranslateStatus")
    };
}


// ========================================================
// TRANSLATE UPLOADED SRT
// ========================================================

async function translateUploadedSubtitle() {

    if (isTranslating) {
        return;
    }


    if (
        !uploadedSubtitles ||
        !uploadedSubtitles.length
    ) {

        alert(
            "Please select an SRT file first."
        );

        return;

    }


    isTranslating = true;
    
    const uploadProgressUI = createUploadProgressUI();

uploadProgressUI.container.style.display = "block";
uploadProgressUI.fill.style.width = "0%";
uploadProgressUI.percent.textContent = "0%";
uploadProgressUI.status.textContent =
    `Preparing ${uploadedSubtitles.length} subtitles...`;


    if (translateBtn) {

        translateBtn.disabled = true;

        translateBtn.textContent =
            "Translating...";

    }


    try {

        const translated =
            await translateSubtitleChunks(
                uploadedSubtitles
            );


        const sinhalaSRT =
            buildSRT(translated);


        const filename =
            `${uploadedFileName}.Sinhala.SubLankaAI.srt`;

            uploadProgressUI.fill.style.width = "100%";
uploadProgressUI.percent.textContent = "100%";
uploadProgressUI.status.textContent =
    `Translation complete! ${translated.length} subtitles translated.`;

        downloadTextFile(
            sinhalaSRT,
            filename
        );


        alert(
            "Translation completed!\n\n" +
            filename
        );


    } catch (error) {

        uploadProgressUI.status.textContent =
    "Translation failed: " + error.message;

        console.error(
            "UPLOAD TRANSLATION ERROR:",
            error
        );

        alert(
            "Translation failed:\n\n" +
            error.message
        );

    } finally {

        isTranslating = false;


        if (translateBtn) {

            translateBtn.disabled = false;

            translateBtn.textContent =
                "Translate Subtitle";

        }

    }

}


// ========================================================
// HIDE CATEGORY RESULTS
// ========================================================

function hideCategoryResults() {

    const container =
        document.getElementById(
            "categoryResults"
        );

    if (container) {

        container.style.display =
            "none";

    }

}


// ========================================================
// SHOW CATEGORY RESULTS
// ========================================================

function showCategoryResults() {

    const container =
        document.getElementById(
            "categoryResults"
        );

    if (container) {

        container.style.display =
            "block";

    }

}


// ========================================================
// MOVIE / TV SEARCH
// ========================================================

async function searchMovies() {

    if (!searchInput) {
        return;
    }


    const query =
        searchInput.value.trim();


    if (!query) {

        if (searchStatus) {

            searchStatus.textContent =
                "Enter a movie or TV series name.";

        }

        return;

    }


    hideCategoryResults();


    if (searchBtn) {

        searchBtn.disabled = true;

        searchBtn.innerHTML = `
            <span class="search-loading">
                <span class="search-spinner"></span>
                Searching...
            </span>
        `;

    }


    if (searchStatus) {

        searchStatus.textContent =
            "Searching...";

    }


    if (searchResults) {

        searchResults.innerHTML = "";

    }


    try {

        const response =
            await fetch(
                `/api/search?query=${encodeURIComponent(
                    query
                )}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Search failed."
            );

        }


        const results =
            Array.isArray(data.results)
                ? data.results
                : [];


        if (!results.length) {

            if (searchStatus) {

                searchStatus.textContent =
                    "No movies or TV series found.";

            }

            return;

        }


        results.sort(
            function (a, b) {

                if (
                    a.type === "series" &&
                    b.type !== "series"
                ) {

                    return -1;

                }


                if (
                    a.type !== "series" &&
                    b.type === "series"
                ) {

                    return 1;

                }


                return 0;

            }
        );


        if (searchStatus) {

            searchStatus.textContent =
                `${results.length} results found`;

        }


        displaySearchResults(
            results
        );


    } catch (error) {

        console.error(
            "SEARCH ERROR:",
            error
        );


        if (searchStatus) {

            searchStatus.textContent =
                error.message ||
                "Search failed.";

        }

    } finally {

        if (searchBtn) {

            searchBtn.disabled = false;

            searchBtn.innerHTML =
                "🔍 Search";

        }

    }

}


// ========================================================
// DISPLAY SEARCH RESULTS
// ========================================================

function displaySearchResults(results) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = "";


    results
        .slice(0, 20)
        .forEach(
            function (item) {

                const card =
                    document.createElement("div");


                card.className =
                    "search-result-card";


                const poster =
                    item.poster &&
                    item.poster !== "N/A"

                        ? `
                            <img
                                class="result-poster"
                                src="${escapeAttribute(
                                    item.poster
                                )}"
                                alt=""
                            >
                          `

                        : `
                            <div
                                class="result-poster"
                                style="
                                    width:80px;
                                    height:115px;
                                    display:flex;
                                    align-items:center;
                                    justify-content:center;
                                    background:#111827;
                                    border-radius:8px;
                                    font-size:28px;
                                "
                            >
                                🎬
                            </div>
                          `;


                const typeText =
                    item.type === "series"
                        ? "📺 TV Series"
                        : "🎬 Movie";


                card.innerHTML = `

                    ${poster}

                    <div class="result-info">

                        <h3>
                            ${escapeHTML(
                                item.title
                            )}
                        </h3>

                        <div class="result-meta">

                            <span>
                                ${typeText}
                            </span>

                            <span>
                                ${escapeHTML(
                                    item.year || ""
                                )}
                            </span>

                        </div>

                        <button
                            type="button"
                            class="select-title-btn"
                        >
                            Select
                        </button>

                        <div class="sinhala-status">

                            <span class="sinhala-checking">
                                🔎 Checking Sinhala subtitle...
                            </span>

                        </div>

                    </div>

                `;


                const selectButton =
                    card.querySelector(
                        ".select-title-btn"
                    );


                if (selectButton) {

                    selectButton.addEventListener(
                        "click",
                        function () {

                            selectSearchResult(
                                item
                            );

                        }
                    );

                }


                searchResults.appendChild(
                    card
                );


                checkSinhalaSubtitles(
                    item,
                    card
                );

            }
        );

}


// ========================================================
// CHECK SINHALA SUBTITLE
// ========================================================

async function checkSinhalaSubtitles(
    item,
    card
) {

    const status =
        card?.querySelector(
            ".sinhala-status"
        );


    if (!status || !item) {
        return;
    }


    try {

        const params =
            new URLSearchParams({

                title:
                    item.title || "",

                year:
                    String(
                        item.year || ""
                    ),

                type:
                    item.type || "movie"

            });


        const response =
            await fetch(
                `/api/sinhala-search?${params.toString()}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Sinhala search failed"
            );

        }


        if (
            data.found &&
            Array.isArray(data.sources) &&
            data.sources.length
        ) {

            const links =
                data.sources
                    .filter(
                        source =>
                            source &&
                            source.url
                    )
                    .slice(0, 3)
                    .map(
                        source => `

                            <a
                                href="${escapeAttribute(
                                    source.url
                                )}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="sinhala-source-link"
                            >
                                ${escapeHTML(
                                    source.source ||
                                    "Source"
                                )}
                                ↗
                            </a>

                        `
                    )
                    .join("");


            status.innerHTML = `

                <div class="sinhala-available">

                    <strong>
                        🇱🇰 Sinhala Subtitle Available
                    </strong>

                    <div class="sinhala-source-links">
                        ${links}
                    </div>

                </div>

            `;

        } else {

            status.innerHTML = `

                <div class="sinhala-not-found">

                    ✨ Sinhala subtitle not found

                </div>

            `;

        }


    } catch (error) {

        console.warn(
            "SINHALA SEARCH ERROR:",
            error
        );


        status.innerHTML = `

            <div class="sinhala-not-found">

                ✨ Sinhala subtitle not found

            </div>

        `;

    }

}


// ========================================================
// SELECT MOVIE / TV
// ========================================================

async function selectSearchResult(item) {

    if (!item || !item.imdbID) {

        alert(
            "IMDb ID is missing."
        );

        return;

    }


    if (searchStatus) {

        searchStatus.textContent =
            `Selected: ${item.title}`;

    }


    if (item.type === "movie") {

        await searchSubtitles(
            item,
            "movie"
        );

        return;

    }


    if (item.type === "series") {

        showEpisodeSelector(
            item
        );

    }

}


// ========================================================
// TV SEASON / EPISODE
// ========================================================

function showEpisodeSelector(item) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = `

        <div class="episode-selector">

            <h2>
                ${escapeHTML(
                    item.title
                )}
            </h2>

            <p>
                Select Season and Episode
            </p>

            <div class="episode-fields">

                <div>

                    <label>
                        Season
                    </label>

                    <input
                        type="number"
                        id="seasonInput"
                        min="1"
                        value="1"
                    >

                </div>

                <div>

                    <label>
                        Episode
                    </label>

                    <input
                        type="number"
                        id="episodeInput"
                        min="1"
                        value="1"
                    >

                </div>

            </div>

            <button
                type="button"
                id="findSubtitleBtn"
                class="select-title-btn"
            >
                Find English Subtitle
            </button>

        </div>

    `;


    const button =
        document.getElementById(
            "findSubtitleBtn"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        function () {

            const season =
                Number(
                    document.getElementById(
                        "seasonInput"
                    ).value
                );


            const episode =
                Number(
                    document.getElementById(
                        "episodeInput"
                    ).value
                );


            if (
                !season ||
                season < 1 ||
                !episode ||
                episode < 1
            ) {

                if (searchStatus) {

                    searchStatus.textContent =
                        "Enter a valid season and episode.";

                }

                return;

            }


            searchSubtitles(
                item,
                "episode",
                season,
                episode
            );

        }
    );

}


// ========================================================
// SUBDL SEARCH
// ========================================================

async function searchSubtitles(
    item,
    type,
    season = null,
    episode = null
) {

    if (searchStatus) {

        searchStatus.textContent =
            "Searching English subtitles...";

    }


    if (searchResults) {

        searchResults.innerHTML = `

            <div class="translation-status">

                <div class="status-spinner"></div>

                <h3>
                    🔎 Searching SubDL...
                </h3>

                <p>
                    Looking for English subtitles
                </p>

            </div>

        `;

    }


    try {

        const params =
            new URLSearchParams();


        params.set(
            "imdb_id",
            item.imdbID
        );


        params.set(
            "type",
            type
        );


        if (type === "episode") {

            params.set(
                "season",
                String(season)
            );

            params.set(
                "episode",
                String(episode)
            );

        }


        const response =
            await fetch(
                `/api/subtitles?${params.toString()}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Subtitle search failed."
            );

        }


        const results =
            Array.isArray(data.results)
                ? data.results
                : [];


        if (!results.length) {

            if (searchStatus) {

                searchStatus.textContent =
                    "No English subtitles found.";

            }


            if (searchResults) {

                searchResults.innerHTML = `

                    <div class="translation-status">

                        ❌ No English subtitle found.

                    </div>

                `;

            }

            return;

        }


        if (searchStatus) {

            searchStatus.textContent =
                `${results.length} English subtitles found`;

        }


        // IMPORTANT:
        // Sinhala results are checked inside
        // displaySubtitleResults()

        displaySubtitleResults(
            results,
            item,
            season,
            episode
        );


    } catch (error) {

        console.error(
            "SUBTITLE SEARCH ERROR:",
            error
        );


        if (searchStatus) {

            searchStatus.textContent =
                "Subtitle search failed.";

        }


        if (searchResults) {

            searchResults.innerHTML = `

                <div
                    class="translation-status error"
                >

                    ❌ ${escapeHTML(
                        error.message
                    )}

                </div>

            `;

        }

    }

}


// ========================================================
// DISPLAY SUBTITLE RESULTS
// ========================================================
// NEW VERSION
//
// Sinhala subtitle links appear FIRST.
// English SubDL results appear BELOW.
// ========================================================

async function displaySubtitleResults(
    subtitles,
    movie,
    season = null,
    episode = null
) {

    const container =
        document.getElementById(
            "searchResults"
        );


    if (!container) {
        return;
    }


    // ====================================================
    // LOADING
    // ====================================================

    container.innerHTML = `

        <div class="subtitle-loading">

            <div class="status-spinner"></div>

            <strong>
                🔎 Checking Sinhala subtitles...
            </strong>

            <p>
                Finding Sinhala subtitle sources
            </p>

        </div>

    `;


    // ====================================================
    // CHECK SINHALA SUBTITLE
    // ====================================================

    let sinhalaHTML = "";


    try {

        const params =
            new URLSearchParams({

                title:
                    movie?.title || "",

                year:
                    String(
                        movie?.year || ""
                    ),

                type:
                    movie?.type || "movie"

            });


        const response =
            await fetch(
                `/api/sinhala-search?${params.toString()}`
            );


        const data =
            await response.json();


        if (
            response.ok &&
            data.found &&
            Array.isArray(data.sources) &&
            data.sources.length
        ) {

            const links =
                data.sources
                    .filter(
                        function (source) {

                            return (
                                source &&
                                source.url
                            );

                        }
                    )
                    .slice(0, 3)
                    .map(
                        function (source) {

                            return `

                                <a
                                    href="${escapeAttribute(
                                        source.url
                                    )}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="sinhala-first-source"
                                >

                                    ${escapeHTML(
                                        source.source ||
                                        "Source"
                                    )}

                                    <i
                                        class="fa-solid fa-arrow-up-right-from-square"
                                    ></i>

                                </a>

                            `;

                        }
                    )
                    .join("");


            sinhalaHTML = `

                <div class="sinhala-first-card">

                    <div class="sinhala-first-header">

                        <span class="sinhala-first-icon">
                            🇱🇰
                        </span>

                        <div>

                            <strong>
                                Sinhala Subtitle Available
                            </strong>

                            <small>

                                ${escapeHTML(
                                    movie?.title || ""
                                )}

                                ${
                                    movie?.year
                                        ? `
                                            (${escapeHTML(
                                                String(
                                                    movie.year
                                                )
                                            )})
                                          `
                                        : ""
                                }

                            </small>

                        </div>

                    </div>


                    <div class="sinhala-first-sources">

                        ${links}

                    </div>

                </div>

            `;

        } else {

            sinhalaHTML = `

                <div class="sinhala-first-not-found">

                    ✨ Sinhala subtitle not found

                </div>

            `;

        }


    } catch (error) {

        console.warn(
            "Selected movie Sinhala search error:",
            error
        );


        sinhalaHTML = `

            <div class="sinhala-first-not-found">

                ✨ Sinhala subtitle not found

            </div>

        `;

    }


    // ====================================================
    // ENGLISH SUBTITLE RESULTS
    // ====================================================

    let englishHTML = `

        <div class="english-subtitle-heading">

            <span>
                🇬🇧
            </span>

            <strong>
                English Subtitles
            </strong>

        </div>

    `;


    if (
        !Array.isArray(subtitles) ||
        !subtitles.length
    ) {

        englishHTML += `

            <div class="subtitle-empty">

                No English subtitles found.

            </div>

        `;

    } else {

        englishHTML +=

            subtitles
                .slice(0, 15)
                .map(
                    function (
                        subtitle,
                        index
                    ) {

                        const fileName =
                            subtitle.fileName ||
                            `English Subtitle ${
                                index + 1
                            }`;


                        const release =
                            subtitle.release ||
                            "Unknown release";


                        const fps =
                            subtitle.fps ||
                            "";


                        const hi =
                            subtitle.hearingImpaired
                                ? "🔊 Hearing Impaired"
                                : "🎬 Standard";


                        return `

                            <div
                                class="subtitle-result-card"
                            >

                                <div
                                    class="subtitle-result-info"
                                >

                                    <strong>

                                        ${escapeHTML(
                                            fileName
                                        )}

                                    </strong>


                                    <div
                                        class="subtitle-meta"
                                    >

                                        ${escapeHTML(
                                            release
                                        )}

                                        ${
                                            fps
                                                ? `
                                                    · ${escapeHTML(
                                                        String(
                                                            fps
                                                        )
                                                    )} FPS
                                                  `
                                                : ""
                                        }

                                    </div>


                                    <div
                                        class="subtitle-type"
                                    >

                                        ${hi}

                                    </div>

                                </div>


                                <button
                                    class="subtitle-select-btn"
                                    type="button"
                                    data-subtitle-index="${index}"
                                >

                                    Select

                                </button>

                            </div>

                        `;

                    }
                )
                .join("");


        // ================================================
        // ADD BUTTON EVENTS SAFELY
        // ================================================

        container.innerHTML =
            sinhalaHTML +
            englishHTML;


        const buttons =
            container.querySelectorAll(
                ".subtitle-select-btn"
            );


        buttons.forEach(
            function (
                button,
                index
            ) {

                button.addEventListener(
                    "click",
                    function () {

                        selectSubtitle(
                            subtitles[index],
                            movie,
                            season,
                            episode
                        );

                    }
                );

            }
        );


        return;

    }


    // ====================================================
    // FINAL OUTPUT
    // ====================================================

    container.innerHTML =
        sinhalaHTML +
        englishHTML;

}


// ========================================================
// DOWNLOAD ENGLISH → TRANSLATE
// ========================================================

async function selectSubtitle(
    subtitle,
    item,
    season,
    episode
) {

    const subtitleUrl =
        subtitle.downloadUrl ||
        subtitle.url ||
        subtitle.download_url;


    if (!subtitleUrl) {

        throw new Error(
            "Subtitle download URL is missing."
        );

    }


    let fullSubtitleUrl =
        subtitleUrl;


    if (
        subtitleUrl.startsWith("/")
    ) {

        fullSubtitleUrl =
            "https://dl.subdl.com" +
            subtitleUrl;

    }


    if (
        !fullSubtitleUrl.startsWith("http")
    ) {

        throw new Error(
            "Invalid subtitle URL: " +
            fullSubtitleUrl
        );

    }


    if (searchStatus) {

        searchStatus.textContent =
            "Downloading English subtitle...";

    }


    if (searchResults) {

        searchResults.innerHTML = `

            <div class="translation-status">

                <div class="status-spinner"></div>

                <h3>
                    Downloading English subtitle...
                </h3>

                <p>
                    Please wait...
                </p>

            </div>

        `;

    }


    try {

        const response =
            await fetch(
                `/api/subtitle-download?url=${encodeURIComponent(
                    fullSubtitleUrl
                )}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Subtitle download failed."
            );

        }


        if (!data.data) {

            throw new Error(
                "Downloaded subtitle is empty."
            );

        }


        const binary =
            atob(data.data);


        const bytes =
            new Uint8Array(
                binary.length
            );


        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            bytes[i] =
                binary.charCodeAt(i);

        }


        if (isZipFile(bytes)) {

            throw new Error(
                "SubDL returned a ZIP subtitle package."
            );

        }


        const englishSRT =
            decodeSubtitleBytes(bytes);


        if (!englishSRT.trim()) {

            throw new Error(
                "Subtitle file is empty."
            );

        }


        const subtitles =
            parseSRT(englishSRT);


        if (!subtitles.length) {

            throw new Error(
                "Downloaded file is not a valid SRT."
            );

        }


        if (searchStatus) {

            searchStatus.textContent =
                `${subtitles.length} subtitles downloaded. Starting translation...`;

        }


        if (searchResults) {

            searchResults.innerHTML = `

                <div class="translation-status">

                    <div class="translation-icon">
                        ✨
                    </div>

                    <h3>
                        Translating to Sinhala
                    </h3>

                    <p class="translation-subtitle">
                        AI is creating your Sinhala subtitles
                    </p>

                    <div class="translation-progress-row">

                        <div class="progress-track">

                            <div
                                id="autoTranslateProgress"
                                class="progress-fill"
                            ></div>

                        </div>

                        <span
                            id="autoTranslatePercent"
                            class="progress-percent"
                        >
                            0%
                        </span>

                    </div>

                    <div
                        id="autoTranslateCount"
                        class="translation-count"
                    >
                        0 of ${subtitles.length} subtitles
                    </div>

                    <p
                        id="autoTranslateStatus"
                        class="translation-status-text"
                    >
                        Preparing your Sinhala subtitles...
                    </p>

                </div>

            `;

        }


        const translated =
            await translateSubtitleChunks(
                subtitles
            );


        const sinhalaSRT =
            buildSRT(translated);


        const baseName =
            getSubtitleBaseName(
                item,
                season,
                episode
            );


        const filename =
            `${baseName}.Sinhala.SubLankaAI.srt`;


        downloadTextFile(
            sinhalaSRT,
            filename
        );


        if (searchStatus) {

            searchStatus.textContent =
                "✓ Sinhala subtitle completed!";

        }


        if (searchResults) {

            searchResults.innerHTML = `

                <div
                    class="translation-status success"
                >

                    <div class="translation-complete-icon">
                        ✓
                    </div>

                    <h2>
                        Translation Complete
                    </h2>

                    <p class="translation-subtitle">
                        Your Sinhala subtitle is ready
                    </p>

                    <div class="translation-count">
                        ${translated.length}
                        subtitles translated
                    </div>

                    <p class="translation-file-name">
                        ${escapeHTML(
                            filename
                        )}
                    </p>

                    <button
                        type="button"
                        id="downloadAgainBtn"
                        class="select-title-btn"
                    >
                        ⬇ Download Sinhala Subtitle
                    </button>

                </div>

            `;


            const downloadAgainBtn =
                document.getElementById(
                    "downloadAgainBtn"
                );


            if (downloadAgainBtn) {

                downloadAgainBtn.addEventListener(
                    "click",
                    function () {

                        downloadTextFile(
                            sinhalaSRT,
                            filename
                        );

                    }
                );

            }

        }


    } catch (error) {

        console.error(
            "AUTO TRANSLATION ERROR:",
            error
        );


        if (searchStatus) {

            searchStatus.textContent =
                "Translation failed.";

        }


        if (searchResults) {

            searchResults.innerHTML = `

                <div
                    class="translation-status error"
                >

                    <h3>
                        ❌ Translation failed
                    </h3>

                    <p>
                        ${escapeHTML(
                            error.message
                        )}
                    </p>

                </div>

            `;

        }

    }

}


// ========================================================
// TRANSLATE CHUNKS
// ========================================================

async function translateSubtitleChunks(
    subtitles
) {

    const CHUNK_SIZE = 20;


    const totalChunks =
        Math.ceil(
            subtitles.length /
            CHUNK_SIZE
        );


    const translated = [];


    for (
        let start = 0;
        start < subtitles.length;
        start += CHUNK_SIZE
    ) {

        const chunk =
            subtitles.slice(
                start,
                start + CHUNK_SIZE
            );


        const chunkNumber =
            Math.floor(
                start /
                CHUNK_SIZE
            ) + 1;


        updateTranslationProgress(
            chunkNumber,
            totalChunks,
            translated.length,
            subtitles.length
        );


        let success = false;

        let lastError = null;


        for (
            let attempt = 1;
            attempt <= 3;
            attempt++
        ) {

            try {

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
    language: "si",
    style: selectedTranslationStyle
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
                        "Server returned invalid JSON."
                    );

                }


                if (!response.ok) {

                    throw new Error(
                        data.error ||
                        `Chunk ${chunkNumber} failed.`
                    );

                }


                if (
                    !Array.isArray(
                        data.subtitles
                    )
                ) {

                    throw new Error(
                        "Translation API returned invalid subtitle data."
                    );

                }


                const checked =
                    validateTranslatedChunk(
                        chunk,
                        data.subtitles
                    );


                translated.push(
                    ...checked
                );


                success = true;

                break;


            } catch (error) {

                lastError =
                    error;


                console.warn(
                    `Chunk ${chunkNumber} attempt ${attempt} failed:`,
                    error
                );


                if (
                    attempt < 3
                ) {

                    const waitTime =
                        attempt === 1
                            ? 3000
                            : 7000;


                    updateTranslationStatus(
                        "Having a little trouble — retrying..."
                    );


                    await sleep(
                        waitTime
                    );

                }

            }

        }


        if (!success) {

            throw new Error(
                `Translation could not continue: ${
                    lastError?.message ||
                    "Unknown error"
                }`
            );

        }


        const completed =
            translated.length;


        updateTranslationProgress(
            chunkNumber,
            totalChunks,
            completed,
            subtitles.length
        );


        if (
            start + CHUNK_SIZE <
            subtitles.length
        ) {

            await sleep(
                1200
            );

        }

    }


    return translated;

}


// ========================================================
// VALIDATE TRANSLATED CHUNK
// ========================================================

function validateTranslatedChunk(
    original,
    translated
) {

    const translatedMap =
        new Map();


    translated.forEach(
        function (sub) {

            if (
                sub &&
                Number.isInteger(
                    Number(sub.number)
                )
            ) {

                translatedMap.set(
                    Number(sub.number),
                    sub.text
                );

            }

        }
    );


    return original.map(
        function (sub) {

            const translatedText =
                translatedMap.get(
                    sub.number
                );


            return {

                number:
                    sub.number,

                timestamp:
                    sub.timestamp,

                text:
                    typeof translatedText ===
                    "string" &&
                    translatedText.trim()
                        ? translatedText.trim()
                        : sub.text

            };

        }
    );

}


// ========================================================
// UPDATE BOTH TRANSLATION PROGRESS BARS
// ========================================================

function updateTranslationProgress(
    chunkNumber,
    totalChunks,
    completed,
    total
) {
    const percent = total > 0
        ? Math.min(100, Math.round((completed / total) * 100))
        : 0;

    // Existing movie / TV subtitle progress.
    const autoProgress =
        document.getElementById("autoTranslateProgress");

    const autoPercent =
        document.getElementById("autoTranslatePercent");

    const autoStatus =
        document.getElementById("autoTranslateStatus");

    const autoCount =
        document.getElementById("autoTranslateCount");

    if (autoProgress) {
        autoProgress.style.width = `${percent}%`;
    }

    if (autoPercent) {
        autoPercent.textContent = `${percent}%`;
    }

    if (autoStatus) {
        autoStatus.textContent =
            `Translated ${completed}/${total} subtitles — chunk ${chunkNumber}/${totalChunks}`;
    }

    if (autoCount) {
        autoCount.textContent =
            `${completed} of ${total} subtitles`;
    }

    // Uploaded SRT progress.
    const uploadProgress =
        document.getElementById("uploadTranslateFill");

    const uploadPercent =
        document.getElementById("uploadTranslatePercent");

    const uploadStatus =
        document.getElementById("uploadTranslateStatus");

    if (uploadProgress) {
        uploadProgress.style.width = `${percent}%`;
    }

    if (uploadPercent) {
        uploadPercent.textContent = `${percent}%`;
    }

    if (uploadStatus) {
        uploadStatus.textContent =
            `Translated ${completed}/${total} subtitles — chunk ${chunkNumber}/${totalChunks}`;
    }
}
// ========================================================
// TRANSLATION STATUS
// ========================================================

function updateTranslationStatus(
    message
) {

    const status =
        document.getElementById(
            "autoTranslateStatus"
        );


    if (status) {

        status.textContent =
            message;

    }

}


// ========================================================
// SRT PARSER
// ========================================================

function parseSRT(srt) {

    if (
        typeof srt !== "string"
    ) {

        return [];

    }


    const normalized =
        srt
            .replace(
                /^\uFEFF/,
                ""
            )
            .replace(
                /\r\n/g,
                "\n"
            )
            .replace(
                /\r/g,
                "\n"
            );


    const blocks =
        normalized.split(
            /\n\s*\n/
        );


    const subtitles = [];


    blocks.forEach(
        function (block) {

            const lines =
                block
                    .split("\n")
                    .map(
                        line =>
                            line.trimEnd()
                    );


            if (
                lines.length < 3
            ) {

                return;

            }


            let numberIndex = 0;


            while (
                numberIndex <
                    lines.length &&
                !lines[numberIndex].trim()
            ) {

                numberIndex++;

            }


            const number =
                parseInt(
                    lines[numberIndex],
                    10
                );


            const timestamp =
                lines[
                    numberIndex + 1
                ];


            if (
                Number.isNaN(number) ||
                !timestamp ||
                !timestamp.includes("-->")
            ) {

                return;

            }


            const text =
                lines
                    .slice(
                        numberIndex + 2
                    )
                    .join("\n")
                    .trim();


            if (!text) {
                return;
            }


            subtitles.push({

                number,

                timestamp:
                    timestamp.trim(),

                text

            });

        }
    );


    return subtitles;

}


// ========================================================
// BUILD SRT
// ========================================================

function buildSRT(subtitles) {

    return subtitles
        .map(
            function (sub) {

                return [
                    sub.number,
                    sub.timestamp,
                    sub.text,
                    ""
                ].join("\n");

            }
        )
        .join("\n");

}


// ========================================================
// DOWNLOAD FILE
// ========================================================

function downloadTextFile(
    text,
    filename
) {

    const blob =
        new Blob(
            [
                "\uFEFF",
                text
            ],
            {
                type:
                    "text/plain;charset=utf-8"
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
        filename;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    setTimeout(
        function () {

            URL.revokeObjectURL(
                url
            );

        },
        1000
    );

}


// ========================================================
// FILE NAME
// ========================================================

function getSubtitleBaseName(
    item,
    season,
    episode
) {

    const cleanTitle =
        String(
            item?.title ||
            "Subtitle"
        )
            .replace(
                /[\\/:*?"<>|]/g,
                ""
            )
            .trim();


    if (
        item?.type === "series"
    ) {

        const s =
            String(
                season
            ).padStart(
                2,
                "0"
            );


        const e =
            String(
                episode
            ).padStart(
                2,
                "0"
            );


        return `${cleanTitle}.S${s}E${e}`;

    }


    return cleanTitle;

}


// ========================================================
// DECODE SUBTITLE
// ========================================================

function decodeSubtitleBytes(bytes) {

    try {

        const text =
            new TextDecoder(
                "utf-8",
                {
                    fatal: false
                }
            ).decode(bytes);


        if (
            text.includes("-->")
        ) {

            return text;

        }

    } catch {}


    try {

        return new TextDecoder(
            "windows-1252"
        ).decode(bytes);

    } catch {

        return new TextDecoder()
            .decode(bytes);

    }

}


// ========================================================
// ZIP CHECK
// ========================================================

function isZipFile(bytes) {

    return (

        bytes.length >= 4 &&

        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04

    );

}


// ========================================================
// ESCAPE HTML
// ========================================================

function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


// ========================================================
// ESCAPE ATTRIBUTE
// ========================================================

function escapeAttribute(value) {

    return escapeHTML(value);

}


// ========================================================
// SLEEP
// ========================================================

function sleep(ms) {

    return new Promise(
        function (resolve) {

            setTimeout(
                resolve,
                ms
            );

        }
    );

}


// ========================================================
// SEARCH UI STYLES
// ========================================================

(function injectSearchUIStyles() {

    if (
        document.getElementById(
            "sublankaSearchFixes"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "sublankaSearchFixes";


    style.textContent = `

        #searchResults {

            display: flex !important;

            flex-direction: column !important;

            gap: 14px !important;

            width: 100% !important;

            max-width: 100% !important;

            overflow-x: hidden !important;

        }


        #searchResults
        .search-result-card {

            width: 100% !important;

            max-width: 100% !important;

            min-width: 0 !important;

            box-sizing: border-box !important;

            display: flex !important;

            align-items: flex-start !important;

            gap: 14px !important;

            flex: 0 0 auto !important;

            overflow: hidden !important;

        }


        #searchResults
        .search-result-card > img,

        #searchResults
        .search-result-card
        .result-poster {

            width: 82px !important;

            min-width: 82px !important;

            max-width: 82px !important;

            height: 118px !important;

            min-height: 118px !important;

            max-height: 118px !important;

            object-fit: cover !important;

            flex: 0 0 82px !important;

            border-radius: 10px !important;

        }


        #searchResults
        .result-info {

            min-width: 0 !important;

            flex: 1 1 auto !important;

            overflow: hidden !important;

        }


        .search-loading {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            gap: 9px;

        }


        .search-spinner {

            width: 17px;

            height: 17px;

            border: 3px solid
                rgba(255,255,255,.35);

            border-top-color: #fff;

            border-radius: 50%;

            animation:
                sublankaSearchSpin
                .7s linear infinite;

        }


        @keyframes sublankaSearchSpin {

            from {
                transform: rotate(0deg);
            }

            to {
                transform: rotate(360deg);
            }

        }


        .sinhala-status {

            margin-top: 10px;

            font-size: 13px;

        }


        .sinhala-available {

            padding: 9px 10px;

            border-radius: 10px;

            background:
                rgba(34,197,94,.10);

            border:
                1px solid
                rgba(34,197,94,.24);

        }


        .sinhala-available strong {

            display: block;

            margin-bottom: 7px;

        }


        .sinhala-source-links {

            display: flex;

            flex-wrap: wrap;

            gap: 6px;

        }


        .sinhala-source-link {

            display: inline-flex;

            align-items: center;

            padding: 5px 8px;

            border-radius: 7px;

            text-decoration: none;

            background:
                rgba(124,58,237,.16);

            color: #ddd;

        }


        .sinhala-not-found,
        .sinhala-checking {

            opacity: .82;

        }


        .status-spinner {

            width: 24px;

            height: 24px;

            margin: 0 auto 12px;

            border: 3px solid
                rgba(255,255,255,.2);

            border-top-color: #fff;

            border-radius: 50%;

            animation:
                sublankaSearchSpin
                .7s linear infinite;

        }


        /* ============================================
           SINHALA FIRST RESULT
        ============================================ */

        .sinhala-first-card {

            width: 100%;

            box-sizing: border-box;

            padding: 18px;

            margin-bottom: 14px;

            border-radius: 18px;

            background:
                linear-gradient(
                    145deg,
                    rgba(24,34,70,.96),
                    rgba(18,20,48,.96)
                );

            border:
                1px solid
                rgba(110,255,180,.25);

            box-shadow:
                0 15px 40px
                rgba(0,0,0,.22);

        }


        .sinhala-first-header {

            display: flex;

            align-items: center;

            gap: 13px;

            margin-bottom: 15px;

        }


        .sinhala-first-icon {

            width: 48px;

            height: 48px;

            display: flex;

            align-items: center;

            justify-content: center;

            border-radius: 14px;

            font-size: 24px;

            background:
                rgba(34,197,94,.12);

            border:
                1px solid
                rgba(34,197,94,.25);

            flex-shrink: 0;

        }


        .sinhala-first-header strong {

            display: block;

            color: #fff;

            font-size: 16px;

            margin-bottom: 4px;

        }


        .sinhala-first-header small {

            display: block;

            color:
                rgba(220,225,245,.58);

            font-size: 12px;

        }


        .sinhala-first-sources {

            display: flex;

            flex-wrap: wrap;

            gap: 8px;

        }


        .sinhala-first-source {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            gap: 7px;

            padding: 9px 12px;

            border-radius: 10px;

            text-decoration: none;

            color: #fff;

            background:
                linear-gradient(
                    135deg,
                    rgba(124,92,255,.28),
                    rgba(65,100,255,.18)
                );

            border:
                1px solid
                rgba(145,120,255,.28);

            font-size: 12px;

            font-weight: 600;

            transition:
                transform .2s ease,
                background .2s ease;

        }


        .sinhala-first-source:hover {

            transform:
                translateY(-2px);

            background:
                linear-gradient(
                    135deg,
                    rgba(124,92,255,.42),
                    rgba(65,100,255,.28)
                );

        }


        .sinhala-first-source i {

            font-size: 10px;

            opacity: .75;

        }


        .sinhala-first-not-found {

            width: 100%;

            box-sizing: border-box;

            padding: 14px 16px;

            margin-bottom: 14px;

            border-radius: 14px;

            background:
                rgba(255,255,255,.045);

            border:
                1px solid
                rgba(255,255,255,.08);

            color:
                rgba(230,230,245,.72);

            font-size: 13px;

        }


        .english-subtitle-heading {

            display: flex;

            align-items: center;

            gap: 9px;

            margin:
                8px 0 10px;

            padding:
                3px 2px;

            color: #fff;

            font-size: 16px;

        }


        .english-subtitle-heading span {

            font-size: 18px;

        }


        .subtitle-result-card {

            width: 100%;

            box-sizing: border-box;

            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 14px;

            padding: 15px;

            margin-bottom: 10px;

            border-radius: 14px;

            background:
                rgba(255,255,255,.045);

            border:
                1px solid
                rgba(255,255,255,.08);

        }


        .subtitle-result-info {

            min-width: 0;

            flex: 1;

        }


        .subtitle-result-info strong {

            display: block;

            color: #fff;

            font-size: 14px;

            line-height: 1.4;

            word-break: break-word;

        }


        .subtitle-meta {

            margin-top: 5px;

            color:
                rgba(220,225,245,.55);

            font-size: 11px;

            word-break: break-word;

        }


        .subtitle-type {

            margin-top: 5px;

            color:
                rgba(220,225,245,.5);

            font-size: 11px;

        }


        .subtitle-select-btn {

            flex-shrink: 0;

            border: none;

            padding: 9px 13px;

            border-radius: 9px;

            cursor: pointer;

            color: #fff;

            background:
                linear-gradient(
                    135deg,
                    #7357ff,
                    #8c4dff
                );

            font-size: 12px;

            font-weight: 600;

        }


        .subtitle-select-btn:hover {

            opacity: .9;

        }


        .subtitle-loading {

            width: 100%;

            box-sizing: border-box;

            padding: 28px 20px;

            text-align: center;

            border-radius: 18px;

            background:
                rgba(255,255,255,.045);

            border:
                1px solid
                rgba(255,255,255,.08);

        }


        .subtitle-loading strong {

            display: block;

            color: #fff;

            font-size: 15px;

        }


        .subtitle-loading p {

            margin:
                7px 0 0;

            color:
                rgba(220,225,245,.55);

            font-size: 12px;

        }


        .subtitle-empty {

            padding: 18px;

            text-align: center;

            border-radius: 14px;

            color:
                rgba(220,225,245,.6);

            background:
                rgba(255,255,255,.04);

        }


        .translation-status {

            width: 100% !important;

            box-sizing: border-box !important;

            padding: 28px 22px !important;

            text-align: center !important;

            border-radius: 22px !important;

            background:
                linear-gradient(
                    145deg,
                    rgba(25,30,70,.96),
                    rgba(18,20,48,.96)
                ) !important;

            border:
                1px solid
                rgba(150,110,255,.28) !important;

            box-shadow:
                0 18px 45px
                rgba(0,0,0,.25) !important;

        }


        .translation-icon {

            width: 58px;

            height: 58px;

            margin:
                0 auto 14px;

            display: flex;

            align-items: center;

            justify-content: center;

            border-radius: 18px;

            font-size: 28px;

            background:
                linear-gradient(
                    135deg,
                    rgba(125,92,255,.22),
                    rgba(185,70,255,.18)
                );

            border:
                1px solid
                rgba(155,110,255,.35);

            animation:
                translationPulse
                2s ease-in-out infinite;

        }


        .translation-status h3 {

            margin: 0;

            font-size: 22px;

            color: #fff;

        }


        .translation-subtitle {

            margin:
                8px 0 22px;

            color:
                rgba(220,220,240,.68);

            font-size: 13px;

        }


        .translation-progress-row {

            display: flex;

            align-items: center;

            gap: 12px;

            width: 100%;

        }


        .translation-progress-row
        .progress-track {

            flex: 1;

            height: 9px;

            overflow: hidden;

            border-radius: 999px;

            background:
                rgba(255,255,255,.08);

        }


        .translation-progress-row
        .progress-fill {

            width: 0%;

            height: 100%;

            border-radius: inherit;

            background:
                linear-gradient(
                    90deg,
                    #7357ff,
                    #b14cff
                );

            transition:
                width .35s ease;

        }


        .progress-percent {

            min-width: 42px;

            text-align: right;

            font-size: 13px;

            font-weight: 700;

            color: #c5a8ff;

        }


        .translation-count {

            margin-top: 14px;

            font-size: 14px;

            font-weight: 600;

            color:
                rgba(235,235,250,.82);

        }


        .translation-status-text {

            margin:
                7px 0 0;

            font-size: 12px;

            color:
                rgba(200,200,225,.55);

        }


        .translation-complete-icon {

            width: 62px;

            height: 62px;

            margin:
                0 auto 14px;

            display: flex;

            align-items: center;

            justify-content: center;

            border-radius: 50%;

            font-size: 32px;

            font-weight: 700;

            color: #fff;

            background:
                linear-gradient(
                    135deg,
                    #7c5cff,
                    #b04cff
                );

        }


        .translation-file-name {

            margin:
                10px auto 18px;

            max-width: 100%;

            font-size: 12px;

            word-break: break-word;

        }


        @keyframes translationPulse {

            0%, 100% {
                transform: scale(1);
            }

            50% {
                transform: scale(1.04);
            }

        }


        @media (max-width:600px) {

            #searchResults
            .search-result-card {

                padding: 12px !important;

                gap: 12px !important;

            }


            #searchResults
            .search-result-card > img,

            #searchResults
            .search-result-card
            .result-poster {

                width: 78px !important;

                min-width: 78px !important;

                max-width: 78px !important;

                height: 112px !important;

                min-height: 112px !important;

                max-height: 112px !important;

                flex-basis: 78px !important;

            }


            .subtitle-result-card {

                align-items: flex-start;

            }


            .subtitle-select-btn {

                padding:
                    8px 10px;

            }


            .sinhala-first-card {

                padding: 15px;

            }


            .sinhala-first-sources {

                display: grid;

                grid-template-columns: 1fr;

            }


            .sinhala-first-source {

                width: 100%;

                box-sizing: border-box;

            }


            .translation-status {

                padding:
                    24px 18px !important;

            }

        }


        @media (max-width:380px) {

            #searchResults
            .search-result-card > img,

            #searchResults
            .search-result-card
            .result-poster {

                width: 68px !important;

                min-width: 68px !important;

                max-width: 68px !important;

                height: 98px !important;

                min-height: 98px !important;

                max-height: 98px !important;

                flex-basis: 68px !important;

            }

        }

    `;


    document.head.appendChild(
        style
    );

})();


// ========================================================
// TRANSLATION SECTION SCROLL
// ========================================================

const translationSection =
    document.querySelector(
        ".settings-section"
    );


if (translationSection) {

    translationSection.style.scrollMarginTop =
        "18px";

}


// ========================================================
// INITIAL STATE
// ========================================================

if (translateBtn) {

    translateBtn.disabled =
        true;

}


// ========================================================
// CREATE CATEGORY CONTAINER
// ========================================================

function createCategoryResultsContainer() {

    if (categoryResultsContainer) {

        return categoryResultsContainer;

    }


    categoryResultsContainer =
        document.createElement("div");


    categoryResultsContainer.id =
        "categoryResults";


    categoryResultsContainer.className =
        "category-results";


    const categorySection =
        document.querySelector(
            ".category-chips"
        );


    if (categorySection) {

        categorySection.insertAdjacentElement(
            "afterend",
            categoryResultsContainer
        );

    } else if (searchResults) {

        searchResults.insertAdjacentElement(
            "beforebegin",
            categoryResultsContainer
        );

    }


    return categoryResultsContainer;

}


// ========================================================
// LOAD CATEGORY
// ========================================================

async function loadCategory(category) {

    const container =
        createCategoryResultsContainer();


    if (!container) {
        return;
    }


    container.style.display =
        "block";


    container.innerHTML = `

        <div class="category-loading">

            <div class="category-spinner"></div>

            <span>
                Loading ${getCategoryName(category)}...
            </span>

        </div>

    `;


    try {

        const response =
            await fetch(
                `/api/categories?category=${encodeURIComponent(
                    category
                )}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Category loading failed."
            );

        }


        const results =
            Array.isArray(data.results)
                ? data.results
                : [];


        if (!results.length) {

            container.innerHTML = `

                <div class="category-empty">

                    🎬

                    <p>
                        No titles found right now.
                    </p>

                </div>

            `;

            return;

        }


        renderCategoryResults(
            results.slice(0, 4),
            container
        );


    } catch (error) {

        console.error(
            "CATEGORY ERROR:",
            error
        );


        container.innerHTML = `

            <div class="category-empty category-error">

                ❌

                <p>
                    Could not load titles.
                </p>

                <button
                    type="button"
                    class="category-retry-btn"
                    onclick="loadCategory('${escapeAttribute(
                        category
                    )}')"
                >
                    Try Again
                </button>

            </div>

        `;

    }

}


// ========================================================
// CATEGORY NAME
// ========================================================

function getCategoryName(category) {

    const names = {

        trending: "Trending",
        movie: "Movies",
        tv: "TV Series",
        anime: "Anime"

    };


    return names[category] ||
        "titles";

}


// ========================================================
// RENDER CATEGORY RESULTS
// ========================================================

function renderCategoryResults(
    results,
    container
) {

    container.innerHTML = "";


    const grid =
        document.createElement("div");


    grid.className =
        "category-results-grid";


    results.forEach(
        function (item) {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "category-card";


            const poster =
                item.poster &&
                item.poster !== "N/A"

                    ? `

                        <img
                            src="${escapeAttribute(
                                item.poster
                            )}"
                            alt="${escapeAttribute(
                                item.title
                            )}"
                            loading="lazy"
                            class="category-poster"
                        >

                      `

                    : `

                        <div
                            class="
                                category-poster
                                category-poster-empty
                            "
                        >
                            🎬
                        </div>

                      `;


            card.innerHTML = `

                <div class="category-poster-wrap">

                    ${poster}

                    <span
                        class="category-type-badge"
                    >

                        ${
                            item.type === "series"
                                ? "📺 TV"
                                : "🎬 Movie"
                        }

                    </span>

                </div>


                <div class="category-card-info">

                    <h3>
                        ${escapeHTML(
                            item.title
                        )}
                    </h3>


                    <div class="category-card-meta">

                        <span>
                            ${escapeHTML(
                                item.year || ""
                            )}
                        </span>

                        <span>
                            ${
                                item.type === "series"
                                    ? "TV"
                                    : "Movie"
                            }
                        </span>

                    </div>


                    <button
                        type="button"
                        class="category-select-btn"
                    >
                        Select
                    </button>

                </div>

            `;


            const selectButton =
                card.querySelector(
                    ".category-select-btn"
                );


            if (selectButton) {

                selectButton.addEventListener(
                    "click",
                    function () {

                        selectSearchResult(
                            item
                        );

                    }
                );

            }


            grid.appendChild(
                card
            );

        }
    );


    container.appendChild(
        grid
    );

}


// ========================================================
// CATEGORY CHIP EVENTS
// ========================================================

categoryChips.forEach(
    function (chip) {

        chip.addEventListener(
            "click",
            function () {

                categoryChips.forEach(
                    function (item) {

                        item.classList.remove(
                            "active"
                        );

                    }
                );


                chip.classList.add(
                    "active"
                );


                const category =
                    chip.dataset.category ||
                    "trending";


                if (searchResults) {

                    searchResults.innerHTML =
                        "";

                }


                if (searchStatus) {

                    searchStatus.textContent =
                        "";

                }


                showCategoryResults();


                loadCategory(
                    category
                );

            }
        );

    }
);


// ========================================================
// LOAD TRENDING ON PAGE LOAD
// ========================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const categorySection =
            document.querySelector(
                ".category-chips"
            );


        if (categorySection) {

            loadCategory(
                "trending"
            );

        }

    }
);


// ========================================================
// DEBUG
// ========================================================

console.log(
    "SubLanka AI script loaded successfully."
);
