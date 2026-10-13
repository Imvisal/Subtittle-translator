const AdmZip = require("adm-zip");

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

        const checkUrl =
            new URL(finalUrl);


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

            return res.status(
                response.status
            ).json({

                error:
                    `SubDL download failed (${response.status})`

            });

        }


        const buffer =
            Buffer.from(
                await response.arrayBuffer()
            );


        if (!buffer.length) {

            return res.status(502).json({
                error:
                    "SubDL returned an empty file"
            });

        }


        const contentType =
            response.headers.get(
                "content-type"
            ) ||
            "application/octet-stream";


        // ==================================================
        // CHECK ZIP
        // ==================================================

        const isZip =
            buffer.length >= 4 &&
            buffer[0] === 0x50 &&
            buffer[1] === 0x4b &&
            buffer[2] === 0x03 &&
            buffer[3] === 0x04;


        let subtitleBuffer =
            buffer;


        let subtitleContentType =
            contentType;


        let extractedFileName =
            "subtitle.srt";


        // ==================================================
        // EXTRACT SRT FROM ZIP
        // ==================================================

        if (isZip) {

            try {

                const zip =
                    new AdmZip(
                        buffer
                    );


                const entries =
                    zip
                        .getEntries()
                        .filter(
                            entry =>
                                !entry.isDirectory &&
                                /\.srt$/i.test(
                                    entry.entryName
                                )
                        );


                if (
                    !entries.length
                ) {

                    return res.status(422).json({
                        error:
                            "Subtitle ZIP does not contain an SRT file"
                    });

                }


                // Prefer shortest SRT path
                entries.sort(
                    (a, b) =>
                        a.entryName.length -
                        b.entryName.length
                );


                const selected =
                    entries[0];


                subtitleBuffer =
                    selected.getData();


                extractedFileName =
                    selected.entryName
                        .split("/")
                        .pop() ||
                    "subtitle.srt";


                subtitleContentType =
                    "application/x-subrip";

            } catch (zipError) {

                console.error(
                    "SUBDL ZIP ERROR:",
                    zipError
                );


                return res.status(422).json({
                    error:
                        "Could not extract the subtitle ZIP"
                });

            }

        }


        // ==================================================
        // BASIC SRT VALIDATION
        // ==================================================

        const text =
            subtitleBuffer.toString(
                "utf8"
            );


        if (
            !text.includes("-->")
        ) {

            return res.status(422).json({
                error:
                    "Downloaded file is not a valid SRT subtitle"
            });

        }


        // ==================================================
        // RETURN SRT AS BASE64
        // ==================================================

        return res.status(200).json({

            success:
                true,

            data:
                subtitleBuffer.toString(
                    "base64"
                ),

            contentType:
                subtitleContentType,

            fileName:
                extractedFileName,

            size:
                subtitleBuffer.length,

            extractedFromZip:
                isZip

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
