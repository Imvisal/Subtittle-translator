module.exports = async function handler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const {
            imdb_id,
            type,
            season,
            episode
        } = req.query;


        if (!imdb_id) {
            return res.status(400).json({
                error: "IMDb ID is required"
            });
        }


        const apiKey =
            process.env.SUBDL_API_KEY;


        if (!apiKey) {
            return res.status(500).json({
                error: "SUBDL_API_KEY is missing"
            });
        }


        const url =
            new URL(
                "https://api.subdl.com/api/v1/subtitles"
            );


        // API key stays on server
        url.searchParams.set(
            "api_key",
            apiKey
        );


        // Search by IMDb ID
        url.searchParams.set(
            "imdb_id",
            imdb_id
        );


        // English only
        url.searchParams.set(
            "languages",
            "EN"
        );


        // Return individual files
        url.searchParams.set(
            "unpack",
            "1"
        );


        // Maximum results
        url.searchParams.set(
            "subs_per_page",
            "30"
        );


        // Identify our application
        url.searchParams.set(
            "client",
            "custom_integration"
        );


        // TV episode
        if (type === "episode") {

            url.searchParams.set(
                "type",
                "tv"
            );


            if (season) {

                url.searchParams.set(
                    "season_number",
                    String(season)
                );

            }


            if (episode) {

                url.searchParams.set(
                    "episode_number",
                    String(episode)
                );

            }

        }


        // Movie
        else {

            url.searchParams.set(
                "type",
                "movie"
            );

        }


        const response =
            await fetch(
                url.toString(),
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        const raw =
            await response.text();


        let data;

        try {

            data =
                JSON.parse(raw);

        } catch {

            return res.status(502).json({
                error:
                    "SubDL returned invalid JSON"
            });

        }


        if (!response.ok || data.status === false) {

            return res.status(
                response.status || 500
            ).json({
                error:
                    data.error ||
                    "SubDL subtitle search failed"
            });

        }


        const subtitles =
            Array.isArray(data.subtitles)
                ? data.subtitles
                : [];


        const results = [];


        // ------------------------------------------------
        // Convert SubDL response into our UI format
        // ------------------------------------------------

        subtitles.forEach(sub => {

            // Individual files from season packs
            if (
                Array.isArray(
                    sub.unpack_files
                )
            ) {

                sub.unpack_files.forEach(
                    file => {

                        // Make sure this is English
                        if (
                            file.language &&
                            file.language.toUpperCase() !== "EN"
                        ) {
                            return;
                        }


                        // For TV make sure episode matches
                        if (
                            type === "episode" &&
                            episode &&
                            Number(file.episode) !==
                                Number(episode)
                        ) {
                            return;
                        }


                        results.push({

                            id:
                                file.file_n_id,

                            fileId:
                                file.file_n_id,

                            nId:
                                file.file_n_id,

                            fileName:
                                file.name ||
                                "English.srt",

                            release:
                                file.release_name ||
                                sub.release_name ||
                                "",

                            language:
                                file.language ||
                                "EN",

                            fps:
                                sub.fps ||
                                null,

                            hearingImpaired:
                                Boolean(file.hi),

                            format:
                                file.format ||
                                "srt",

                            size:
                                file.size ||
                                0,

                            downloadUrl:
                                file.url

                        });

                    }
                );

            }

        });


        // ------------------------------------------------
        // Remove duplicates
        // ------------------------------------------------

        const unique =
            Array.from(
                new Map(
                    results.map(
                        item => [
                            item.fileId,
                            item
                        ]
                    )
                ).values()
            );


        return res.status(200).json({

            total:
                unique.length,

            results:
                unique.slice(0, 30)

        });


    } catch (error) {

        console.error(
            "SUBDL SEARCH ERROR:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Subtitle search failed"

        });

    }

};
