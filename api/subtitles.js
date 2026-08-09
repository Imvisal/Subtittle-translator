module.exports = async function handler(req, res) {

    try {

        // ==================================================
        // METHOD CHECK
        // ==================================================

        if (req.method !== "GET") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ==================================================
        // QUERY
        // ==================================================

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


        // ==================================================
        // API KEY
        // ==================================================

        const apiKey =
            process.env.SUBDL_API_KEY;


        if (!apiKey) {

            console.error(
                "SUBDL_API_KEY is missing"
            );

            return res.status(500).json({
                error:
                    "SUBDL_API_KEY is missing in Vercel Environment Variables"
            });

        }


        // ==================================================
        // SUBDL API URL
        // ==================================================

        const url =
            new URL(
                "https://api.subdl.com/api/v1/subtitles"
            );


        // API key stays server-side
        url.searchParams.set(
            "api_key",
            apiKey
        );


        // IMDb ID
        url.searchParams.set(
            "imdb_id",
            String(imdb_id)
        );


        // English subtitles
        url.searchParams.set(
            "languages",
            "EN"
        );


        // Maximum results
        url.searchParams.set(
            "subs_per_page",
            "30"
        );


        // Ask SubDL to return individual files
        url.searchParams.set(
            "unpack",
            "1"
        );


        // Tell SubDL which application is using the API
        url.searchParams.set(
            "client",
            "custom_integration"
        );


        // ==================================================
        // MOVIE / TV
        // ==================================================

        if (type === "episode") {

            // TV
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

        } else {

            // Movie
            url.searchParams.set(
                "type",
                "movie"
            );

        }


        console.log(
            "SubDL search:",
            url
                .toString()
                .replace(
                    apiKey,
                    "***"
                )
        );


        // ==================================================
        // REQUEST SUBDL
        // ==================================================

        const response =
            await fetch(
                url.toString(),
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        const raw =
            await response.text();


        // ==================================================
        // PARSE JSON
        // ==================================================

        let data;

        try {

            data =
                JSON.parse(raw);

        } catch (error) {

            console.error(
                "SUBDL RAW RESPONSE:",
                raw.substring(
                    0,
                    1000
                )
            );

            return res.status(502).json({

                error:
                    "SubDL returned invalid JSON"

            });

        }


        // ==================================================
        // API ERROR
        // ==================================================

        if (
            !response.ok ||
            data.status === false
        ) {

            console.error(
                "SUBDL API ERROR:",
                data
            );


            return res.status(
                response.status || 500
            ).json({

                error:
                    data.error ||
                    "SubDL subtitle search failed"

            });

        }


        // ==================================================
        // GET SUBTITLES
        // ==================================================

        const subtitles =
            Array.isArray(
                data.subtitles
            )
                ? data.subtitles
                : [];


        const results = [];


        // ==================================================
        // PROCESS SUBTITLE RESULTS
        // ==================================================

        subtitles.forEach(
            function (sub) {

                /*
                ------------------------------------------------
                unpack=1 returns individual files here
                ------------------------------------------------
                */

                if (
                    !Array.isArray(
                        sub.unpack_files
                    )
                ) {

                    return;

                }


                sub.unpack_files.forEach(
                    function (file) {

                        // ----------------------------------------
                        // Language
                        // ----------------------------------------

                        if (
                            file.language &&
                            String(
                                file.language
                            ).toUpperCase() !== "EN"
                        ) {

                            return;

                        }


                        // ----------------------------------------
                        // TV episode filter
                        // ----------------------------------------

                        if (
                            type === "episode" &&
                            episode
                        ) {

                            if (
                                Number(
                                    file.episode
                                ) !==
                                Number(
                                    episode
                                )
                            ) {

                                return;

                            }

                        }


                        // ----------------------------------------
                        // URL
                        // ----------------------------------------

                        let downloadUrl =
                            file.url ||
                            "";


                        /*
                        SubDL returns relative URLs such as:

                        /subtitle/12345/abcde

                        Convert them to:

                        https://dl.subdl.com/subtitle/12345/abcde
                        */

                        if (
                            downloadUrl.startsWith(
                                "/"
                            )
                        ) {

                            downloadUrl =
                                `https://dl.subdl.com${downloadUrl}`;

                        }


                        /*
                        If SubDL somehow returns another
                        absolute URL, only accept dl.subdl.com.
                        */

                        if (
                            downloadUrl.startsWith(
                                "http"
                            )
                        ) {

                            try {

                                const parsed =
                                    new URL(
                                        downloadUrl
                                    );


                                if (
                                    parsed.hostname !==
                                    "dl.subdl.com"
                                ) {

                                    return;

                                }

                            } catch {

                                return;

                            }

                        }


                        if (
                            !downloadUrl
                        ) {

                            return;

                        }


                        // ----------------------------------------
                        // Create our clean result
                        // ----------------------------------------

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
                                Boolean(
                                    file.hi
                                ),

                            format:
                                file.format ||
                                "srt",

                            size:
                                file.size ||
                                0,

                            season:
                                file.season ??
                                sub.season ??
                                null,

                            episode:
                                file.episode ??
                                null,

                            downloadUrl:
                                downloadUrl

                        });

                    }
                );

            }
        );


        // ==================================================
        // REMOVE DUPLICATES
        // ==================================================

        const unique =
            Array.from(

                new Map(

                    results.map(
                        function (item) {

                            return [
                                item.fileId,
                                item
                            ];

                        }
                    )

                ).values()

            );


        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(200).json({

            success: true,

            total:
                unique.length,

            results:
                unique.slice(
                    0,
                    30
                )

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
