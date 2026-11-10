#!/usr/bin/env node
/* SinSubz auto-translate runner (GitHub Actions, .github/workflows/auto-translate.yml).

   In the LAST HOUR before the Gemini quota resets (midnight Pacific = 13:30 in Sri Lanka, so it starts about 12:40) it uses
   the quota that is still unused (it would be lost anyway) to translate the episodes / films listed in
   auto-queue.json that are not on the site yet. It stops at the reset, so visitors get the fresh quota, and stores them as "Ready" subtitles (api/_ready.js) so anybody can
   download them from the home page.

   It drives the REAL website in a headless browser (same code path as a visitor: SubDL search -> download -> clean ->
   40-line chunks -> Gemini -> word notes -> credit line), so the result is identical to a normal translation. The only
   difference: every /api/translate call carries the admin key, so there is no sign-in and no daily limit.

   Env:  ADMIN_KEY (required, same value as in Vercel)    SITE_URL (default https://sinsubs.site)
         MAX_PER_RUN (override queue file)   MAX_MINUTES (default 70)   FORCE=1 (skip the "is it quota-reset time?" check)

   Stops by itself when Gemini says the quota is used up, or after 3 failures in a row.  Safe to run again: finished
   episodes are skipped. */
"use strict";

const fs = require("fs");
const path = require("path");

const SITE = (process.env.SITE_URL || "https://sinsubs.site").replace(/\/$/, "");
const KEY = process.env.ADMIN_KEY || "";
const MAX_MS = (Number(process.env.MAX_MINUTES) || 70) * 60 * 1000;
const started = Date.now();

function log() { console.log.apply(console, ["[" + new Date().toISOString().slice(11, 19) + "]"].concat([].slice.call(arguments))); }

function pacificHour() {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date())) % 24;
}

async function api(pathAndQuery, opts) {
    const res = await fetch(SITE + pathAndQuery, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { ok: res.ok, status: res.status, json, text };
}

function wanted(queue) {
    const out = [];
    (queue.titles || []).forEach(t => {
        if (!/^tt\d{5,10}$/.test(String(t.imdb || ""))) { log("skip (bad imdb id):", t.title); return; }
        if (t.type === "tv") {
            (t.episodes || []).forEach(e => out.push({ t, season: Number(t.season), episode: Number(e) }));
        } else {
            out.push({ t, season: 0, episode: 0 });
        }
    });
    return out;
}

// runs inside the website page
async function translateInPage(job) {
    const item = {
        imdbID: job.imdb, title: job.title, year: job.year || "", poster: job.poster || "",
        type: job.type === "tv" ? "series" : "movie"
    };
    const isTv = job.type === "tv";
    const q = new URLSearchParams({ imdb_id: job.imdb, type: isTv ? "episode" : "movie" });
    if (isTv) { q.set("season", String(job.season)); q.set("episode", String(job.episode)); }
    const r = await fetch("/api/subtitles?" + q);
    const d = await r.json();
    if (!r.ok) { throw new Error("subtitle search: " + (d.error || r.status)); }
    const list = (d.results || []).filter(s => !s.hearingImpaired).concat((d.results || []).filter(s => s.hearingImpaired));
    if (!list.length) { return { skip: "no English subtitle on SubDL" }; }

    let subs = null;
    for (const cand of list.slice(0, 4)) {
        try {
            const url = cand.downloadUrl || cand.url || cand.download_url;
            if (!url) { continue; }
            const dr = await fetch("/api/subtitle-download?url=" + encodeURIComponent(url.startsWith("/") ? "https://dl.subdl.com" + url : url));
            const dd = await dr.json();
            if (!dr.ok || !dd.data) { continue; }
            const bin = atob(dd.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
            if (isZipFile(bytes)) { continue; }
            const parsed = parseSRT(decodeSubtitleBytes(bytes));
            if (parsed.length >= (isTv ? 150 : 400)) { subs = parsed; break; }
        } catch (e) { /* try the next file */ }
    }
    if (!subs) { return { skip: "no usable English file (too short / bad)" }; }

    const translated = await translateWithLibrary(subs, item, job.season || null, job.episode || null,
        { title: job.title + (job.year ? " (" + job.year + ")" : "") });
    const srt = buildSRT(addSinSubzCredit(applyWordNotes(translated)));
    const base = getSubtitleBaseName(item, job.season, job.episode);
    return { srt, count: translated.length, filename: base + ".Sinhala.SinSubz.srt" };
}

(async () => {
    if (!KEY) { console.error("ADMIN_KEY is not set"); process.exit(1); }

    const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" || process.env.FORCE === "1";
    if (!manual && pacificHour() !== 23) {
        log("Pacific hour is " + pacificHour() + ", not the last hour before the reset (23): nothing to do (the other cron entry covers it).");
        return;
    }

    const queue = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "auto-queue.json"), "utf8"));
    const maxRun = Number(process.env.MAX_PER_RUN) || Number(queue.max_per_run) || 20;

    const list = await api("/api/stats?ready=list");
    const have = new Set();
    ((list.json && list.json.items) || []).forEach(it => it.eps.forEach(e => have.add(it.id + "|" + (it.type === "tv" ? e.s : 0) + "|" + (it.type === "tv" ? e.e : 0))));

    const todo = wanted(queue).filter(j => !have.has(j.t.imdb + "|" + j.season + "|" + j.episode));
    log("Queue: " + todo.length + " not translated yet, this run does at most " + maxRun + ".");
    if (!todo.length) { return; }

    const { chromium } = require("playwright");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    // no Google sign-in in the runner: pretend there is a token (the server accepts the admin key instead)
    await ctx.addInitScript(() => {
        try { Object.defineProperty(window, "__sinsubzIdToken", { value: async () => "runner", configurable: false, writable: false }); } catch (e) { /* ignore */ }
    });
    await ctx.route(/\/api\/translate/, route => route.continue({ headers: Object.assign({}, route.request().headers(), { "x-admin-key": KEY }) }));
    const page = await ctx.newPage();
    await page.goto(SITE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof translateWithLibrary === "function" && typeof buildSRT === "function", null, { timeout: 60000 });

    let done = 0, failsInRow = 0;
    for (const job of todo) {
        if (done >= maxRun) { log("Reached the per-run limit."); break; }
        if (Date.now() - started > MAX_MS) { log("Time budget used."); break; }
        if (!manual && pacificHour() !== 23) { log("Quota reset reached: the fresh quota is for visitors, stopping."); break; }
        const label = job.t.title + (job.t.type === "tv" ? " S" + String(job.season).padStart(2, "0") + "E" + String(job.episode).padStart(2, "0") : "");
        log("Translating " + label + " ...");
        try {
            const out = await page.evaluate(translateInPage, Object.assign({}, job.t, { season: job.season, episode: job.episode }));
            if (out.skip) { log("  skipped: " + out.skip); continue; }
            const put = await api("/api/stats?ready=put", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": KEY },
                body: JSON.stringify({ imdb: job.t.imdb, title: job.t.title, year: job.t.year, poster: job.t.poster, type: job.t.type === "tv" ? "tv" : "movie", season: job.season, episode: job.episode, filename: out.filename, srt: out.srt, count: out.count })
            });
            if (!put.ok) { throw new Error("store failed " + put.status + " " + put.text.slice(0, 120)); }
            log("  done: " + out.count + " lines");
            done++; failsInRow = 0;
        } catch (e) {
            const msg = String(e && e.message || e);
            log("  failed: " + msg);
            if (/quota|limit|busy|exhaust|try again/i.test(msg)) { log("Gemini quota looks used up: stopping."); break; }
            if (++failsInRow >= 3) { log("3 failures in a row: stopping."); break; }
        }
    }
    await browser.close();
    log("Finished. Translated " + done + " this run.");
})().catch(e => { console.error(e); process.exit(1); });
