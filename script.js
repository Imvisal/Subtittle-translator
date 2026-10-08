"use strict";

/* =========================================================
   SUBLANKA AI - FULL JAVASCRIPT
========================================================= */


/* =========================================================
   ELEMENTS
========================================================= */

const searchInput =
    document.getElementById("searchInput");

const searchBtn =
    document.getElementById("searchBtn");

const searchResults =
    document.getElementById("searchResults");

const searchStatus =
    document.getElementById("searchStatus");

const fileInput =
    document.getElementById("subtitleFile");

const fileName =
    document.getElementById("fileName");

const translateBtn =
    document.getElementById("translateBtn");

const languageSelect =
    document.getElementById("language");

const preview =
    document.getElementById("preview");

const progressContainer =
    document.getElementById("progressContainer");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");

const progressFill =
    document.getElementById("progressFill");

const downloadBtn =
    document.getElementById("downloadBtn");

const themeToggle =
    document.getElementById("themeToggle");


let uploadedSubtitles = [];

let uploadedFileName = "subtitle";

let translatedSRT = "";

let isTranslating = false;


/* =========================================================
   SEARCH
========================================================= */

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

                event.preventDefault();

                searchMovies();

            }

        }
    );

}


/* =========================================================
   FILE UPLOAD
========================================================= */

if (fileInput) {

    fileInput.addEventListener(
        "change",
        handleFileUpload
    );

}


/* =========================================================
   TRANSLATE BUTTON
========================================================= */

if (translateBtn) {

    translateBtn.addEventListener(
        "click",
        translateUploadedSubtitle
    );

    translateBtn.disabled = true;

}


/* =========================================================
   DOWNLOAD
========================================================= */

if (downloadBtn) {

    downloadBtn.addEventListener(
        "click",
        function () {

            if (!translatedSRT) {
                return;
            }

            downloadTextFile(
                translatedSRT,
                `${uploadedFileName}.Sinhala.SubLankaAI.srt`
            );

        }
    );

}


/* =========================================================
   THEME
========================================================= */

if (themeToggle) {

    themeToggle.addEventListener(
        "click",
        function () {

            document.body.classList.toggle(
                "light-mode"
            );

            const light =
                document.body.classList.contains(
                    "light-mode"
                );

            localStorage.setItem(
                "sublanka-theme",
                light ? "light" : "dark"
            );

            themeToggle.textContent =
                light ? "☀️" : "🌙";

        }
    );

}


(function restoreTheme() {

    try {

        const theme =
            localStorage.getItem(
                "sublanka-theme"
            );

        if (theme === "light") {

            document.body.classList.add(
                "light-mode"
            );

            if (themeToggle) {
                themeToggle.textContent = "☀️";
            }

        }

    } catch (error) {

        console.warn(error);

    }

})();


/* =========================================================
   SEARCH HELPERS
========================================================= */

function focusSearch() {

    if (!searchInput) {
        return;
    }

    searchInput.focus();

    searchInput.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

}


function setSearchQuery(value) {

    if (!searchInput) {
        return;
    }

    if (value === "Trending") {

        searchInput.value = "";

        focusSearch();

        return;
    }

    searchInput.value = value;

    focusSearch();

}


/* =========================================================
   MOVIE SEARCH
========================================================= */

async function searchMovies() {

    const query =
        searchInput?.value.trim();


    if (!query) {

        if (searchStatus) {

            searchStatus.textContent =
                "Enter a movie or TV series name.";

        }

        return;
    }


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
            "Searching movies & TV series...";

    }


    if (searchResults) {

        searchResults.innerHTML = "";

    }


    try {

        const response =
            await fetch(
                `/api/search?query=${encodeURIComponent(query)}`
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

            searchStatus.textContent =
                "No movies or TV series found.";

            return;
        }


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


/* =========================================================
   DISPLAY SEARCH RESULTS
========================================================= */

function displaySearchResults(results) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = "";


    results
        .slice(0, 20)
        .forEach(function (item) {

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
                            src="${escapeAttribute(item.poster)}"
                            alt=""
                            loading="lazy"
                        >
                      `

                    : `
                        <div class="
                            result-poster
                            result-poster-empty
                        ">
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
                        ${escapeHTML(item.title)}
                    </h3>

                    <div class="result-meta">

                        <span>
                            ${typeText}
                        </span>

                        <span>
                            ${escapeHTML(item.year || "")}
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

                            <span class="mini-spinner"></span>

                            <span>
                                Checking...
                            </span>

                        </span>

                    </div>

                </div>
            `;


            const button =
                card.querySelector(
                    ".select-title-btn"
                );


            button.addEventListener(
                "click",
                function () {

                    selectSearchResult(
                        item
                    );

                }
            );


            searchResults.appendChild(
                card
            );


            checkSinhalaSubtitles(
                item,
                card
            );

        });

}


/* =========================================================
   SINHALA SUBTITLE CHECK
========================================================= */

async function checkSinhalaSubtitles(
    item,
    card
) {

    const status =
        card.querySelector(
            ".sinhala-status"
        );


    if (!status) {
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
                                class="sinhala-source-link"
                                href="${escapeAttribute(source.url)}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                ${escapeHTML(
                                    source.source ||
                                    "Source"
                                )}
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
            "Sinhala check failed:",
            error
        );


        status.innerHTML = `

            <div class="sinhala-not-found">
                ✨ Sinhala subtitle not found
            </div>

        `;

    }

}


/* =========================================================
   SELECT MOVIE / SERIES
========================================================= */

async function selectSearchResult(item) {

    if (!item?.imdbID) {

        alert(
            "IMDb ID is missing."
        );

        return;
    }


    if (item.type === "movie") {

        await searchSubtitles(
            item,
            "movie"
        );

        return;
    }


    showEpisodeSelector(
        item
    );

}


/* =========================================================
   TV EPISODE SELECTOR
========================================================= */

function showEpisodeSelector(item) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = `

        <div class="translation-status">

            <h3>
                ${escapeHTML(item.title)}
            </h3>

            <p>
                Select Season and Episode
            </p>


            <div
                style="
                    display:flex;
                    gap:10px;
                    margin:20px 0;
                "
            >

                <input
                    id="seasonInput"
                    type="number"
                    min="1"
                    value="1"
                    placeholder="Season"
                    style="
                        width:50%;
                        padding:13px;
                        border-radius:12px;
                        background:#080a26;
                        color:white;
                        border:1px solid #403d75;
                    "
                >


                <input
                    id="episodeInput"
                    type="number"
                    min="1"
                    value="1"
                    placeholder="Episode"
                    style="
                        width:50%;
                        padding:13px;
                        border-radius:12px;
                        background:#080a26;
                        color:white;
                        border:1px solid #403d75;
                    "
                >

            </div>


            <button
                id="findSubtitleBtn"
                class="select-title-btn"
            >
                Find English Subtitle
            </button>

        </div>
    `;


    document
        .getElementById("findSubtitleBtn")
        ?.addEventListener(
            "click",
            function () {

                const season =
                    Number(
                        document.getElementById(
                            "seasonInput"
                        )?.value
                    );


                const episode =
                    Number(
                        document.getElementById(
                            "episodeInput"
                        )?.value
                    );


                if (
                    !season ||
                    !episode
                ) {

                    alert(
                        "Enter season and episode."
                    );

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


/* =========================================================
   SUBDL SEARCH
========================================================= */

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
                season
            );

            params.set(
                "episode",
                episode
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

            searchResults.innerHTML = `

                <div class="translation-status">

                    ❌ No English subtitle found.

                </div>
            `;

            return;
        }


        displaySubtitleResults(
            results,
            item,
            season,
            episode
        );


    } catch (error) {

        console.error(error);


        searchResults.innerHTML = `

            <div class="translation-status">

                ❌ ${escapeHTML(
                    error.message
                )}

            </div>
        `;

    }

}


/* =========================================================
   SUBTITLE RESULTS
========================================================= */

function displaySubtitleResults(
    results,
    item,
    season,
    episode
) {

    searchResults.innerHTML = "";


    results
        .slice(0, 15)
        .forEach(function (subtitle) {

            const card =
                document.createElement("div");


            card.className =
                "search-result-card";


            card.innerHTML = `

                <div class="result-info">

                    <h3>
                        ${escapeHTML(
                            subtitle.fileName ||
                            "English Subtitle"
                        )}
                    </h3>


                    <div class="result-meta">

                        <span>
                            🇬🇧 English
                        </span>

                        ${
                            subtitle.release
                                ? `
                                    <span>
                                        ${escapeHTML(
                                            subtitle.release
                                        )}
                                    </span>
                                  `
                                : ""
                        }

                    </div>


                    <button
                        class="select-title-btn"
                        type="button"
                    >
                        Use This Subtitle
                    </button>

                </div>

            `;


            card
                .querySelector(
                    ".select-title-btn"
                )
                .addEventListener(
                    "click",
                    function () {

                        selectSubtitle(
                            subtitle,
                            item,
                            season,
                            episode
                        );

                    }
                );


            searchResults.appendChild(
                card
            );

        });

}


/* =========================================================
   DOWNLOAD + TRANSLATE SUBTITLE
========================================================= */

async function selectSubtitle(
    subtitle,
    item,
    season,
    episode
) {

    try {

        let url =
            subtitle.downloadUrl ||
            subtitle.url ||
            subtitle.download_url;


        if (!url) {

            throw new Error(
                "Subtitle download URL is missing."
            );

        }


        if (url.startsWith("/")) {

            url =
                "https://dl.subdl.com" +
                url;

        }


        if (searchStatus) {

            searchStatus.textContent =
                "Downloading English subtitle...";

        }


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


        const response =
            await fetch(
                `/api/subtitle-download?url=${encodeURIComponent(url)}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Download failed."
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
            decodeSubtitleBytes(
                bytes
            );


        const subtitles =
            parseSRT(
                englishSRT
            );


        if (!subtitles.length) {

            throw new Error(
                "Downloaded subtitle is not a valid SRT."
            );

        }


        searchResults.innerHTML = `

            <div class="translation-status">

                <h3>
                    🇬🇧 English subtitle downloaded
                </h3>

                <p>
                    ${subtitles.length}
                    subtitle entries
                </p>


                <div class="progress-track">

                    <div
                        id="autoProgress"
                        class="progress-fill"
                    ></div>

                </div>


                <p id="autoStatus">
                    Preparing translation...
                </p>

            </div>
        `;


        const translated =
            await translateSubtitleChunks(
                subtitles
            );


        translatedSRT =
            buildSRT(
                translated
            );


        const baseName =
            getSubtitleBaseName(
                item,
                season,
                episode
            );


        const filename =
            `${baseName}.Sinhala.SubLankaAI.srt`;


        downloadTextFile(
            translatedSRT,
            filename
        );


        searchResults.innerHTML = `

            <div class="translation-status">

                <h2>
                    ✅ Translation Complete
                </h2>

                <p>
                    ${translated.length}
                    subtitles translated.
                </p>

                <br>

                <button
                    id="downloadAgain"
                    class="select-title-btn"
                >
                    ⬇ Download Sinhala Subtitle
                </button>

            </div>
        `;


        document
            .getElementById("downloadAgain")
            ?.addEventListener(
                "click",
                function () {

                    downloadTextFile(
                        translatedSRT,
                        filename
                    );

                }
            );


    } catch (error) {

        console.error(
            "AUTO TRANSLATION ERROR:",
            error
        );


        searchResults.innerHTML = `

            <div class="translation-status">

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


/* =========================================================
   TRANSLATE CHUNKS
========================================================= */

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
                start / CHUNK_SIZE
            ) + 1;


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

                            body:
                                JSON.stringify({

                                    subtitles:
                                        chunk,

                                    language:
                                        languageSelect?.value ||
                                        "si"

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
                        "Translation failed."
                    );

                }


                if (
                    !Array.isArray(
                        data.subtitles
                    )
                ) {

                    throw new Error(
                        "Invalid translation response."
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

                lastError = error;


                if (
                    attempt < 3
                ) {

                    await sleep(
                        attempt === 1
                            ? 3000
                            : 7000
                    );

                }

            }

        }


        if (!success) {

            throw new Error(
                `Chunk ${chunkNumber} failed: ${
                    lastError?.message ||
                    "Unknown error"
                }`
            );

        }


        updateTranslationProgress(
            translated.length,
            subtitles.length,
            chunkNumber,
            totalChunks
        );


        const autoProgress =
            document.getElementById(
                "autoProgress"
            );


        const autoStatus =
            document.getElementById(
                "autoStatus"
            );


        const percent =
            Math.round(
                (
                    translated.length /
                    subtitles.length
                ) * 100
            );


        if (autoProgress) {

            autoProgress.style.width =
                `${percent}%`;

        }


        if (autoStatus) {

            autoStatus.textContent =
                `Translated ${translated.length}/${subtitles.length} subtitles`;
        }


        if (
            start + CHUNK_SIZE <
            subtitles.length
        ) {

            await sleep(1200);

        }

    }


    return translated;

}


/* =========================================================
   UPLOAD TRANSLATION
========================================================= */

async function translateUploadedSubtitle() {

    if (isTranslating) {
        return;
    }


    if (!uploadedSubtitles.length) {

        alert(
            "Please select an SRT file first."
        );

        return;
    }


    isTranslating = true;


    translateBtn.disabled = true;

    translateBtn.textContent =
        "Translating...";


    try {

        const translated =
            await translateSubtitleChunks(
                uploadedSubtitles
            );


        translatedSRT =
            buildSRT(
                translated
            );


        const filename =
            `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


        if (downloadBtn) {

            downloadBtn.hidden = false;

        }


        downloadTextFile(
            translatedSRT,
            filename
        );


        if (progressText) {

            progressText.textContent =
                "Translation complete";

        }


    } catch (error) {

        alert(
            "Translation failed:\n\n" +
            error.message
        );

    } finally {

        isTranslating = false;

        translateBtn.disabled = false;

        translateBtn.textContent =
            "✨ Translate Subtitle";

    }

}


/* =========================================================
   FILE UPLOAD
========================================================= */

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
            "Please select an SRT file."
        );

        return;
    }


    uploadedFileName =
        file.name.replace(
            /\.srt$/i,
            ""
        );


    fileName.textContent =
        file.name;


    try {

        const text =
            await file.text();


        uploadedSubtitles =
            parseSRT(text);


        if (!uploadedSubtitles.length) {

            alert(
                "Could not read this SRT file."
            );

            return;
        }


        preview.value =
            buildSRT(
                uploadedSubtitles
            );


        translateBtn.disabled =
            false;


        progressText.textContent =
            `${uploadedSubtitles.length} subtitles ready`;


    } catch (error) {

        console.error(error);

        alert(
            "Could not read subtitle file."
        );

    }

}


/* =========================================================
   PROGRESS
========================================================= */

function updateTranslationProgress(
    completed,
    total,
    chunk,
    totalChunks
) {

    const percent =
        total
            ? Math.round(
                completed /
                total *
                100
            )
            : 0;


    if (progressFill) {

        progressFill.style.width =
            `${percent}%`;

    }


    if (progressPercent) {

        progressPercent.textContent =
            `${percent}%`;

    }


    if (progressText) {

        progressText.textContent =
            `Chunk ${chunk}/${totalChunks} — ${completed}/${total}`;

    }

}


/* =========================================================
   SRT PARSER
========================================================= */

function parseSRT(srt) {

    if (
        typeof srt !== "string"
    ) {

        return [];

    }


    const normalized =
        srt
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");


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


            const number =
                parseInt(
                    lines[0],
                    10
                );


            const timestamp =
                lines[1];


            if (
                Number.isNaN(number) ||
                !timestamp?.includes("-->")
            ) {
                return;
            }


            const text =
                lines
                    .slice(2)
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


/* =========================================================
   BUILD SRT
========================================================= */

function buildSRT(subtitles) {

    return subtitles
        .map(
            sub => [

                sub.number,

                sub.timestamp,

                sub.text,

                ""

            ].join("\n")
        )
        .join("\n");

}


/* =========================================================
   VALIDATE TRANSLATION
========================================================= */

function validateTranslatedChunk(
    original,
    translated
) {

    const map =
        new Map();


    translated.forEach(
        sub => {

            if (
                sub &&
                Number.isInteger(
                    Number(sub.number)
                )
            ) {

                map.set(
                    Number(sub.number),
                    sub.text
                );

            }

        }
    );


    return original.map(
        sub => ({

            number:
                sub.number,

            timestamp:
                sub.timestamp,

            text:
                typeof map.get(sub.number) ===
                    "string" &&
                map.get(sub.number).trim()
                    ? map.get(sub.number).trim()
                    : sub.text

        })
    );

}


/* =========================================================
   DOWNLOAD
========================================================= */

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
        document.createElement("a");


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


/* =========================================================
   FILE NAME
========================================================= */

function getSubtitleBaseName(
    item,
    season,
    episode
) {

    const title =
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

        return (
            `${title}.S${String(season).padStart(2, "0")}` +
            `E${String(episode).padStart(2, "0")}`
        );

    }


    return title;

}


/* =========================================================
   DECODE
========================================================= */

function decodeSubtitleBytes(bytes) {

    try {

        const utf8 =
            new TextDecoder(
                "utf-8"
            ).decode(bytes);


        if (
            utf8.includes("-->")
        ) {

            return utf8;

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


/* =========================================================
   ZIP
========================================================= */

function isZipFile(bytes) {

    return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
    );

}


/* =========================================================
   ESCAPE
========================================================= */

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


function escapeAttribute(value) {

    return escapeHTML(value);

}


/* =========================================================
   SLEEP
========================================================= */

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

console.log(
    "SubLanka AI loaded successfully."
);
