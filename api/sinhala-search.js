// api/sinhala-search.js

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\b(the|a|an)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanHtml(html = "") {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#8217;|&#039;/gi, "'")
        .replace(/&#8211;|&#8212;/gi, "-")
        .replace(/&quot;/gi, '"')
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function decodeHtml(str = "") {
    return str
        .replace(/&amp;/gi, "&")
        .replace(/&#8217;|&#039;/gi, "'")
        .replace(/&#8216;/gi, "'")
        .replace(/&#8220;|&#8221;/gi, '"')
        .replace(/&quot;/gi, '"')
        .replace(/&nbsp;/gi, " ");
}

function titleMatches(foundTitle, wantedTitle, year = "") {
    const a = normalizeTitle(foundTitle);
    const b = normalizeTitle(wantedTitle);

    if (!a || !b) return false;

    // Exact title
    if (a === b) return true;

    // One contains the other
    if (a.includes(b) || b.includes(a)) {
        return true;
    }

    // Compare important words
    const wantedWords = b
        .split(" ")
        .filter(x => x.length >= 2);

    if (!wantedWords.length) return false;

    const matched = wantedWords.filter(word => a.includes(word)).length;

    // Require most important words to match
    if (matched / wantedWords.length >= 0.75) {
        return true;
    }

    // Year can help with titles that have numbers
    if (year && a.includes(String(year))) {
        const titleWords = wantedWords.filter(word => a.includes(word));
        if (titleWords.length >= Math.max(1, wantedWords.length - 1)) {
            return true;
        }
    }

    return false;
}

function extractLinks(html, baseUrl) {
    const results = [];

    const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {
        const href = decodeHtml(match[1]);
        const text = cleanHtml(match[2]);

        if (!href || !text) continue;

        let url;

        try {
            url = new URL(href, baseUrl).href;
        } catch {
            continue;
        }

        results.push({
            url,
            text
        });
    }

    return results;
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
        const response = await fetch(searchUrl, {
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

        const html = await response.text();

        const links = extractLinks(html, baseUrl);

        // Find only links whose visible title actually matches
        const matched = links.find(item => {
            const text = item.text;

            // Must look like a Sinhala subtitle result
            const sinhalaSubtitle =
                /sinhala\s*subtitles?|සිංහල\s*(උපසිරසි|උපසිරැසි)/i.test(
                    text
                );

            if (!sinhalaSubtitle) {
                return false;
            }

            return titleMatches(text, title, year);
        });

        if (!matched) {
            return null;
        }

        return {
            source,
            url: matched.url,
            title: matched.text.trim(),
            type
        };
    } catch (error) {
        console.error(`${source} search error:`, error.message);
        return null;
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const title = String(req.query.title || "").trim();
    const year = String(req.query.year || "").trim();
    const type = String(req.query.type || "movie").toLowerCase();

    if (!title) {
        return res.status(400).json({
            error: "Title is required"
        });
    }

    try {
        const encodedTitle = encodeURIComponent(title);

        const searches = [
            searchSite({
                source: "Baiscope",
                searchUrl:
                    `https://www.baiscope.lk/?s=${encodedTitle}`,
                baseUrl: "https://www.baiscope.lk",
                title,
                year,
                type
            }),

            searchSite({
                source: "SinhalaSub",
                searchUrl:
                    `https://sinhalasub.lk/?s=${encodedTitle}`,
                baseUrl: "https://sinhalasub.lk",
                title,
                year,
                type
            }),

            searchSite({
                source: "Cineru",
                searchUrl:
                    `https://cineru.lk/cineru-search/?s=${encodedTitle}`,
                baseUrl: "https://cineru.lk",
                title,
                year,
                type
            })
        ];

        const results = await Promise.all(searches);

        const sources = results.filter(Boolean);

        return res.status(200).json({
            found: sources.length > 0,
            title,
            year,
            type,
            sources
        });

    } catch (error) {
        console.error("Sinhala search error:", error);

        return res.status(500).json({
            error: "Sinhala subtitle search failed",
            found: false,
            sources: []
        });
    }
};
