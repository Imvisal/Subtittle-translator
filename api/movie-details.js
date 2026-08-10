"use strict";

/*
=========================================================
 SubLanka AI
 Movie Details API
 OMDb API
=========================================================
*/

export default async function handler(req, res) {

    /* =====================================================
       CORS
    ===================================================== */

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );


    if (req.method === "OPTIONS") {

        return res.status(200).end();
    }


    /* =====================================================
       ONLY GET
    ===================================================== */

    if (req.method !== "GET") {

        return res.status(405).json({
            error: "Method not allowed"
        });
    }


    /* =====================================================
       GET IMDb ID
    ===================================================== */

    const imdbId =
        req.query?.imdb_id;


    if (!imdbId) {

        return res.status(400).json({
            error: "IMDb ID is required."
        });
    }


    /* =====================================================
       CHECK API KEY
    ===================================================== */

    const apiKey =
        process.env.OMDB_API_KEY ||
        process.env.OMDB_KEY;


    if (!apiKey) {

        console.error(
            "OMDb API key is missing."
        );


        return res.status(500).json({
            error:
                "OMDb API key is not configured."
        });
    }


    /* =====================================================
       VALIDATE IMDb ID
    ===================================================== */

    if (
        !/^tt\d+$/.test(
            String(imdbId)
        )
    ) {

        return res.status(400).json({
            error:
                "Invalid IMDb ID."
        });
    }


    /* =====================================================
       OMDb URL
    ===================================================== */

    const url =
        `https://www.omdbapi.com/?apikey=${encodeURIComponent(
            apiKey
        )}&i=${encodeURIComponent(
            imdbId
        )}&plot=full`;


    try {

        /* =================================================
           FETCH OMDb
        ================================================= */

        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                `OMDb HTTP error: ${response.status}`
            );
        }


        const movie =
            await response.json();


        /* =================================================
           OMDb ERROR
        ================================================= */

        if (
            movie.Response === "False"
        ) {

            return res.status(404).json({

                error:
                    movie.Error ||
                    "Movie not found."

            });
        }


        /* =================================================
           POSTER
        ================================================= */

        let poster =
            movie.Poster;


        if (
            !poster ||
            poster === "N/A"
        ) {

            poster = null;
        }


        /*
          Some poster URLs returned by APIs can be
          malformed. Make sure it is a real URL.
        */

        if (poster) {

            try {

                new URL(poster);

            } catch {

                poster = null;
            }
        }


        /* =================================================
           RETURN CLEAN MOVIE DATA
        ================================================= */

        const result = {

            Title:
                movie.Title ||
                "Unknown",

            Year:
                movie.Year ||
                "N/A",

            Rated:
                movie.Rated ||
                "N/A",

            Released:
                movie.Released ||
                "N/A",

            Runtime:
                movie.Runtime ||
                "N/A",

            Genre:
                movie.Genre ||
                "N/A",

            Director:
                movie.Director ||
                "N/A",

            Writer:
                movie.Writer ||
                "N/A",

            Actors:
                movie.Actors ||
                "N/A",

            Plot:
                movie.Plot ||
                "No description available.",

            Language:
                movie.Language ||
                "N/A",

            Country:
                movie.Country ||
                "N/A",

            Awards:
                movie.Awards ||
                "N/A",

            imdbRating:
                movie.imdbRating ||
                "N/A",

            imdbVotes:
                movie.imdbVotes ||
                "N/A",

            imdbID:
                movie.imdbID ||
                imdbId,

            Type:
                movie.Type ||
                "movie",

            totalSeasons:
                movie.totalSeasons ||
                null,

            Poster:
                poster,

            /*
              Extra lowercase versions so the frontend
              can use either format.
            */

            title:
                movie.Title ||
                "Unknown",

            year:
                movie.Year ||
                "N/A",

            poster:
                poster,

            posterUrl:
                poster
        };


        /* =================================================
           CACHE
        ================================================= */

        res.setHeader(
            "Cache-Control",
            "public, s-maxage=3600, stale-while-revalidate=86400"
        );


        /* =================================================
           RESPONSE
        ================================================= */

        return res.status(200).json({

            success: true,

            movie: result

        });


    } catch (error) {

        console.error(
            "MOVIE DETAILS ERROR:",
            error
        );


        return res.status(500).json({

            error:
                "Could not load movie details.",

            message:
                error.message

        });
    }
}
