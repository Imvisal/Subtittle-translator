"use strict";

/*
========================================================
SUBLANKA AI - COMPLETE SCRIPT.JS
========================================================

FEATURES
1. SRT file upload
2. SRT preview
3. English -> Sinhala translation
4. Movie / TV search
5. TV season / episode selection
6. SubDL English subtitle search
7. Subtitle download
8. Automatic Sinhala translation
9. Automatic SRT download
10. Translation progress
11. Smooth scroll to translation section
12. Dark / Light theme
13. Sinhala subtitle source search
14. Baiscope / SinhalaSub / Cineru source buttons
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


// --------------------------------------------------------
// FILE INPUT
// --------------------------------------------------------

const fileInput =
    document.getElementById("subtitleFile") ||
    document.getElementById("fileInput") ||
    document.getElementById("srtFile");

const fileName =
    document.getElementById("fileName") ||
    document.getElementById("fileNameDisplay");


// --------------------------------------------------------
// TRANSLATE BUTTON
// --------------------------------------------------------

const translateBtn =
    document.getElementById("translateBtn") ||
    document.getElementById("translateButton");


// --------------------------------------------------------
// LANGUAGE
// --------------------------------------------------------

const languageSelect =
    document.getElementById("language") ||
    document.getElementById("languageSelect");


// --------------------------------------------------------
// PREVIEW
// --------------------------------------------------------

const subtitlePreview =
    document.getElementById("preview") ||
    document.getElementById("subtitlePreview");


// --------------------------------------------------------
// DOWNLOAD
// --------------------------------------------------------

const downloadBtn =
    document.getElementById("downloadBtn");


// --------------------------------------------------------
// PROGRESS
// --------------------------------------------------------

const progressContainer =
    document.getElementById("progressContainer");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");

const progressFill =
    document.getElementById("progressFill");


// --------------------------------------------------------
// THEME
// --------------------------------------------------------

const themeToggle =
    document.getElementById("themeToggle");


// ========================================================
// GLOBAL STATE
// ========================================================

let uploadedSubtitles = [];

let uploadedFileName =
    "subtitle";

let translatedSubtitleText =
    "";

let isTranslating =
    false;


// ========================================================
// INITIAL STATE
// ========================================================

if (translateBtn) {
    translateBtn.disabled = true;
}

if (downloadBtn) {
    downloadBtn.disabled = true;
}

if (progressContainer) {
    progressContainer.style.display = "none";
}


// ========================================================
// THEME
// ========================================================

function loadTheme() {

    const savedTheme =
        localStorage.getItem(
            "sublanka_theme"
        );

    const theme =
        savedTheme || "dark";

    document.documentElement.setAttribute(
        "data-theme",
        theme
    );
}


function toggleTheme() {

    const currentTheme =
        document.documentElement.getAttribute(
            "data-theme"
        ) || "dark";

    const newTheme =
        currentTheme === "dark"
            ? "light"
            : "dark";

    document.documentElement.setAttribute(
        "data-theme",
        newTheme
    );

    localStorage.setItem(
        "sublanka_theme",
        newTheme
    );
}


if (themeToggle) {

    themeToggle.addEventListener(
        "click",
        toggleTheme
    );

}

loadTheme();


// ========================================================
// SMOOTH SCROLL TO TRANSLATION SECTION
// ========================================================

function scrollToTranslationSection() {

    const section =
        document.querySelector(
            ".settings-section"
        );

    if (!section) {
        return;
    }

    section.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest"
    });
}


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

                event.preventDefault();

                searchMovies();

            }

        }
    );

}


// ========================================================
// FILE UPLOAD EVENT
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
        translateUploadedSubtitle
    );

}


// ========================================================
// HANDLE SRT FILE UPLOAD
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

            translateBtn.disabled =
                false;

            translateBtn.innerHTML =
                '<i class="fa-solid fa-wand-magic-sparkles"></i> Translate to Sinhala';

        }


        if (searchStatus) {

            searchStatus.textContent =
                `${uploadedSubtitles.length} subtitle entries ready.`;

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

function showSRTPreview(subtitles) {

    if (!subtitlePreview) {
        return;
    }


    const text =
        buildSRT(
            subtitles
        );


    if (
        subtitlePreview.tagName ===
        "TEXTAREA"
    ) {

        subtitlePreview.value =
            text;

    } else {

        subtitlePreview.textContent =
            text;

    }

}


// ========================================================
// TRANSLATE UPLOADED SUBTITLE
// ========================================================

async function translateUploadedSubtitle() {

    scrollToTranslationSection();


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


    isTranslating =
        true;


    if (translateBtn) {

        translateBtn.disabled =
            true;

        translateBtn.innerHTML =
            "⏳ Translating...";

    }


    showProgress();

    updateMainProgress(
        0,
        "Preparing translation..."
    );


    try {

        await sleep(350);


        const translated =
            await translateSubtitleChunks(
                uploadedSubtitles
            );


        translatedSubtitleText =
            buildSRT(
                translated
            );


        if (subtitlePreview) {

            if (
                subtitlePreview.tagName ===
                "TEXTAREA"
            ) {

                subtitlePreview.value =
                    translatedSubtitleText;

            } else {

                subtitlePreview.textContent =
                    translatedSubtitleText;

            }

        }


        if (downloadBtn) {

            downloadBtn.disabled =
                false;

        }


        const filename =
            `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


        downloadTextFile(
            translatedSubtitleText,
            filename
        );


        updateMainProgress(
            100,
            "Translation completed!"
        );


        if (searchStatus) {

            searchStatus.textContent =
                "✓ Sinhala subtitle completed!";

        }


        if (translateBtn) {

            translateBtn.innerHTML =
                '<i class="fa-solid fa-check"></i> Translation Complete';

        }


    } catch (error) {

        console.error(
            "TRANSLATION ERROR:",
            error
        );


        updateMainProgress(
            0,
            "Translation failed."
        );


        if (searchStatus) {

            searchStatus.textContent =
                "Translation failed.";

        }


        alert(
            "Translation failed:\n\n" +
            error.message
        );

    } finally {

        isTranslating =
            false;


        if (translateBtn) {

            translateBtn.disabled =
                false;

        }

    }

}


// ========================================================
// DOWNLOAD BUTTON
// ========================================================

if (downloadBtn) {

    downloadBtn.addEventListener(
        "click",
        function () {

            if (
                !translatedSubtitleText
            ) {

                return;

            }


            const filename =
                `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


            downloadTextFile(
                translatedSubtitleText,
                filename
            );

        }
    );

}


// ========================================================
// PROGRESS UI
// ========================================================

function showProgress() {

    if (progressContainer) {

        progressContainer.style.display =
            "block";

    }

}


function updateMainProgress(
    percent,
    message
) {

    const safePercent =
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


    if (progressText) {

        progressText.textContent =
            message;

    }


    if (progressPercent) {

        progressPercent.textContent =
            `${Math.round(safePercent)}%`;

    }


    if (progressFill) {

        progressFill.style.width =
            `${safePercent}%`;

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


    if (searchBtn) {

        searchBtn.disabled =
            true;

        searchBtn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';

    }


    if (searchStatus) {

        searchStatus.textContent =
            "Searching movies and TV series...";

    }


    if (searchResults) {

        searchResults.innerHTML =
            `
            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                Searching...

            </div>
            `;

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


            if (searchResults) {

                searchResults.innerHTML =
                    `
                    <div class="search-empty">
                        No results found.
                    </div>
                    `;

            }

            return;
        }


        // TV first
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


        if (searchResults) {

            searchResults.innerHTML =
                `
                <div class="search-empty">

                    ❌ ${escapeHTML(
                        error.message
                    )}

                </div>
                `;

        }

    } finally {

        if (searchBtn) {

            searchBtn.disabled =
                false;

            searchBtn.innerHTML =
                '<i class="fa-solid fa-magnifying-glass"></i> <span>Search</span>';

        }

    }

}


// ========================================================
// DISPLAY MOVIE / TV RESULTS
// ========================================================

function displaySearchResults(
    results
) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML =
        "";


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
                            class="result-poster"
                            style="
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                font-size:25px;
                            "
                        >
                            🎬
                        </div>
                        `;


                const typeText =
                    item.type === "series"
                        ? "📺 TV Series"
                        : "🎬 Movie";


                card.innerHTML =
                    `
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
                                    item.year ||
                                    ""
                                )}
                            </span>

                        </div>


                        <!-- SINHALA SOURCES -->

                        <div class="sinhala-status">

                            <div class="sinhala-checking">

                                <i class="fa-solid fa-spinner fa-spin"></i>

                                Checking Sinhala subtitles...

                            </div>

                        </div>


                        <!-- SELECT -->

                        <button
                            type="button"
                            class="select-title-btn"
                        >
                            Select
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
                ------------------------------------------------
                CHECK SINHALA SOURCES
                ------------------------------------------------
                */

                checkSinhalaSubtitles(
                    item,
                    card
                );

            }
        );

}


// ========================================================
// CHECK SINHALA SUBTITLE SOURCES
// ========================================================

async function checkSinhalaSubtitles(
    item,
    card
) {

    if (!item || !card) {
        return;
    }


    const status =
        card.querySelector(
            ".sinhala-status"
        );


    if (!status) {
        return;
    }


    try {

        const params =
            new URLSearchParams();


        params.set(
            "title",
            item.title || ""
        );


        params.set(
            "year",
            item.year || ""
        );


        params.set(
            "type",
            item.type || "movie"
        );


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


        const sources =
            Array.isArray(
                data.results
            )
                ? data.results
                : [];


        if (!sources.length) {

            status.innerHTML =
                `
                <div class="sinhala-not-found">

                    ✨ Sinhala subtitle not found

                </div>
                `;

            return;
        }


        status.innerHTML =
            `
            <div class="sinhala-title">

                🇱🇰 Sinhala Subtitle Sources

            </div>

            <div class="sinhala-sources">

                ${
                    sources
                        .map(
                            function (source) {

                                return `
                                <a
                                    class="sinhala-source"
                                    href="${escapeAttribute(
                                        source.searchUrl
                                    )}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >

                                    <span>
                                        🟢
                                        ${escapeHTML(
                                            source.source
                                        )}
                                    </span>

                                    <span>
                                        Open ↗
                                    </span>

                                </a>
                                `;

                            }
                        )
                        .join("")
                }

            </div>
            `;


    } catch (error) {

        console.error(
            "SINHALA SEARCH ERROR:",
            error
        );


        status.innerHTML =
            `
            <div class="sinhala-check-failed">

                🔎 Sinhala subtitle search unavailable

            </div>
            `;

    }

}


// ========================================================
// SELECT MOVIE / TV
// ========================================================

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


    if (
        item.type ===
        "movie"
    ) {

        await searchSubtitles(
            item,
            "movie"
        );

        return;
    }


    if (
        item.type ===
        "series"
    ) {

        showEpisodeSelector(
            item
        );

    }

}


// ========================================================
// TV SEASON / EPISODE
// ========================================================

function showEpisodeSelector(
    item
) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML =
        `
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

            const seasonInput =
                document.getElementById(
                    "seasonInput"
                );


            const episodeInput =
                document.getElementById(
                    "episodeInput"
                );


            const season =
                Number(
                    seasonInput?.value
                );


            const episode =
                Number(
                    episodeInput?.value
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
// SUBDL ENGLISH SUBTITLE SEARCH
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

        searchResults.innerHTML =
            `
            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                Searching English subtitles...

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
            type ===
            "episode"
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

                searchResults.innerHTML =
                    `
                    <div class="search-empty">

                        ❌ No English subtitles found.

                        <br><br>

                        <button
                            type="button"
                            class="back-search-btn"
                            onclick="location.reload()"
                        >
                            Back to Search
                        </button>

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

            searchResults.innerHTML =
                `
                <div class="search-empty">

                    ❌ ${escapeHTML(
                        error.message
                    )}

                </div>
                `;

        }

    }

}


// ========================================================
// DISPLAY ENGLISH SUBTITLE RESULTS
// ========================================================

function displaySubtitleResults(
    results,
    item,
    season,
    episode
) {

    if (!searchResults) {
        return;
    }


    searchResults.innerHTML =
        `
        <div class="subtitle-results-title">

            🇬🇧 English Subtitles

        </div>
        `;


    results
        .slice(0, 15)
        .forEach(
            function (subtitle) {

                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "subtitle-card";


                const fileName =
                    subtitle.fileName ||
                    "English Subtitle";


                const release =
                    subtitle.release ||
                    "";


                const fps =
                    subtitle.fps ||
                    "";


                card.innerHTML =
                    `
                    <h4>
                        ${escapeHTML(
                            fileName
                        )}
                    </h4>

                    <p>

                        🇬🇧 English

                        ${
                            release
                                ? " • " +
                                  escapeHTML(
                                      release
                                  )
                                : ""
                        }

                        ${
                            fps
                                ? " • " +
                                  escapeHTML(
                                      String(fps)
                                  ) +
                                  " FPS"
                                : ""
                        }

                    </p>

                    <button
                        type="button"
                    >
                        Use This Subtitle
                    </button>
                    `;


                const button =
                    card.querySelector(
                        "button"
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


// ========================================================
// SELECT ENGLISH SUBTITLE
// DOWNLOAD -> TRANSLATE
// ========================================================

async function selectSubtitle(
    subtitle,
    item,
    season,
    episode
) {

    scrollToTranslationSection();


    const subtitleUrl =
        subtitle.downloadUrl ||
        subtitle.url ||
        subtitle.download_url;


    if (!subtitleUrl) {

        alert(
            "Subtitle download URL is missing."
        );

        return;
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

        alert(
            "Invalid subtitle URL."
        );

        return;
    }


    if (searchStatus) {

        searchStatus.textContent =
            "Downloading English subtitle...";

    }


    if (searchResults) {

        searchResults.innerHTML =
            `
            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                Downloading English subtitle...

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
            atob(
                data.data
            );


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


        if (
            isZipFile(bytes)
        ) {

            throw new Error(
                "SubDL returned a ZIP subtitle package. ZIP extraction is required in the download API."
            );

        }


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


        const subtitles =
            parseSRT(
                englishSRT
            );


        if (!subtitles.length) {

            throw new Error(
                "Downloaded file is not a valid SRT."
            );

        }


        scrollToTranslationSection();


        await sleep(300);


        showProgress();


        updateMainProgress(
            0,
            `English subtitle loaded successfully. ${subtitles.length} subtitle entries ready.`
        );


        if (searchResults) {

            searchResults.innerHTML =
                `
                <div class="subtitle-loaded">

                    <h3>
                        ✓ English subtitle loaded
                    </h3>

                    <p>
                        ${subtitles.length}
                        subtitle entries ready.
                    </p>

                    <button
                        type="button"
                        id="translateSearchSubtitle"
                    >
                        🇱🇰 Translate to Sinhala
                    </button>

                </div>
                `;

        }


        const translateSearchSubtitle =
            document.getElementById(
                "translateSearchSubtitle"
            );


        if (
            translateSearchSubtitle
        ) {

            translateSearchSubtitle.addEventListener(
                "click",
                async function () {

                    if (isTranslating) {
                        return;
                    }


                    scrollToTranslationSection();


                    await sleep(300);


                    try {

                        isTranslating =
                            true;


                        translateSearchSubtitle.disabled =
                            true;

                        translateSearchSubtitle.textContent =
                            "⏳ Translating...";


                        showProgress();


                        const translated =
                            await translateSubtitleChunks(
                                subtitles
                            );


                        translatedSubtitleText =
                            buildSRT(
                                translated
                            );


                        if (subtitlePreview) {

                            if (
                                subtitlePreview.tagName ===
                                "TEXTAREA"
                            ) {

                                subtitlePreview.value =
                                    translatedSubtitleText;

                            } else {

                                subtitlePreview.textContent =
                                    translatedSubtitleText;

                            }

                        }


                        if (downloadBtn) {

                            downloadBtn.disabled =
                                false;

                        }


                        const filename =
                            `${getSubtitleBaseName(
                                item,
                                season,
                                episode
                            )}.Sinhala.SubLankaAI.srt`;


                        downloadTextFile(
                            translatedSubtitleText,
                            filename
                        );


                        updateMainProgress(
                            100,
                            "Translation completed!"
                        );


                        translateSearchSubtitle.textContent =
                            "✓ Translation Complete";


                    } catch (error) {

                        console.error(
                            "SEARCH TRANSLATION ERROR:",
                            error
                        );


                        updateMainProgress(
                            0,
                            "Translation failed."
                        );


                        alert(
                            "Translation failed:\n\n" +
                            error.message
                        );


                        translateSearchSubtitle.disabled =
                            false;

                        translateSearchSubtitle.textContent =
                            "🇱🇰 Translate to Sinhala";

                    } finally {

                        isTranslating =
                            false;

                    }

                }
            );

        }


    } catch (error) {

        console.error(
            "SUBTITLE DOWNLOAD ERROR:",
            error
        );


        if (searchStatus) {

            searchStatus.textContent =
                "Subtitle download failed.";

        }


        if (searchResults) {

            searchResults.innerHTML =
                `
                <div class="search-empty">

                    ❌ ${escapeHTML(
                        error.message
                    )}

                </div>
                `;

        }

    }

}


// ========================================================
// TRANSLATE SUBTITLE CHUNKS
// ========================================================

async function translateSubtitleChunks(
    subtitles
) {

    const CHUNK_SIZE =
        20;


    const totalChunks =
        Math.ceil(
            subtitles.length /
            CHUNK_SIZE
        );


    const translated =
        [];


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


        const completedBefore =
            translated.length;


        const percentBefore =
            subtitles.length > 0
                ? Math.round(
                    (
                        completedBefore /
                        subtitles.length
                    ) * 100
                )
                : 0;


        updateMainProgress(
            percentBefore,
            `Translating ${completedBefore}/${subtitles.length}...`
        );


        let success =
            false;


        let lastError =
            null;


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
                                        getSelectedLanguage()

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


                success =
                    true;


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

                    updateMainProgress(
                        percentBefore,
                        `Retrying chunk ${chunkNumber}/${totalChunks}...`
                    );


                    const waitTime =
                        attempt === 1
                            ? 3000
                            : 7000;


                    await sleep(
                        waitTime
                    );

                }

            }

        }


        if (!success) {

            throw new Error(
                `Chunk ${chunkNumber} failed after 3 attempts: ` +
                (
                    lastError?.message ||
                    "Unknown error"
                )
            );

        }


        const completed =
            translated.length;


        const percent =
            subtitles.length > 0
                ? Math.round(
                    (
                        completed /
                        subtitles.length
                    ) * 100
                )
                : 0;


        updateMainProgress(
            percent,
            `Translating ${completed}/${subtitles.length}...`
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


    updateMainProgress(
        100,
        "Translation completed!"
    );


    return translated;

}


// ========================================================
// GET LANGUAGE
// ========================================================

function getSelectedLanguage() {

    if (
        languageSelect &&
        languageSelect.value
    ) {

        return languageSelect.value;

    }

    return "si";

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


// ========================================================
// SRT PARSER
// ========================================================

function parseSRT(
    srt
) {

    if (
        typeof srt !==
        "string"
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


    const subtitles =
        [];


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


            let numberIndex =
                0;


            while (
                numberIndex <
                    lines.length &&
                !lines[
                    numberIndex
                ].trim()
            ) {

                numberIndex++;

            }


            const number =
                parseInt(
                    lines[
                        numberIndex
                    ],
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


// ========================================================
// BUILD SRT
// ========================================================

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


// ========================================================
// DOWNLOAD TEXT FILE
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
// GET SUBTITLE BASE NAME
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
        item?.type ===
        "series"
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


// ========================================================
// DECODE SUBTITLE BYTES
// ========================================================

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
        // Continue
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


// ========================================================
// ZIP CHECK
// ========================================================

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


// ========================================================
// ESCAPE HTML
// ========================================================

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


// ========================================================
// ESCAPE ATTRIBUTE
// ========================================================

function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );

}


// ========================================================
// SLEEP
// ========================================================

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


// ========================================================
// DEBUG
// ========================================================

console.log(
    "SubLanka AI script loaded successfully."
);
