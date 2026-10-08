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
                error: "Google CSE environment variables missing"
            });
        }

        const cleanTitle = normalizeTitle(title);
        const requestedYear = extractYear(year);

        const sourceList = [
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

        const allResults = [];

        // Search each source separately
        for (const source of sourceList) {

            const googleResults = await googleSearch({
                apiKey: API_KEY,
                cx: CX,
                title: cleanTitle,
                year: requestedYear,
                domain: source.domain
            });

            for (const item of googleResults) {

                if (!item || !item.link) {
                    continue;
                }

                const resultTitle =
                    String(item.title || "");

                const snippet =
                    String(item.snippet || "");

                const url =
                    String(item.link || "");

                // Make sure URL really belongs to this source
                let parsedUrl;

                try {
                    parsedUrl = new URL(url);
                } catch {
                    continue;
                }

                if (
                    !parsedUrl.hostname
                        .toLowerCase()
                        .includes(source.domain)
                ) {
                    continue;
                }

                // Check title
                const titleScore =
                    getTitleScore(
                        cleanTitle,
                        resultTitle,
                        url
                    );

                if (titleScore < 60) {
                    continue;
                }

                // Check year
                const yearScore =
                    getYearScore(
                        requestedYear,
                        resultTitle,
                        snippet,
                        url
                    );

                /*
                 * If a year was supplied, reject a clearly
                 * different year.
                 */
                if (requestedYear && yearScore === -100) {
                    continue;
                }

                const score =
                    titleScore +
                    Math.max(0, yearScore);

                allResults.push({
                    source: source.name,
                    url,
                    title: resultTitle,
                    score
                });
            }
        }

        // Best result per source
        const bestBySource = {};

        for (const result of allResults) {

            if (
                !bestBySource[result.source] ||
                result.score >
                    bestBySource[result.source].score
            ) {
                bestBySource[result.source] = result;
            }
        }

        const sources =
            Object.values(bestBySource)
                .sort((a, b) => b.score - a.score);

        return res.status(200).json({
            found: sources.length > 0,
            title,
            year: requestedYear,
            type,
            sources,
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
   GOOGLE CSE SEARCH
===================================================== */

async function googleSearch({
    apiKey,
    cx,
    title,
    year,
    domain
}) {

    /*
     * IMPORTANT:
     * Don't use exactTerms/siteSearch/hq here.
     *
     * Put everything inside the normal Google query.
     */
    let query =
        `"${title}" Sinhala subtitles`;

    if (year) {
        query += ` ${year}`;
    }

    query += ` site:${domain}`;

    const params = new URLSearchParams();

    params.set("key", apiKey);
    params.set("cx", cx);
    params.set("q", query);
    params.set("num", "10");

    const apiUrl =
        "https://www.googleapis.com/customsearch/v1?" +
        params.toString();

    console.log(
        "GOOGLE SEARCH:",
        query
    );

    const response =
        await fetch(apiUrl);

    const data =
        await response.json();

    if (!response.ok) {

        console.error(
            "GOOGLE ERROR:",
            data
        );

        return [];
    }

    return Array.isArray(data.items)
        ? data.items
        : [];
}


/* =====================================================
   TITLE SCORE
===================================================== */

function getTitleScore(
    requestedTitle,
    resultTitle,
    url
) {

    const requested =
        normalizeTitle(requestedTitle);

    const result =
        normalizeTitle(
            `${resultTitle} ${url}`
        );

    if (!requested || !result) {
        return 0;
    }

    // Exact phrase
    if (result.includes(requested)) {
        return 100;
    }

    const requestedWords =
        requested
            .split(/\s+/)
            .filter(Boolean);

    const resultWords =
        result
            .split(/\s+/)
            .filter(Boolean);

    if (!requestedWords.length) {
        return 0;
    }

    let matched = 0;

    for (const word of requestedWords) {

        if (resultWords.includes(word)) {
            matched++;
        }
    }

    const percentage =
        matched / requestedWords.length;

    if (percentage === 1) {
        return 90;
    }

    if (percentage >= 0.8) {
        return 75;
    }

    if (percentage >= 0.6) {
        return 60;
    }

    return 0;
}


/* =====================================================
   YEAR SCORE
===================================================== */

function getYearScore(
    requestedYear,
    title,
    snippet,
    url
) {

    if (!requestedYear) {
        return 0;
    }

    const text =
        `${title} ${snippet} ${url}`;

    const years =
        text.match(
            /\b(19\d{2}|20\d{2})\b/g
        ) || [];

    const uniqueYears =
        [...new Set(years)];

    // Correct year
    if (uniqueYears.includes(requestedYear)) {
        return 40;
    }

    /*
     * If another movie year is clearly present,
     * reject it.
     */
    if (uniqueYears.length > 0) {
        return -100;
    }

    /*
     * Google result didn't expose a year.
     * Don't reject automatically.
     */
    return 0;
}


/* =====================================================
   NORMALIZE TITLE
===================================================== */

function normalizeTitle(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[’']/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
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
