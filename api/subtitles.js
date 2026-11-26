// When a film / episode has NO English subtitle on SubDL, other languages are tried (Gemini translates them to Sinhala just as well:
// a Brazilian Portuguese file gave a good Sinhala result). English is always preferred; this runs only when English gave nothing.
const FALLBACK_LANGS = ["BR_PT", "PT", "ES", "FR", "DE", "IT", "NL", "TR", "ID", "AR", "PL", "RU", "RO", "EL", "CS", "HU", "SV", "DA", "NO", "FI", "HE", "FA", "HI", "VI", "TH", "KO", "JA", "ZH", "BG", "HR", "SR", "UK"];
const LANG_NAME = { BR_PT: "Portuguese (Brazil)", PT: "Portuguese", ES: "Spanish", FR: "French", DE: "German", IT: "Italian", NL: "Dutch", TR: "Turkish", ID: "Indonesian", AR: "Arabic", PL: "Polish", RU: "Russian", RO: "Romanian", EL: "Greek", CS: "Czech", HU: "Hungarian", SV: "Swedish", DA: "Danish", NO: "Norwegian", FI: "Finnish", HE: "Hebrew", FA: "Persian", HI: "Hindi", VI: "Vietnamese", TH: "Thai", KO: "Korean", JA: "Japanese", ZH: "Chinese", BG: "Bulgarian", HR: "Croatian", SR: "Serbian", UK: "Ukrainian" };

module.exports = async function handler(req, res) {
    const isFallback = req.__subFallback === true;
    if (!isFallback && req.method === "GET" && await require("./_guard.js").guard(req, res, { kind: "sub", perMin: 40, perHour: 400, cache: 600 })) { return; }

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


        // only real IMDb ids / small numbers reach the SubDL request
        if (!/^(tt)?\d{5,10}$/.test(String(imdb_id))) {
            return res.status(400).json({
                error: "Invalid IMDb ID"
            });
        }

        for (const value of [season, episode]) {
            if (value != null && value !== "" && !/^\d{1,4}$/.test(String(value))) {
                return res.status(400).json({
                    error: "Invalid season or episode"
                });
            }
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


        // English subtitles (the fallback pass asks for the other languages instead)
        url.searchParams.set(
            "languages",
            isFallback ? FALLBACK_LANGS.join(",") : "EN"
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
                            !isFallback &&
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

                        // SubDL often leaves file.episode empty: then read it from the file name (S01E06, 1x06, E06),
                        // and a pack whose files carry no episode number at all is accepted only when it holds a single file
                        if (
                            type === "episode" &&
                            episode
                        ) {

                            let fe = Number(file.episode) || 0;

                            if (!fe) {
                                const nm = String(file.name || "") + " " + String(file.release_name || sub.release_name || "");
                                const m = nm.match(/s\d{1,2}[\s._-]*e(\d{1,3})/i) || nm.match(/\b\d{1,2}x(\d{2,3})\b/i) || nm.match(/(?:^|[^a-z0-9])e(?:p(?:isode)?)?[\s._-]?(\d{1,3})(?![a-z0-9])/i);
                                if (m) { fe = Number(m[1]) || 0; }
                            }

                            if (fe ? fe !== Number(episode) : sub.unpack_files.length !== 1) {

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


                        // the API key must never reach the browser (SubDL puts it into the file links):
                        // /api/subtitle-download adds it again on the server
                        try {
                            const cu = new URL(downloadUrl);
                            if (cu.searchParams.has("api_key")) { cu.searchParams.delete("api_key"); downloadUrl = cu.toString(); }
                        } catch (e) { /* relative or odd: leave as it is */ }

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
                                (isFallback ? "Subtitle.srt" : "English.srt"),

                            release:
                                file.release_name ||
                                sub.release_name ||
                                "",

                            language:
                                (isFallback ? (sub.language || file.language) : file.language) ||
                                (isFallback ? "" : "EN"),

                            fallback:
                                isFallback,

                            languageName:
                                isFallback
                                    ? (LANG_NAME[String(sub.language || file.language || "").toUpperCase().replace(/-/g, "_")] || String(sub.language || file.language || "Other language"))
                                    : "English",

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

        if (!unique.length && !isFallback) {
            // no English at all: try the other languages once (the answer then says fallback:true and which language)
            req.__subFallback = true;
            return handler(req, res);
        }
        if (isFallback) {
            const rank = function (r) { const i = FALLBACK_LANGS.indexOf(String(r.language || "").toUpperCase().replace(/-/g, "_")); return i < 0 ? 99 : i; };
            unique.sort(function (a, b) { return rank(a) - rank(b); });
        }

        if (!unique.length) { res.setHeader("Cache-Control", "no-store"); }     // an empty answer may be a hiccup: never keep it in the CDN

        return res.status(200).json({

            success: true,

            fallback:
                isFallback && unique.length > 0,

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
