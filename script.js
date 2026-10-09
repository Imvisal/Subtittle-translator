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

// Place progress bar directly below the upload area.
const uploadArea =
    fileInput?.closest(".upload-section") ||
    fileInput?.closest(".upload-area") ||
    fileInput?.closest(".upload-container") ||
    fileInput?.parentElement?.parentElement;

if (uploadArea) {
    uploadArea.insertAdjacentElement("afterend", container);
} else if (translateBtn?.parentElement) {
    translateBtn.parentElement.insertBefore(
        container,
        translateBtn
    );
} else {
    document.body.appendChild(container);
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

function showSRTPreview(subtitles) {

    if (!subtitlePreview) {
        return;
    }

    subtitlePreview.textContent =
        buildSRT(subtitles);

}


// ========================================================
// TRANSLATE UPLOADED SRT WITH PROGRESS BAR
// ========================================================

async function translateUploadedSubtitle() {

    if (isTranslating) return;

    if (!uploadedSubtitles || !uploadedSubtitles.length) {
        alert("Please select an SRT file first.");
        return;
    }

    isTranslating = true;

    if (translateBtn) {
        translateBtn.disabled = true;
        translateBtn.textContent = "Translating...";
    }

    // Find the upload area using the file input.
const uploadArea =
    fileInput?.closest("section") ||
    fileInput?.closest(".upload-card") ||
    fileInput?.closest(".upload-section") ||
    fileInput?.closest(".upload-area");

if (uploadArea) {
    uploadArea.insertAdjacentElement("afterend", container);
} else {
    // Fallback: place it before the language selector.
    const languageElement =
        languageSelect?.closest("section") ||
        languageSelect?.parentElement?.parentElement;

    if (languageElement) {
        languageElement.insertAdjacentElement("beforebegin", container);
    } else if (translateBtn?.parentElement) {
        translateBtn.parentElement.insertBefore(container, translateBtn);
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

                            body:
                                JSON.stringify({

                                    subtitles:
                                        chunk,

                                    language:
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
// UPDATE TRANSLATION PROGRESS AND PERCENTAGE
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

    // Existing movie/TV translation progress.
    const autoProgress = document.getElementById(
        "autoTranslateProgress"
    );

    const autoStatus = document.getElementById(
        "autoTranslateStatus"
    );

    const autoPercent = document.getElementById(
        "autoTranslatePercent"
    );

    if (autoProgress) {
        autoProgress.style.width = `${percent}%`;
    }

    if (autoPercent) {
        autoPercent.textContent = `${percent}%`;
    }

    if (autoStatus) {
        autoStatus.textContent =
            `Translated ${completed}/${total} subtitles — chunk ${chunkNumber}/${totalChunks} (${percent}%)`;
    }

    // Uploaded SRT translation progress.
    const uploadProgress = document.getElementById(
        "uploadTranslateFill"
    );

    const uploadPercent = document.getElementById(
        "uploadTranslatePercent"
    );

    const uploadStatus = document.getElementById(
        "uploadTranslateStatus"
    );

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
