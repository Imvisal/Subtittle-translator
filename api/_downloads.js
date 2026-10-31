/* SinSubz — download counts for the download page.

   Served by api/stats.js:  GET /api/stats?downloads=1
     -> { enabled, android, windows, portable, windowsTotal }

   This file starts with "_" on purpose: Vercel does not count it as a serverless function
   (the Hobby plan allows at most 12). Do not rename it to downloads.js.

   The numbers come straight from GitHub: every release asset has a download_count, and the
   /get/android, /get/windows and /get/portable links end up on those same files, so the
   counts include downloads from the website, the apps' update button and GitHub itself.

   - android      = every .apk across all releases (older releases used other file names)
   - windows      = every Windows installer (.exe that is not the portable one)
   - portable     = every SinSubz-Portable.exe
   - windowsTotal = windows + portable

   Optional: set GITHUB_TOKEN in Vercel to lift GitHub's 60-requests-per-hour limit for
   anonymous calls. The response is cached for 10 minutes, so the limit is not a problem
   without it. */
"use strict";

const REPO = "Imvisal/Subtittle-translator";

module.exports = async function downloadsHandler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const headers = {
            Accept: "application/vnd.github+json",
            "User-Agent": "sinsubz-site"
        };
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
        }

        let android = 0;
        let windows = 0;
        let portable = 0;

        // 100 releases per page; walk pages so the total keeps working as releases pile up
        for (let page = 1; page <= 5; page++) {
            const r = await fetch(
                "https://api.github.com/repos/" + REPO + "/releases?per_page=100&page=" + page,
                { headers, signal: AbortSignal.timeout(8000) }
            );
            if (!r.ok) throw new Error("github " + r.status);

            const releases = await r.json();
            if (!Array.isArray(releases) || releases.length === 0) break;

            for (const rel of releases) {
                for (const a of (rel.assets || [])) {
                    const name = String(a.name || "").toLowerCase();
                    const n = Number(a.download_count) || 0;

                    if (name.endsWith(".apk")) android += n;
                    else if (name.endsWith(".exe") && name.includes("portable")) portable += n;
                    else if (name.endsWith(".exe")) windows += n;
                }
            }

            if (releases.length < 100) break;
        }

        res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
        return res.status(200).json({
            enabled: true,
            android: android,
            windows: windows,
            portable: portable,
            windowsTotal: windows + portable
        });

    } catch (e) {
        // the page simply hides the counts when this fails
        res.setHeader("Cache-Control", "public, s-maxage=60");
        return res.status(200).json({ enabled: false });
    }
};
