// api/sinhala-search.js

const SOURCES = {
    Baiscope: "baiscope.lk",
    SinhalaSub: "sinhalasub.lk",
    Cineru: "cineru.lk"
};

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\b(the|a|an|movie|film)\b/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titleScore(resultText, wantedTitle) {
    const found = normalizeTitle(resultText);
    const wanted = normalizeTitle(wantedTitle);

    if (!found || !wanted) return 0;

    if (found === wanted) return 1;

    if (found.includes(wanted)) return 0.95;

    const wantedWords = wanted
        .split(" ")
        .filter(word => word.length >= 2);

    if (!wantedWords.length) return 0;

    let matched = 0;

    for (const word of wantedWords) {
        if (found.includes(word)) {
            matched++;
        }
    }

    return matched / wantedWords.length;
}

function getSourceFromUrl(url = "") {
    try {
        const hostname = new URL(url).hostname
            .toLowerCase()
            .replace(/^www\./, "");

        for (const [source, domain] of Object.entries(SOURCES)) {
            if (
                hostname === domain ||
                hostname.endsWith("." + domain)
            ) {
                return {
                    source,
                    domain
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}

function looksLikeSinhalaSubtitle(result) {
    const text = `
        ${result.title || ""}
        ${result.snippet || ""}
        ${result.link || ""}
    `.toLowerCase();

    return (
        text.includes("sinhala") ||
        text.includes("subtitle") ||
        text.includes("subtitles") ||
        text.includes("සිංහල") ||
        text.includes("උපසිරසි") ||
        text.includes("උපසිරැසි")
    );
}

async function googleSearch(query) {
    const apiKey =
        process.env.GOOGLE_SEARCH_API_KEY;

    const cseId =
        process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cseId) {
        throw new Error(
            "Google Search API environment variables are missing"
        );
    }

    const url =
        "https://www.googleapis.com/customsearch/v1" +
        "?key=" + encodeURIComponent(apiKey) +
        "&cx=" + encodeURIComponent(cseId) +
        "&q=" + encodeURIComponent(query) +
        "&num=10" +
        "&hl=en" +
        "&gl=lk";

    const response = await fetch(url);

    const data = await response.json();

    if (!response.ok) {
        console.error(
            "Google Search API error:",
            data
        );

        throw new Error(
            data?.error?.message ||
            "Google Search API request failed"
        );
    }

    return Array.isArray(data.items)
        ? data.items
        : [];
}

async function findSinhalaSubtitles({
    title,
    year,
    type
}) {
    /*
     * First search:
     *
     * "Sonic the Hedgehog" "Sinhala subtitle"
     */
    let results = await googleSearch(
        `"${title}" "Sinhala subtitle"`
    );

    /*
     * If Google doesn't return anything,
     * try a second broader search.
     */
    if (!results.length) {
        results = await googleSearch(
            `"${title}" Sinhala`
        );
    }

    const found = [];

    for (const result of results) {

        const sourceInfo =
            getSourceFromUrl(result.link);

        // Ignore sites outside our 3 sources
        if (!sourceInfo) {
            continue;
        }

        // Must look like a subtitle result
        if (!looksLikeSinhalaSubtitle(result)) {
            continue;
        }

        const combinedText = `
            ${result.title || ""}
            ${result.snippet || ""}
        `;

        const score =
            titleScore(
                combinedText,
                title
            );

        /*
         * Require a strong title match.
         *
         * This prevents:
         * Sonic Drone Home
         *
         * from being accepted for:
         * Sonic the Hedgehog
         */
        if (score < 0.75) {
            continue;
        }

        /*
         * If year is available and Google result
         * contains another year, reject it.
         */
        if (year) {

            const years =
                combinedText.match(
                    /\b(19|20)\d{2}\b/g
                ) || [];

            const differentYear =
                years.some(
                    foundYear =>
                        foundYear !== String(year)
                );

            if (
                differentYear &&
                !combinedText.includes(String(year))
            ) {
                continue;
            }
        }

        found.push({
            source: sourceInfo.source,
            url: result.link,
            title:
                result.title ||
                title,
            snippet:
                result.snippet || "",
            type,
            score
        });
    }

    /*
     * Keep only the best result from each source.
     */
    const bestBySource = {};

    for (const item of found) {

        const current =
            bestBySource[item.source];

        if (
            !current ||
            item.score > current.score
        ) {
            bestBySource[item.source] = item;
        }
    }

    return Object.values(bestBySource);
}

module.exports = async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const title =
        String(
            req.query.title || ""
        ).trim();

    const year =
        String(
            req.query.year || ""
        ).trim();

    const type =
        String(
            req.query.type || "movie"
        ).toLowerCase();

    if (!title) {
        return res.status(400).json({
            found: false,
            sources: [],
            error: "Title is required"
        });
    }

    try {

        const sources =
            await findSinhalaSubtitles({
                title,
                year,
                type
            });

        return res.status(200).json({
            found: sources.length > 0,
            title,
            year,
            type,
            sources
        });

    } catch (error) {

        console.error(
            "Sinhala subtitle search error:",
            error
        );

        return res.status(500).json({
    found: false,
    title,
    year,
    type,
    sources: [],
    error: error.message,
    details: String(error)
});
    }
};
