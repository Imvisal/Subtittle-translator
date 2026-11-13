// what visitors type into the search box -> a ranked list the owner's auto-translate runner uses as a demand signal
async function logSearch(req) {
    try {
        const g = require("./_google");
        if (!g.hasRedis()) { return; }
        const text = String((req.query && req.query.query) || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (text.length < 3 || text.length > 60 || /https?:|www\.|[<>{}]/.test(text)) { return; }
        await Promise.race([
            g.redis([["ZINCRBY", "sq:z", 1, text], ["ZREMRANGEBYRANK", "sq:z", 0, -1501], ["EXPIRE", "sq:z", 90 * 86400]]),
            new Promise(r => setTimeout(r, 900))
        ]);
    } catch (e) { /* logging must never break the search */ }
}


// OMDb's free key allows ~1000 calls a day. When it says "Request limit reached" (or the flag below is set), search through TMDB instead,
// so visitors never see that message. The flag is shared with the title pages (api/_ready.js) and lasts 30 minutes.
async function omdbBlocked() {
    try { const g = require("./_google"); if (!g.hasRedis()) { return false; } return !!(await g.redis([["GET", "omdb:limit"]]))[0]; } catch (e) { return false; }
}
async function omdbMarkLimit() {
    try { const g = require("./_google"); if (g.hasRedis()) { await g.redis([["SET", "omdb:limit", "1", "EX", 1800]]); } } catch (e) { /* ignore */ }
}
async function tmdbSearch(query) {
    const key = process.env.TMDB_API_KEY;
    if (!key) { return null; }
    const isToken = key.length > 40;
    const get = async p => {
        const r = await fetch("https://api.themoviedb.org/3" + p + (p.includes("?") ? "&" : "?") + "language=en-US" + (isToken ? "" : "&api_key=" + encodeURIComponent(key)), { headers: isToken ? { Authorization: "Bearer " + key } : {}, signal: AbortSignal.timeout(6000) });
        if (!r.ok) { throw new Error("TMDB " + r.status); }
        return r.json();
    };
    const s = await get("/search/multi?include_adult=false&query=" + encodeURIComponent(query));
    const hits = (s.results || []).filter(x => x.media_type === "movie" || x.media_type === "tv").slice(0, 12);
    const out = await Promise.all(hits.map(async x => {
        try {
            const ids = await get("/" + x.media_type + "/" + x.id + "/external_ids");
            if (!ids || !/^tt\d{5,10}$/.test(ids.imdb_id || "")) { return null; }
            const date = String(x.release_date || x.first_air_date || "");
            return { imdbID: ids.imdb_id, type: x.media_type === "tv" ? "series" : "movie", title: x.title || x.name || "", year: date.slice(0, 4), poster: x.poster_path ? "https://image.tmdb.org/t/p/w342" + x.poster_path : null };
        } catch (e) { return null; }
    }));
    return out.filter(Boolean);
}

async function searchHandler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const query =
            String(req.query.query || "").trim().slice(0, 100);

        if (!query) {
            return res.status(400).json({
                error: "Search query is required"
            });
        }

        const apiKey =
            process.env.OMDB_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "OMDB_API_KEY is missing"
            });
        }

        if (await omdbBlocked()) {
            const alt = await tmdbSearch(query).catch(() => null);
            if (alt && alt.length) { logSearch(req); return res.status(200).json({ results: alt }); }
        }

        const url =
            new URL("https://www.omdbapi.com/");

        url.searchParams.set(
            "apikey",
            apiKey
        );

        url.searchParams.set(
            "s",
            query
        );

        url.searchParams.set(
            "page",
            "1"
        );

        url.searchParams.set(
            "type",
            "movie"
        );


        // --------------------------------------------------
        // MOVIE SEARCH
        // --------------------------------------------------

        const movieResponse =
            await fetch(url);

        const movieData =
            await movieResponse.json();


        // --------------------------------------------------
        // TV / SERIES SEARCH
        // --------------------------------------------------

        const tvURL =
            new URL(
                "https://www.omdbapi.com/"
            );

        tvURL.searchParams.set(
            "apikey",
            apiKey
        );

        tvURL.searchParams.set(
            "s",
            query
        );

        tvURL.searchParams.set(
            "page",
            "1"
        );

        tvURL.searchParams.set(
            "type",
            "series"
        );


        const tvResponse =
            await fetch(tvURL);

        const tvData =
            await tvResponse.json();


        // --------------------------------------------------
        // OMDB ERROR
        // --------------------------------------------------

        if (
            movieData.Response === "False" &&
            tvData.Response === "False"
        ) {

            if (/limit/i.test(String(movieData.Error || tvData.Error || ""))) {
                omdbMarkLimit();
                const alt = await tmdbSearch(query).catch(() => null);
                if (alt && alt.length) { return res.status(200).json({ results: alt }); }
            }

            return res.status(404).json({

                error:
                    movieData.Error ||
                    tvData.Error ||
                    "No results found"

            });

        }


        // --------------------------------------------------
        // FORMAT RESULTS
        // --------------------------------------------------

        const movies =
            movieData.Response === "True"
                ? (movieData.Search || []).map(
                    item => ({

                        imdbID:
                            item.imdbID,

                        type:
                            "movie",

                        title:
                            item.Title,

                        year:
                            item.Year,

                        poster:
                            item.Poster !== "N/A"
                                ? item.Poster
                                : null

                    })
                )
                : [];


        const series =
            tvData.Response === "True"
                ? (tvData.Search || []).map(
                    item => ({

                        imdbID:
                            item.imdbID,

                        type:
                            "series",

                        title:
                            item.Title,

                        year:
                            item.Year,

                        poster:
                            item.Poster !== "N/A"
                                ? item.Poster
                                : null

                    })
                )
                : [];


        // --------------------------------------------------
        // COMBINE
        // --------------------------------------------------

        const results = [
            ...movies,
            ...series
        ];


        // Remove duplicate IMDb IDs
        const unique =
            Array.from(
                new Map(
                    results.map(
                        item =>
                            [
                                item.imdbID,
                                item
                            ]
                    )
                ).values()
            );


        // --------------------------------------------------
        // RETURN
        // --------------------------------------------------

        return res.status(200).json({

            results:
                unique.slice(0, 20)

        });


    } catch (error) {

        console.error(
            "OMDb search error:",
            error
        );

        return res.status(500).json({

            error:
                error.message ||
                "Search failed"

        });

    }

};

module.exports = async function handler(req, res) {
    const logging = req.method === "GET" ? logSearch(req) : null;
    try {
        return await searchHandler(req, res);
    } finally {
        if (logging) { await logging; }
    }
};
