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

        const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const cx = process.env.GOOGLE_CSE_ID;

        const cleanTitle = normalizeTitle(title);
        const cleanYear = extractYear(year);

        const sources = [
            {
                name: "Baiscope",
                host: "baiscope.lk"
            },
            {
                name: "SinhalaSub",
                host: "sinhalasub.lk"
            },
            {
                name: "Cineru",
                host: "cineru.lk"
            }
        ];

        const found = [];

        /*
        ====================================================
        1. GOOGLE SEARCH
        ====================================================
        */

        if (apiKey && cx) {

            const googleResults =
                await googleSearch(
                    apiKey,
                    cx,
                    title,
                    cleanYear
                );

            for (const item of googleResults) {

                if (!item || !item.link) {
                    continue;
                }

                let url;

                try {
                    url = new URL(item.link);
                } catch {
                    continue;
                }

                const host =
                    url.hostname
                        .toLowerCase()
                        .replace(/^www\./, "");

                const source =
                    sources.find(
                        s => s.host === host
                    );

                if (!source) {
                    continue;
                }

                const resultTitle =
                    String(item.title || "");

                const snippet =
                    String(item.snippet || "");

                const score =
                    matchScore(
                        title,
                        cleanYear,
                        resultTitle,
                        snippet,
                        item.link
                    );

                if (score >= 70) {

                    found.push({
                        source: source.name,
                        url: item.link,
                        title: resultTitle,
                        score
                    });
                }
            }
        }


        /*
        ====================================================
        2. DIRECT URL CHECK
        ====================================================
        */

        for (const source of sources) {

            const alreadyFound =
                found.some(
                    x => x.source === source.name
                );

            if (alreadyFound) {
                continue;
            }

            const candidates =
                buildCandidateUrls(
                    source,
                    title,
                    cleanYear
                );

            for (const candidate of candidates) {

                const valid =
                    await checkPage(
                        candidate,
                        title,
                        cleanYear
                    );

                if (valid) {

                    found.push({
                        source: source.name,
                        url: candidate,
                        title:
                            `${title} (${cleanYear}) Sinhala Subtitles`,
                        score: 100
                    });

                    break;
                }
            }
        }


        /*
        ====================================================
        REMOVE DUPLICATES
        ====================================================
        */

        const unique = [];

        const seen =
            new Set();

        found
            .sort(
                (a, b) =>
                    b.score - a.score
            )
            .forEach(item => {

                if (
                    seen.has(item.source)
                ) {
                    return;
                }

                seen.add(item.source);
                unique.push(item);
            });


        return res.status(200).json({
            found: unique.length > 0,
            title,
            year: cleanYear,
            type,
            sources: unique,
            error: null
        });

    } catch (error) {

        console.error(
            "SINHALA SEARCH ERROR:",
            error
        );

        return res.status(500).json({
            found: false,
            title: req.query.title || "",
            year: req.query.year || "",
            sources: [],
            error:
                error.message ||
                "Sinhala subtitle search failed"
        });
    }
};


/* ========================================================
   GOOGLE SEARCH
======================================================== */

async function googleSearch(
    apiKey,
    cx,
    title,
    year
) {

    /*
     * IMPORTANT:
     * No exactTerms
     * No siteSearch
     * No hq
     *
     * Keep the Google query broad.
     */

    const queries = [];

    queries.push(
        `"${title}" Sinhala subtitles`
    );

    if (year) {
        queries.push(
            `"${title}" ${year} Sinhala subtitles`
        );
    }

    const all = [];

    for (const query of queries) {

        try {

            const params =
                new URLSearchParams();

            params.set(
                "key",
                apiKey
            );

            params.set(
                "cx",
                cx
            );

            params.set(
                "q",
                query
            );

            params.set(
                "num",
                "10"
            );

            /*
             * Disable Google's automatic
             * duplicate filtering.
             */
            params.set(
                "filter",
                "0"
            );

            const response =
                await fetch(
                    "https://www.googleapis.com/customsearch/v1?" +
                    params.toString()
                );

            const data =
                await response.json();

            if (
                response.ok &&
                Array.isArray(data.items)
            ) {

                all.push(
                    ...data.items
                );
            }

        } catch (error) {

            console.error(
                "GOOGLE SEARCH ERROR:",
                error.message
            );
        }
    }

    /*
     * Remove duplicate URLs
     */
    const unique = [];

    const seen =
        new Set();

    for (const item of all) {

        if (
            !item ||
            !item.link
        ) {
            continue;
        }

        if (
            seen.has(item.link)
        ) {
            continue;
        }

        seen.add(item.link);

        unique.push(item);
    }

    return unique;
}


/* ========================================================
   BUILD POSSIBLE SOURCE URLS
======================================================== */

function buildCandidateUrls(
    source,
    title,
    year
) {

    const slug =
        slugify(title);

    const urls = [];

    if (!year) {
        return urls;
    }


    /*
    ------------------------------
    BAISCOPE
    ------------------------------
    */

    if (source.name === "Baiscope") {

        urls.push(
            `https://www.baiscope.lk/${slug}-${year}-sinhala-subtitle/`
        );

        urls.push(
            `https://www.baiscope.lk/movies/${slug}-${year}-sinhala-subtitles/`
        );

        urls.push(
            `https://www.baiscope.lk/${slug}-${year}-sinhala-subtitles/`
        );
    }


    /*
    ------------------------------
    CINERU
    ------------------------------
    */

    if (source.name === "Cineru") {

        urls.push(
            `https://cineru.lk/${slug}-${year}-sinhala-sub/`
        );

        urls.push(
            `https://cineru.lk/${slug}-${year}-sinhala-subtitles/`
        );

        urls.push(
            `https://cineru.lk/movies/${slug}-${year}-sinhala-subtitles/`
        );
    }


    /*
    ------------------------------
    SINHALASUB
    ------------------------------
    */

    if (source.name === "SinhalaSub") {

        urls.push(
            `https://sinhalasub.lk/movies/${slug}-${year}-sinhala-subtitles/`
        );

        urls.push(
            `https://sinhalasub.lk/${slug}-${year}-sinhala-subtitles/`
        );

        urls.push(
            `https://www.sinhalasub.lk/movies/${slug}-${year}-sinhala-subtitles/`
        );
    }

    return urls;
}


/* ========================================================
   DIRECT PAGE CHECK
======================================================== */

async function checkPage(
    url,
    requestedTitle,
    requestedYear
) {

    try {

        const response =
            await fetch(
                url,
                {
                    method: "GET",
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (compatible; SubLankaAI/1.0)"
                    },
                    redirect: "follow"
                }
            );

        if (!response.ok) {
            return false;
        }

        const html =
            await response.text();

        if (!html) {
            return false;
        }

        const text =
            normalizeTitle(
                stripHTML(html)
            );

        const title =
            normalizeTitle(
                requestedTitle
            );

        /*
         * Title must exist.
         */
        if (!text.includes(title)) {
            return false;
        }

        /*
         * Year must exist.
         */
        if (
            requestedYear &&
            !text.includes(requestedYear)
        ) {
            return false;
        }

        /*
         * Must look like a Sinhala subtitle page.
         */
        const lower =
            html.toLowerCase();

        const subtitleFound =
            lower.includes("sinhala subtitle") ||
            lower.includes("sinhala subtitles") ||
            lower.includes("සිංහල උපසිරැසි") ||
            lower.includes("සිංහල උපසිරසි");

        if (!subtitleFound) {
            return false;
        }

        return true;

    } catch (error) {

        console.log(
            "DIRECT CHECK FAILED:",
            url,
            error.message
        );

        return false;
    }
}


/* ========================================================
   MATCH SCORE
======================================================== */

function matchScore(
    requestedTitle,
    requestedYear,
    resultTitle,
    snippet,
    url
) {

    const requested =
        normalizeTitle(
            requestedTitle
        );

    const result =
        normalizeTitle(
            `${resultTitle} ${snippet} ${url}`
        );

    let score = 0;

    /*
     * Exact title phrase
     */
    if (
        result.includes(requested)
    ) {
        score += 80;
    } else {

        const requestedWords =
            requested
                .split(/\s+/)
                .filter(Boolean);

        const resultWords =
            result
                .split(/\s+/)
                .filter(Boolean);

        let matched = 0;

        for (
            const word of requestedWords
        ) {

            if (
                resultWords.includes(word)
            ) {
                matched++;
            }
        }

        const ratio =
            matched /
            requestedWords.length;

        if (ratio >= 0.9) {
            score += 70;
        } else if (ratio >= 0.75) {
            score += 50;
        }
    }


    /*
     * Correct year
     */
    if (
        requestedYear &&
        result.includes(requestedYear)
    ) {
        score += 20;
    }


    /*
     * Sinhala subtitle keyword
     */
    if (
        result.includes(
            "sinhala subtitle"
        ) ||
        result.includes(
            "sinhala subtitles"
        )
    ) {
        score += 10;
    }

    return score;
}


/* ========================================================
   NORMALIZE
======================================================== */

function normalizeTitle(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[’']/g, "")
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


/* ========================================================
   SLUGIFY
======================================================== */

function slugify(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[’']/g, "")
        .replace(
            /[^\p{L}\p{N}]+/gu,
            "-"
        )
        .replace(
            /-+/g,
            "-"
        )
        .replace(
            /^-|-$/g,
            ""
        );
}


/* ========================================================
   YEAR
======================================================== */

function extractYear(value) {

    const match =
        String(value || "").match(
            /\b(19\d{2}|20\d{2})\b/
        );

    return match
        ? match[1]
        : "";
}


/* ========================================================
   REMOVE HTML
======================================================== */

function stripHTML(html) {

    return String(html || "")
        .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
        )
        .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
        )
        .replace(
            /<[^>]+>/g,
            " "
        )
        .replace(
            /&nbsp;/gi,
            " "
        )
        .replace(
            /&amp;/gi,
            "&"
        );
}
