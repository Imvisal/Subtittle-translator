// api/sinhala-search.js

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\b(the|a|an)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function titleMatch(resultTitle, movieTitle, year = "") {
    const a = normalizeTitle(resultTitle);
    const b = normalizeTitle(movieTitle);

    if (!a || !b) return false;

    // Exact
    if (a === b) return true;

    // Remove year for comparison
    const aNoYear = a.replace(/\b(19|20)\d{2}\b/g, "").trim();
    const bNoYear = b.replace(/\b(19|20)\d{2}\b/g, "").trim();

    if (aNoYear === bNoYear) return true;

    // Movie title must be contained in result title
    if (aNoYear.includes(bNoYear)) {
        return true;
    }

    // Check important words
    const words = bNoYear
        .split(" ")
        .filter(x => x.length >= 2);

    if (!words.length) return false;

    const matched = words.filter(word =>
        aNoYear.includes(word)
    ).length;

    return matched / words.length >= 0.8;
}

async function fetchJSON(url) {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 Chrome/131 Safari/537.36",
                "Accept": "application/json"
            }
        });

        if (!response.ok) return null;

        return await response.json();

    } catch (error) {
        console.error("Fetch JSON error:", error.message);
        return null;
    }
}

async function searchWordPress({
    source,
    baseUrl,
    title,
    year,
    type
}) {
    try {
        const search = encodeURIComponent(title);

        const apiUrl =
            `${baseUrl}/wp-json/wp/v2/search` +
            `?search=${search}&per_page=20`;

        const data = await fetchJSON(apiUrl);

        if (!Array.isArray(data)) {
            return null;
        }

        for (const item of data) {

            const resultTitle =
                item.title?.rendered ||
                item.title ||
                "";

            if (!titleMatch(resultTitle, title, year)) {
                continue;
            }

            // Ignore pages that obviously aren't subtitle posts
            const combined =
                `${resultTitle} ${item.url || ""}`.toLowerCase();

            const subtitleRelated =
                combined.includes("subtitle") ||
                combined.includes("subtitles") ||
                combined.includes("sub");

            if (!subtitleRelated) {
                continue;
            }

            return {
                source,
                url: item.url,
                title: resultTitle,
                type
            };
        }

        return null;

    } catch (error) {
        console.error(
            `${source} search error:`,
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

    const title =
        String(req.query.title || "").trim();

    const year =
        String(req.query.year || "").trim();

    const type =
        String(req.query.type || "movie").toLowerCase();

    if (!title) {
        return res
