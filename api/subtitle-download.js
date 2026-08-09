module.exports = async function handler(req, res) {

    try {

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }


        const fileUrl =
            String(
                req.query.url || ""
            ).trim();


        if (!fileUrl) {
            return res.status(400).json({
                error: "Subtitle URL is required"
            });
        }


        // ------------------------------------------------
        // SECURITY
        // Only allow SubDL download server
        // ------------------------------------------------

        let parsed;

        try {

            parsed =
                new URL(fileUrl);

        } catch {

            return res.status(400).json({
                error: "Invalid subtitle URL"
            });

        }


        if (
            parsed.hostname !==
            "dl.subdl.com"
        ) {

            return res.status(403).json({
                error:
                    "Only SubDL download URLs are allowed"
            });

        }


        // Relative URLs returned by SubDL
        const finalUrl =
            parsed.pathname.startsWith("/")
                ? `https://dl.subdl.com${parsed.pathname}`
                : fileUrl;


        const response =
            await fetch(
                finalUrl
            );


        if (!response.ok) {

            return res.status(
                response.status
            ).json({

                error:
                    "Could not download subtitle"

            });

        }


        const buffer =
            await response.arrayBuffer();


        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        return res.status(200).json({

            data:
                Buffer
                    .from(buffer)
                    .toString("base64"),

            contentType

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
