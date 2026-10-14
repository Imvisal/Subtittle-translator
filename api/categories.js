"use strict";

module.exports = async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const apiKey = process.env.TMDB_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "TMDB_API_KEY is not configured"
            });
        }

        const category = String(
            req.query.category || "trending"
        ).toLowerCase();

        const TMDB_BASE = "https://api.themoviedb.org/3";

        // --------------------------------
        // Fetch TMDB
        // --------------------------------
        async function tmdbFetch(endpoint) {
            // Works with both a v3 API key and a v4 "Read Access Token" (eyJ...)
            const isToken = apiKey.length > 40;
            const separator = endpoint.includes("?") ? "&" : "?";
            const url =
                `${TMDB_BASE}${endpoint}${separator}language=en-US` +
                (isToken ? "" : `&api_key=${encodeURIComponent(apiKey)}`);

            const response = await fetch(url, {
                headers: isToken ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(7000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`TMDB API error ${response.status}: ${errorText}`);
            }

            return response.json();
        }

        // --------------------------------
        // Get IMDb ID
        // --------------------------------
        async function getImdbId(item) {
            try {
                const mediaType =
                    item.media_type ||
                    (item.title ? "movie" : "tv");

                const data = await tmdbFetch(
                    `/${mediaType}/${item.id}/external_ids`
                );

                return data.imdb_id || null;

            } catch (error) {
                console.error(
                    "IMDb ID ERROR:",
                    error.message
                );

                return null;
            }
        }

        // --------------------------------
        // Convert TMDB item
        // --------------------------------
        async function normalizeItem(entry) {

            const item = entry.item;
            const type = entry.type;

            const title =
                item.title ||
                item.name ||
                "";

            const date =
                item.release_date ||
                item.first_air_date ||
                "";

            const year =
                date
                    ? date.substring(0, 4)
                    : "";

            const poster =
                item.poster_path
                    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                    : "";

            const imdbID =
                await getImdbId({
                    ...item,
                    media_type:
                        type === "series"
                            ? "tv"
                            : "movie"
                });

            return {
                imdbID,
                tmdbID: item.id,
                type,
                anime: !!entry.anime,
                title,
                year,
                poster
            };
        }

        // --------------------------------
        // Category sources
        // --------------------------------
        const TOTAL = 10;

        const isAnime = item =>
            (item.genre_ids || []).includes(16) &&
            item.original_language === "ja";

        const movieList = async (path) =>
            ((await tmdbFetch(path)).results || [])
                .map(item => ({ item, type: "movie", anime: false }));

        const tvList = async (path, anime = false) =>
            ((await tmdbFetch(path)).results || [])
                .map(item => ({ item, type: "series", anime }));

        const ANIME_PATH =
            "/discover/tv" +
            "?sort_by=popularity.desc" +
            "&with_genres=16" +
            "&with_original_language=ja" +
            "&include_adult=false" +
            "&page=1";

        let entries = [];

        // TRENDING = a mix of movies + TV series + anime
        if (category === "trending") {

            const [movies, shows, anime] = await Promise.all([
                movieList("/trending/movie/week"),
                tvList("/trending/tv/week"),
                tvList(ANIME_PATH, true)
            ]);

            // keep anime out of the normal TV list so nothing repeats
            const animeIds = new Set(anime.map(e => e.item.id));
            const tv = shows.filter(e =>
                !animeIds.has(e.item.id) && !isAnime(e.item)
            );

            // movie, tv, anime, movie, tv, anime ...
            const buckets = [
                movies.slice(0, 6),
                tv.slice(0, 6),
                anime.slice(0, 6)
            ];

            const mixed = [];
            for (let i = 0; i < 6; i++) {
                buckets.forEach(list => {
                    if (list[i]) mixed.push(list[i]);
                });
            }

            entries = mixed;
        }

        // MOVIES
        else if (category === "movie") {

            entries = await movieList(
                "/discover/movie" +
                "?sort_by=popularity.desc" +
                "&include_adult=false" +
                "&page=1"
            );
        }

        // TV SERIES
        else if (category === "tv") {

            entries = await tvList(
                "/discover/tv" +
                "?sort_by=popularity.desc" +
                "&include_adult=false" +
                "&page=1"
            );
        }

        // ANIME
        else if (category === "anime") {

            entries = await tvList(ANIME_PATH, true);
        }

        else {
            return res.status(400).json({
                error: "Invalid category",
                allowed: [
                    "trending",
                    "movie",
                    "tv",
                    "anime"
                ]
            });
        }

        // --------------------------------
        // IMDb IDs (all in parallel), keep the first 10 that have one
        // --------------------------------
        const normalized = await Promise.all(
            entries.slice(0, 16).map(normalizeItem)
        );
        const results = normalized.filter(n => n.imdbID).slice(0, TOTAL);

        res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");

        return res.status(200).json({
            success: true,
            category,
            results
        });

    } catch (error) {

        console.error(
            "CATEGORY API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Failed to load category"
        });
    }
};
