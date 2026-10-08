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
                error: "Google Search API configuration missing"
            });
        }

        // -----------------------------
        // CLEAN TITLE
        // -----------------------------
        const cleanTitle = title
            .replace(/[^\p{L}\p{N}\s:'&.!?-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

        const requestedYear = extractYear(year);

        // Search query
        let query = `"${cleanTitle}"`;

        if (requestedYear) {
            query += ` "${requestedYear}"`;
        }

        query += ` "Sinhala subtitles"`;

        console.log("SINHALA SEARCH:", query);

        // -----------------------------
        // GOOGLE CSE
        // -----------------------------
        const googleURL =
            "https://www.googleapis.com/customsearch/v1" +
            `?key=${encodeURIComponent(API_KEY)}` +
            `&cx=${encodeURIComponent(CX)}` +
            `&q=${encodeURIComponent(query)}` +
            `&num=10`;

        const response = await fetch(googleURL);

        const data = await response.json();

        if (!response.ok) {
            console.error("GOOGLE CSE ERROR:", data);

            return res.status(500).json({
                error: data?.error?.message || "Google search failed"
            });
        }

        const items = Array.isArray(data.items)
            ? data.items
            : [];

        // -----------------------------
        // ALLOWED SOURCES
        // -----------------------------
        const allowedSources = [
            {
                name: "Baiscope",
                domains: ["baiscope.lk", "www.baiscope.lk"]
            },
            {
                name: "SinhalaSub",
                domains: ["sinhalasub.lk", "www.sinhalasub.lk"]
            },
            {
                name: "Cineru",
                domains: ["cineru.lk", "www.cineru.lk"]
            }
        ];

        const results = [];

        // -----------------------------
        // CHECK EACH GOOGLE RESULT
        // -----------------------------
        for (const item of items) {

            if (!item || !item.link) continue;

            let url;

            try {
                url = new URL(item.link);
            } catch {
                continue;
            }

            const hostname = url.hostname.toLowerCase();

            const source = allowedSources.find(src =>
                src.domains.includes(hostname)
            );

            if (!source) continue;

            const resultTitle = String(item.title || "");
            const resultText = String(item.snippet || "");

            const fullText =
                `${resultTitle} ${resultText}`.toLowerCase();

            const normalizedRequested =
                normalizeTitle(cleanTitle);

            const normalizedResult =
                normalizeTitle(resultTitle);

            // -----------------------------
            // TITLE MATCH
            // -----------------------------
            const titleMatch =
                titleMatches(
                    normalizedRequested,
                    normalizedResult,
                    fullText
                );

            if (!titleMatch) {
                continue;
            }

            // -----------------------------
            // YEAR MATCH
            // -----------------------------
            let yearMatch = true;

            if (requestedYear) {

                const yearsFound =
                    extractAllYears(
                        `${resultTitle} ${resultText} ${url.pathname}`
                    );

                yearMatch =
                    yearsFound.includes(requestedYear);

                // If year isn't shown in Google result title/snippet,
                // allow URL/title context only when title is a very strong match.
                if (!yearMatch) {

                    const strongTitle =
                        normalizedResult === normalizedRequested ||
                        normalizedResult.includes(normalizedRequested);

                    if (!strongTitle) {
                        continue;
                    }
                }
            }

            // -----------------------------
            // SCORE
            // -----------------------------
            let score = 0;

            if (normalizedResult === normalizedRequested) {
                score += 70;
            } else if (
                normalizedResult.includes(normalizedRequested)
            ) {
                score += 55;
            } else {
                score += 40;
            }

            if (requestedYear && yearMatch) {
                score += 30;
            }

            if (
                fullText.includes("sinhala subtitle") ||
                fullText.includes("sinhala subtitles")
            ) {
                score += 10;
            }

            results.push({
                source: source.name,
                url: item.link,
                title: resultTitle,
                score
            });
        }

        // -----------------------------
        // REMOVE DUPLICATES
        // -----------------------------
        const unique = [];

        const seenSources = new Set();

        results
            .sort((a, b) => b.score - a.score)
            .forEach(result => {

                if (seenSources.has(result.source)) {
                    return;
                }

                seenSources.add(result.source);
                unique.push(result);
            });

        return res.status(200).json({
            found: unique.length > 0,
            title: cleanTitle,
            year: requestedYear,
            type,
            sources: unique,
            error: null
        });

    } catch (error) {

        console.error("SINHALA SEARCH ERROR:", error);

        return res.status(500).json({
            found: false,
            sources: [],
            error: error.message || "Sinhala search failed"
        });
    }
};


// ======================================================
// HELPERS
// ======================================================

function normalizeTitle(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// Get first valid 4-digit year
function extractYear(value) {

    const match = String(value || "").match(
        /\b(19\d{2}|20\d{2})\b/
    );

    return match ? match[1] : "";
}


// Get all years from text
function extractAllYears(value) {

    const matches =
        String(value || "").match(
            /\b(19\d{2}|20\d{2})\b/g
        ) || [];

    return [...new Set(matches)];
}


// Strong title matching
function titleMatches(
    requestedTitle,
    resultTitle,
    fullText
) {

    if (!requestedTitle) {
        return false;
    }

    // Exact title
    if (resultTitle === requestedTitle) {
        return true;
    }

    // Exact requested phrase exists
    if (resultTitle.includes(requestedTitle)) {

        // Important:
        // "Sonic" should NOT automatically match
        // "Sonic X" / "Sonic Boom" unless the requested
        // title itself contains those words.

        const remaining =
            resultTitle
                .replace(requestedTitle, "")
                .trim();

        // If extra words are only generic subtitle wording,
        // accept it.
        if (!remaining) {
            return true;
        }

        return false;
    }

    // Check individual words
    const requestedWords =
        requestedTitle
            .split(/\s+/)
            .filter(Boolean);

    const resultWords =
        resultTitle
            .split(/\s+/)
            .filter(Boolean);

    if (!requestedWords.length) {
        return false;
    }

    const matchedWords =
        requestedWords.filter(word =>
            resultWords.includes(word)
        );

    const coverage =
        matchedWords.length / requestedWords.length;

    // For titles with 2+ words, require all words.
    if (requestedWords.length >= 2) {
        return coverage === 1;
    }

    // Single-word titles need exact word match,
    // not just substring.
    return resultWords.includes(requestedTitle);
}
