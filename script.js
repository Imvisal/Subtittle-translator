"use strict";

/* =========================================================
   SUBLANKA AI
   COMPLETE script.js
   ========================================================= */


/* =========================================================
   DOM ELEMENTS
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
    document.getElementById("subtitleFile") ||
    document.getElementById("fileInput") ||
    document.getElementById("srtFile");


const fileName =
    document.getElementById("fileName");


const translateBtn =
    document.getElementById("translateBtn");


const languageSelect =
    document.getElementById("language");


const subtitlePreview =
    document.getElementById("preview");


const themeToggle =
    document.getElementById("themeToggle");


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let uploadedSubtitles = [];

let uploadedFileName = "subtitle";

let isTranslating = false;


/* =========================================================
   SEARCH EVENTS
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
   THEME
   ========================================================= */

if (themeToggle) {

    themeToggle.addEventListener(
        "click",
        toggleTheme
    );

}


/* =========================================================
   RESTORE THEME
   ========================================================= */

(function restoreTheme() {

    /*
     * Force DARK mode as default.
     * Only use saved light mode if user
     * explicitly selected it.
     */

    try {

        const savedTheme =
            localStorage.getItem(
                "sublanka-theme"
            );


        if (
            savedTheme === "light"
        ) {

            document.body.classList.add(
                "light-mode"
            );

            updateThemeButton(
                true
            );

        } else {

            document.body.classList.remove(
                "light-mode"
            );

            updateThemeButton(
                false
            );

        }

    } catch (error) {

        console.warn(
            "Theme restore failed:",
            error
        );

    }

})();


/* =========================================================
   THEME TOGGLE
   ========================================================= */

function toggleTheme() {

    if (!document.body) {
        return;
    }


    document.body.classList.toggle(
        "light-mode"
    );


    const light =
        document.body.classList.contains(
            "light-mode"
        );


    try {

        localStorage.setItem(
            "sublanka-theme",
            light
                ? "light"
                : "dark"
        );

    } catch (error) {

        console.warn(
            "Theme save failed:",
            error
        );

    }


    updateThemeButton(
        light
    );

}


/* =========================================================
   THEME BUTTON ICON
   ========================================================= */

function updateThemeButton(
    light
) {

    if (!themeToggle) {
        return;
    }


    themeToggle.textContent =
        light
            ? "☀"
            : "☾";

}


/* =========================================================
   FILE UPLOAD
   ========================================================= */

async function handleFileUpload(
    event
) {

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


        event.target.value = "";


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
            parseSRT(
                text
            );


        if (
            !uploadedSubtitles.length
        ) {

            alert(
                "This SRT file could not be read."
            );

            return;

        }


        showSRTPreview(
            uploadedSubtitles
        );


        if (translateBtn) {

            translateBtn.disabled =
                false;

        }


        console.log(
            "SRT loaded:",
            uploadedSubtitles.length
        );


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


/* =========================================================
   SHOW SRT PREVIEW
   ========================================================= */

function showSRTPreview(
    subtitles
) {

    if (!subtitlePreview) {
        return;
    }


    subtitlePreview.value =
        buildSRT(
            subtitles
        );

}


/* =========================================================
   TRANSLATE UPLOADED SUBTITLE
   ========================================================= */

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


    if (translateBtn) {

        translateBtn.disabled =
            true;

        translateBtn.textContent =
            "Translating...";

    }


    try {

        const translated =
            await translateSubtitleChunks(
                uploadedSubtitles
            );


        const sinhalaSRT =
            buildSRT(
                translated
            );


        const filename =
            `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


        downloadTextFile(
            sinhalaSRT,
            filename
        );


        if (subtitlePreview) {

            subtitlePreview.value =
                sinhalaSRT;

        }


        alert(
            "Translation completed!\n\n" +
            filename
        );


    } catch (error) {

        console.error(
            "TRANSLATION ERROR:",
            error
        );


        alert(
            "Translation failed:\n\n" +
            error.message
        );


    } finally {

        isTranslating = false;


        if (translateBtn) {

            translateBtn.disabled =
                false;

            translateBtn.textContent =
                "Translate Subtitle";

        }

    }

}


/* =========================================================
   MOVIE / TV SEARCH
   ========================================================= */

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


    /* -----------------------------------------
       LOADING
    ----------------------------------------- */

    if (searchBtn) {

        searchBtn.disabled =
            true;

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
            Array.isArray(
                data.results
            )
                ? data.results
                : [];


        if (!results.length) {

            if (searchStatus) {

                searchStatus.textContent =
                    "No movies or TV series found.";

            }

            return;

        }


        /*
         * TV series first
         */

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

            searchBtn.disabled =
                false;

            searchBtn.innerHTML =
                "🔍 Search";

        }

    }

}


/* =========================================================
   DISPLAY SEARCH RESULTS
   ========================================================= */

function displaySearchResults(
    results
) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = "";


    results
        .slice(0, 20)
        .forEach(
            function (item) {

                const card =
                    document.createElement(
                        "div"
                    );


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
                                loading="lazy"
                            >
                          `

                        : `
                            <div
                                class="result-poster result-poster-empty"
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

                                <span class="mini-spinner"></span>

                                <span>
                                    Checking...
                                </span>

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


                /*
                 * Check Sinhala subtitle
                 * separately.
                 */

                checkSinhalaSubtitles(
                    item,
                    card
                );

            }
        );

}


/* =========================================================
   CHECK SINHALA SUBTITLES
   ========================================================= */

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
                "Sinhala subtitle search failed."
            );

        }


        if (
            data.found &&
            Array.isArray(
                data.sources
            ) &&
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
                                    class="sinhala-source-link"
                                >
                                    ${escapeHTML(
                                        source.source ||
                                        "Source"
                                    )}
                                </a>
                            `;

                        }
                    )
                    .join("");


            status.innerHTML = `

                <div class="sinhala-available">

                    <strong>
                        🇱🇰 Sinhala Subtitle Available
                    </strong>


                    ${
                        links
                            ? `
                                <div class="sinhala-source-links">
                                    ${links}
                                </div>
                              `
                            : ""
                    }

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


/* =========================================================
   SELECT SEARCH RESULT
   ========================================================= */

async function selectSearchResult(
    item
) {

    if (
        !item ||
        !item.imdbID
    ) {

        alert(
            "IMDb ID is missing."
        );

        return;

    }


    if (searchStatus) {

        searchStatus.textContent =
            `Selected: ${item.title}`;

    }


    /*
     * Movie
     */

    if (
        item.type === "movie"
    ) {

        await searchSubtitles(
            item,
            "movie"
        );

        return;

    }


    /*
     * TV series
     */

    if (
        item.type === "series"
    ) {

        showEpisodeSelector(
            item
        );

    }

}


/* =========================================================
   TV SEASON / EPISODE SELECTOR
   ========================================================= */

function showEpisodeSelector(
    item
) {

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


/* =========================================================
   SEARCH SUBDL
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


        if (
            type === "episode"
        ) {

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
            Array.isArray(
                data.results
            )
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

                <div class="translation-status error">

                    <h3>
                        ❌ Subtitle search failed
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


/* =========================================================
   DISPLAY SUBTITLE RESULTS
   ========================================================= */

function displaySubtitleResults(
    results,
    item,
    season,
    episode
) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML = "";


    results
        .slice(0, 15)
        .forEach(
            function (subtitle) {

                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "search-result-card";


                const fileName =
                    subtitle.fileName ||
                    "English Subtitle";


                const release =
                    subtitle.release ||
                    "";


                const fps =
                    subtitle.fps ||
                    "";


                const hi =
                    subtitle.hearingImpaired
                        ? "🔊 Hearing Impaired"
                        : "🎬 Standard";


                card.innerHTML = `

                    <div class="result-info">

                        <h3>
                            ${escapeHTML(
                                fileName
                            )}
                        </h3>


                        <div class="result-meta">

                            <span>
                                🇬🇧 English
                            </span>


                            ${
                                release
                                    ? `
                                        <span>
                                            ${escapeHTML(
                                                release
                                            )}
                                        </span>
                                      `
                                    : ""
                            }


                            ${
                                fps
                                    ? `
                                        <span>
                                            ${escapeHTML(
                                                String(fps)
                                            )}
                                            FPS
                                        </span>
                                      `
                                    : ""
                            }

                        </div>


                        <p>
                            ${hi}
                        </p>


                        <button
                            type="button"
                            class="select-title-btn"
                        >
                            Use This Subtitle
                        </button>

                    </div>

                `;


                const button =
                    card.querySelector(
                        ".select-title-btn"
                    );


                if (button) {

                    button.addEventListener(
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

                }


                searchResults.appendChild(
                    card
                );

            }
        );

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
            !fullSubtitleUrl.startsWith(
                "http"
            )
        ) {

            throw new Error(
                "Invalid subtitle URL."
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


        /* -----------------------------------------
           DOWNLOAD
        ----------------------------------------- */

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


        /* -----------------------------------------
           BASE64 -> BYTES
        ----------------------------------------- */

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


        /* -----------------------------------------
           ZIP CHECK
        ----------------------------------------- */

        if (
            isZipFile(bytes)
        ) {

            throw new Error(
                "SubDL returned a ZIP subtitle package. ZIP extraction is required for this subtitle."
            );

        }


        /* -----------------------------------------
           DECODE
        ----------------------------------------- */

        const englishSRT =
            decodeSubtitleBytes(
                bytes
            );


        if (
            !englishSRT.trim()
        ) {

            throw new Error(
                "Subtitle file is empty."
            );

        }


        /* -----------------------------------------
           PARSE
        ----------------------------------------- */

        const subtitles =
            parseSRT(
                englishSRT
            );


        if (
            !subtitles.length
        ) {

            throw new Error(
                "Downloaded file is not a valid SRT."
            );

        }


        if (searchStatus) {

            searchStatus.textContent =
                `${subtitles.length} subtitles downloaded. Starting translation...`;

        }


        /* -----------------------------------------
           TRANSLATION UI
        ----------------------------------------- */

        if (searchResults) {

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
                            id="autoTranslateProgress"
                            class="progress-fill"
                        ></div>

                    </div>


                    <p id="autoTranslateStatus">
                        Preparing translation...
                    </p>

                </div>

            `;

        }


        /* -----------------------------------------
           TRANSLATE
        ----------------------------------------- */

        const translated =
            await translateSubtitleChunks(
                subtitles
            );


        /* -----------------------------------------
           BUILD SRT
        ----------------------------------------- */

        const sinhalaSRT =
            buildSRT(
                translated
            );


        /* -----------------------------------------
           FILE NAME
        ----------------------------------------- */

        const baseName =
            getSubtitleBaseName(
                item,
                season,
                episode
            );


        const filename =
            `${baseName}.Sinhala.SubLankaAI.srt`;


        /* -----------------------------------------
           DOWNLOAD
        ----------------------------------------- */

        downloadTextFile(
            sinhalaSRT,
            filename
        );


        if (searchStatus) {

            searchStatus.textContent =
                "✓ Sinhala subtitle completed!";

        }


        /* -----------------------------------------
           COMPLETE UI
        ----------------------------------------- */

        if (searchResults) {

            searchResults.innerHTML = `

                <div class="translation-status success">

                    <h2>
                        ✅ Translation Complete
                    </h2>

                    <p>
                        ${translated.length}
                        subtitles translated.
                    </p>

                    <p>
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


            const again =
                document.getElementById(
                    "downloadAgainBtn"
                );


            if (again) {

                again.addEventListener(
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

                <div class="translation-status error">

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


/* =========================================================
   TRANSLATE IN CHUNKS
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


        /* -----------------------------------------
           RETRY
        ----------------------------------------- */

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
                        JSON.parse(
                            raw
                        );

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
                        `Chunk ${chunkNumber}/${totalChunks} failed — retrying...`
                    );


                    await sleep(
                        waitTime
                    );

                }

            }

        }


        if (!success) {

            throw new Error(
                `Chunk ${chunkNumber} failed after 3 attempts: ${
                    lastError?.message ||
                    "Unknown error"
                }`
            );

        }


        updateTranslationProgress(
            chunkNumber,
            totalChunks,
            translated.length,
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


/* =========================================================
   VALIDATE TRANSLATED CHUNK
   ========================================================= */

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
                    Number(
                        sub.number
                    )
                )
            ) {

                translatedMap.set(
                    Number(
                        sub.number
                    ),
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


/* =========================================================
   TRANSLATION PROGRESS
   ========================================================= */

function updateTranslationProgress(
    chunkNumber,
    totalChunks,
    completed,
    total
) {

    const percent =
        total > 0
            ? Math.round(
                (
                    completed /
                    total
                ) * 100
            )
            : 0;


    const progress =
        document.getElementById(
            "autoTranslateProgress"
        );


    const status =
        document.getElementById(
            "autoTranslateStatus"
        );


    if (progress) {

        progress.style.width =
            `${percent}%`;

    }


    if (status) {

        status.textContent =
            `Translated ${completed}/${total} subtitles — chunk ${chunkNumber}/${totalChunks}`;

    }


    /* Also update main progress */

    const mainProgress =
        document.getElementById(
            "progressFill"
        );


    const mainPercent =
        document.getElementById(
            "progressPercent"
        );


    const mainText =
        document.getElementById(
            "progressText"
        );


    if (mainProgress) {

        mainProgress.style.width =
            `${percent}%`;

    }


    if (mainPercent) {

        mainPercent.textContent =
            `${percent}%`;

    }


    if (mainText) {

        mainText.textContent =
            `Translated ${completed}/${total} subtitles`;

    }

}


/* =========================================================
   TRANSLATION STATUS
   ========================================================= */

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


/* =========================================================
   SRT PARSER
   ========================================================= */

function parseSRT(
    srt
) {

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
                        function (line) {

                            return line.trimEnd();

                        }
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
                !timestamp.includes(
                    "-->"
                )
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


/* =========================================================
   BUILD SRT
   ========================================================= */

function buildSRT(
    subtitles
) {

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


/* =========================================================
   DOWNLOAD TEXT FILE
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


/* =========================================================
   SUBTITLE FILE NAME
   ========================================================= */

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
            )
                .padStart(
                    2,
                    "0"
                );


        const e =
            String(
                episode
            )
                .padStart(
                    2,
                    "0"
                );


        return (
            `${cleanTitle}.S${s}E${e}`
        );

    }


    return cleanTitle;

}


/* =========================================================
   DECODE SUBTITLE BYTES
   ========================================================= */

function decodeSubtitleBytes(
    bytes
) {

    try {

        const text =
            new TextDecoder(
                "utf-8",
                {
                    fatal: false
                }
            ).decode(
                bytes
            );


        if (
            text.includes(
                "-->"
            )
        ) {

            return text;

        }

    } catch {
        /* fallback */
    }


    try {

        return new TextDecoder(
            "windows-1252"
        ).decode(
            bytes
        );

    } catch {

        return new TextDecoder()
            .decode(
                bytes
            );

    }

}


/* =========================================================
   ZIP CHECK
   ========================================================= */

function isZipFile(
    bytes
) {

    return (

        bytes.length >= 4 &&

        bytes[0] === 0x50 &&

        bytes[1] === 0x4b &&

        bytes[2] === 0x03 &&

        bytes[3] === 0x04

    );

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(
    value
) {

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


/* =========================================================
   ESCAPE ATTRIBUTE
   ========================================================= */

function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );

}


/* =========================================================
   SLEEP
   ========================================================= */

function sleep(
    ms
) {

    return new Promise(
        function (resolve) {

            setTimeout(
                resolve,
                ms
            );

        }
    );

}


/* =========================================================
   CATEGORY CHIP SEARCH
   ========================================================= */

document
    .querySelectorAll(
        ".category-chip"
    )
    .forEach(
        function (chip) {

            chip.addEventListener(
                "click",
                function () {

                    const text =
                        chip.textContent
                            .trim()
                            .toLowerCase();


                    if (!searchInput) {
                        return;
                    }


                    if (
                        text.includes(
                            "anime"
                        )
                    ) {

                        searchInput.value =
                            "anime";

                    }


                    if (
                        text.includes(
                            "movies"
                        )
                    ) {

                        searchInput.focus();

                        return;

                    }


                    if (
                        text.includes(
                            "tv"
                        )
                    ) {

                        searchInput.focus();

                        return;

                    }


                    if (
                        text.includes(
                            "trending"
                        )
                    ) {

                        searchInput.focus();

                        return;

                    }

                }
            );

        }
    );


/* =========================================================
   INITIAL MESSAGE
   ========================================================= */

console.log(
    "SubLanka AI script.js loaded successfully."
);
