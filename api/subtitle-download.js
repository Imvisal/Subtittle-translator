module.exports = async function handler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }


        const rawUrl =
            String(
                req.query.url || ""
            ).trim();


        if (!rawUrl) {
            return res.status(400).json({
                error: "Subtitle URL is required"
            });
        }


        // ==================================================
        // BUILD SAFE SUBDL URL
        // ==================================================

        let finalUrl;


        /*
        --------------------------------------------------
        SubDL can return either:

        /subtitle/xxxxx.zip

        OR

        https://dl.subdl.com/subtitle/xxxxx.zip
        --------------------------------------------------
        */

        if (rawUrl.startsWith("/")) {

            finalUrl =
                `https://dl.subdl.com${rawUrl}`;

        } else {

            try {

                const parsed =
                    new URL(rawUrl);


                if (
                    parsed.hostname !==
                    "dl.subdl.com"
                ) {

                    return res.status(403).json({
                        error:
                            "Only SubDL download URLs are allowed"
                    });

                }


                finalUrl =
                    parsed.toString();


            } catch {

                return res.status(400).json({
                    error:
                        "Invalid subtitle URL"
                });

            }

        }


        // ==================================================
        // EXTRA SECURITY CHECK
        // ==================================================

        let checkUrl;

        try {

            checkUrl =
                new URL(finalUrl);

        } catch {

            return res.status(400).json({
                error:
                    "Invalid subtitle URL"
            });

        }


        if (
            checkUrl.protocol !==
            "https:"
        ) {

            return res.status(403).json({
                error:
                    "Only HTTPS subtitle URLs are allowed"
            });

        }


        if (
            checkUrl.hostname !==
            "dl.subdl.com"
        ) {

            return res.status(403).json({
                error:
                    "Only SubDL download URLs are allowed"
            });

        }


        // ==================================================
        // DOWNLOAD FROM SUBDL
        // ==================================================

        console.log(
            "Downloading subtitle:",
            finalUrl
        );


        const response =
            await fetch(
                finalUrl,
                {
                    method: "GET",
                    redirect: "follow",
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 SubLankaAI"
                    }
                }
            );


        if (!response.ok) {

            console.error(
                "SubDL response:",
                response.status,
                response.statusText
            );


            return res.status(
                response.status
            ).json({

                error:
                    `SubDL download failed (${response.status})`

            });

        }


        // ==================================================
        // READ FILE
        // ==================================================

        const buffer =
            await response.arrayBuffer();


        if (!buffer.byteLength) {

            return res.status(502).json({
                error:
                    "SubDL returned an empty file"
            });

        }


        const contentType =
            response.headers.get(
                "content-type"
            ) || "application/octet-stream";


        // ==================================================
        // RETURN BASE64
        // ==================================================

        return res.status(200).json({

            success: true,

            data:
                Buffer
                    .from(buffer)
                    .toString("base64"),

            contentType,

            size:
                buffer.byteLength

        });


    } catch (error) {

        console.error(
            "SUBDL DOWNLOAD ERROR:",
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                "Subtitle download failed"

        });

    }

};
