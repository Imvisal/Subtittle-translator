// ---- scroll performance: let decorative loops rest while scrolling / when the hero is off screen ----
(function () {
    var root = document.documentElement, t = 0, on = false;

    window.addEventListener("scroll", function () {
        if (!on) { on = true; root.classList.add("is-scrolling"); }
        clearTimeout(t);
        t = setTimeout(function () { on = false; root.classList.remove("is-scrolling"); }, 160);
    }, { passive: true });

    var hero = document.querySelector(".hero");
    if (hero && "IntersectionObserver" in window) {
        new IntersectionObserver(function (e) {
            root.classList.toggle("hero-off", !e[0].isIntersecting);
        }).observe(hero);
    }
})();

"use strict";

/*
========================================================
SINSUBZ — COMPLETE script.js
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
            .match(/\.(srt|ass|ssa)$/)
    ) {

        alert(
            "Please select an SRT or ASS subtitle file."
        );

        return;

    }


    uploadedFileName =
        file.name.replace(
            /\.(srt|ass|ssa)$/i,
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

        // Automatically scroll to the subtitle editor
requestAnimationFrame(() => {
    setTimeout(() => {
        const editor = document.getElementById(
            "subtitleEditorWorkspace"
        );

        if (editor) {
            editor.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    }, 300);
});


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
        workspace.className = "sinsubz-editor";

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
    if (document.getElementById("sinsubzEditorStyles")) return;

    const style = document.createElement("style");
    style.id = "sinsubzEditorStyles";

    style.textContent = `
        .sinsubz-editor {
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

        .sinsubz-editor * {
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
            .sinsubz-editor {
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
                uploadedSubtitles,
                { title: String(uploadedFileName || "").replace(/[._]+/g, " ") }
            );

        const sinhalaSRT =
            buildSRT(addSinSubzCredit(translated));

        askForComment(String(uploadedFileName || ""));


        const filename =
            `${uploadedFileName}.Sinhala.SinSubz.srt`;

            uploadProgressUI.fill.style.width = "100%";
uploadProgressUI.percent.textContent = "100%";
uploadProgressUI.status.textContent =
    `Translation complete! ${translated.length} subtitles translated.`;

        downloadTextFile(
            sinhalaSRT,
            filename
        );

        saveMyTranslation({
            title: String(uploadedFileName || "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim(), year: "", poster: "",
            type: /\bs\d{1,2}\s?e\d{1,3}\b/i.test(String(uploadedFileName || "")) ? "tv" : "movie"
        }, sinhalaSRT, filename);


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

// Bring the results / progress area into view. The poster or button that was clicked is usually
// far above it, so without this the person has to scroll down to find the subtitle list, and
// back up to see the translation progress. force=false only scrolls when it is not already visible.
function scrollToResults(force) {

    const el = document.getElementById("searchResults");

    if (!el) {
        return;
    }

    // inside the title popup the info card sits above the list: only scroll when the
    // thing we want (progress / list) is below the visible part of the popup
    const modalBody = titleModalOpen ? document.getElementById("titleModalBody") : null;

    if (modalBody) {

        requestAnimationFrame(function () {

            const box = modalBody.getBoundingClientRect();
            const top = el.getBoundingClientRect().top;

            if (top > box.bottom - 140) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
            }

        });

        return;

    }

    const reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    requestAnimationFrame(function () {

        const top = el.getBoundingClientRect().top;

        if (!force && top >= 0 && top < window.innerHeight * 0.6) {
            return;
        }

        el.scrollIntoView({
            behavior: reduce ? "auto" : "smooth",
            block: "start"
        });

    });

}


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
// IMDb RATING LABELS
// Cards carry an empty <span class="imdb-slot" data-imdb-id="tt...">.
// applyImdbRatings() asks /api/ratings once for all of them and fills in a small
// "IMDb 7.4" label. Titles without a rating keep the slot hidden, and a failed
// request changes nothing, so the cards never break because of it.
// (The Android / Windows app list "New releases" uses the same helper.)
// ========================================================

const imdbRatingCache = {};

function imdbSlot(id) {

    return /^tt\d+$/.test(String(id || ""))
        ? `<span class="imdb-slot" data-imdb-id="${id}"></span>`
        : "";

}

function fillImdbSlot(slot, info) {

    if (!info || !info.rating) {
        return;
    }

    slot.innerHTML =
        "<b>IMDb</b><em>" + escapeHTML(info.rating) + "</em>";

    slot.title =
        "IMDb rating " + info.rating + "/10" +
        (info.votes ? " (" + info.votes + " votes)" : "");

    slot.classList.add("has-rating");

}

function applyImdbRatings(root) {

    const scope = root || document;

    const slots = Array.from(
        scope.querySelectorAll(".imdb-slot[data-imdb-id]:not(.has-rating)")
    );

    if (!slots.length) {
        return;
    }

    const need = [];

    slots.forEach(function (slot) {
        const id = slot.dataset.imdbId;
        if (!(id in imdbRatingCache) && need.indexOf(id) === -1) {
            need.push(id);
        }
    });

    function paint() {
        slots.forEach(function (slot) {
            fillImdbSlot(slot, imdbRatingCache[slot.dataset.imdbId]);
        });
    }

    if (!need.length) {
        paint();
        return;
    }

    const chunks = [];

    for (let i = 0; i < need.length; i += 20) {
        chunks.push(need.slice(i, i + 20));
    }

    Promise.all(
        chunks.map(function (ids) {
            return fetch("/api/ratings?ids=" + ids.join(","))
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (!data || !data.ratings) { return; }
                    const unknown = data.unknown || [];
                    ids.forEach(function (id) {
                        // "unknown" = could not be checked right now: ask again next time
                        if (unknown.indexOf(id) === -1) {
                            imdbRatingCache[id] = data.ratings[id] || null;
                        }
                    });
                })
                .catch(function () { /* offline: no labels, nothing else changes */ });
        })
    ).then(paint);

}

window.applyImdbRatings = applyImdbRatings;


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

                            ${imdbSlot(item.imdbID)}

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

    applyImdbRatings(searchResults);

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
// TITLE POPUP (website only): blurred page, big panel with
// details + trailer + the subtitle list / translate progress
// ========================================================

let titleModalOpen = false;
const titleModalHome = [];

function openTitleModal() {

    const modal = document.getElementById("titleModal");
    const body = document.getElementById("titleModalBody");
    const info = document.getElementById("titleInfo");
    const results = document.getElementById("searchResults");

    if (!modal || !body || !info || !results) {
        return false;
    }

    if (!titleModalOpen) {

        // remember where the two blocks live so they can go back on close
        [info, results].forEach(function (node) {
            const mark = document.createComment("tm-home");
            node.parentNode.insertBefore(mark, node);
            titleModalHome.push({ node: node, mark: mark });
            body.appendChild(node);
        });

        modal.hidden = false;
        document.documentElement.classList.add("tm-open");
        titleModalOpen = true;

        const panel = modal.querySelector(".tm-panel");
        if (panel) panel.scrollTop = 0;
        body.scrollTop = 0;

    }

    return true;

}

// keepResults = true: translating started, so the popup closes and the progress is shown in the normal page place
function closeTitleModal(keepResults) {

    if (!titleModalOpen) {
        return;
    }

    const modal = document.getElementById("titleModal");

    // stop a playing trailer
    const info = document.getElementById("titleInfo");
    if (info) {
        info.innerHTML = "";
        info.hidden = true;
    }
    titleInfoToken++;

    titleModalHome.splice(0).forEach(function (h) {
        if (h.mark.parentNode) {
            h.mark.parentNode.insertBefore(h.node, h.mark);
            h.mark.remove();
        }
    });

    if (!keepResults) {
        const results = document.getElementById("searchResults");
        if (results) results.innerHTML = "";

        if (searchStatus) searchStatus.textContent = "";
    }

    if (modal) modal.hidden = true;

    document.documentElement.classList.remove("tm-open");
    titleModalOpen = false;

    if (!keepResults) { showCategoryResults(); }

}

document.addEventListener("click", function (event) {

    const t = event.target;

    if (!titleModalOpen || !t || !t.closest) {
        return;
    }

    if (t.closest(".tm-close") || t.classList.contains("tm-back")) {
        closeTitleModal();
    }

});

document.addEventListener("keydown", function (event) {

    if (event.key === "Escape" && titleModalOpen) {
        closeTitleModal();
    }

});


// ========================================================
// TITLE INFO CARD (short, spoiler-light overview + trailer)
// ========================================================

let titleInfoToken = 0;

async function showTitleInfo(item) {

    const box = document.getElementById("titleInfo");

    if (!box || !item || !item.imdbID) {
        return;
    }

    const token = ++titleInfoToken;

    box.hidden = true;
    box.innerHTML = "";

    try {

        const response = await fetch(
            "/api/ratings?info=1&id=" + encodeURIComponent(item.imdbID) +
            "&type=" + encodeURIComponent(item.type === "series" ? "series" : "movie")
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const info = data && data.info;

        // the visitor picked something else while we were loading
        if (token !== titleInfoToken || !info || (!info.overview && !info.trailer)) {
            return;
        }

        const facts = [];

        if (info.year) facts.push(escapeHTML(info.year));
        if (info.runtime) facts.push(info.runtime + " min");
        if (info.seasons) facts.push(info.seasons + (info.seasons > 1 ? " seasons" : " season"));
        if (info.genres && info.genres.length) facts.push(escapeHTML(info.genres.join(" · ")));
        if (info.rating) facts.push("★ " + info.rating);

        const posterUrl =
            item.poster && item.poster !== "N/A" ? item.poster : "";

        box.innerHTML =
            '<div class="ti-card' + (info.trailer ? ' has-trailer' : '') + (posterUrl ? ' has-poster' : '') + '">' +
                (posterUrl ? '<img class="ti-poster" src="' + escapeHTML(posterUrl) + '" alt="">' : '') +
                '<div class="ti-text">' +
                    '<div class="ti-head">' +
                        '<h3>' + escapeHTML(info.title || item.title) + '</h3>' +
                        (facts.length ? '<div class="ti-facts">' + facts.join('<span>\u2022</span>') + '</div>' : '') +
                    '</div>' +
                    (info.tagline ? '<p class="ti-tagline">\u201c' + escapeHTML(info.tagline) + '\u201d</p>' : '') +
                    (info.overview ? '<p class="ti-overview">' + escapeHTML(info.overview) + '</p>' : '') +
                '</div>' +
                (info.trailer
                    ? '<div class="ti-trailer" data-yt="' + escapeHTML(info.trailer) + '">' +
                        '<button type="button" class="ti-play" aria-label="Play trailer">' +
                            '<img src="https://img.youtube.com/vi/' + escapeHTML(info.trailer) + '/mqdefault.jpg" alt="" loading="lazy">' +
                            '<span class="ti-play-icon">\u25B6</span>' +
                            '<span class="ti-play-label">Watch trailer</span>' +
                        '</button>' +
                      '</div>'
                    : '') +
            '</div>';

        const trailer = box.querySelector(".ti-trailer");

        if (trailer) {

            trailer.querySelector(".ti-play").addEventListener("click", function () {

                trailer.innerHTML =
                    '<iframe src="https://www.youtube-nocookie.com/embed/' +
                    encodeURIComponent(trailer.dataset.yt) +
                    '?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';

            });

        }

        box.hidden = false;

        if (!titleModalOpen) {
            // card first, the subtitle list follows right under it
            box.scrollIntoView({ behavior: "smooth", block: "start" });
        }

    } catch (error) {

        // info is only a bonus, never block the subtitles because of it

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


    openTitleModal();

    showTitleInfo(item);


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

    scrollToResults(true);


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

        scrollToResults(true);

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

    scrollToResults(false);

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


    // the translation itself is shown on the page, not inside the title popup
    closeTitleModal(true);

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

        scrollToResults(true);

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

            // the picked film / episode poster replaces the animated icon (no poster -> the icon)
            var trPoster = item && /^https?:\/\//i.test(String(item.poster || "")) ? String(item.poster) : "";
            var trName = (item && item.title) ? String(item.title) : "";
            var trSub = (item && item.year ? String(item.year) : "") + (season ? (item && item.year ? " · " : "") + "S" + String(season).padStart(2, "0") + (episode ? "E" + String(episode).padStart(2, "0") : "") : "");
            var trTitleHtml = trName ? '<div class="tr-title">' + escapeHTML(trName) + (trSub ? '<span>' + escapeHTML(trSub) + '</span>' : '') + '</div>' : "";
            const trPosterHtml = trPoster
                ? '<div class="tr-poster" aria-hidden="true"><img src="' + escapeAttribute(trPoster) + '" alt="" referrerpolicy="no-referrer" onerror="this.closest(\'.tr-poster\').classList.add(\'tr-poster-fail\')"><span class="tr-shine"></span></div>'
                : "";

            searchResults.innerHTML = `

                <div class="translation-status">

                    ${trPosterHtml}
                    <div class="translation-icon tr-orb" aria-hidden="true"${trPoster ? ' hidden' : ''}>
                        <span class="tr-ring"></span>
                        <svg class="tr-svg" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="5" y="10" width="30" height="21" rx="6"></rect>
                            <path class="tr-l tr-l1" d="M11 17h18"></path>
                            <path class="tr-l tr-l2" d="M11 23.5h11"></path>
                            <path class="tr-spark tr-s1" d="M33 2.5l1.1 2.7 2.7 1.1-2.7 1.1L33 10l-1.1-2.6-2.7-1.1 2.7-1.1z" fill="currentColor" stroke="none"></path>
                            <path class="tr-spark tr-s2" d="M6 32.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor" stroke="none"></path>
                        </svg>
                    </div>

                    ${trTitleHtml}

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
                        class="translation-count tc"
                    >
                        <b class="tc-num" id="autoTranslateNum">0</b><span class="tc-of"> / ${subtitles.length} subtitles</span>
                    </div>

                    <p
                        id="autoTranslateStatus"
                        class="translation-status-text"
                    >
                        Preparing your Sinhala subtitles...
                    </p>

                </div>

            `;

            scrollToResults(true);

        }


        const translated =
            await translateWithLibrary(
                subtitles,
                item,
                season,
                episode,
                { title: (item && item.title) ? item.title + (item.year ? " (" + item.year + ")" : "") : "",
                  job: ((item && item.title) ? item.title : "") + (season ? " S" + String(season).padStart(2, "0") + (episode ? "E" + String(episode).padStart(2, "0") : "") : "") }
            );


        const sinhalaSRT =
            buildSRT(addSinSubzCredit(translated));

        askForComment((item && item.title) ? item.title + (item.year ? " (" + item.year + ")" : "") : "");


        const baseName =
            getSubtitleBaseName(
                item,
                season,
                episode
            );


        const releaseTag = getReleaseTag(subtitle);

        const filename =
            `${baseName}${releaseTag ? "." + releaseTag : ""}.Sinhala.SinSubz.srt`;


        downloadTextFile(
            sinhalaSRT,
            filename
        );

        saveMyTranslation({
            title: (item && item.title ? item.title : baseName) + (season ? " S" + String(season).padStart(2, "0") + (episode ? "E" + String(episode).padStart(2, "0") : "") : ""),
            year: item && item.year, poster: item && item.poster, type: season ? "tv" : "movie"
        }, sinhalaSRT, filename);


        if (searchStatus) {

            searchStatus.textContent =
                "✓ Sinhala subtitle completed!";

        }


        if (searchResults) {

            searchResults.innerHTML = `

                <div
                    class="translation-status success"
                >

                    ${trPoster
                        ? '<div class="tr-poster tr-done" aria-hidden="true"><img src="' + escapeAttribute(trPoster) + '" alt="" referrerpolicy="no-referrer" onerror="this.closest(\'.tr-poster\').classList.add(\'tr-poster-fail\')"><span class="tr-check">✓</span></div>'
                        : ''}
                    <div class="translation-complete-icon"${trPoster ? ' hidden' : ''}>
                        ✓
                    </div>

                    ${trTitleHtml}

                    <h2>
                        Translation Complete
                    </h2>

                    <p class="translation-subtitle">
                        Your Sinhala subtitle is ready
                    </p>

                    <div class="tr-chips">
                        <span class="tr-chip">${translated.length} subtitles</span>
                        <span class="tr-chip">🇱🇰 Sinhala</span>
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

// Premium offer right after a translation (also when a saved Sinhala subtitle was reused). One popup per finish.
let premiumOfferTimer = null;
function offerPremiumSoon() {
    if (/Electron/i.test(navigator.userAgent || "") || !window.__sinsubzPremiumInfo) { return; }
    clearTimeout(premiumOfferTimer);
    premiumOfferTimer = setTimeout(function () { window.__sinsubzPremiumInfo("done"); }, 400);
}

// Keeps a copy of the finished Sinhala subtitle in the signed-in user's account ("My translations").
// Free users see it as a poster card; downloading it again is a Premium feature. Never blocks or breaks translating.
async function saveMyTranslation(info, srt, filename) {
    try {
        if (/Electron/i.test(navigator.userAgent || "") || !window.__sinsubzIdToken) { return; }
        const tk = await window.__sinsubzIdToken();
        if (!tk) { return; }
        await fetch("/api/stats?mytr=save", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
            body: JSON.stringify({
                title: info.title || "", year: info.year || "", type: info.type || "movie",
                poster: info.poster && info.poster !== "N/A" ? info.poster : "", srt: srt, filename: filename
            })
        });
    } catch (e) { /* optional */ }
}

// Wrapper: lets the Android / desktop apps show notifications
// (window.__appNotify is only defined by app-shim.js / desktop-shim.js).
async function translateSubtitleChunks(
    subtitles,
    meta
) {

    const notify = window.__appNotify;

    if (notify && typeof notify.start === "function") {
        try { notify.start(); } catch (e) { /* ignore */ }
    }

    try {

        const result =
            await translateSubtitleChunksImpl(subtitles, meta);

        if (notify) {
            try { notify.done(result.length); } catch (e) { /* ignore */ }
        }

        // free signed-in users get a short Premium offer once their subtitles are ready (not the Windows app)
        offerPremiumSoon();

        return result;

    } catch (error) {

        if (notify) {
            try { notify.failed(error && error.message); } catch (e) { /* ignore */ }
        }

        throw error;

    }

}


// ========================================================
// SAVED TRANSLATIONS (library.js + retime.js + api/_library.js)
// A finished translation is saved with the English file it came from. When somebody picks ANOTHER
// release of the same film / episode (BluRay, WEB-DL ...), the saved Sinhala lines are lined up with
// the new English file by text and put on its own timing: no new AI translation. Lines that did not
// match (at most 5%) are translated by the AI. Less than 95% matched -> a normal full AI translation.
// ========================================================

async function translateWithLibrary(subtitles, item, season, episode, meta) {

    const lib = window.SinSubzLibrary;
    const retimer = window.SinSubzRetime;

    if (!lib || !retimer) {
        return translateSubtitleChunks(subtitles, meta);
    }

    // the same clean-up the translator does first, so the saved English lines are what the AI saw
    const english = dropBracketCues(subtitles);

    let key = "";
    let hash = "";

    try {
        key = lib.titleKey(item, season, episode, selectedTranslationStyle);
        hash = lib.hashCues(english);
    } catch (e) {
        key = "";
    }

    if (key) {
        try {
            const reused = await reuseSavedTranslation(lib, retimer, key, hash, english, meta);
            if (reused) { offerPremiumSoon(); return reused; }
        } catch (error) {
            console.warn("Saved translation not used:", error);
        }
    }

    const translated = await translateSubtitleChunks(subtitles, meta);

    if (key) {
        try {
            lib.save(key, hash, lib.buildPairs(english, translated), english.length);
        } catch (e) { /* saving is optional */ }
    }

    return translated;
}


async function reuseSavedTranslation(lib, retimer, key, hash, english, meta) {

    updateTranslationStatus("Looking for a saved Sinhala subtitle...");

    const entries = await lib.lookup(key, hash);

    if (!entries.length) { return null; }

    const newCues = english.map(function (cue) {
        const t = lib.cueTimes(cue.timestamp);
        return { s: t.s, e: t.e, text: cue.text };
    });

    let best = null;

    for (const entry of entries) {
        const result = retimer.retime(entry.pairs, newCues);
        if (!best || result.score > best.score) { best = result; }
    }

    if (!best || !best.ok) {
        console.info("Saved translation not used:", best ? best.reason : "no match");
        return null;
    }

    updateTranslationStatus("Found a saved Sinhala subtitle. Matching it to this release...");

    // the few lines that did not match go to the AI
    const aiText = new Map();

    if (best.missing.length) {

        const missingCues = best.missing.map(function (pos, n) {
            return { ...english[best.items[pos].index], number: n + 1 };
        });

        const done = await translateSubtitleChunks(missingCues, meta);

        done.forEach(function (cue) {
            aiText.set(lib.startKey(cue.timestamp), cue.text);
        });
    }

    const out = [];

    best.items.forEach(function (item) {

        const source = english[item.index];
        const text = String(item.si !== null ? item.si : (aiText.get(lib.startKey(source.timestamp)) || "")).trim();

        if (text) {
            out.push({ ...source, number: out.length + 1, text: text });
        }
    });

    // something went wrong with the lines: do not hand out a half-empty file
    if (out.length < Math.floor(english.length * 0.8)) { return null; }

    updateTranslationProgress(1, 1, english.length, english.length);

    return polishReadability(out);
}


// [ ... ] parts are sound / music descriptions ([DOOR SLAMS], [ඇතින් කුරුල්ලෝ කෑගහනවා]).
// They are removed before translating (saves quota) and again from the result; a cue that has
// nothing left is dropped. If that would remove every cue, the file is left alone.
// "SARA: Hello" / "හෝස්ට්: ..." -> speaker name before a colon is removed (max 3 words, no digits)
function stripSpeakerLabel(line) {
    const m = String(line).match(/^((?:<[^>]+>\s*)*(?:[-\u2013\u2014]\s*)?(?:<[^>]+>\s*)*)([^\s:<>\d][^:<>\d]{0,23}):(?=\s|$)\s*/);
    if (!m) return line;
    const label = m[2].trim();
    if (!label || label.split(/\s+/).length > 3 || /[.!?,]/.test(label)) return line;
    return m[1] + String(line).slice(m[0].length);
}

function stripBracketParts(text) {

    // [ ... ] and ( ... ) parts are removed
    let t = String(text || "").replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, "");

    let lines = t.split("\n")
        .map(l => stripSpeakerLabel(l))
        .map(l => l.replace(/<(\w+)[^>]*>\s*<\/\1>/g, "").replace(/[ \t]+/g, " ").trim())
        .filter(l => l && !/^(?:<[^>]+>\s*)*[-\u2013\u2014]?\s*(?:<\/[^>]+>\s*)*$/.test(l));

    // "- [door slams]\n- Hello" leaves one speaker: the dash is no longer needed
    if (lines.length === 1) {
        lines = [lines[0].replace(/^((?:<[^>]+>)*)[-\u2013\u2014]\s+/, "$1")];
    }

    return lines.join("\n");
}

function dropBracketCues(subs) {

    const out = [];

    for (const sub of subs || []) {

        const hadBrackets = /[\[(]/.test(String((sub && sub.text) || "")) || stripSpeakerLabel(String((sub && sub.text) || "").split("\n")[0]) !== String((sub && sub.text) || "").split("\n")[0] || /\n.*:(\s|$)/.test(String((sub && sub.text) || ""));

        if (!hadBrackets) { out.push(sub); continue; }

        const text = stripBracketParts(sub.text);

        if (text) { out.push({ ...sub, text }); }
    }

    return out.length ? out.map((s, i) => ({ ...s, number: i + 1 })) : (subs || []);
}


// Popup shown when someone presses Translate without being signed in. Resolves when the box closes
// (after a successful sign-in, or when the person cancels).
function askToSignIn(getTok) {
    return new Promise(function (resolve) {
        const old = document.getElementById("signInAsk");
        if (old) old.remove();

        const wrap = document.createElement("div");
        wrap.id = "signInAsk";
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-modal", "true");
        wrap.style.cssText = "position:fixed;inset:0;z-index:99997;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,6,18,.72);backdrop-filter:blur(4px)";
        wrap.innerHTML =
            '<div style="max-width:380px;width:100%;background:#14172b;color:#eceaff;border:1px solid #2c3050;border-radius:20px;padding:24px;text-align:center;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
            '<div style="font-size:19px;font-weight:800;margin-bottom:8px">Sign in to translate</div>' +
            '<div style="font-size:14.5px;line-height:1.55;opacity:.85">Translating needs a free Google account. Each account can translate <b>2 films and 5 TV episodes per day</b>.</div>' +
            '<div id="signInAskMsg" style="min-height:20px;margin-top:8px;font-size:13px;color:#ff9a9a"></div>' +
            '<button id="signInAskGo" type="button" style="margin-top:10px;width:100%;padding:13px;border:0;border-radius:14px;background:#fff;color:#1f1f1f;font-size:16px;font-weight:700;cursor:pointer">Sign in with Google</button>' +
            '<button id="signInAskNo" type="button" style="margin-top:8px;background:none;border:0;color:inherit;opacity:.65;font-size:14px;text-decoration:underline;cursor:pointer">Not now</button>' +
            '</div>';
        document.body.appendChild(wrap);

        const done = function () { wrap.remove(); resolve(); };
        wrap.querySelector("#signInAskNo").addEventListener("click", done);
        wrap.addEventListener("click", function (e) { if (e.target === wrap) done(); });

        const go = wrap.querySelector("#signInAskGo");
        go.addEventListener("click", async function () {
            go.disabled = true;
            try { if (window.__sinsubzSignIn) await window.__sinsubzSignIn(); } catch (e) { /* ignore */ }
            if (await getTok()) { done(); return; }
            go.disabled = false;
            wrap.querySelector("#signInAskMsg").textContent = "Sign-in did not finish. Allow pop-ups for this site and try again.";
        });
    });
}

// a random id kept on this browser / app: the daily limit also counts per device (account switching does not reset it)
function getDeviceId() {
    let id = "";
    try { id = localStorage.getItem("sinsubz-device") || ""; } catch (e) { /* ignore */ }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
        const a = new Uint8Array(18);
        (window.crypto || window.msCrypto).getRandomValues(a);
        id = Array.from(a, function (b) { return b.toString(36).padStart(2, "0"); }).join("").slice(0, 32);
        try { localStorage.setItem("sinsubz-device", id); } catch (e) { /* ignore */ }
    }
    return id;
}

async function translateSubtitleChunksImpl(
    subtitles,
    meta
) {

    subtitles = dropBracketCues(subtitles);

    // translating needs a Google account (website + Android app; the Windows app has no sign-in yet).
    // Nothing opens by itself: a message explains it and the person presses the button.
    if (!/Electron/i.test(navigator.userAgent || "")) {
        const getTok = async () => {
            try { return window.__sinsubzIdToken ? await window.__sinsubzIdToken() : ""; } catch (e) { return ""; }
        };
        if (!(await getTok())) {
            await askToSignIn(getTok);
            if (!(await getTok())) {
                throw new Error("Please sign in with Google to translate.");
            }
        }
    }

    const CHUNK_SIZE = 40;

    // How many chunks are translated at the same time.
    // The server spreads them over all Gemini keys.
    const CONCURRENCY = 4;

    const totalChunks =
        Math.ceil(subtitles.length / CHUNK_SIZE);

    const results = new Array(totalChunks);

    let nextChunk = 0;
    let completed = 0;
    let failure = null;

    // ---- resume: finished chunks are kept in memory, so pressing Translate again after a failure
    // continues from where it stopped instead of starting over (cleared when the whole file is done) ----
    const resumeKey = (function () {
        let h = 0;
        const txt = subtitles.map(function (c) { return typeof c === "string" ? c : String((c && (c.text || c.original || c.line)) || ""); });
        for (let i = 0; i < txt.length; i++) { const t = txt[i]; for (let j = 0; j < t.length; j += 3) { h = (h * 31 + t.charCodeAt(j)) | 0; } }
        return subtitles.length + ":" + h + ":" + txt[0] + "|" + txt[txt.length - 1];
    })();
    window.__sinsubzResume = window.__sinsubzResume || { key: "", parts: {} };
    if (window.__sinsubzResume.key !== resumeKey) { window.__sinsubzResume = { key: resumeKey, parts: {} }; }
    const resumed = window.__sinsubzResume.parts;
    Object.keys(resumed).forEach(function (i) {
        const idx = Number(i);
        if (idx < totalChunks && Array.isArray(resumed[i])) { results[idx] = resumed[i]; completed += resumed[i].length; }
    });


    // Translates ONE chunk (with up to 3 attempts) and returns the checked result.
    async function translateOneChunk(chunk, chunkNumber, chunkStart) {

        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {

            try {

                const authHeaders = { "Content-Type": "application/json" };
                try { authHeaders["x-sinsubz-device"] = getDeviceId(); } catch (e) { /* ignore */ }
                try {
                    const tk = window.__sinsubzIdToken ? await window.__sinsubzIdToken() : "";
                    if (tk) { authHeaders.Authorization = "Bearer " + tk; }
                } catch (e) { /* server decides */ }

                const response = await fetch(
                    "/api/translate",
                    {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({
                            subtitles: chunk,
                            language: "si",
                            style: selectedTranslationStyle,
                            title: (meta && meta.title) || "",
                            job: String((meta && (meta.job || meta.title)) || uploadedFileName || ""),
                            chunk: chunkNumber, chunks: totalChunks,
                            context: getChunkContext(subtitles, chunkStart, chunk.length)
                        })
                    }
                );

                const raw = await response.text();

                let data;

                try {
                    data = JSON.parse(raw);
                } catch {
                    throw new Error("Server returned invalid JSON.");
                }

                if (!response.ok) {

                    const apiError = new Error(
                        data.error || `Chunk ${chunkNumber} failed.`
                    );

                    // daily limit reached on every key/model: retrying will not help
                    if (data.code === "QUOTA_EXHAUSTED" || data.code === "DAILY_LIMIT" || data.code === "PREMIUM_PRIORITY" || data.code === "LOGIN_REQUIRED" || data.code === "RUNNER_RESERVE") {
                        apiError.quotaExhausted = true;
                    }
                    if (data.code === "RATE_LIMITED") apiError.rateLimited = true;
                    if ((data.code === "DAILY_LIMIT" || data.code === "PREMIUM_PRIORITY") && window.__sinsubzPremiumInfo) {
                        setTimeout(function () { window.__sinsubzPremiumInfo("limit"); }, 600);
                    }

                    throw apiError;
                }

                if (!Array.isArray(data.subtitles)) {
                    throw new Error(
                        "Translation API returned invalid subtitle data."
                    );
                }

                return validateTranslatedChunk(chunk, data.subtitles);

            } catch (error) {

                lastError = error;

                console.warn(
                    `Chunk ${chunkNumber} attempt ${attempt} failed:`,
                    error
                );

                if (error && error.quotaExhausted) {
                    break;
                }

                // another chunk already failed for good: stop wasting calls
                if (failure) {
                    break;
                }

                if (attempt < 3) {

                    updateTranslationStatus(
                        "Having a little trouble — retrying..."
                    );

                    await sleep(error && error.rateLimited ? (attempt === 1 ? 20000 : 35000) : (attempt === 1 ? 3000 : 7000));
                }
            }
        }

        throw new Error(
            `Translation could not continue: ${
                lastError?.message || "Unknown error"
            }`
        );
    }


    // ---- a chunk can be running twice at the very end ("hedging") ----
    // The last few chunks run alone, so ONE slow answer (busy Gemini key, broken JSON, a retry) makes the
    // bar sit at 97% for a long time. When nothing new is left to start and a chunk has been running
    // longer than HEDGE_AFTER_MS, the idle worker sends the same chunk again; whichever answer comes first
    // is used and the other one is ignored.
    const HEDGE_AFTER_MS = 25000;
    const runs = new Map();           // chunk index -> { startedAt, launches, failures, settled, hedged, launch }

    function runChunk(index) {

        const start = index * CHUNK_SIZE;
        const chunk = subtitles.slice(start, start + CHUNK_SIZE);

        return new Promise(function (resolve, reject) {

            const r = { startedAt: Date.now(), launches: 0, failures: 0, settled: false, hedged: false };

            r.launch = function () {
                r.launches++;
                translateOneChunk(chunk, index + 1, start).then(function (value) {
                    if (!r.settled) { r.settled = true; resolve(value); }
                }).catch(function (error) {
                    r.failures++;
                    if (!r.settled && r.failures >= r.launches) { r.settled = true; reject(error); }
                });
            };

            runs.set(index, r);
            r.launch();

        });
    }

    let watching = false;

    async function watchTail() {

        if (watching) { return; }
        watching = true;

        while (!failure) {

            const open = Array.from(runs.values()).filter(function (r) { return !r.settled; });
            if (!open.length) { return; }

            await sleep(2000);

            const now = Date.now();
            const slow = open.filter(function (r) { return !r.settled && !r.hedged && now - r.startedAt > HEDGE_AFTER_MS; });
            slow.slice(0, 2).forEach(function (r) { r.hedged = true; r.launch(); });

        }
    }


    // Each worker keeps taking the next untranslated chunk.
    async function worker(workerIndex) {

        // small stagger so the first requests do not all hit at the same instant
        await sleep(workerIndex * 400);

        while (!failure) {

            const index = nextChunk++;

            if (index >= totalChunks) {
                watchTail();           // idle: help the last chunks along (only one watcher runs)
                return;
            }

            if (results[index]) { continue; }     // already translated in an earlier try

            const start = index * CHUNK_SIZE;
            const chunk = subtitles.slice(start, start + CHUNK_SIZE);

            try {

                results[index] = await runChunk(index);
                window.__sinsubzResume.parts[index] = results[index];

                completed += chunk.length;

                updateTranslationProgress(
                    index + 1,
                    totalChunks,
                    completed,
                    subtitles.length
                );

            } catch (error) {

                failure = failure || error;

                return;
            }
        }
    }


    updateTranslationProgress(
        1,
        totalChunks,
        completed,
        subtitles.length
    );

    await Promise.all(
        Array.from(
            { length: Math.min(CONCURRENCY, totalChunks) },
            (_, workerIndex) => worker(workerIndex)
        )
    );

    if (failure) {
        throw failure;
    }

    window.__sinsubzResume = { key: "", parts: {} };     // finished: nothing to resume

    // results[] is indexed by chunk, so the order is always the original order
    // (and results.flat() lines up cue for cue with `subtitles`)
    const cleaned =
        cleanTranslatedCues(
            results.flat(),
            subtitles,
            CHUNK_SIZE
        );

    return dropBracketCues(polishReadability(cleaned));

}


// ========================================================
// CONTEXT FOR EACH CHUNK
// Neighbouring ORIGINAL lines (not translated, only read) so the model
// keeps the same pronouns / names across chunk borders.
// ========================================================

function getChunkContext(all, start, length) {

    const text = sub => String((sub && sub.text) || "").slice(0, 300);

    return {
        before: all.slice(Math.max(0, start - 4), start).map(text),
        after: all.slice(start + length, start + length + 3).map(text)
    };

}


// ========================================================
// READABILITY POLISH (no AI, no quota)
//  1. long single-line cues are split into 2 balanced lines
//  2. cues that are too fast get a little more screen time,
//     only into the free gap before the next cue
// ========================================================

function polishReadability(subs) {

    const MAX_LINE = 42;
    const TARGET_CPS = 17;
    const MAX_EXTRA_SECONDS = 3;
    const GAP = 0.08;

    const parse = ts => {
        const m = String(ts || "").match(
            /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/
        );
        if (!m) return null;
        const t = (h, mi, se, ms) =>
            (+h) * 3600 + (+mi) * 60 + (+se) + (+ms.padEnd(3, "0")) / 1000;
        return {
            start: t(m[1], m[2], m[3], m[4]),
            end: t(m[5], m[6], m[7], m[8])
        };
    };

    const fmt = sec => {
        const ms = Math.round(sec * 1000);
        const h = Math.floor(ms / 3600000);
        const mi = Math.floor((ms % 3600000) / 60000);
        const se = Math.floor((ms % 60000) / 1000);
        const r = ms % 1000;
        const p = (n, w) => String(n).padStart(w, "0");
        return `${p(h, 2)}:${p(mi, 2)}:${p(se, 2)},${p(r, 3)}`;
    };

    const plain = t => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    const polished = subs.map((sub, i) => {

        let text = String(sub.text || "");
        let timestamp = sub.timestamp;

        // 1. split a long one-line cue at the space closest to the middle
        if (!text.includes("\n") && plain(text).length > MAX_LINE) {

            const mid = Math.floor(text.length / 2);
            let best = -1;

            for (let k = 0; k < text.length; k++) {
                if (text[k] === " " && !/^<\/?[a-z]/i.test(text.slice(k + 1)) &&
                    (best === -1 || Math.abs(k - mid) < Math.abs(best - mid))) {
                    best = k;
                }
            }

            if (best > 8 && best < text.length - 8) {
                text = text.slice(0, best).trim() + "\n" + text.slice(best + 1).trim();
            }
        }

        // 2. give fast cues more time (never into the next cue)
        const t = parse(timestamp);

        if (t) {

            const next = subs[i + 1] ? parse(subs[i + 1].timestamp) : null;
            const chars = plain(text).replace(/\n/g, "").length;
            const duration = t.end - t.start;

            if (duration > 0 && chars / duration > TARGET_CPS) {

                const wanted = Math.min(chars / TARGET_CPS, duration + MAX_EXTRA_SECONDS);
                const limit = next ? next.start - GAP : t.start + wanted;
                const newEnd = Math.min(t.start + wanted, limit);

                if (newEnd > t.end + 0.05) {
                    timestamp = `${fmt(t.start)} --> ${fmt(newEnd)}`;
                }
            }
        }

        return { ...sub, text, timestamp };

    });

    // 3. still too fast: show the cue up to 0.3 s earlier, only into free time after the previous
    //    cue (its final end time is known here, so nothing ever overlaps)
    const EARLY = 0.3, HARD_CPS = 22;

    for (let i = 1; i < polished.length; i++) {

        const t = parse(polished[i].timestamp);
        const prev = parse(polished[i - 1].timestamp);
        if (!t || !prev) continue;

        const chars = plain(String(polished[i].text || "")).replace(/\n/g, "").length;
        if (!(t.end > t.start) || chars / (t.end - t.start) <= HARD_CPS) continue;

        const newStart = Math.max(t.start - EARLY, prev.end + GAP);
        if (newStart < t.start - 0.05) {
            polished[i] = { ...polished[i], timestamp: `${fmt(newStart)} --> ${fmt(t.end)}` };
        }
    }

    return polished;

}


// ========================================================
// VALIDATE TRANSLATED CHUNK
// ========================================================

// Clean-up passes live in subtitle-cleanup.js (negative-length cues, repeated lines, names).
// If that file did not load, or a pass fails, the cues are used exactly as they came back.
function keepSpeakerDashes(originalText, translatedText) {

    try {
        if (window.SinSubzCleanup) {
            return window.SinSubzCleanup.restoreSpeakerDashes(
                originalText,
                translatedText
            );
        }
    } catch (e) { /* keep the text as it is */ }

    return translatedText;

}


function cleanTranslatedCues(cues, originalCues, chunkSize) {

    try {
        if (window.SinSubzCleanup) {
            return window.SinSubzCleanup.cleanup(
                cues,
                originalCues.map(function (sub) { return sub.text; }),
                { chunkSize: chunkSize }
            );
        }
    } catch (e) { /* keep the cues as they are */ }

    return cues;

}


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
                        ? keepSpeakerDashes(
                            sub.text,
                            translatedText.trim()
                        )
                        : sub.text

            };

        }
    );

}


// ========================================================
// UPDATE BOTH TRANSLATION PROGRESS BARS
// ========================================================

// smooth rolling number for the progress count
function tweenNumber(el, to) {
    const from = el.__v || 0;
    el.__v = to;
    cancelAnimationFrame(el.__raf);

    const start = performance.now();
    const dur = 650;

    (function tick(now) {
        const t = Math.max(0, Math.min(1, (now - start) / dur));
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (to - from) * eased).toLocaleString("en-US");
        if (t < 1) { el.__raf = requestAnimationFrame(tick); }
    })(start);
}

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
            `Part ${chunkNumber} of ${totalChunks}`;
    }

    if (autoCount) {
        const numEl = document.getElementById("autoTranslateNum");

        if (numEl) {
            tweenNumber(numEl, completed);
        } else {
            autoCount.textContent = `${completed} of ${total} subtitles`;
        }
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

    // App notifications (Android / desktop only)
    if (window.__appNotify) {
        try { window.__appNotify.progress(percent, completed, total); } catch (e) { /* ignore */ }
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

// ========================================================
// ASS / SSA -> SRT (some releases only have .ass subtitles)
// ========================================================
function assToSrt(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    let inEvents = false, fmt = null;
    const cues = [];

    const toMs = function (t) {
        const m = /^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(String(t).trim());
        if (!m) { return null; }
        return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(String(m[4]).padEnd(3, "0").slice(0, 3));
    };
    const stamp = function (ms) {
        const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60, r = ms % 1000;
        const z = function (n, w) { return String(n).padStart(w, "0"); };
        return z(h, 2) + ":" + z(mi, 2) + ":" + z(se, 2) + "," + z(r, 3);
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (/^\[.*\]$/.test(line)) { inEvents = /^\[events\]$/i.test(line); continue; }
        if (!inEvents) { continue; }
        if (/^format:/i.test(line)) { fmt = line.slice(7).split(",").map(function (x) { return x.trim().toLowerCase(); }); continue; }
        if (!/^dialogue:/i.test(line)) { continue; }
        const f = fmt || ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
        const parts = line.slice(9).trim().split(",");
        const ti = f.indexOf("text");
        if (parts.length < f.length) { continue; }
        const body = parts.slice(ti).join(",");
        const s0 = toMs(parts[f.indexOf("start")]), e0 = toMs(parts[f.indexOf("end")]);
        if (s0 === null || e0 === null) { continue; }
        if (/\{[^}]*\\p[1-9]/.test(body)) { continue; }              // drawing (shapes), not text
        let t = body
            .replace(/\{\\i1\}/g, "<i>").replace(/\{\\i0\}/g, "</i>")
            .replace(/\{[^}]*\}/g, "")
            .replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ")
            .replace(/[ \t]+\n/g, "\n").trim();
        const open = (t.match(/<i>/g) || []).length, close = (t.match(/<\/i>/g) || []).length;
        if (open > close) { t += "</i>"; }
        if (!t) { continue; }
        cues.push({ s: s0, e: Math.max(e0, s0 + 300), t: t });
    }

    cues.sort(function (a, b) { return a.s - b.s; });
    return cues.map(function (c, i) { return (i + 1) + "\n" + stamp(c.s) + " --> " + stamp(c.e) + "\n" + c.t + "\n"; }).join("\n");
}

function looksLikeAss(text) {
    const t = String(text || "").slice(0, 200000);
    return /^\[Script Info\]/im.test(t) || (/^\[Events\]/im.test(t) && /^Dialogue:/im.test(t));
}

function parseSRT(srt) {
    if (looksLikeAss(srt)) { srt = assToSrt(srt); }

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

// SinSubz credit: one short cue at the start and one at the end of every translated subtitle.
// They only go into a gap with no dialogue and never touch the timing of any other cue.
const SINSUBZ_CREDIT = "Sinhala subtitles by SinSubz\n<font color=\"#FFFF00\">Sinsubs.site</font>";

function addSinSubzCredit(subs) {

    const re = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/;

    const toSec = (h, m, s, ms) =>
        (+h) * 3600 + (+m) * 60 + (+s) + (+String(ms).padEnd(3, "0")) / 1000;

    const clock = sec => {
        const ms = Math.max(0, Math.round(sec * 1000));
        const p = (n, w) => String(n).padStart(w, "0");
        return p(Math.floor(ms / 3600000), 2) + ":" +
            p(Math.floor((ms % 3600000) / 60000), 2) + ":" +
            p(Math.floor((ms % 60000) / 1000), 2) + "," + p(ms % 1000, 3);
    };

    const list = (subs || []).filter(s => s && s.text && s.text.indexOf(SINSUBZ_CREDIT) === -1);

    let first = Infinity, last = 0;

    list.forEach(s => {
        const m = re.exec(String(s.timestamp || ""));
        if (!m) return;
        first = Math.min(first, toSec(m[1], m[2], m[3], m[4]));
        last = Math.max(last, toSec(m[5], m[6], m[7], m[8]));
    });

    if (!isFinite(first)) return subs;      // nothing readable: leave the file alone

    const out = list.slice();

    // start: use the quiet time before the first line (needs at least ~3 s of room)
    if (first >= 3.4) {
        const dur = Math.min(4, first - 0.9);
        out.unshift({ number: 0, timestamp: clock(0.4) + " --> " + clock(0.4 + dur), text: SINSUBZ_CREDIT });
    }

    // end: right after the last line
    out.push({ number: 0, timestamp: clock(last + 1) + " --> " + clock(last + 5), text: SINSUBZ_CREDIT });

    return out.map((s, i) => ({ number: i + 1, timestamp: s.timestamp, text: s.text }));
}

// Website only: after a translation finishes, comments.js may show a small "leave a comment" popup.
function askForComment(label) {
    try {
        if (window.SinSubzComments) {
            window.SinSubzComments.afterTranslate(
                String(label || "").replace(/\.srt$/i, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim()
            );
        }
    } catch (e) { /* never break the translation */ }
}

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

// Anonymous usage counters (shown on the website). Fire and forget, never blocks anything.
const __statSent = new Set();

function trackStat(type, name) {
    try {
        const key = type + "|" + (name || "");
        if (__statSent.has(key)) return;      // same file saved twice in one visit counts once
        __statSent.add(key);
        // signed-in visitors send their Google token too, so the admin panel can count per account
        const getToken = (type === "translated" && window.__sinsubzIdToken)
            ? window.__sinsubzIdToken().catch(function () { return ""; })
            : Promise.resolve("");

        getToken.then(function (token) {
            const headers = { "Content-Type": "application/json" };
            if (token) { headers.Authorization = "Bearer " + token; }
            return fetch("/api/stats", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ type: type, name: name || "" })
            });
        }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
}

function countSavedFile(filename) {
    const f = String(filename || "");
    if (/\.Sinhala\.SinSubz\.srt$/i.test(f)) trackStat("translated", f);
    else if (/\.synced\.srt$/i.test(f)) trackStat("synced", f);
}

/* Website only: a short "your download is ready" screen with an A-Ads banner before the file is saved.
   Not in the apps, not for Premium, never withholds the file (Download now is always there). */
function showDownloadAd(done) {
    var UNIT = "2461670", W = 728, H = 90, SECS = 4, MOBILE = window.innerWidth < 740;
    var de = document.documentElement;
    var skip = typeof window.__appSaveTextFile === "function" || de.classList.contains("app-mode") ||
        de.classList.contains("is-premium") || navigator.webdriver || !/^https?:$/.test(location.protocol) ||
        document.getElementById("dlAdOverlay");
    if (skip) { done(); return; }
    var finished = false, left = SECS, timer = null;
    function finish() {
        if (finished) { return; }
        finished = true; clearInterval(timer);
        var o = document.getElementById("dlAdOverlay"); if (o) { o.remove(); }
        window.removeEventListener("resize", fit);
        done();
    }
    var o = document.createElement("div");
    o.id = "dlAdOverlay";
    o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Download ready");
    o.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(6,6,18,.82);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)";
    o.innerHTML =
        '<div style="width:100%;max-width:780px;background:#161630;border:1px solid rgba(160,160,255,.35);border-radius:18px;padding:22px 18px;text-align:center;color:#eee;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
        '<div style="font-size:20px;font-weight:700;margin-bottom:6px">✅ Your Sinhala subtitle is ready</div>' +
        '<div id="dlAdSub" style="opacity:.8;margin-bottom:14px">Download starts in ' + SECS + 's</div>' +
        '<div style="font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px">Advertisement</div>' +
        '<div id="dlAdBox" style="position:relative;overflow:hidden;margin:0 auto;' + (MOBILE ? 'width:100%;height:100px' : 'width:' + W + 'px;height:' + H + 'px') + '"><iframe data-aa="' + (MOBILE ? "2461674" : UNIT) +
        '" src="https://ad.a-ads.com/' + (MOBILE ? "2461674/?size=Adaptive" : UNIT + '/?size=' + W + 'x' + H) + '" style="border:0;padding:0;' + (MOBILE ? 'width:100%;height:100px' : 'width:' + W + 'px;height:' + H + 'px') + ';overflow:hidden;display:block;transform-origin:0 0"></iframe></div>' +
        '<button type="button" id="dlAdBtn" style="margin-top:18px;padding:12px 26px;border:0;border-radius:12px;background:#7c7cff;color:#fff;font-size:16px;font-weight:700;cursor:pointer">⬇ Download now</button>' +
        '</div>';
    document.body.appendChild(o);
    function fit() {
        var box = document.getElementById("dlAdBox"); if (!box) { return; }
        if (MOBILE) { return; }
        var k = Math.min(1, (box.parentNode.clientWidth - 36) / W);
        box.firstChild.style.transform = k < 1 ? "scale(" + k + ")" : "none";
        box.style.width = Math.round(W * k) + "px"; box.style.height = Math.round(H * k) + "px";
    }
    fit(); window.addEventListener("resize", fit);
    document.getElementById("dlAdBtn").addEventListener("click", finish);
    timer = setInterval(function () {
        left -= 1;
        var t = document.getElementById("dlAdSub");
        if (left <= 0) { finish(); } else if (t) { t.textContent = "Download starts in " + left + "s"; }
    }, 1000);
}

function downloadTextFile(
    text,
    filename
) {

    countSavedFile(filename);

    // Inside the Android app, blob downloads do not work in the WebView.
    // app-shim.js (only included in the app build) saves + shares the file.
    if (typeof window.__appSaveTextFile === "function") {
        window.__appSaveTextFile(text, filename);
        return;
    }

    showDownloadAd(function () { saveBlobFile(text, filename); });
}

function saveBlobFile(text, filename) {

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

// "The.Odyssey.2026.1080p.WEBRip.x264-YTS" -> "WEBRip.1080p" (the release type goes into the saved file name)
function getReleaseTag(subtitle) {
    const text = [subtitle && subtitle.release, subtitle && subtitle.fileName, subtitle && subtitle.name]
        .filter(Boolean).join(" ").replace(/[_\s]+/g, ".");

    const sources = [
        [/\bremux\b/i, "Remux"],
        [/\bblu[-.]?ray\b|\bbdrip\b|\bbrrip\b|\bbd\b/i, "BluRay"],
        [/\bweb[-.]?dl\b/i, "WEB-DL"],
        [/\bweb[-.]?rip\b/i, "WEBRip"],
        [/\bhdrip\b/i, "HDRip"],
        [/\bdvd[-.]?rip\b|\bdvd\b/i, "DVDRip"],
        [/\bhdtv\b/i, "HDTV"],
        [/\bhd[-.]?cam\b|\bcam(?:rip)?\b|\bts\b|\btelesync\b/i, "CAM"],
        [/\bweb\b/i, "WEB"]
    ];
    let source = "";
    for (const [re, name] of sources) { if (re.test(text)) { source = name; break; } }

    const res = (text.match(/\b(2160p|1080p|720p|480p)\b/i) || [])[1] || (/\b4k\b/i.test(text) ? "2160p" : "");

    return [source, res ? res.toLowerCase() : ""].filter(Boolean).join(".");
}

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
            "sinsubzSearchFixes"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "sinsubzSearchFixes";


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
                sinsubzSearchSpin
                .7s linear infinite;

        }


        @keyframes sinsubzSearchSpin {

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
                sinsubzSearchSpin
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
            results.slice(0, 10),
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

                <small class="category-error-detail" style="opacity:.6;display:block;margin-bottom:10px;max-width:420px;word-break:break-word"></small>

                <button
                    type="button"
                    class="category-retry-btn"
                >
                    Try Again
                </button>

            </div>

        `;

        const detail = container.querySelector(".category-error-detail");
        if (detail) detail.textContent = String((error && error.message) || "").slice(0, 160);

        // no inline onclick: the category value is never put into JS source
        const retryBtn = container.querySelector(".category-retry-btn");
        if (retryBtn) retryBtn.addEventListener("click", () => loadCategory(category));

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

const CATEGORY_PAGE_SIZE = 6;

function renderCategoryResults(
    results,
    container
) {

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                results.length / CATEGORY_PAGE_SIZE
            )
        );

    let page = 0;
    let busy = false;

    container.innerHTML = "";

    const stage =
        document.createElement("div");
    stage.className = "category-stage";

    container.appendChild(stage);

    let pager = null;

    if (totalPages > 1) {

        pager =
            document.createElement("div");
        pager.className = "category-pager";

        pager.innerHTML = `
            <button type="button" class="category-page-btn" data-dir="-1" aria-label="Previous page">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="category-dots"></div>
            <span class="category-page-count"></span>
            <button type="button" class="category-page-btn" data-dir="1" aria-label="Next page">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;

        container.appendChild(pager);

    }

    function typeLabel(item) {
        if (item.anime) return "Anime";
        return item.type === "series" ? "TV" : "Movie";
    }

    function typeBadge(item) {
        if (item.anime) return "🎌 Anime";
        return item.type === "series" ? "📺 TV" : "🎬 Movie";
    }

    function buildGrid(slice) {

        const grid =
            document.createElement("div");

        grid.className =
            "category-results-grid";

        slice.forEach(function (item) {

            const card =
                document.createElement("article");

            card.className = "category-card";

            const poster =
                item.poster &&
                item.poster !== "N/A"
                    ? `<img src="${escapeAttribute(item.poster)}" alt="${escapeAttribute(item.title)}" loading="lazy" class="category-poster">`
                    : `<div class="category-poster category-poster-empty">🎬</div>`;

            card.innerHTML = `

                <div class="category-poster-wrap">

                    ${poster}

                    <span class="category-type-badge">
                        ${typeBadge(item)}
                    </span>

                    ${imdbSlot(item.imdbID)}

                </div>

                <div class="category-card-info">

                    <h3>${escapeHTML(item.title)}</h3>

                    <div class="category-card-meta">
                        <span>${escapeHTML(item.year || "")}</span>
                        <span>${typeLabel(item)}</span>
                    </div>

                    <button type="button" class="category-select-btn">
                        Select
                    </button>

                </div>

            `;

            const selectButton =
                card.querySelector(".category-select-btn");

            if (selectButton) {
                selectButton.addEventListener(
                    "click",
                    function () {
                        selectSearchResult(item);
                    }
                );
            }

            grid.appendChild(card);

        });

        return grid;

    }

    function updatePager() {

        if (!pager) return;

        const dots =
            pager.querySelector(".category-dots");

        dots.innerHTML = "";

        for (let i = 0; i < totalPages; i++) {

            const dot =
                document.createElement("button");

            dot.type = "button";
            dot.className =
                "category-dot" +
                (i === page ? " active" : "");
            dot.setAttribute("aria-label", "Page " + (i + 1));

            dot.addEventListener("click", function () {
                goTo(i);
            });

            dots.appendChild(dot);

        }

        pager.querySelector(".category-page-count")
            .textContent = (page + 1) + " / " + totalPages;

        const [prev, next] =
            pager.querySelectorAll(".category-page-btn");

        prev.disabled = page === 0;
        next.disabled = page === totalPages - 1;

    }

    function show(direction, animate) {

        const slice =
            results.slice(
                page * CATEGORY_PAGE_SIZE,
                (page + 1) * CATEGORY_PAGE_SIZE
            );

        const grid = buildGrid(slice);

        if (animate) {
            grid.classList.add(
                direction > 0
                    ? "page-in-next"
                    : "page-in-prev"
            );
        }

        stage.innerHTML = "";
        stage.appendChild(grid);

        applyImdbRatings(grid);
        updatePager();

    }

    function goTo(target) {

        if (
            busy ||
            target === page ||
            target < 0 ||
            target >= totalPages
        ) {
            return;
        }

        const direction = target > page ? 1 : -1;
        const current = stage.firstElementChild;

        busy = true;

        const swap = function () {
            page = target;
            show(direction, true);
            busy = false;
        };

        if (current) {
            current.classList.add(
                direction > 0
                    ? "page-out-next"
                    : "page-out-prev"
            );
            setTimeout(swap, 260);
        } else {
            swap();
        }

    }

    if (pager) {
        pager.querySelectorAll(".category-page-btn")
            .forEach(function (btn) {
                btn.addEventListener("click", function () {
                    goTo(page + Number(btn.dataset.dir));
                });
            });
    }

    show(1, false);

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
// SEARCH SUGGESTIONS (live dropdown while typing)
// ========================================================

(function initSearchSuggestions() {

    if (!searchInput) {
        return;
    }

    const wrap = searchInput.closest(".search-input-wrap");

    if (!wrap) {
        return;
    }

    const MIN_CHARS = 2;
    const MAX_ITEMS = 6;
    const DEBOUNCE_MS = 300;

    const box = document.createElement("div");
    box.className = "suggest-box";
    box.id = "suggestBox";
    box.setAttribute("role", "listbox");
    box.hidden = true;
    wrap.appendChild(box);

    searchInput.setAttribute("aria-controls", "suggestBox");
    searchInput.setAttribute("aria-autocomplete", "list");

    const cache = new Map();
    let timer = null;
    let controller = null;
    let items = [];
    let active = -1;
    let latest = "";

    function close() {
        box.hidden = true;
        box.innerHTML = "";
        items = [];
        active = -1;
    }

    function setActive(index) {

        const rows = box.querySelectorAll(".suggest-item");

        rows.forEach(function (row, i) {
            row.classList.toggle("active", i === index);
            row.setAttribute("aria-selected", i === index ? "true" : "false");
        });

        active = index;

        if (rows[index]) {
            rows[index].scrollIntoView({ block: "nearest" });
        }

    }

    function choose(item) {

        searchInput.value = item.title;
        close();

        if (searchResults) {
            searchResults.innerHTML = "";
        }

        hideCategoryResults();
        selectSearchResult(item);

    }

    function showLoading() {

        let rows = "";

        for (let i = 0; i < 3; i++) {
            rows += `
                <div class="suggest-skeleton">
                    <span class="suggest-thumb"></span>
                    <span class="suggest-lines"><i></i><i></i></span>
                </div>`;
        }

        box.innerHTML = rows;
        box.hidden = false;

    }

    function render(list, query) {

        items = list.slice(0, MAX_ITEMS);
        active = -1;

        if (!items.length) {

            box.innerHTML = `
                <div class="suggest-empty">
                    No matches for "${escapeHTML(query)}"
                </div>`;
            box.hidden = false;
            return;

        }

        box.innerHTML = "";

        items.forEach(function (item, index) {

            const row = document.createElement("div");

            row.className = "suggest-item";
            row.setAttribute("role", "option");
            row.style.animationDelay = (index * 0.04) + "s";

            const thumb =
                item.poster && item.poster !== "N/A"
                    ? `<img class="suggest-thumb" src="${escapeAttribute(item.poster)}" alt="" loading="lazy">`
                    : `<span class="suggest-thumb suggest-thumb-empty">🎬</span>`;

            row.innerHTML = `
                ${thumb}
                <span class="suggest-text">
                    <strong>${escapeHTML(item.title)}</strong>
                    <small>
                        ${escapeHTML(item.year || "")}
                        &middot;
                        ${item.type === "series" ? "TV Series" : "Movie"}
                    </small>
                </span>
                <i class="fa-solid fa-arrow-right suggest-arrow"></i>
            `;

            // mousedown (not click) so it fires before the input loses focus
            row.addEventListener("mousedown", function (event) {
                event.preventDefault();
                choose(item);
            });

            row.addEventListener("mousemove", function () {
                if (active !== index) setActive(index);
            });

            box.appendChild(row);

        });

        box.hidden = false;

    }

    async function fetchSuggestions(query) {

        const key = query.toLowerCase();

        if (cache.has(key)) {
            render(cache.get(key), query);
            return;
        }

        if (controller) {
            controller.abort();
        }

        controller = new AbortController();

        showLoading();

        try {

            const response = await fetch(
                `/api/search?query=${encodeURIComponent(query)}`,
                { signal: controller.signal }
            );

            const data = await response.json();

            // OMDb answers 404 when nothing matches
            const list =
                response.ok && Array.isArray(data.results)
                    ? data.results
                    : [];

            cache.set(key, list);

            // ignore answers for text the user has already changed
            if (searchInput.value.trim() === query) {
                render(list, query);
            }

        } catch (error) {

            if (error && error.name === "AbortError") {
                return;
            }

            close();

        }

    }

    searchInput.addEventListener("input", function () {

        const query = searchInput.value.trim();

        latest = query;
        clearTimeout(timer);

        if (query.length < MIN_CHARS) {
            if (controller) controller.abort();
            close();
            return;
        }

        timer = setTimeout(function () {
            fetchSuggestions(query);
        }, DEBOUNCE_MS);

    });

    searchInput.addEventListener("keydown", function (event) {

        if (box.hidden || !items.length) {
            if (event.key === "Escape") close();
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((active + 1) % items.length);
        }

        else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((active - 1 + items.length) % items.length);
        }

        else if (event.key === "Enter") {

            clearTimeout(timer);

            if (active >= 0) {
                // picks the highlighted suggestion instead of a full search
                event.preventDefault();
                event.stopImmediatePropagation();
                choose(items[active]);
            } else {
                close();
            }

        }

        else if (event.key === "Escape") {
            close();
        }

    }, true);

    searchInput.addEventListener("focus", function () {
        if (latest.length >= MIN_CHARS && items.length) {
            box.hidden = false;
        }
    });

    searchInput.addEventListener("blur", function () {
        // small delay so a tap on a row still registers
        setTimeout(close, 120);
    });

    if (searchBtn) {
        searchBtn.addEventListener("click", function () {
            clearTimeout(timer);
            close();
        });
    }

})();


// ========================================================
// DEBUG
// ========================================================

console.log(
    "SinSubz script loaded successfully."
);


/* ---------------------------------------------------------
   "Go Premium" window (bank transfer for now): benefits, price, bank details, and a button to message us on
   Telegram with the account email.
   mode: "settings" (opened from the app Settings card), "limit" (daily limit reached) or
         "done" (a translation just finished; shown to free signed-in users only).
--------------------------------------------------------- */
window.__sinsubzPremiumInfo = async function (mode) {
    if (mode === true) { mode = "limit"; }
    if (document.getElementById("premiumAsk")) { return; }
    const esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
    let me = null, email = "";
    try {
        const tk = window.__sinsubzIdToken ? await window.__sinsubzIdToken() : "";
        const r = await fetch("/api/stats?me=1", { headers: tk ? { Authorization: "Bearer " + tk } : {} });
        me = await r.json();
    } catch (e) { me = null; }
    if (mode === "done" && (!me || !me.signedIn || me.premium)) { return; }      // never bother Premium members
    if (document.getElementById("premiumAsk")) { return; }
    try {
        const u = window.__sinsubzUser ? window.__sinsubzUser() : null;
        email = (u && u.email) || "";
    } catch (e) { /* ignore */ }
    const offer = (me && me.offer) || { price: "", bank: "", contact: "https://t.me/sinsubz" };
    const pm = (me && me.premiumMovies) || 10, pe = (me && me.premiumEpisodes) || 30;
    const fm = (me && me.movies) || 2, fe = (me && me.episodes) || 5;
    const contact = String(offer.contact || "https://t.me/sinsubz");

    const head = mode === "download" ? "Downloading again is Premium"
        : mode === "done" ? "Your subtitles are ready! \uD83C\uDF89"
        : mode === "limit" ? "You reached today\u2019s free limit" : "Go Premium";
    const sub = mode === "download" ? "Your subtitle is saved. Premium members can download their saved subtitles any time."
        : mode === "done" ? "Enjoy SinSubz more with Premium."
        : mode === "limit" ? "Premium lets you translate a lot more every day." : "Support SinSubz and get more.";

    const check = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="11" fill="#2fbf71"/><path d="M7 12.5l3.3 3.3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const perk = function (t) { return '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:14.5px">' + check + '<span>' + t + '</span></div>'; };

    const wrap = document.createElement("div");
    wrap.id = "premiumAsk";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.style.cssText = "position:fixed;inset:0;z-index:99997;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,6,18,.78);backdrop-filter:blur(5px);overflow:auto";
    wrap.innerHTML =
        '<div style="max-width:410px;width:100%;margin:auto;background:linear-gradient(170deg,#1c1f3a,#12142a 55%);color:#eceaff;border:1px solid #3a3f6b;border-radius:22px;overflow:hidden;font-family:inherit;box-shadow:0 24px 70px rgba(0,0,0,.55)">' +
        '<div style="padding:22px 22px 14px;text-align:center;background:radial-gradient(120% 90% at 50% 0%,rgba(245,163,12,.28),transparent 70%)">' +
        '<div style="width:58px;height:58px;margin:0 auto 10px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ffd75e,#f5a30c);box-shadow:0 8px 26px rgba(245,163,12,.45)">' +
        '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="#3a2600" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg></div>' +
        '<div style="font-size:21px;font-weight:800;line-height:1.25">' + head + '</div>' +
        '<div style="font-size:13.5px;opacity:.8;margin-top:4px">' + sub + '</div></div>' +
        '<div style="padding:4px 22px 20px">' +
        '<div style="background:#0f1122;border:1px solid #2c3050;border-radius:14px;padding:6px 14px">' +
        perk('<b>' + pm + ' films</b> a day <span style="opacity:.6">(free: ' + fm + ')</span>') +
        perk('<b>' + pe + ' TV episodes</b> a day <span style="opacity:.6">(free: ' + fe + ')</span>') +
        perk('<b>Priority</b> when the AI is busy') +
        perk('<b>Priority support</b>') +
        perk('<b>No ads</b> in the app') +
        perk('<b>Premium badge</b> on your comments') +
        perk('Supports SinSubz to keep growing') + '</div>' +
        (offer.price ? '<div style="text-align:center;font-size:18px;font-weight:800;margin:14px 0 0;color:#ffd75e">' + esc(offer.price) + '</div>' : '') +
        '<a id="premiumBuy" href="' + esc(offer.buy || "https://sinsubs.site/premium.html") + '" target="_blank" rel="noopener" style="display:block;margin-top:16px;text-align:center;padding:14px;border-radius:14px;background:linear-gradient(135deg,#ffd75e,#f5a30c);color:#3a2600;font-weight:800;text-decoration:none">Get Premium</a>' +
        '<div style="font-size:12.5px;opacity:.7;margin-top:8px;text-align:center;line-height:1.5">Pay by bank transfer and upload the slip. Premium is turned on after we check it.</div>' +
        '<a href="' + esc(contact) + '" target="_blank" rel="noopener" style="display:block;margin-top:8px;text-align:center;font-size:13.5px;color:#7fd0ff">Questions? Message us on Telegram</a>' +
        '<button id="premiumNo" type="button" style="display:block;margin:10px auto 0;background:none;border:0;color:inherit;opacity:.65;font-size:14px;text-decoration:underline;cursor:pointer">' + (mode === "done" ? "Maybe later" : "Close") + '</button></div></div>';
    document.body.appendChild(wrap);
    const done = function () { wrap.remove(); };
    wrap.querySelector("#premiumNo").addEventListener("click", done);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) { done(); } });
};


/* ---------------------------------------------------------
   One-time notice (only on 2026-11-06, Sri Lanka time): the film / episode counter was wrong for a while
   because of our mistake. The counts reset at midnight. Shown once per browser, then never again.
--------------------------------------------------------- */
(function () {
    try {
        const sl = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
        if (sl !== "2026-11-06") { return; }
        let seen = false;
        try { seen = localStorage.getItem("sinsubz-count-notice") === "1"; } catch (e) { /* ignore */ }
        if (seen) { return; }
        const show = function () {
            if (document.getElementById("countNotice")) { return; }
            const w = document.createElement("div");
            w.id = "countNotice";
            w.setAttribute("role", "dialog");
            w.style.cssText = "position:fixed;inset:0;z-index:99996;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,6,18,.7);backdrop-filter:blur(4px)";
            w.innerHTML =
                '<div style="max-width:380px;width:100%;background:#17192f;color:#eceaff;border:1px solid #3a3f6b;border-radius:20px;padding:22px 20px 18px;text-align:center;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
                '<div style="font-size:30px;line-height:1">🙏</div>' +
                '<div style="font-size:18px;font-weight:800;margin:8px 0 8px">සමාවෙන්න!</div>' +
                '<div style="font-size:14.5px;line-height:1.7;opacity:.95">අපෙන් සිදු වූ තාක්ෂණික දෝෂයක් හේතුවෙන් ඊයේ දිනයේදී සහ අද දින subtitle translate කිරීමේ ක්‍රියාවලියේ දෝෂයක් පැවතිණි. එය දැන් යථා තත්ත්වයට පත් කර ඇත. සිදු වූ අපහසුතාවයට කණගාටුව ප්‍රකාශ කරමු. අප සමග රැඳී සිටින ඔබට ස්තූතියි.</div>' +
                '<div style="font-size:13.5px;line-height:1.6;opacity:.75;margin-top:12px;padding-top:12px;border-top:1px solid #2c3050">Due to a technical issue on our side, there was a problem with subtitle translation yesterday and today. It has now been fixed. We apologise for the inconvenience, and thank you for staying with us.</div>' +
                '<div style="margin-top:10px;font-weight:700">SinSubz Team \u2764\uFE0F</div>' +
                '<button id="countNoticeOk" type="button" style="margin-top:16px;width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#8b7bff,#6a5af9);color:#fff;font-weight:700;font-size:15px;cursor:pointer">OK</button></div>';
            document.body.appendChild(w);
            const close = function () { try { localStorage.setItem("sinsubz-count-notice", "1"); } catch (e) { /* ignore */ } w.remove(); };
            w.querySelector("#countNoticeOk").addEventListener("click", close);
            w.addEventListener("click", function (e) { if (e.target === w) { close(); } });
        };
        if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { setTimeout(show, 1200); }); } else { setTimeout(show, 1200); }
    } catch (e) { /* ignore */ }
})();


// ========================================================
// "MATCH MY VIDEO" LINK (from a title page /tv/<slug>): /?match=tt123&t=Title&y=2014&s=1&e=3
// Opens the English release list for that episode / film. Picking the release that matches the person's video
// uses the saved Sinhala translation, retimed to that release (no AI wait).
// ========================================================
(function () {
    try {
        const p = new URLSearchParams(location.search);
        const id = p.get("match");
        if (!/^tt\d{5,10}$/.test(id || "")) { return; }
        const season = Number(p.get("s")) || null;
        const episode = Number(p.get("e")) || null;
        const item = {
            imdbID: id, title: (p.get("t") || "").slice(0, 150), year: (p.get("y") || "").slice(0, 4),
            poster: /^https:\/\//.test(p.get("p") || "") ? p.get("p") : "", type: season ? "series" : "movie"
        };
        window.addEventListener("load", function () {
            setTimeout(function () {
                try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
                searchSubtitles(item, season ? "episode" : "movie", season, episode);
            }, 400);
        });
    } catch (e) { /* ignore */ }
})();
