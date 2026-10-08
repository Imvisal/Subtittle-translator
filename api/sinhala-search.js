"use strict";

/*
========================================================
SubLanka AI
Exact Sinhala Subtitle Search
========================================================

Checks the exact movie / TV title separately.

Sources:
- Baiscope
- SinhalaSub
- Cineru

Important:
- Does NOT return the same Sinhala page for every result
- Checks title + year
- Rejects unrelated titles
========================================================
*/


module.exports = async function handler(req, res) {

    try {

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
            ).trim();


        if (!title) {

            return res.status(400).json({
                error: "Title is required"
            });

        }


        const GOOGLE_API_KEY =
            process.env.GOOGLE_SEARCH_API_KEY;


        const GOOGLE_CSE_ID =
            process.env.GOOGLE_CSE_ID;


        if (
            !GOOGLE_API_KEY ||
            !GOOGLE_CSE_ID
        ) {

            return res.status(500).json({
                error:
                    "Google Search API is not configured."
            });

        }


        // ====================================================
        // CLEAN TITLE
        // ====================================================

        const cleanTitle =
            normalizeTitle(title);


        if (!cleanTitle) {

            return res.status(200).json({

                found: false,

                title,

                year,

                type,

                sources: []

            });

        }


        // ====================================================
        // YEAR
        // ====================================================

        const releaseYear =
            extractFirstYear(year);


        // ====================================================
        // SEARCH GOOGLE CSE
        // ====================================================

        const queryParts = [

            `"${title}"`,

            releaseYear
                ? `"${releaseYear}"`
                : "",

            `"Sinhala subtitles"`

        ].filter(Boolean);


        const query =
            queryParts.join(" ");


        const url =
            new URL(
                "https://www.googleapis.com/customsearch/v1"
            );


        url.searchParams.set(
            "key",
            GOOGLE_API_KEY
        );


        url.searchParams.set(
            "cx",
            GOOGLE_CSE_ID
        );


        url.searchParams.set(
            "q",
            query
        );


        url.searchParams.set(
            "num",
            "10"
        );


        url.searchParams.set(
            "safe",
            "active"
        );


        const response =
            await fetch(
                url.toString()
            );


        const data =
            await response.json();


        if (!response.ok) {

            console.error(
                "GOOGLE CSE ERROR:",
                data
            );


            return res.status(
                response.status
            ).json({

                error:
                    data?.error?.message ||
                    "Google subtitle search failed."

            });

        }


        const items =
            Array.isArray(data.items)
                ? data.items
                : [];


        // ====================================================
        // SOURCE DEFINITIONS
        // ====================================================

        const sourceRules = [

            {
                name: "Baiscope",

                hosts: [
                    "baiscope.lk",
                    "www.baiscope.lk"
                ]

            },

            {
                name: "SinhalaSub",

                hosts: [
                    "sinhalasub.lk",
                    "www.sinhalasub.lk"
                ]

            },

            {
                name: "Cineru",

                hosts: [
                    "cineru.lk",
                    "www.cineru.lk"
                ]

            }

        ];


        const foundSources = [];


        // ====================================================
        // CHECK EVERY GOOGLE RESULT
        // ====================================================

        for (
            const item of items
        ) {

            if (
                !item ||
                !item.link
            ) {
                continue;
            }


            const resultUrl =
                item.link;


            let hostname = "";


            try {

                hostname =
                    new URL(
                        resultUrl
                    )
                        .hostname
                        .toLowerCase();

            } catch {

                continue;

            }


            // Find source

            const sourceRule =
                sourceRules.find(
                    rule =>
                        rule.hosts.some(
                            host =>
                                hostname === host ||
                                hostname.endsWith(
                                    "." + host
                                )
                        )
                );


            if (!sourceRule) {
                continue;
            }


            // =================================================
            // RESULT TEXT
            // =================================================

            const resultTitle =
                String(
                    item.title || ""
                );


            const snippet =
                String(
                    item.snippet || ""
                );


            const resultText =
                `${resultTitle} ${snippet}`;


            // =================================================
            // EXACT TITLE MATCH
            // =================================================

            const titleScore =
                calculateTitleScore(
                    cleanTitle,
                    resultTitle,
                    resultText
                );


            // =================================================
            // YEAR MATCH
            // =================================================

            const yearScore =
                calculateYearScore(
                    releaseYear,
                    resultText,
                    resultUrl
                );


            // =================================================
            // TOTAL SCORE
            // =================================================

            const score =
                titleScore +
                yearScore;


            console.log(
                "SINHALA MATCH:",
                {
                    requestedTitle:
                        title,

                    requestedYear:
                        releaseYear,

                    resultTitle,

                    resultUrl,

                    titleScore,

                    yearScore,

                    score
                }
            );


            // =================================================
            // STRICT MATCH
            // =================================================

            if (
                score < 75
            ) {

                continue;

            }


            // Avoid duplicate source

            const alreadyFound =
                foundSources.some(
                    source =>
                        source.source ===
                        sourceRule.name
                );


            if (alreadyFound) {
                continue;
            }


            foundSources.push({

                source:
                    sourceRule.name,

                url:
                    resultUrl,

                title:
                    resultTitle,

                score:
                    score

            });

        }


        // ====================================================
        // SORT
        // ====================================================

        foundSources.sort(
            (a, b) =>
                b.score - a.score
        );


        // ====================================================
        // RESPONSE
        // ====================================================

        return res.status(200).json({

            found:
                foundSources.length > 0,

            title:
                title,

            year:
                year,

            type:
                type,

            sources:
                foundSources.slice(
                    0,
                    3
                ),

            error:
                null

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
                "Sinhala subtitle search failed."

        });

    }

};


// ========================================================
// NORMALIZE TITLE
// ========================================================

function normalizeTitle(value) {

    return String(
        value || ""
    )
        .toLowerCase()

        .replace(
            /&/g,
            "and"
        )

        .replace(
            /[^\p{L}\p{N}\s]/gu,
            " "
        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();

}


// ========================================================
// EXTRACT FIRST YEAR
// ========================================================

function extractFirstYear(value) {

    const match =
        String(
            value || ""
        ).match(
            /\b(19|20)\d{2}\b/
        );


    return match
        ? match[0]
        : "";

}


// ========================================================
// TITLE SCORE
// ========================================================

function calculateTitleScore(
    requestedTitle,
    resultTitle,
    resultText
) {

    const requested =
        normalizeTitle(
            requestedTitle
        );


    const result =
        normalizeTitle(
            resultTitle
        );


    const text =
        normalizeTitle(
            resultText
        );


    if (!requested) {
        return 0;
    }


    // Exact full title

    if (
        result === requested
    ) {

        return 100;

    }


    // Result title starts with requested title

    if (
        result.startsWith(
            requested + " "
        )
    ) {

        return 85;

    }


    // Result contains exact requested phrase

    if (
        result.includes(
            requested
        )
    ) {

        return 75;

    }


    // Check individual words

    const words =
        requested
            .split(" ")
            .filter(
                word =>
                    word.length >= 2
            );


    if (!words.length) {
        return 0;
    }


    let matched = 0;


    for (
        const word of words
    ) {

        if (
            text.includes(
                word
            )
        ) {

            matched++;

        }

    }


    const ratio =
        matched /
        words.length;


    if (
        ratio === 1
    ) {

        return 65;

    }


    if (
        ratio >= 0.8
    ) {

        return 50;

    }


    return 0;

}


// ========================================================
// YEAR SCORE
// ========================================================

function calculateYearScore(
    year,
    resultText,
    resultUrl
) {

    if (!year) {

        return 15;

    }


    const text =
        `${resultText} ${resultUrl}`;


    const years =
        text.match(
            /\b(19|20)\d{2}\b/g
        ) || [];


    if (
        years.includes(
            year
        )
    ) {

        return 25;

    }


    // For TV series such as 2003-2006,
    // allow the first year to appear.

    const firstYear =
        years[0];


    if (
        firstYear === year
    ) {

        return 20;

    }


    // Wrong year should strongly reduce confidence

    if (
        years.length
    ) {

        return -30;

    }


    return 0;

}
