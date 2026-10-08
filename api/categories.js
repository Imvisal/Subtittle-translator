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
            const separator = endpoint.includes("?")
                ? "&"
                : "?";

            const url =
                `${TMDB_BASE}${endpoint}` +
                `${separator}api_key=${encodeURIComponent(apiKey)}` +
                `&language=en-US`;

            const response = await fetch(url);

            if (!response.ok) {
                const errorText = await response.text();

                throw new Error(
                    `TMDB API error ${response.status}: ${errorText}`
                );
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
        async function normalizeItem(item, forcedType = null) {

            const type =
                forcedType ||
                (item.media_type === "tv"
                    ? "series"
                    : "movie");

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
                title,
                year,
                poster
            };
        }

        // --------------------------------
        // Get category data
        // --------------------------------
        let items = [];

        // TRENDING
        if (category === "trending") {

            const data = await tmdbFetch(
                "/trending/all/day"
            );

            items = (data.results || [])
                .filter(item =>
                    item.media_type === "movie" ||
                    item.media_type === "tv"
                )
                .slice(0, 8);
        }

        // MOVIES
        else if (category === "movie") {

            const data = await tmdbFetch(
                "/discover/movie" +
                "?sort_by=popularity.desc" +
                "&include_adult=false" +
                "&page=1"
            );

            items = (data.results || [])
                .slice(0, 8);
        }

        // TV SERIES
        else if (category === "tv") {

            const data = await tmdbFetch(
                "/discover/tv" +
                "?sort_by=popularity.desc" +
                "&include_adult=false" +
                "&page=1"
            );

            items = (data.results || [])
                .slice(0, 8);
        }

        // ANIME
        else if (category === "anime") {

            const data = await tmdbFetch(
                "/discover/tv" +
                "?sort_by=popularity.desc" +
                "&with_genres=16" +
                "&with_original_language=ja" +
                "&include_adult=false" +
                "&page=1"
            );

            items = (data.results || [])
                .slice(0, 8);
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
        // Convert items + get IMDb IDs
        // --------------------------------
        const results = [];

        for (const item of items) {

            const normalized =
                await normalizeItem(item);

            // Existing subtitle system requires IMDb ID
            if (!normalized.imdbID) {
                continue;
            }

            results.push(normalized);

            // We only need 4 cards
            if (results.length >= 4) {
                break;
            }
        }

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
