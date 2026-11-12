/* Vercel cron -> starts the "Auto translate" GitHub workflow.
   GitHub's own schedule is often late or skipped, so Vercel (vercel.json "crons", twice a day) asks GitHub to start it.
   The workflow itself checks that it is the last hour before the Gemini reset and does nothing otherwise.

   Admin panel (x-admin-key), same URL /api/stats?cron=runner :
     &act=start   start a MANUAL run now (ignores the last-hour rule, stops by itself after 60 minutes)
     &act=stop    ask a running job to stop (flag aq:stop, checked by the runner between episodes) and cancel the GitHub run
     &act=status  { running: bool, since } from GitHub; &act=flag  { stop: bool } (read by the runner)

   Env (Vercel):  CRON_SECRET             any long random text; Vercel sends it as "Authorization: Bearer <CRON_SECRET>"
                  GITHUB_DISPATCH_TOKEN   fine-grained GitHub token for the repo with "Actions: Read and write"
                  GITHUB_REPO             optional, default visalhmg123-cell/sinsubz-runner1 */
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
    const act = (String(req.url || "").match(/[?&]act=([a-z]+)/) || [])[1] || "";
    if (act && !adminOk) { return res.status(401).json({ error: "Unauthorized" }); }
    const g = require("./_google");

    if (act === "flag") {
        try { const [v] = await g.redis([["GET", "aq:stop"]]); return res.status(200).json({ stop: !!v }); } catch (e) { return res.status(200).json({ stop: false }); }
    }

    if (!token) { return res.status(503).json({ error: "GITHUB_DISPATCH_TOKEN is not set" }); }
    const repo = /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO || "") ? process.env.GITHUB_REPO : "visalhmg123-cell/sinsubz-runner1";
    const gh = (path, opt) => fetch("https://api.github.com/repos/" + repo + path, Object.assign({
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "sinsubz-cron", "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000)
    }, opt || {}));
    const active = async () => {
        const out = [];
        for (const st of ["in_progress", "queued"]) {
            const r = await gh("/actions/workflows/auto-translate.yml/runs?status=" + st + "&per_page=10");
            if (r.ok) { const j = await r.json(); (j.workflow_runs || []).forEach(x => out.push({ id: x.id, since: x.run_started_at || x.created_at, status: x.status })); }
        }
        return out;
    };

    try {
        if (act === "status") {
            const runs = await active();
            return res.status(200).json({ ok: true, running: runs.length > 0, runs });
        }
        if (act === "stop") {
            try { await g.redis([["SET", "aq:stop", "1", "EX", "7200"]]); } catch (e) { /* the cancel below still works */ }
            const runs = await active();
            for (const r of runs) { await gh("/actions/runs/" + r.id + "/cancel", { method: "POST" }).catch(() => null); }
            return res.status(200).json({ ok: true, stopped: runs.length });
        }
        if (act === "start") {
            if ((await active()).length) { return res.status(200).json({ ok: false, error: "A run is already going" }); }
            try { await g.redis([["DEL", "aq:stop"]]); } catch (e) { /* ignore */ }
            const r = await gh("/actions/workflows/auto-translate.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { source: "manual" } }) });
            if (r.status !== 204) { return res.status(502).json({ error: "GitHub answered " + r.status }); }
            return res.status(200).json({ ok: true, started: true });
        }

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
