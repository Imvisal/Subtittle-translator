// api/sinhala-search.js

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanText(text = "") {
    return text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#8217;|&#039;/gi, "'")
        .replace(/&#8216;/gi, "'")
        .replace(/&#8220;|&#8221;/gi, '"')
        .replace(/&quot;/gi, '"')
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function decodeUrl(url = "") {
    return url
        .replace(/&amp;/gi, "&")
        .replace(/&#038;/gi, "&");
}

function titleMatches(foundTitle, wantedTitle, year = "") {
    const found = normalizeTitle(foundTitle);
    const wanted = normalizeTitle(wantedTitle);

    if (!found || !wanted) return false;

    // Exact match
    if (found === wanted) return true;

    // Remove common words
    const removeWords = new Set([
        "the",
        "a",
        "an",
        "movie",
        "film",
        "sinhala",
        "subtitle",
        "subtitles",
        "sub",
        "සිංහල",
        "උපසිරසි",
        "උපසිරැසි"
    ]);

    const wantedWords = wanted
        .split(" ")
        .filter(word => word.length >= 2)
        .filter(word => !removeWords.has(word));

    const foundWords = found
        .split(" ")
        .filter(word => word.length >= 2);

    if (!wantedWords.length) return false;

    let matched = 0;

    for (const word of wantedWords) {
        if (foundWords.includes(word)) {
            matched++;
            continue;
        }

        // Partial match for words like sonic / sonics
        if (
            foundWords.some(
                x => x.startsWith(word) || word.startsWith(x)
            )
        ) {
            matched++;
        }
    }

    const score = matched / wantedWords.length;

    // Strong title match
    if (score >= 0.75) {
        return true;
    }

    // Year match can help
    if (year && found.includes(String(year))) {
        if (score >= 0.6) {
            return true;
        }
    }

    return false;
}

function extractLinks(html, baseUrl) {
    const links = [];

    const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
        let href = decodeUrl(match[1]);
        let text = cleanText(match[2]);

        if (!href || !text) continue;

        try {
            href = new URL(href, baseUrl).href;
        } catch {
            continue;
        }

        links.push({
            url: href,
            text
        });
    }

    return links;
}

function isSubtitlePage(text = "", url = "") {
    const value = `${text} ${url}`.toLowerCase();

    return (
        value.includes("sinhala-subtitle") ||
        value.includes("sinhala-subtitles") ||
        value.includes("sinhala-sub") ||
        value.includes("සිංහල උපසිරැසි") ||
        value.includes("සිංහල උපසිරසි") ||
        value.includes("සිංහල සබ්")
    );
}

async function fetchPage(url) {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        });

        if (!response.ok) {
            return null;
        }

        return await response.text();
    } catch (error) {
        console.error("Fetch error:", url, error.message);
        return null;
    }
}

async function searchSite({
    source,
    searchUrl,
    baseUrl,
    title,
    year,
    type
}) {
    try {
        console.log(`Searching ${source}: ${searchUrl}`);

        const searchHtml = await fetchPage(searchUrl);

        if (!searchHtml) {
            return null;
        }

        const links = extractLinks(searchHtml, baseUrl);

        // Find candidate pages by TITLE first
        const candidates = [];

        for (const link of links) {
            if (!titleMatches(link.text, title, year)) {
                continue;
            }

            // Ignore navigation/category links
            if (
                link.url.includes("/category/") ||
                link.url.includes("/tag/") ||
                link.url.includes("/page/")
            ) {
                continue;
            }

            candidates.push(link);
        }

        // Remove duplicates
        const uniqueCandidates = [];

        for (const candidate of candidates) {
            if (
                !uniqueCandidates.some(
                    x => x.url === candidate.url
                )
            ) {
                uniqueCandidates.push(candidate);
            }
        }

        // Check candidate pages
        for (const candidate of uniqueCandidates.slice(0, 8)) {
            const pageHtml = await fetchPage(candidate.url);

            if (!pageHtml) {
                continue;
            }

            const pageText = cleanText(pageHtml);

            // Confirm this is actually a Sinhala subtitle page
            if (!isSubtitlePage(pageText, candidate.url)) {
                continue;
            }

            // Make sure requested title is also present on page
            if (!titleMatches(pageText, title, year)) {
                continue;
            }

            console.log(
                `FOUND ${source}: ${candidate.url}`
            );

            return {
                source,
                url: candidate.url,
                title: candidate.text.trim(),
                type
            };
        }

        return null;

    } catch (error) {
        console.error(
            `${source} search failed:`,
            error.message
        );

        return null;
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const title = String(
        req.query.title || ""
    ).trim();

    const year = String(
        req.query.year || ""
    ).trim();

    const type = String(
        req.query.type || "movie"
    ).toLowerCase();

    if (!title) {
        return res.status(400).json({
            error: "Title is required",
            found: false,
            sources: []
        });
    }

    try {
        const encodedTitle =
            encodeURIComponent(title);

        const checks = await Promise.allSettled([

            searchSite({
                source: "Baiscope",
                searchUrl:
                    `https://www.baiscope.lk/?s=${encodedTitle}`,
                baseUrl:
                    "https://www.baiscope.lk",
                title,
                year,
                type
            }),

            searchSite({
                source: "SinhalaSub",
                searchUrl:
                    `https://sinhalasub.lk/?s=${encodedTitle}`,
                baseUrl:
                    "https://sinhalasub.lk",
                title,
                year,
                type
            }),

            searchSite({
                source: "Cineru",
                searchUrl:
                    `https://cineru.lk/cineru-search/?s=${encodedTitle}`,
                baseUrl:
                    "https://cineru.lk",
                title,
                year,
                type
            })

        ]);

        const sources = [];

        for (const result of checks) {
            if (
                result.status === "fulfilled" &&
                result.value
            ) {
                sources.push(result.value);
            }
        }

        // Remove duplicate sources
        const uniqueSources = sources.filter(
            (item, index, array) =>
                index ===
                array.findIndex(
                    x => x.source === item.source
                )
        );

        return res.status(200).json({
            found: uniqueSources.length > 0,
            title,
            year,
            type,
            sources: uniqueSources
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
            error: "Search failed"
        });
    }
};
