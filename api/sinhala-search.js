"use strict";

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const title = String(req.query.title || "").trim();
        const year = String(req.query.year || "").trim();
        const type = String(req.query.type || "movie").trim();

        if (!title) {
            return res.status(400).json({
                error: "Title is required"
            });
        }

        const API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
        const CX = process.env.GOOGLE_CSE_ID;

        if (!API_KEY || !CX) {
            return res.status(500).json({
                error: "Google CSE configuration missing"
            });
        }

        const cleanTitle = normalizeTitle(title);
        const requestedYear = extractYear(year);

        const sources = [
            {
                name: "Baiscope",
                domain: "baiscope.lk"
            },
            {
                name: "SinhalaSub",
                domain: "sinhalasub.lk"
            },
            {
                name: "Cineru",
                domain: "cineru.lk"
            }
        ];

        /*
         * Search all 3 Sinhala subtitle websites separately.
         */
        const searches = await Promise.all(
            sources.map(source =>
                searchGoogle({
                    apiKey: API_KEY,
                    cx: CX,
                    title: cleanTitle,
                    year: requestedYear,
                    domain: source.domain
                })
            )
        );

        const foundSources = [];

        for (let i = 0; i < searches.length; i++) {

            const source = sources[i];
            const items = searches[i];

            let bestMatch = null;

            for (const item of items) {

                if (!item || !item.link) {
                    continue;
                }

                const resultTitle =
                    String(item.title || "");

                const snippet =
                    String(item.snippet || "");

                const url =
                    String(item.link || "");

                /*
                 * Make sure this result actually belongs
                 * to the requested movie/show.
                 */
                if (
                    !isCorrectTitle(
                        cleanTitle,
                        resultTitle,
                        url
                    )
                ) {
                    continue;
                }

                /*
                 * Year check.
                 */
                if (
                    requestedYear &&
                    !isCorrectYear(
                        requestedYear,
                        resultTitle,
                        snippet,
                        url
                    )
                ) {
                    continue;
                }

                const score =
                    calculateScore(
                        cleanTitle,
                        requestedYear,
                        resultTitle,
                        snippet
                    );

                if (
                    !bestMatch ||
                    score > bestMatch.score
                ) {
                    bestMatch = {
                        source: source.name,
                        url,
                        title: resultTitle,
                        score
                    };
                }
            }

            if (bestMatch) {
                foundSources.push(bestMatch);
            }
        }

        return res.status(200).json({
            found: foundSources.length > 0,
            title,
            year: requestedYear,
            type,
            sources: foundSources,
            error: null
        });

    } catch (error) {

        console.error(
            "SINHALA SEARCH ERROR:",
            error
        );

        return res.status(500).json({
            found: false,
            sources: [],
            error:
                error.message ||
                "Sinhala subtitle search failed"
        });
    }
};


/* =====================================================
   GOOGLE SEARCH
===================================================== */

async function searchGoogle({
    apiKey,
    cx,
    title,
    year,
    domain
}) {

    const params = new URLSearchParams();

    params.set("key", apiKey);
    params.set("cx", cx);

    /*
     * Search for Sinhala subtitles.
     */
    params.set(
        "q",
        `"Sinhala subtitles"`
    );

    /*
     * Google exactTerms:
     * every result must contain this phrase.
     */
    params.set(
        "exactTerms",
        title
    );

    /*
     * Search only the current Sinhala subtitle website.
     */
    params.set(
        "siteSearch",
        domain
    );

    params.set(
        "siteSearchFilter",
        "i"
    );

    params.set(
        "num",
        "10"
    );

    /*
     * Add year as an extra search hint.
     */
    if (year) {
        params.set(
            "hq",
            year
        );
    }

    const url =
        "https://www.googleapis.com/customsearch/v1?" +
        params.toString();

    const response =
        await fetch(url);

    const data =
        await response.json();

    if (!response.ok) {

        console.error(
            "GOOGLE CSE ERROR:",
            data
        );

        return [];
    }

    return Array.isArray(data.items)
        ? data.items
        : [];
}


/* =====================================================
   TITLE MATCHING
===================================================== */

function isCorrectTitle(
    requested,
    googleTitle,
    url
) {

    const result =
        normalizeTitle(
            `${googleTitle} ${url}`
        );

    const requestedWords =
        requested
            .split(/\s+/)
            .filter(Boolean);

    const resultWords =
        result
            .split(/\s+/)
            .filter(Boolean);

    if (!requestedWords.length) {
        return false;
    }

    /*
     * Every requested title word must exist.
     */
    for (const word of requestedWords) {

        if (!resultWords.includes(word)) {
            return false;
        }
    }

    /*
     * Reject sequel numbers when the requested
     * title doesn't contain one.
     *
     * Example:
     *
     * Sonic the Hedgehog
     * ❌ Sonic the Hedgehog 2
     */
    if (!requested.match(/\b\d+\b/)) {

        const titlePart =
            normalizeTitle(
                googleTitle
            );

        const meaningful =
            titlePart
                .split(/\s+/)
                .filter(Boolean);

        const extraNumbers =
            meaningful.filter(word =>
                /^\d+$/.test(word)
            );

        if (extraNumbers.length > 0) {

            /*
             * A year is allowed.
             */
            const nonYearNumbers =
                extraNumbers.filter(
                    number =>
                        !/^(19|20)\d{2}$/.test(number)
                );

            if (nonYearNumbers.length > 0) {
                return false;
            }
        }
    }

    return true;
}


/* =====================================================
   YEAR MATCHING
===================================================== */

function isCorrectYear(
    requestedYear,
    title,
    snippet,
    url
) {

    const text =
        `${title} ${snippet} ${url}`;

    const years =
        text.match(
            /\b(19\d{2}|20\d{2})\b/g
        ) || [];

    /*
     * If the exact requested year appears,
     * accept it.
     */
    if (years.includes(requestedYear)) {
        return true;
    }

    /*
     * Some websites don't expose the year
     * in Google's result.
     *
     * Don't immediately reject a very strong
     * title match.
     */
    const normalized =
        normalizeTitle(title);

    const requestedYearless =
        normalized
            .replace(
                /\b(19\d{2}|20\d{2})\b/g,
                ""
            )
            .replace(/\s+/g, " ")
            .trim();

    return requestedYearless.length > 0;
}


/* =====================================================
   SCORE
===================================================== */

function calculateScore(
    requestedTitle,
    requestedYear,
    title,
    snippet
) {

    let score = 0;

    const normalizedResult =
        normalizeTitle(title);

    const normalizedRequested =
        normalizeTitle(requestedTitle);

    /*
     * Exact title phrase.
     */
    if (
        normalizedResult.includes(
            normalizedRequested
        )
    ) {
        score += 60;
    }

    /*
     * Requested year.
     */
    if (
        requestedYear &&
        `${title} ${snippet}`.includes(
            requestedYear
        )
    ) {
        score += 30;
    }

    /*
     * Sinhala subtitle keyword.
     */
    const lower =
        `${title} ${snippet}`.toLowerCase();

    if (
        lower.includes("sinhala subtitle") ||
        lower.includes("sinhala subtitles")
    ) {
        score += 10;
    }

    return score;
}


/* =====================================================
   NORMALIZE
===================================================== */

function normalizeTitle(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[’']/g, "")
        .replace(
            /[^\p{L}\p{N}\s]/gu,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}


/* =====================================================
   YEAR
===================================================== */

function extractYear(value) {

    const match =
        String(value || "").match(
            /\b(19\d{2}|20\d{2})\b/
        );

    return match
        ? match[1]
        : "";
}
