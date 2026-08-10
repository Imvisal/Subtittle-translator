"use strict";

/* =========================================================
   SubLanka AI
   Search + TV Episodes
   SubDL + SRT Upload + Translation + Download
========================================================= */


/* =========================================================
   DOM
========================================================= */

const searchInput =
    document.getElementById("searchInput");

const searchBtn =
    document.getElementById("searchBtn");

const searchStatus =
    document.getElementById("searchStatus");

const searchResults =
    document.getElementById("searchResults");

const subtitleFile =
    document.getElementById("subtitleFile");

const fileName =
    document.getElementById("fileName");

const language =
    document.getElementById("language");

const translateBtn =
    document.getElementById("translateBtn");

const preview =
    document.getElementById("preview");

const downloadBtn =
    document.getElementById("downloadBtn");

const progressContainer =
    document.getElementById("progressContainer");

const progressText =
    document.getElementById("progressText");

const progressPercent =
    document.getElementById("progressPercent");

const progressFill =
    document.getElementById("progressFill");


/* =========================================================
   STATE
========================================================= */

let uploadedSubtitles = [];

let uploadedFileName =
    "subtitle";

let translatedSRT =
    "";

let selectedMovie =
    null;

let isTranslating =
    false;


/* =========================================================
   INITIAL STATE
========================================================= */

if (progressContainer) {

    progressContainer.style.display =
        "none";
}


if (translateBtn) {

    translateBtn.disabled =
        true;
}


if (downloadBtn) {

    downloadBtn.disabled =
        true;
}


/* =========================================================
   FILE UPLOAD
========================================================= */

if (subtitleFile) {

    subtitleFile.addEventListener(
        "change",
        handleFileUpload
    );
}


async function handleFileUpload(event) {

    const file =
        event.target.files?.[0];


    if (!file) {

        uploadedSubtitles = [];

        uploadedFileName =
            "subtitle";


        if (fileName) {

            fileName.textContent =
                "No file selected";
        }


        if (preview) {

            preview.value =
                "";
        }


        if (translateBtn) {

            translateBtn.disabled =
                true;
        }


        if (downloadBtn) {

            downloadBtn.disabled =
                true;
        }


        return;
    }


    if (
        !file.name
            .toLowerCase()
            .endsWith(".srt")
    ) {

        alert(
            "Please select an .srt subtitle file."
        );


        subtitleFile.value =
            "";


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


        const subtitles =
            parseSRT(text);


        if (!subtitles.length) {

            alert(
                "This SRT file could not be read."
            );


            return;
        }


        uploadedSubtitles =
            subtitles;


        translatedSRT =
            "";


        if (preview) {

            preview.value =
                text;
        }


        if (translateBtn) {

            translateBtn.disabled =
                false;
        }


        if (downloadBtn) {

            downloadBtn.disabled =
                true;
        }


        setSearchStatus(
            `${subtitles.length} subtitle entries loaded.`
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
   SEARCH BUTTON
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
        event => {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                searchMovies();
            }
        }
    );
}


/* =========================================================
   SEARCH MOVIES / TV
========================================================= */

async function searchMovies() {

    const query =
        searchInput
            ? searchInput.value.trim()
            : "";


    if (!query) {

        setSearchStatus(
            "Enter a movie or TV series name."
        );


        return;
    }


    setSearchLoading(
        true
    );


    setSearchStatus(
        "Searching movies and TV series..."
    );


    if (searchResults) {

        searchResults.innerHTML = `

            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                <h3>
                    Searching...
                </h3>

                <p>
                    Finding movies and TV series
                </p>

                <div class="loading-dots">

                    <span></span>
                    <span></span>
                    <span></span>

                </div>

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

            setSearchStatus(
                "No movies or TV series found."
            );


            if (searchResults) {

                searchResults.innerHTML = `

                    <div class="search-empty">

                        <div class="empty-icon">
                            🔎
                        </div>

                        <h3>
                            No results found
                        </h3>

                        <p>
                            Try another movie or TV series name.
                        </p>

                    </div>

                `;
            }


            return;
        }


        setSearchStatus(
            `${results.length} results found`
        );


        displaySearchResults(
            results
        );


    } catch (error) {

        console.error(
            "SEARCH ERROR:",
            error
        );


        setSearchStatus(
            error.message ||
            "Search failed."
        );


        if (searchResults) {

            searchResults.innerHTML = `

                <div class="search-empty error">

                    <div class="empty-icon">
                        ❌
                    </div>

                    <h3>
                        Search failed
                    </h3>

                    <p>
                        ${escapeHTML(
                            error.message
                        )}
                    </p>

                </div>

            `;
        }


    } finally {

        setSearchLoading(
            false
        );
    }
}


/* =========================================================
   SEARCH LOADING
========================================================= */

function setSearchLoading(
    loading
) {

    if (!searchBtn) {

        return;
    }


    if (loading) {

        searchBtn.disabled =
            true;


        if (
            !searchBtn.dataset.originalText
        ) {

            searchBtn.dataset.originalText =
                searchBtn.innerHTML;
        }


        searchBtn.innerHTML = `

            <span class="search-spinner"></span>

            <span>
                Searching...
            </span>

        `;


        searchBtn.classList.add(
            "search-loading"
        );


    } else {

        searchBtn.disabled =
            false;


        searchBtn.innerHTML =
            searchBtn.dataset.originalText ||
            "🔍 Search";


        searchBtn.classList.remove(
            "search-loading"
        );
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


    searchResults.innerHTML =
        "";


    results
        .slice(0, 20)
        .forEach(
            (item, index) => {

                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "search-result-card";


                card.style.animationDelay =
                    `${index * 0.06}s`;


                const type =
                    item.type === "series"
                        ? "📺 TV Series"
                        : "🎬 Movie";


                card.innerHTML = `

                    <div class="result-info">

                        <h3>
                            ${escapeHTML(
                                item.title || ""
                            )}
                        </h3>


                        <div class="result-meta">

                            <span>
                                ${type}
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

                    </div>

                `;


                const button =
                    card.querySelector(
                        ".select-title-btn"
                    );


                if (button) {

                    button.addEventListener(
                        "click",
                        () => {

                            selectMovie(
                                item
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
   SELECT MOVIE / TV
========================================================= */

function selectMovie(
    item
) {

    selectedMovie =
        item;


    if (!item.imdbID) {

        alert(
            "IMDb ID is missing."
        );


        return;
    }


    setSearchStatus(
        `Selected: ${item.title}`
    );


    /*
       MOVIE
       Directly search subtitles
    */

    if (
        item.type === "movie"
    ) {

        searchSubtitles(
            item,
            "movie"
        );


        return;
    }


    /*
       TV SERIES
       Show season / episode selector
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
   TV EPISODE SELECTOR
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
        () => {

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
                season < 1 ||
                episode < 1
            ) {

                setSearchStatus(
                    "Enter a valid season and episode."
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
   SUBTITLE SEARCH
========================================================= */

async function searchSubtitles(
    item,
    type,
    season = null,
    episode = null
) {

    setSearchStatus(
        "Finding English subtitles..."
    );


    if (searchResults) {

        searchResults.innerHTML = `

            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                <h3>
                    Finding English subtitles
                </h3>

                <p>
                    Searching SubDL...
                </p>

                <div class="loading-dots">

                    <span></span>
                    <span></span>
                    <span></span>

                </div>

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

            setSearchStatus(
                ""
            );


            if (searchResults) {

                searchResults.innerHTML = `

                    <div class="search-empty">

                        <div class="empty-icon">
                            😕
                        </div>

                        <h3>
                            No English subtitles found
                        </h3>

                        <p>
                            Try another release or episode.
                        </p>

                    </div>

                `;
            }


            return;
        }


        setSearchStatus(
            `${results.length} English subtitles found`
        );


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


        setSearchStatus(
            "Subtitle search failed."
        );


        if (searchResults) {

            searchResults.innerHTML = `

                <div class="search-empty error">

                    <div class="empty-icon">
                        ❌
                    </div>

                    <h3>
                        Subtitle search failed
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
   DISPLAY SUBTITLES
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


    searchResults.innerHTML = `

        <div class="subtitle-results-title">

            <h3>
                🇬🇧 English Subtitles
            </h3>

            <span>
                ${results.length} found
            </span>

        </div>

    `;


    results
        .slice(0, 15)
        .forEach(
            (subtitle, index) => {

                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "search-result-card subtitle-card";


                card.style.animationDelay =
                    `${index * 0.06}s`;


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


                            ${
                                subtitle.fps
                                    ? `
                                        <span>
                                            ${escapeHTML(
                                                String(
                                                    subtitle.fps
                                                )
                                            )}
                                            FPS
                                        </span>
                                    `
                                    : ""
                            }

                        </div>


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
                        () => {

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
   DOWNLOAD / LOAD SUBTITLE
========================================================= */

async function selectSubtitle(
    subtitle,
    item,
    season,
    episode
) {

    let subtitleUrl =
        subtitle.downloadUrl ||
        subtitle.url ||
        subtitle.download_url;


    if (!subtitleUrl) {

        alert(
            "Subtitle download URL is missing."
        );


        return;
    }


    if (
        subtitleUrl.startsWith("/")
    ) {

        subtitleUrl =
            "https://dl.subdl.com" +
            subtitleUrl;
    }


    setSearchStatus(
        "Downloading English subtitle..."
    );


    if (searchResults) {

        searchResults.innerHTML = `

            <div class="subtitle-loading">

                <div class="big-spinner"></div>

                <h3>
                    Downloading subtitle
                </h3>

                <p>
                    Please wait...
                </p>

                <div class="loading-dots">

                    <span></span>
                    <span></span>
                    <span></span>

                </div>

            </div>

        `;
    }


    try {

        const response =
            await fetch(
                `/api/subtitle-download?url=${encodeURIComponent(
                    subtitleUrl
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
                "Downloaded subtitle is not a valid SRT file."
            );
        }


        if (preview) {

            preview.value =
                englishSRT;
        }


        if (fileName) {

            fileName.textContent =
                subtitle.fileName ||
                data.fileName ||
                "Downloaded subtitle";
        }


        uploadedSubtitles =
            subtitles;


        uploadedFileName =
            (
                subtitle.fileName ||
                data.fileName ||
                "subtitle.srt"
            ).replace(
                /\.srt$/i,
                ""
            );


        translatedSRT =
            "";


        if (translateBtn) {

            translateBtn.disabled =
                false;
        }


        if (downloadBtn) {

            downloadBtn.disabled =
                true;
        }


        setSearchStatus(
            "English subtitle loaded successfully."
        );


        if (searchResults) {

            searchResults.innerHTML = `

                <div class="subtitle-loaded">

                    <div class="success-icon">
                        ✓
                    </div>

                    <h3>
                        English subtitle loaded
                    </h3>

                    <p>
                        ${subtitles.length}
                        subtitle entries ready.
                    </p>

                    <button
                        type="button"
                        id="translateSearchSubtitle"
                        class="select-title-btn"
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


        if (translateSearchSubtitle) {

            translateSearchSubtitle.addEventListener(
                "click",
                translateUploadedSubtitle
            );
        }


        if (preview) {

            preview.scrollIntoView({

                behavior: "smooth",

                block: "center"

            });
        }


    } catch (error) {

        console.error(
            "SUBTITLE DOWNLOAD ERROR:",
            error
        );


        setSearchStatus(
            "Subtitle download failed."
        );


        if (searchResults) {

            searchResults.innerHTML = `

                <div class="search-empty error">

                    <div class="empty-icon">
                        ❌
                    </div>

                    <h3>
                        Subtitle download failed
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
   TRANSLATE BUTTON
========================================================= */

if (translateBtn) {

    translateBtn.addEventListener(
        "click",
        translateUploadedSubtitle
    );
}


async function translateUploadedSubtitle() {

    if (isTranslating) {

        return;
    }


    if (
        !uploadedSubtitles.length &&
        preview &&
        preview.value.trim()
    ) {

        uploadedSubtitles =
            parseSRT(
                preview.value
            );
    }


    if (!uploadedSubtitles.length) {

        alert(
            "Please upload or select an SRT subtitle first."
        );


        return;
    }


    isTranslating =
        true;


    if (translateBtn) {

        translateBtn.disabled =
            true;


        translateBtn.innerHTML = `

            <span>
                ⏳ Translating...
            </span>

        `;
    }


    showProgress(
        "Starting translation...",
        0
    );


    try {

        const translated =
            await translateSubtitleChunks(
                uploadedSubtitles
            );


        translatedSRT =
            buildSRT(
                translated
            );


        if (preview) {

            preview.value =
                translatedSRT;
        }


        if (downloadBtn) {

            downloadBtn.disabled =
                false;
        }


        setProgress(
            "Translation completed",
            100
        );


        const filename =
            `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


        downloadTextFile(
            translatedSRT,
            filename
        );


        setTimeout(
            hideProgress,
            1500
        );


    } catch (error) {

        console.error(
            "TRANSLATION ERROR:",
            error
        );


        hideProgress();


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


            translateBtn.innerHTML = `

                <span class="translate-icon">
                    ✨
                </span>

                <span>
                    Translate Subtitle
                </span>

            `;
        }
    }
}


/* =========================================================
   TRANSLATION CHUNKS
========================================================= */

async function translateSubtitleChunks(
    subtitles
) {

    const CHUNK_SIZE =
        20;


    const total =
        subtitles.length;


    const translated =
        [];


    for (
        let start = 0;
        start < total;
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


        const totalChunks =
            Math.ceil(
                total / CHUNK_SIZE
            );


        setProgress(

            `Translating ${chunkNumber}/${totalChunks}...`,

            Math.round(
                (start / total) * 100
            )
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
                                        language?.value ||
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
                        "Translation server returned invalid JSON."
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
                    `Translation attempt ${attempt} failed:`,
                    error
                );


                if (
                    attempt < 3
                ) {

                    await sleep(
                        attempt === 1
                            ? 2500
                            : 5000
                    );
                }
            }
        }


        if (!success) {

            throw new Error(
                `Translation chunk ${chunkNumber} failed: ${
                    lastError?.message ||
                    "Unknown error"
                }`
            );
        }


        const completed =
            translated.length;


        setProgress(

            `Translated ${completed}/${total}`,

            Math.round(
                (completed / total) * 100
            )
        );


        if (
            start + CHUNK_SIZE <
            total
        ) {

            await sleep(
                1000
            );
        }
    }


    return translated;
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

            const number =
                Number(
                    sub.number ??
                    sub.index
                );


            if (
                Number.isInteger(
                    number
                )
            ) {

                map.set(
                    number,
                    sub.text
                );
            }
        }
    );


    return original.map(
        sub => {

            const text =
                map.get(
                    sub.number
                );


            return {

                number:
                    sub.number,

                timestamp:
                    sub.timestamp,

                text:
                    typeof text === "string" &&
                    text.trim()
                        ? text.trim()
                        : sub.text

            };
        }
    );
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


    const subtitles =
        [];


    blocks.forEach(
        block => {

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
                    lines[0].trim(),
                    10
                );


            const timestamp =
                lines[1]?.trim();


            if (
                Number.isNaN(number) ||
                !timestamp ||
                !timestamp.includes("-->")
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

                timestamp,

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
            sub => {

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


    const a =
        document.createElement(
            "a"
        );


    a.href =
        url;


    a.download =
        filename;


    document.body.appendChild(
        a
    );


    a.click();


    a.remove();


    setTimeout(
        () => {

            URL.revokeObjectURL(
                url
            );

        },
        1000
    );
}


/* =========================================================
   DOWNLOAD BUTTON
========================================================= */

if (downloadBtn) {

    downloadBtn.addEventListener(
        "click",
        () => {

            if (!translatedSRT) {

                alert(
                    "Translate the subtitle first."
                );


                return;
            }


            const filename =
                `${uploadedFileName}.Sinhala.SubLankaAI.srt`;


            downloadTextFile(
                translatedSRT,
                filename
            );
        }
    );
}


/* =========================================================
   PROGRESS
========================================================= */

function showProgress(
    text,
    percent
) {

    if (!progressContainer) {

        return;
    }


    progressContainer.style.display =
        "block";


    setProgress(
        text,
        percent
    );
}


function setProgress(
    text,
    percent
) {

    if (progressText) {

        progressText.textContent =
            text;
    }


    if (progressPercent) {

        progressPercent.textContent =
            `${percent}%`;
    }


    if (progressFill) {

        progressFill.style.width =
            `${percent}%`;
    }
}


function hideProgress() {

    if (progressContainer) {

        progressContainer.style.display =
            "none";
    }
}


/* =========================================================
   SEARCH STATUS
========================================================= */

function setSearchStatus(
    text
) {

    if (searchStatus) {

        searchStatus.textContent =
            text;
    }
}


/* =========================================================
   DECODE SUBTITLE
========================================================= */

function decodeSubtitleBytes(
    bytes
) {

    try {

        const utf8 =
            new TextDecoder(
                "utf-8"
            ).decode(
                bytes
            );


        if (
            utf8.includes(
                "-->"
            )
        ) {

            return utf8;
        }

    } catch {
        // fallback
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
   HTML ESCAPE
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
   SLEEP
========================================================= */

function sleep(
    ms
) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


/* =========================================================
   READY
========================================================= */

console.log(
    "SubLanka AI loaded successfully."
);
