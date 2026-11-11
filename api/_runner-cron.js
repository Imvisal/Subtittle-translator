/* Vercel cron -> starts the "Auto translate" GitHub workflow.
   GitHub's own schedule is often late or skipped, so Vercel (vercel.json "crons", twice a day) asks GitHub to start it.
   The workflow itself checks that it is the last hour before the Gemini reset and does nothing otherwise.

   Env (Vercel):  CRON_SECRET             any long random text; Vercel sends it as "Authorization: Bearer <CRON_SECRET>"
                  GITHUB_DISPATCH_TOKEN   fine-grained GitHub token for the repo with "Actions: Read and write"
                  GITHUB_REPO             optional, default Imvisal/Subtittle-translator */
"use strict";

const crypto = require("crypto");

function same(a, b) {
    const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
}

module.exports = async function runnerCron(req, res) {
    const secret = process.env.CRON_SECRET;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const adminOk = require("./_admin.js").isAdmin(req);
    if (!adminOk && !(secret && got && same(got, secret))) { return res.status(401).json({ error: "Unauthorized" }); }
    if (!token) { return res.status(503).json({ error: "GITHUB_DISPATCH_TOKEN is not set" }); }
    const repo = /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO || "") ? process.env.GITHUB_REPO : "Imvisal/Subtittle-translator";
    try {
        const r = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/auto-translate.yml/dispatches", {
            method: "POST",
            headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "sinsubz-cron", "Content-Type": "application/json" },
            body: JSON.stringify({ ref: "main", inputs: { source: "cron" } }),
            signal: AbortSignal.timeout(8000)
        });
        if (r.status !== 204) { return res.status(502).json({ error: "GitHub answered " + r.status }); }
        return res.status(200).json({ ok: true, started: true });
    } catch (e) {
        return res.status(502).json({ error: "Could not reach GitHub" });
    }
};
