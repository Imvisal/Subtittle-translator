// api/sinhala-search.js

const SOURCES = [
    {
        name: "Baiscope",
        domain: "baiscope.lk",
        search: title =>
            `https://www.baiscope.lk/?s=${encodeURIComponent(title)}`
    },
    {
        name: "SinhalaSub",
        domain: "sinhalasub.lk",
        search: title =>
            `https://sinhalasub.lk/?s=${encodeURIComponent(title)}`
    },
    {
        name: "Cineru",
        domain: "cineru.lk",
        search: title =>
            `https://cineru.lk/?s=${encodeURIComponent(title)}`
    }
];

function normalize(text = "") {
    return text
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titleWords(title) {
    return normalize(title)
        .split(" ")
        .filter(w => w.length >= 2);
}

function getScore(text, title, year) {
    const haystack = normalize(text);
    const words = titleWords(title);

    if (!words.length) return 0;

    let matched = 0;

    for (const word of words) {
        if (haystack.includes(word)) {
            matched++;
        }
    }

    let score = matched / words.length;

    // Strong bonus when exact title appears
    if (haystack.includes(normalize(title))) {
        score += 0.35;
    }

    // Year match
    if (year && haystack.includes(String(year))) {
        score += 0.15;
    }

    return Math.min(score, 1);
}

function looksLikeSinhalaSubtitle(text) {
    const value = normalize(text);

    return (
        value.includes("sinhala subtitle") ||
        value.includes("sinhala subtitles") ||
        value.includes("sinhala sub") ||
        value.includes("සිංහල උපසිරැසි") ||
        value.includes("සිංහල උපසිරසි") ||
        value.includes("සිංහල සබ්")
    );
}

function extractLinks(html, source) {
    const results = [];

    /*
     * Find links from HTML.
     */
    const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html)) !== null) {

        let url = match[1];

        const anchorText =
            match[2]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        if (!url) continue;

        // Convert relative URLs
        if (url.startsWith("/")) {
            url = `https://${source.domain}${url}`;
        }

        if (!url.startsWith("http")) {
            continue;
        }

        try {
            const hostname =
                new URL(url).hostname
                    .toLowerCase()
                    .replace(/^www\./, "");

            if (
                hostname !== source.domain &&
                !hostname.endsWith("." + source.domain)
            ) {
                continue;
            }
        } catch {
            continue;
        }

        results.push({
            url,
            text: anchorText
        });
    }

    return results;
}

async function searchSource(source, title, year, type) {

    const searchUrl = source.search(title);

    try {

        const response = await fetch(searchUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml"
            }
        });

        if (!response.ok) {
            console.error(
                source.name,
                "HTTP",
                response.status
            );

            return null;
        }

        const html = await response.text();

        if (!html || html.length < 100) {
            return null;
        }

        const links =
            extractLinks(html, source);

        const candidates = [];

        for (const link of links) {

            const combined =
                `${link.text} ${link.url}`;

            /*
             * Ignore obvious navigation links.
             */
            if (
                link.url.includes("/category/") ||
                link.url.includes("/tag/") ||
                link.url.includes("/author/") ||
                link.url.includes("/page/")
            ) {
                continue;
            }

            const score =
                getScore(
                    combined,
                    title,
                    year
                );

            if (score < 0.75) {
                continue;
            }

            /*
             * We need a Sinhala subtitle indication.
             */
            if (
                !looksLikeSinhalaSubtitle(
                    combined
                )
            ) {
                continue;
            }

            candidates.push({
                source: source.name,
                url: link.url,
                title:
                    link.text ||
                    title,
                score,
                type
            });
        }

        /*
         * Sort best result first.
         */
        candidates.sort(
            (a, b) =>
                b.score - a.score
        );

        return candidates[0] || null;

    } catch (error) {

        console.error(
            source.name,
            error.message
        );

        return null;
    }
}

module.exports = async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({
            found: false,
            sources: [],
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

        const results =
            await Promise.all(
                SOURCES.map(source =>
                    searchSource(
                        source,
                        title,
                        year,
                        type
                    )
                )
            );

        const sources =
            results.filter(Boolean);

        return res.status(200).json({
            found:
                sources.length > 0,

            title,
            year,
            type,

            sources
        });

    } catch (error) {

        console.error(
            "Sinhala search error:",
            error
        );

        return res.status(500).json({
            found: false,
            title,
            year,
            type,
            sources: [],
            error:
                "Sinhala subtitle search failed"
        });
    }
};
