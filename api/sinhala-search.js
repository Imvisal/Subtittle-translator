// api/sinhala-search.js

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\b(the|a|an)\b/g, "")
        .replace(/\b(19|20)\d{2}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function titleMatches(foundTitle, wantedTitle) {
    const found = normalizeTitle(foundTitle);
    const wanted = normalizeTitle(wantedTitle);

    if (!found || !wanted) return false;

    // Exact match
    if (found === wanted) {
        return true;
    }

    // One contains the other
    if (
        found.includes(wanted) ||
        wanted.includes(found)
    ) {
        return true;
    }

    const wantedWords = wanted
        .split(" ")
        .filter(word => word.length >= 2);

    if (!wantedWords.length) {
        return false;
    }

    let matched = 0;

    for (const word of wantedWords) {
        if (found.includes(word)) {
            matched++;
        }
    }

    return (
        matched / wantedWords.length >= 0.75
    );
}

function decodeMarkdownText(text = "") {
    return text
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#8217;|&#039;/g, "'")
        .replace(/&#8211;|&#8212;/g, "-")
        .replace(/&quot;/g, '"')
        .trim();
}

function extractMarkdownLinks(text = "") {
    const links = [];

    const regex =
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
        links.push({
            title: decodeMarkdownText(match[1]),
            url: match[2]
        });
    }

    return links;
}

async function jinaFetch(url) {
    try {
        const readerUrl =
            "https://r.jina.ai/" + url;

        const response = await fetch(readerUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0",
                "Accept":
                    "text/plain,text/markdown,*/*"
            }
        });

        if (!response.ok) {
            console.error(
                "Jina HTTP:",
                response.status,
                url
            );

            return null;
        }

        return await response.text();

    } catch (error) {
        console.error(
            "Jina fetch error:",
            error.message
        );

        return null;
    }
}

async function searchSource({
    source,
    searchUrl,
    baseUrl,
    title,
    year,
    type
}) {
    try {

        console.log(
            `Searching ${source}: ${searchUrl}`
        );

        const markdown =
            await jinaFetch(searchUrl);

        if (!markdown) {
            return null;
        }

        const links =
            extractMarkdownLinks(markdown);

        // Only keep links belonging to the source site
        const siteLinks =
            links.filter(link =>
                link.url.startsWith(baseUrl)
            );

        // Search result candidates
        const candidates = [];

        for (const link of siteLinks) {

            const combinedTitle =
                `${link.title} ${link.url}`;

            if (
                titleMatches(
                    combinedTitle,
                    title
                )
            ) {
                candidates.push(link);
            }
        }

        // Remove duplicates
        const unique = candidates.filter(
            (item, index, array) =>
                index ===
                array.findIndex(
                    x => x.url === item.url
                )
        );

        // Ignore obvious category/search/navigation pages
        const valid =
            unique.filter(link => {

                const url =
                    link.url.toLowerCase();

                return (
                    !url.includes("/category/") &&
                    !url.includes("/tag/") &&
                    !url.includes("/page/") &&
                    !url.includes("?s=") &&
                    !url.endsWith("/search")
                );
            });

        if (!valid.length) {
            return null;
        }

        // Prefer links containing subtitle wording
        const subtitlePage =
            valid.find(link => {

                const value =
                    `${link.title} ${link.url}`
                        .toLowerCase();

                return (
                    value.includes("subtitle") ||
                    value.includes("subtitles") ||
                    value.includes("sinhala-sub")
                );
            });

        const result =
            subtitlePage || valid[0];

        console.log(
            `FOUND ${source}: ${result.url}`
        );

        return {
            source,
            url: result.url,
            title: result.title,
            type
        };

    } catch (error) {

        console.error(
            `${source} error:`,
            error.message
        );

        return null;
    }
}

module.exports = async function handler(
    req,
    res
) {

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

        const encoded =
            encodeURIComponent(title);

        const results =
            await Promise.allSettled([

                // Baiscope
                searchSource({
                    source: "Baiscope",
                    searchUrl:
                        `https://www.baiscope.lk/?s=${encoded}`,
                    baseUrl:
                        "https://www.baiscope.lk",
                    title,
                    year,
                    type
                }),

                // SinhalaSub
                searchSource({
                    source: "SinhalaSub",
                    searchUrl:
                        `https://sinhalasub.lk/?s=${encoded}`,
                    baseUrl:
                        "https://sinhalasub.lk",
                    title,
                    year,
                    type
                }),

                // Cineru
                searchSource({
                    source: "Cineru",
                    searchUrl:
                        `https://cineru.lk/cineru-search/?s=${encoded}`,
                    baseUrl:
                        "https://cineru.lk",
                    title,
                    year,
                    type
                })

            ]);

        const sources = [];

        for (const result of results) {

            if (
                result.status === "fulfilled" &&
                result.value
            ) {
                sources.push(result.value);
            }
        }

        // Remove duplicate source names
        const uniqueSources =
            sources.filter(
                (item, index, array) =>
                    index ===
                    array.findIndex(
                        x =>
                            x.source ===
                            item.source
                    )
            );

        return res.status(200).json({

            found
