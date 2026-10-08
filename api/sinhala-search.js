// api/sinhala-search.js

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\b(the|a|an|movie|film)\b/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titleMatches(text, wantedTitle, year = "") {
    const found = normalizeTitle(text);
    const wanted = normalizeTitle(wantedTitle);

    if (!found || !wanted) return false;

    // Exact title
    if (found === wanted) {
        return true;
    }

    // Full title contained
    if (found.includes(wanted)) {
        return true;
    }

    // Important words comparison
    const words = wanted
        .split(" ")
        .filter(w => w.length >= 2);

    if (!words.length) return false;

    let matched = 0;

    for (const word of words) {
        if (found.includes(word)) {
            matched++;
        }
    }

    const score = matched / words.length;

    // 80%+ title words must match
    if (score >= 0.8) {
        return true;
    }

    // If year is present, allow slightly weaker match
    if (
        year &&
        String(text).includes(String(year)) &&
        score >= 0.65
    ) {
        return true;
    }

    return false;
}

function decodeHtml(str = "") {
    return str
        .replace(/&amp;/gi, "&")
        .replace(/&#39;|&#039;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&#8217;/gi, "'")
        .replace(/&#8211;/gi, "-")
        .replace(/&#8212;/gi, "-")
        .replace(/&nbsp;/gi, " ");
}

function stripHtml(str = "") {
    return decodeHtml(
        str.replace(/<[^>]*>/g, " ")
    )
        .replace(/\s+/g, " ")
        .trim();
}

function extractSearchResults(html = "") {
    const results = [];

    /*
     * DuckDuckGo HTML result format
     */
    const regex =
        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
        let url = decodeHtml(match[1]);
        const title = stripHtml(match[2]);

        if (!url || !title) continue;

        // Decode DDG redirect URL
        try {
            const parsed = new URL(url);

            if (
                parsed.hostname.includes("duckduckgo.com") &&
                parsed.searchParams.get("uddg")
            ) {
                url = decodeURIComponent(
                    parsed.searchParams.get("uddg")
                );
            }
        } catch {
            // Ignore invalid URLs
        }

        results.push({
            title,
            url
        });
    }

    return results;
}

async function duckSearch(query) {
    try {
        const url =
            "https://html.duckduckgo.com/html/?q=" +
            encodeURIComponent(query);

        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml"
            }
        });

        if (!response.ok) {
            console.log(
                "DuckDuckGo HTTP:",
                response.status
            );

            return [];
        }

        const html = await response.text();

        return extractSearchResults(html);

    } catch (error) {
        console.error(
            "DuckDuckGo search error:",
            error.message
        );

        return [];
    }
}

async function searchSource({
    source,
    domain,
    title,
    year,
    type
}) {
    try {
        /*
         * Search using the movie title itself.
         *
         * Example:
         * site:baiscope.lk
         * "Sonic the Hedgehog"
         * "Sinhala Subtitle"
         */
        const queries = [
            `site:${domain} "${title}" "Sinhala Subtitle"`,
            `site:${domain} "${title}" Sinhala`,
            `site:${domain} "${title}" ${year || ""}`
        ];

        let allResults = [];

        for (const query of queries) {

            const results =
                await duckSearch(query);

            allResults.push(...results);

            if (allResults.length >= 20) {
                break;
            }
        }

        // Remove duplicates
        allResults = allResults.filter(
