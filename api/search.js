module.exports = async function handler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const query =
            String(req.query.query || "").trim();

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
