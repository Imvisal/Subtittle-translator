"use strict";

module.exports = async function handler(req, res) {

    try {

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
            String(req.query.type || "movie").trim();

        if (!title) {
            return res.status(400).json({
                error: "Title is required"
            });
        }

        /*
        ======================================================
        IMPORTANT

        This endpoint returns SOURCE PAGES only.
        It does not download/re-host subtitle files.
        ======================================================
        */

        const cleanTitle = title
            .replace(/[^\w\s-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const searchTitle =
            year
                ? `${cleanTitle} ${year}`
                : cleanTitle;

        const results = [];

        /*
        ======================================================
        SOURCE 1 - Baiscope
        ======================================================
        */

        results.push({
            source: "Baiscope",
            searchUrl:
                `https://www.baiscope.lk/?s=${encodeURIComponent(
                    searchTitle
                )}`,
            type: type
        });


        /*
        ======================================================
        SOURCE 2 - SinhalaSub
        ======================================================
        */

        results.push({
            source: "SinhalaSub",
            searchUrl:
                `https://sinhalasub.lk/?s=${encodeURIComponent(
                    searchTitle
                )}`,
            type: type
        });


        /*
        ======================================================
        SOURCE 3 - Cineru
        ======================================================
        */

        results.push({
            source: "Cineru",
            searchUrl:
                `https://cineru.lk/cineru-search/?s=${encodeURIComponent(
                    searchTitle
                )}`,
            type: type
        });


        return res.status(200).json({

            success: true,

            title: cleanTitle,

            year: year,

            type: type,

            results: results

        });


    } catch (error) {

        console.error(
            "SINHALA SEARCH ERROR:",
            error
        );

        return res.status(500).json({

            error:
                error.message ||
                "Sinhala subtitle search failed"

        });

    }

};
