/* SinSubz: "Ready" Sinhala translations made by the owner's scheduled runner (GitHub Actions, see
   scripts/auto-translate.js). Everybody can list and download them from the home page.
   Served through /api/stats (?ready=...), so it is not a serverless function of its own.

   GET  /api/stats?ready=list                      -> { items: [ { id, slug, t, y, p, type, eps: [ { s, e, n, ts } ] } ] }
   GET  /tv/<slug>  /film/<slug>  (vercel.json rewrites to ?ready=page&slug=)  -> the title page (HTML, title.js / title.css)
   GET  /api/stats?ready=title&slug=<slug>         -> the same data as JSON
   GET  /sitemap-titles.xml                        (rewrite to ?ready=sitemap)
   GET  /api/stats?ready=get&id=tt123&s=1&e=2      -> the .srt file (download)   (movies: s and e left out)
   POST /api/stats?ready=intros   x-admin-key {offset,redo} -> makes the Sinhala story intro of 2 titles per call (redo: also replaces existing ones)
   POST /api/stats?ready=backfill x-admin-key     -> { cursor } makes /film pages from the saved translations (library), a few films per call
   POST /api/stats?ready=put   x-admin-key         -> { imdb, title, year, poster, type, season, episode, filename, srt }
   POST /api/stats?ready=del   x-admin-key         -> { imdb, season, episode }   (no season/episode = the whole title)

   Redis keys
     rdy:idx                 hash  imdb -> JSON { id, t, y, p, type, eps: { "1x2": { s, e, f (filename), n (lines), ts } } }
     rdy:srt:<imdb>:<s>:<e>  string  gzip + base64 of the .srt text (no expiry) */
"use strict";

const zlib = require("zlib");
const { hasRedis, redis, clean, verifyGoogleUser, overLimit, sha } = require("./_google");

const MAX_SRT = 700000;
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const https = u => { const s = String(u || ""); return /^https:\/\/[^\s"'<>]{4,400}$/.test(s) ? s : ""; };
const num = v => (/^\d{1,4}$/.test(String(v == null ? "" : v)) ? Number(v) : 0);
const imdbOk = v => /^tt\d{5,10}$/.test(String(v || ""));
const q = req => { try { return Object.fromEntries(new URL(req.url, "http://x").searchParams); } catch (e) { return {}; } };
// Some ready files (imported from saved translations) have no SinSubz credit. Add the usual one when it is missing:
// at the start (only when the first line comes after >= 3.4 s of quiet) and after the last line. Same text and rules as the site.
const CREDIT = 'Sinhala Subtitles by SinSubz\nඅලුත්ම Movies සහ TV series වල සිංහල උපසිරැසි සඳහා – <font color="#FFFF00">Sinsubs.site</font>';
function withCredit(srt) {
    try {
        // files saved with an older credit wording (or a small "s" in Subtitles) get the current one
        const swapped = String(srt).replace(/Sinhala [Ss]ubtitles by SinSubz(\r?\n)(?:අලුත්ම[^\n<]*?[–-] )?<font color="#FFFF00">Sinsubs\.site<\/font>/g, (m, nl) => CREDIT.replace(/\n/g, nl));
        if (/Sinsubs\.site/i.test(swapped)) { return swapped; }
        srt = swapped;
        const txt = String(srt).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
        const re = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/;
        const blocks = txt.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        const cues = [];
        let first = Infinity, last = 0;
        for (const b of blocks) {
            const lines = b.split("\n");
            const i = lines.findIndex(l => re.test(l));
            if (i < 0) { continue; }
            const m = re.exec(lines[i]);
            const t = (h, mi, se, ms) => (+h) * 3600 + (+mi) * 60 + (+se) + (+String(ms).padEnd(3, "0")) / 1000;
            first = Math.min(first, t(m[1], m[2], m[3], m[4]));
            last = Math.max(last, t(m[5], m[6], m[7], m[8]));
            cues.push({ ts: lines[i].trim(), text: lines.slice(i + 1).join("\n") });
        }
        if (!cues.length || !isFinite(first)) { return srt; }
        const clock = sec => { const ms = Math.max(0, Math.round(sec * 1000)); const p = (n, w) => String(n).padStart(w, "0"); return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor((ms % 3600000) / 60000), 2) + ":" + p(Math.floor((ms % 60000) / 1000), 2) + "," + p(ms % 1000, 3); };
        if (first >= 3.4) { cues.unshift({ ts: clock(0.4) + " --> " + clock(0.4 + Math.min(4, first - 0.9)), text: CREDIT }); }
        cues.push({ ts: clock(last + 1) + " --> " + clock(last + 5), text: CREDIT });
        return cues.map((c, i) => (i + 1) + "\n" + c.ts + "\n" + c.text).join("\n\n") + "\n";
    } catch (e) { return srt; }
}

const srtKey = (id, s, e) => "rdy:srt:" + id + ":" + s + ":" + e;

const slugify = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "title";
const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SITE = "https://sinsubs.site";
// Public addresses end with -sinhala-subtitles (/film/steps-2026-sinhala-subtitles): the words people search for are in the URL.
// The old address (/film/steps-2026) still works and sends a 301 to the new one.
const SUF = "-sinhala-subtitles";
const pub = s => String(s || "") + SUF;
const pageUrl = m => SITE + (m.type === "tv" ? "/tv/" : "/film/") + pub(m.slug);

async function allTitles() {
    const [flat] = await redis([["HGETALL", "rdy:idx"]]);
    const out = [];
    for (let i = 0; flat && i < flat.length; i += 2) { const m = parse(flat[i + 1]); if (m) { if (!m.slug) { m.slug = slugify(m.t); } out.push(m); } }
    return out;
}

// TMDB: overview, genres, rating and the episode names of the seasons that have ready files. Cached 7 days in Redis.
async function tmdbInfo(m, opts) {
    const key = process.env.TMDB_API_KEY;
    if (!key) { return null; }
    const seasons = [...new Set(Object.values(m.eps || {}).map(x => x.s).filter(Boolean))].sort((a, b) => a - b);
    const ck = "rdy:tmdb:" + m.id;
    const cached = parse((await redis([["GET", ck]]))[0]);
    if (cached && cached.cast !== undefined && seasons.every(n => cached.seasons && cached.seasons[n] && cached.sp && n in cached.sp)) {
        // only the Sinhala intro is missing (new feature, or Gemini failed earlier): make just that, retry at most once an hour
        if (cached.overview && !cached.si && ((opts && opts.force) || Date.now() - (cached.siTry || 0) > 600 * 1000)) {
            cached.siTry = Date.now();
            cached.si = await sinhalaSummary(m.t, m.y, m.type, cached.overview, !!(opts && opts.force));
            await redis([["SET", ck, JSON.stringify(cached), "EX", 7 * 86400]]);
        }
        return cached;
    }
    const isToken = key.length > 40;
    const get = async p => {
        const url = "https://api.themoviedb.org/3" + p + (p.includes("?") ? "&" : "?") + "language=en-US" + (isToken ? "" : "&api_key=" + encodeURIComponent(key));
        const r = await fetch(url, { headers: isToken ? { Authorization: "Bearer " + key } : {}, signal: AbortSignal.timeout(7000) });
        if (!r.ok) { throw new Error("TMDB " + r.status); }
        return r.json();
    };
    try {
        const found = await get("/find/" + m.id + "?external_source=imdb_id");
        const pick = m.type === "tv" ? (found.tv_results || [])[0] : (found.movie_results || [])[0];
        if (!pick) { return cached || null; }
        const d = await get("/" + (m.type === "tv" ? "tv" : "movie") + "/" + pick.id + "?append_to_response=videos,credits");
        const vids = ((d.videos && d.videos.results) || []).filter(v => v.site === "YouTube" && /^[\w-]{6,20}$/.test(v.key || ""));
        const tr = vids.find(v => v.type === "Trailer" && v.official) || vids.find(v => v.type === "Trailer") || vids.find(v => v.type === "Teaser");
        const info = {
            overview: String(d.overview || "").replace(/\s+/g, " ").trim().slice(0, 700),
            tagline: String(d.tagline || "").slice(0, 160),
            genres: (d.genres || []).slice(0, 4).map(g => g.name),
            rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
            runtime: m.type === "tv" ? ((d.episode_run_time || [])[0] || 0) : (d.runtime || 0),
            trailer: tr ? tr.key : "",
            backdrop: d.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + d.backdrop_path : "",
            cast: ((d.credits && d.credits.cast) || []).slice(0, 14).map(c => ({ n: String(c.name || "").slice(0, 60), c: String(c.character || "").replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 50), p: c.profile_path ? "https://image.tmdb.org/t/p/w185" + c.profile_path : "" })).filter(c => c.n),
            by: m.type === "tv" ? (d.created_by || []).slice(0, 3).map(x => String(x.name || "").slice(0, 60)).filter(Boolean)
                : ((d.credits && d.credits.crew) || []).filter(x => x.job === "Director").slice(0, 3).map(x => String(x.name || "").slice(0, 60)),
            totalSeasons: d.number_of_seasons || 0,
            countries: (() => {
                const names = new Intl.DisplayNames(["en"], { type: "region" });
                const codes = m.type === "tv" ? (d.origin_country || []) : (d.production_countries || []).map(c => c.iso_3166_1);
                return codes.slice(0, 2).map(c => { try { return names.of(c) || c; } catch (e) { return c; } });
            })(),
            seasons: {}
        };
        // IMDb / Rotten Tomatoes / Metascore / age rating (OMDb). If OMDb is busy, keep the rest and look again in 6 hours.
        let omdbOk = !process.env.OMDB_API_KEY;
        let omdbBlocked = false;
        try { omdbBlocked = !!(await redis([["GET", "omdb:limit"]]))[0]; } catch (e) { /* ignore */ }
        if (process.env.OMDB_API_KEY && !omdbBlocked) {
            try {
                const or = await fetch("https://www.omdbapi.com/?apikey=" + encodeURIComponent(process.env.OMDB_API_KEY) + "&i=" + encodeURIComponent(m.id), { signal: AbortSignal.timeout(5000) });
                const o = await or.json();
                if (o && o.Response === "True") {
                    omdbOk = true;
                    const val = v => (v && v !== "N/A" ? String(v) : "");
                    info.imdb = val(o.imdbRating); info.votes = val(o.imdbVotes); info.mc = val(o.Metascore); info.rated = val(o.Rated);
                    const rt = (o.Ratings || []).find(x => x.Source === "Rotten Tomatoes");
                    info.rt = rt ? val(rt.Value) : "";
                } else if (o && /Incorrect IMDb ID|not found/i.test(String(o.Error || ""))) { omdbOk = true; }
                else if (o && /limit/i.test(String(o.Error || ""))) { await redis([["SET", "omdb:limit", "1", "EX", 1800]]); }
            } catch (e) { /* retry later */ }
        }
        if (m.type === "tv") {
            info.sp = {};
            for (const n of seasons) {
                try {
                    const sd = await get("/tv/" + pick.id + "/season/" + n);
                    info.sp[n] = sd.poster_path ? "https://image.tmdb.org/t/p/w500" + sd.poster_path : ((sd.episodes || []).find(e => e.still_path) ? "https://image.tmdb.org/t/p/w500" + (sd.episodes || []).find(e => e.still_path).still_path : "");
                    info.seasons[n] = (sd.episodes || []).map(e => ({ e: e.episode_number, name: String(e.name || "").slice(0, 120), air: String(e.air_date || ""), min: e.runtime || 0 }));
                } catch (err) { info.seasons[n] = []; }
            }
        }
        info.si = (cached && cached.si) || "";
        info.siTry = Date.now();
        { const v = info.imdb ? "i:" + info.imdb : (info.rating ? "t:" + info.rating : ""); if (v) { redis([["HSET", "rdy:rt", m.id, v]]).catch(() => {}); } }   // rating tag on the ready posters
        await redis([["SET", ck, JSON.stringify(info), "EX", omdbOk ? 7 * 86400 : 6 * 3600]]);
        if (!info.si && info.overview) {
            info.si = await sinhalaSummary(m.t, m.y, m.type, info.overview, !!(opts && opts.force));
            if (info.si) { await redis([["SET", ck, JSON.stringify(info), "EX", omdbOk ? 7 * 86400 : 6 * 3600]]); }
        }
        return info;
    } catch (err) {
        return cached || null;
    }
}

// A brand-new title: build its TMDB info + Sinhala story intro right away (not on the first visit). Never fails the caller.
async function warmTitle(m, ms) {
    try { await Promise.race([tmdbInfo(m, { force: true }), new Promise(r => setTimeout(r, ms || 7000))]); } catch (e) { /* the page makes it later */ }
}

// A short spoiler-free Sinhala story intro (Gemini), written from the English TMDB overview. Never blocks the page for long.
let sumErr = "";      // why the last Sinhala intro failed (shown in the admin panel)
async function sinhalaSummary(title, year, type, overview, bulk) {
    sumErr = "";
    if (!overview) { return ""; }
    const keys = [...new Set([].concat((process.env.GEMINI_API_KEYS || "").split(","), process.env.GEMINI_API_KEY, Array.from({ length: 29 }, (_, i) => process.env["GEMINI_API_KEY_" + (i + 2)])).map(k => (k || "").trim()).filter(Boolean))];
    if (!keys.length && !process.env.GEMINI_SUMMARY_KEY) { sumErr = "no Gemini key"; return ""; }
    const prompt = "Write a short Sinhala story intro for the " + (type === "tv" ? "TV series" : "film") + " \"" + title + "\" (" + year + ").\n" +
        "Source (English overview): " + overview + "\n\n" +
        "Rules: 2 or 3 sentences, 40-70 words. Natural, friendly spoken Sinhala (ඔයා, මේක, ඒක; not bookish). Tell ONLY the set-up / the first part of the story that the overview gives. " +
        "NO spoilers: no twists or reveals, no deaths, no betrayals, no who-is-really-who, no ending, nothing that happens after the opening situation. If the overview itself hints at a later event, leave that part out. " +
        "Use ONLY facts that are in the overview, do not invent plot, do not add opinions or praise. Keep character and place names in English letters. " +
        "Output only the Sinhala text, no quotes, no title, no markdown.";
    // page view: ONE key (GEMINI_SUMMARY_KEY, else the last Gemini key) so the translation keys stay free.
    // admin "make all" (bulk): that key first, then up to 3 other keys, and two models, because quota may be used up
    const first = (process.env.GEMINI_SUMMARY_KEY || "").trim() || keys[keys.length - 1];
    const tryKeys = bulk ? [...new Set([first].concat(keys.slice().reverse().slice(0, 4)))].filter(Boolean) : [first];
    const models = bulk ? ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"] : ["gemini-2.5-flash-lite"];
    for (const model of models) {
        for (const key of tryKeys) {
            try {
                const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
                    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 400 } }),
                    signal: AbortSignal.timeout(bulk ? 5000 : 6000)
                });
                if (!r.ok) { sumErr = "Gemini " + r.status + " (" + model + ")"; if (r.status === 429 || r.status === 503 || r.status === 404 || r.status === 400 || r.status === 401 || r.status === 403) { continue; } return ""; }       // a dead / limited key: try the next one (then the Cloudflare writer)
                const j = await r.json();
                const t = String((((j.candidates || [])[0] || {}).content || {}).parts ? j.candidates[0].content.parts.map(x => x.text || "").join("") : "").replace(/[*_`#>"]+/g, "").replace(/\s+/g, " ").trim();
                if (t.length > 30 && /[\u0D80-\u0DFF]/.test(t)) { return t.slice(0, 600); }
                sumErr = "Gemini answered, but not usable Sinhala text";
            } catch (e) { sumErr = "Gemini timeout / network"; }
        }
    }
    // Gemini is out of quota / failed: the Cloudflare chat model (the same one the backup translator uses) writes the intro instead
    try {
        const mt = require("./_mt.js");
        if (mt.llmEnabled()) {
            const t = String(await Promise.race([mt.llmText(prompt), new Promise((_, no) => setTimeout(() => no(new Error("Cloudflare timeout")), bulk ? 9000 : 6500))]))
                .replace(/[*_`#>"]+/g, "").replace(/\s+/g, " ").trim();
            if (t.length > 30 && /[\u0D80-\u0DFF]/.test(t)) { return t.slice(0, 600); }
            sumErr += " | Cloudflare gave no usable Sinhala";
        } else { sumErr += " | no Cloudflare fallback"; }
    } catch (e) { sumErr += " | Cloudflare: " + String(e && e.message || e).slice(0, 50); }
    return "";
}


// ---------------------------------------------------------------------------------------------
// FILM PAGES FROM THE LIBRARY: every film that a signed-in visitor translated (lib:t:<imdb>:<style>) gets a /film/<slug>
// page and a ready file built from the saved Sinhala lines. Runs when a translation is saved and, for the old
// ones, from the admin panel (ready=backfill). TV episodes are not touched here: the auto runner makes those pages.
// ---------------------------------------------------------------------------------------------

// TMDB genre ids -> short names for the home page filter (a few TV-only ids are split into the usual two)
const GENRE = { 28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller", 10752: "War", 37: "Western", 10759: ["Action", "Adventure"], 10765: ["Sci-Fi", "Fantasy"], 10768: ["War"], 10762: ["Family"] };
const genreNames = ids => [...new Set([].concat(...(ids || []).map(i => GENRE[i] || [])))].slice(0, 4);
const tsrt = ms => { const t = Math.max(0, Math.round(ms)); const p = (n, l) => String(n).padStart(l, "0"); return p(Math.floor(t / 3600000), 2) + ":" + p(Math.floor(t / 60000) % 60, 2) + ":" + p(Math.floor(t / 1000) % 60, 2) + "," + p(t % 1000, 3); };
function pairsToSrt(pairs) {
    let n = 0, out = "";
    pairs.forEach(x => { if (x && x.si) { n++; out += n + "\n" + tsrt(x.s) + " --> " + tsrt(x.e) + "\n" + String(x.si).trim() + "\n\n"; } });
    return { srt: out, count: n };
}
async function tmdbRaw(p) {
    const key = process.env.TMDB_API_KEY;
    if (!key) { throw new Error("no TMDB key"); }
    const isToken = key.length > 40;
    const url = "https://api.themoviedb.org/3" + p + (p.includes("?") ? "&" : "?") + "language=en-US" + (isToken ? "" : "&api_key=" + encodeURIComponent(key));
    const r = await fetch(url, { headers: isToken ? { Authorization: "Bearer " + key } : {}, signal: AbortSignal.timeout(7000) });
    if (!r.ok) { throw new Error("TMDB " + r.status); }
    return r.json();
}
// makes (or skips) the page of one film. opts.ts = time stamp (old films get an old one so they do not flood "newest").
async function registerFilm(imdb, opts) {
    try {
        if (!hasRedis() || !imdbOk(imdb)) { return "skip"; }
        const o = opts || {};
        const [have] = await redis([["HEXISTS", "rdy:idx", imdb]]);
        if (Number(have) === 1) { return "exists"; }
        // every saved style of this film: take the longest saved copy
        const [keys] = await redis([["SCAN", "0", "MATCH", "lib:t:" + imdb + ":*", "COUNT", "200"]]);
        const klist = ((keys && keys[1]) || []).filter(k => /^lib:t:tt\d+:[a-z0-9_-]{1,24}$/.test(k));
        if (!klist.length) { return "nolib"; }
        let best = null;
        const hashes = await redis(klist.map(k => ["HGETALL", k]));
        for (const all of hashes) {
            for (let i = 0; all && i + 1 < all.length; i += 2) {
                try {
                    const pairs = JSON.parse(zlib.gunzipSync(Buffer.from(all[i + 1], "base64")).toString("utf8"));
                    if (Array.isArray(pairs) && (!best || pairs.length > best.length)) { best = pairs; }
                } catch (e) { /* skip a damaged copy */ }
            }
        }
        if (!best) { return "nolib"; }
        const made = pairsToSrt(best);
        if (made.count < 20) { return "short"; }
        const found = await tmdbRaw("/find/" + imdb + "?external_source=imdb_id");
        const mv = (found.movie_results || [])[0];
        if (!mv) { return "notfilm"; }          // a series or unknown id
        const title = clean(mv.title || mv.original_title, 100);
        if (!title) { return "notfilm"; }
        const year = String(mv.release_date || "").slice(0, 4);
        const m = { id: imdb, t: title, y: year, type: "movie", p: mv.poster_path ? "https://image.tmdb.org/t/p/w342" + mv.poster_path : "", g: genreNames(mv.genre_ids), gt: 1, eps: {} };
        const taken = new Set((await allTitles()).filter(x => x.id !== imdb).map(x => x.slug));
        let sl = slugify(m.t);
        if (taken.has(sl) && m.y) { sl = slugify(m.t + " " + m.y); }
        if (taken.has(sl)) { sl = sl + "-" + imdb; }
        m.slug = sl;
        m.eps["0x0"] = { s: 0, e: 0, f: (title + (year ? " " + year : "") + ".Sinhala.SinSubz.srt").replace(/[\\/:*?"<>|]+/g, "_"), r: "", n: made.count, ts: o.ts || Date.now() };
        const packed = zlib.gzipSync(Buffer.from(made.srt, "utf8")).toString("base64");
        await redis([["SET", srtKey(imdb, 0, 0), packed], ["HSETNX", "rdy:idx", imdb, JSON.stringify(m)]]);
        if (!o.ts) { await warmTitle(m, 5000); await require("./_telegram.js").postNew(m, 0, 0); }          // the backfill (o.ts set) is warmed by its own admin button
        return "created";
    } catch (e) { return "error"; }
}

// ---- admin: look through what signed-in visitors saved ("My translations", kept for some days) and put the ones that are not
// on the Ready list yet into the approval list. The title is worked out from the name; only a clear match is used. ----
function guessName(label) {
    const t = String(label || "").replace(/\.srt$/i, "").replace(/[._]+/g, " ").replace(/[\[\](){}]/g, " ");
    const m = /\bs(\d{1,2})\s?e(\d{1,3})\b/i.exec(t) || /\b(\d{1,2})x(\d{2,3})\b/i.exec(t);
    const y = /\b((?:19|20)\d{2})\b/.exec(t);
    const name = t.replace(/\bs\d{1,2}\s?e\d{1,3}\b.*$/i, "").replace(/\b\d{1,2}x\d{2,3}\b.*$/i, "").replace(/\b(19|20)\d{2}\b.*$/, "").replace(/\b(720p|1080p|2160p|4k|web|webrip|bluray|brrip|hdrip|hdtv|x264|x265)\b.*$/i, "").replace(/\s+Sinhala.*$/i, "").replace(/[-\u2013]+\s*$/, "").replace(/\s+/g, " ").trim();
    return { name, s: m ? Number(m[1]) : 0, e: m ? Number(m[2]) : 0, y: y ? y[1] : "" };
}
const normT = x => String(x || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

async function recover(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
    const out = { looked: 0, added: 0, exists: 0, unsure: 0, notsinhala: 0, names: [] };
    const deadline = Date.now() + 40000;
    let cursor = "0";
    const keys = [];
    do {
        const [scan] = await redis([["SCAN", cursor, "MATCH", "tr:meta:*", "COUNT", "200"]]);
        cursor = String((scan && scan[0]) || "0");
        ((scan && scan[1]) || []).forEach(k => keys.push(k));
    } while (cursor !== "0" && keys.length < 2000);
    const seen = new Set();
    for (const mk of keys) {
        if (Date.now() > deadline) { break; }
        const [flat] = await redis([["HGETALL", mk]]);
        for (let i = 0; flat && i + 1 < flat.length; i += 2) {
            if (Date.now() > deadline) { break; }
            const meta = parse(flat[i + 1]); if (!meta) { continue; }
            const g = guessName(meta.filename || meta.title);
            if (g.name.length < 2) { out.unsure++; continue; }
            const tv = !!(g.s && g.e);
            const dedupe = normT(g.name) + ":" + g.y + ":" + g.s + ":" + g.e;
            if (seen.has(dedupe)) { continue; }
            seen.add(dedupe);
            out.looked++;
            try {
                const r = await tmdbRaw("/search/" + (tv ? "tv" : "movie") + "?query=" + encodeURIComponent(g.name) + (!tv && g.y ? "&year=" + g.y : "") + "&page=1");
                const hit = (r.results || []).find(x => normT(x.title || x.name) === normT(g.name) || normT(x.original_title || x.original_name) === normT(g.name));
                if (!hit) { out.unsure++; continue; }
                let imdb = "";
                if (tv) { const ex = await tmdbRaw("/tv/" + hit.id + "/external_ids"); imdb = ex.imdb_id || ""; }
                else { const mv = await tmdbRaw("/movie/" + hit.id); imdb = mv.imdb_id || ""; }
                if (!imdbOk(imdb)) { out.unsure++; continue; }
                const [idxRaw, dup] = await redis([["HGET", "rdy:idx", imdb], ["EXISTS", "rdy:pk:" + imdb + ":" + g.s + ":" + g.e]]);
                const idx = parse(idxRaw);
                if (Number(dup) === 1 || (idx && idx.eps && idx.eps[g.s + "x" + g.e])) { out.exists++; continue; }
                const packed = (await redis([["GET", "tr:srt:" + mk.slice("tr:meta:".length) + ":" + meta.id]]))[0];
                if (!packed) { continue; }
                const srt = zlib.gunzipSync(Buffer.from(packed, "base64")).toString("utf8");
                const cues = (srt.match(/-->/g) || []).length, letters = (srt.match(/[\u0D80-\u0DFF]/g) || []).length;
                if (cues < 20 || letters < cues * 3 || srt.length > MAX_SRT) { out.notsinhala++; continue; }
                const title = clean(hit.title || hit.name, 100);
                const year = String(hit.release_date || hit.first_air_date || "").slice(0, 4);
                const id = require("crypto").randomBytes(7).toString("hex");
                const item = { id, t: Date.now(), imdb, title, year, poster: hit.poster_path ? "https://image.tmdb.org/t/p/w342" + hit.poster_path : "", type: tv ? "tv" : "movie", s: g.s, e: g.e, lines: cues, by: "found in visitors' saved translations",
                    filename: clean(meta.filename, 140), srt: zlib.gzipSync(Buffer.from(srt, "utf8")).toString("base64") };
                await redis([["SET", "rdy:pend:" + id, JSON.stringify(item), "EX", 30 * 86400], ["LPUSH", "rdy:pendl", id], ["LTRIM", "rdy:pendl", 0, 199], ["SET", "rdy:pk:" + imdb + ":" + g.s + ":" + g.e, "1", "EX", 30 * 86400]]);
                out.added++; out.names.push(title + (tv ? " S" + g.s + "E" + g.e : ""));
            } catch (e) { out.unsure++; }
        }
    }
    return res.status(200).json(out);
}

async function backfill(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const cursor = /^\d{1,20}$/.test(String(b.cursor == null ? "0" : b.cursor)) ? String(b.cursor == null ? "0" : b.cursor) : "0";
    const [scan] = await redis([["SCAN", cursor, "MATCH", "lib:t:tt*", "COUNT", "14"]]);
    const next = String((scan && scan[0]) || "0");
    const ids = [...new Set(((scan && scan[1]) || []).map(k => (/^lib:t:(tt\d{5,10}):[a-z0-9_-]{1,24}$/.exec(k) || [])[1]).filter(Boolean))];
    const stats = { created: 0, exists: 0, skipped: 0, errors: 0 };
    const old = Date.now() - 120 * 86400e3;          // old films go to the end of the "newest" list
    for (let i = 0; i < ids.length; i += 5) {
        const r = await Promise.all(ids.slice(i, i + 5).map(id => registerFilm(id, { ts: old })));
        r.forEach(x => { if (x === "created") { stats.created++; } else if (x === "exists") { stats.exists++; } else if (x === "error") { stats.errors++; } else { stats.skipped++; } });
    }
    return res.status(200).json(Object.assign({ cursor: next, done: next === "0", scanned: ids.length }, stats));
}

// Sinhala story intros for the titles that are already in the list (2 per call; the admin page keeps calling until done)
async function intros(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const offset = Math.max(0, parseInt(b.offset, 10) || 0), redo = !!b.redo;
    const list = (await allTitles()).sort((x, y) => (x.id < y.id ? -1 : 1));
    const part = list.slice(offset, offset + 2);
    const r = { made: 0, had: 0, failed: 0 };
    for (const m of part) {
        try {
            const ck = "rdy:tmdb:" + m.id;
            let c = parse((await redis([["GET", ck]]))[0]);
            if (!c) { c = await tmdbInfo(m); }                 // fills the cache (and makes the intro on the way)
            if (!c || !c.overview) { r.failed++; r.why = c ? "TMDB has no overview" : "TMDB lookup failed (TMDB_API_KEY?)"; continue; }
            if (c.si && !redo) { r.had++; continue; }
            const si = await sinhalaSummary(m.t, m.y, m.type, c.overview, true);
            if (si) { c.si = si; c.siTry = Date.now(); await redis([["SET", ck, JSON.stringify(c), "EX", 7 * 86400]]); r.made++; } else { r.failed++; r.why = sumErr || "no overview"; }
        } catch (e) { r.failed++; r.why = "error: " + String(e && e.message || e).slice(0, 60); }
    }
    const next = offset + part.length;
    return res.status(200).json(Object.assign({ next: next, total: list.length, done: next >= list.length }, r));
}

// Called by the twice-a-day cron: fill the Sinhala intro of a few titles that still have none (budget-limited), so nothing depends on a visit.
async function fillMissingIntros(maxTitles, ms) {
    const until = Date.now() + (ms || 15000);
    let made = 0;
    try {
        const list = (await allTitles()).sort((x, y) => (y.ts || 0) - (x.ts || 0));
        for (const m of list) {
            if (made >= (maxTitles || 6) || Date.now() > until) { break; }
            const ck = "rdy:tmdb:" + m.id;
            let c = parse((await redis([["GET", ck]]))[0]);
            if (!c) { c = await tmdbInfo(m, { force: true }); if (c && c.si) { made++; } continue; }
            if (c.si || !c.overview) { continue; }
            const si = await sinhalaSummary(m.t, m.y, m.type, c.overview, true);
            if (si) { c.si = si; c.siTry = Date.now(); await redis([["SET", ck, JSON.stringify(c), "EX", 7 * 86400]]); made++; } else if (sumErr && /429|quota/i.test(sumErr)) { break; }
        }
    } catch (e) { /* the next run continues */ }
    return made;
}

// Where the film / series can be watched legally (TMDB "watch providers", data by JustWatch). Names only, kept 2 days. Sri Lanka first, else US.
async function watchProviders(m) {
    const ck = "rdy:wp:" + m.id;
    try {
        const c = parse((await redis([["GET", ck]]))[0]);
        if (c) { return c.none ? null : c; }
    } catch (e) { /* go on */ }
    try {
        const found = await tmdbRaw("/find/" + m.id + "?external_source=imdb_id");
        const pick = m.type === "tv" ? (found.tv_results || [])[0] : (found.movie_results || [])[0];
        if (!pick) { return null; }
        const r = await tmdbRaw("/" + (m.type === "tv" ? "tv" : "movie") + "/" + pick.id + "/watch/providers");
        const res = r.results || {};
        const cc = res.LK && (res.LK.flatrate || res.LK.rent || res.LK.buy || res.LK.free || res.LK.ads) ? "LK" : (res.US ? "US" : "");
        const x = cc ? res[cc] : null;
        const names = a => (a || []).slice(0, 8).map(p => String(p.provider_name || "").slice(0, 40)).filter(Boolean);
        const out = x ? { cc, link: /^https:\/\/www\.themoviedb\.org\//.test(x.link || "") ? x.link : "", stream: names(x.flatrate), free: names((x.free || []).concat(x.ads || [])), rent: names(x.rent), buy: names(x.buy) } : null;
        const has = out && (out.stream.length || out.free.length || out.rent.length || out.buy.length);
        await redis([["SET", ck, JSON.stringify(has ? out : { none: 1 }), "EX", has ? 2 * 86400 : 6 * 3600]]);
        return has ? out : null;
    } catch (e) { return null; }
}

async function titleData(slug) {
    const list = await allTitles();
    const m = list.find(x => x.slug === slug) || list.find(x => x.id === slug);
    if (!m) { return null; }
    const info = (await tmdbInfo(m)) || { overview: "", tagline: "", genres: [], rating: 0, runtime: 0, trailer: "", seasons: {} };
    const seasons = {};
    const have = Object.values(m.eps || {});
    have.forEach(x => { (seasons[x.s] = seasons[x.s] || { have: {} }).have[x.e] = { n: x.n, r: x.r || "", ts: x.ts }; });
    Object.keys(seasons).forEach(n => {
        const tm = (info.seasons && info.seasons[n]) || [];
        const eps = new Map();
        tm.forEach(e => eps.set(e.e, { e: e.e, name: e.name, air: e.air }));
        Object.keys(seasons[n].have).forEach(e => { if (!eps.has(Number(e))) { eps.set(Number(e), { e: Number(e), name: "", air: "" }); } });
        seasons[n] = [...eps.values()].sort((a, b) => a.e - b.e).map(e => Object.assign(e, { ready: !!seasons[n].have[e.e], r: (seasons[n].have[e.e] || {}).r || "", n: (seasons[n].have[e.e] || {}).n || 0 }));
    });
    const wp = await Promise.race([watchProviders(m), new Promise(r => setTimeout(() => r(null), 3500))]).catch(() => null);
    // "More Sinhala subtitles": other titles (same genre first, then the newest), plain links for visitors and for Google
    const tsOf = x => Math.max(0, ...Object.values(x.eps || {}).map(e => e.ts || 0));
    const mg = new Set(m.g || []);
    const more = list.filter(x => x.id !== m.id && x.p).map(x => ({ x, score: (x.g || []).filter(g => mg.has(g)).length * 2 + (x.type === m.type ? 1 : 0), ts: tsOf(x) }))
        .sort((a, b) => b.score - a.score || b.ts - a.ts).slice(0, 12)
        .map(o => ({ slug: o.x.slug, title: o.x.t, year: o.x.y, poster: o.x.p, type: o.x.type }));
    return { more, wp, id: m.id, slug: m.slug, title: m.t, year: m.y, poster: m.p, type: m.type, overview: info.overview, trailer: info.trailer || "", backdrop: info.backdrop || "", sp: info.sp || {}, cast: info.cast || [], by: info.by || [], imdb: info.imdb || "", votes: info.votes || "", rt: info.rt || "", mc: info.mc || "", rated: info.rated || "", si: info.si || "", tagline: info.tagline, genres: info.genres, rating: info.rating, runtime: info.runtime, seasons, url: pageUrl(m) };
}

function pageHtml(d) {
    const isTv = d.type === "tv";
    const readyCount = Object.values(d.seasons).reduce((a, l) => a + l.filter(e => e.ready).length, 0);
    const name = d.title + (d.year ? " (" + d.year + ")" : "");
    const ttl = name + " Sinhala Subtitles | සිංහල උපසිරැසි" + (isTv ? " (all episodes)" : "") + " | SinSubz";
    const desc = (isTv
        ? "Download " + d.title + " Sinhala subtitles for " + readyCount + " episode" + (readyCount === 1 ? "" : "s") + ". "
        : "Download " + d.title + " Sinhala subtitles. ") + "Free Sinhala sub (සිංහල උපසිරැසි) .srt files in natural spoken Sinhala from SinSubz." + (d.overview ? " " + d.overview.slice(0, 120) : "");
    const faq = [
        ["How do I download " + d.title + " Sinhala subtitles?",
            "Open this page, " + (isTv ? "pick the season and episode, " : "") + "press Download and choose the video version you have. You get a .srt Sinhala subtitle file for free.",
            d.title + " සිංහල උපසිරැසි ඩවුන්ලෝඩ් කරන්නේ කොහොමද?",
            "මේ පිටුවේ " + (isTv ? "season එකයි episode එකයි තෝරලා " : "") + "Download ඔබලා ඔයාගේ video එකේ version එක තෝරන්න. නොමිලේ .srt සිංහල උපසිරැසි file එක ලැබෙනවා."],
        ["How do I add the Sinhala subtitle to my video?",
            "Save the .srt with the same name as the video file in the same folder, or load it in your player (VLC, MX Player, Kodi, a smart TV or a phone player).",
            "උපසිරැසි video එකට දාගන්නේ කොහොමද?",
            "Video file එකේ නමටම .srt file එක නම් කරලා එකම folder එකේ දාන්න, නැත්නම් VLC, MX Player වගේ player එකේ Subtitles → Add කරන්න."],
        ["Which video version does the Sinhala subtitle fit?",
            "Subtitle timing depends on the video release (WEB-DL, BluRay, WEBRip, HDTV). Choose \"Match my video\" and we sync the Sinhala subtitle to your version.",
            "මේ උපසිරැසි මොන video version එකට ගැළපෙනවද?",
            "Timing එක රඳා පවතින්නේ video release එක (WEB-DL, BluRay, WEBRip, HDTV) මතයි. \"Match my video\" තෝරන්න, අපි ඔයාගේ version එකට sync කරලා දෙනවා."],
        ["Is it free?", "Yes. Downloading Sinhala subtitles from SinSubz is free.", "මේක නොමිලේද?", "ඔව්. SinSubz වලින් සිංහල උපසිරැසි ඩවුන්ලෝඩ් කිරීම නොමිලේ."]
    ];
    const crumbName = isTv ? "TV series" : "Films";
    const ld = { "@context": "https://schema.org", "@graph": [
        { "@type": isTv ? "TVSeries" : "Movie", name: d.title, url: d.url, image: d.poster || undefined, description: d.overview || undefined, inLanguage: "si",
            genre: d.genres && d.genres.length ? d.genres : undefined, datePublished: d.year || undefined,
            actor: d.cast && d.cast.length ? d.cast.slice(0, 8).map(c => ({ "@type": "Person", name: c.n })) : undefined,
            director: !isTv && d.by && d.by.length ? d.by.map(n => ({ "@type": "Person", name: n })) : undefined,
            duration: !isTv && d.runtime ? "PT" + d.runtime + "M" : undefined,
            trailer: d.trailer && d.year ? { "@type": "VideoObject", name: d.title + " trailer", description: "Official trailer of " + d.title + ".",
                thumbnailUrl: "https://img.youtube.com/vi/" + d.trailer + "/hqdefault.jpg", embedUrl: "https://www.youtube.com/embed/" + d.trailer, uploadDate: d.year + "-01-01" } : undefined },
        { "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "SinSubz", item: SITE + "/" },
            { "@type": "ListItem", position: 2, name: crumbName + " Sinhala subtitles", item: SITE + "/#readyTitles" },
            { "@type": "ListItem", position: 3, name: d.title, item: d.url }] },
        { "@type": "FAQPage", mainEntity: faq.map(f => ({ "@type": "Question", name: f[0], acceptedAnswer: { "@type": "Answer", text: f[1] } })).concat(
            faq.map(f => ({ "@type": "Question", name: f[2], acceptedAnswer: { "@type": "Answer", text: f[3] } }))) }
    ] };
    const faqHtml = faq.map(f => "<details><summary>" + esc(f[0]) + " <span>" + esc(f[2]) + "</span></summary><p>" + esc(f[1]) + "</p><p lang=\"si\">" + esc(f[3]) + "</p></details>").join("");
    const seoBlock = '<section class="tp-card tp-seo"><h2>' + esc(d.title) + " Sinhala Subtitles (සිංහල උපසිරැසි)</h2>" +
        "<p>Download " + esc(d.title) + " Sinhala sub for free. SinSubz makes natural spoken Sinhala subtitles (.srt) that fit your video. " +
        esc(d.title) + " සිංහල උපසිරැසි නොමිලේ ඩවුන්ලෝඩ් කරගන්න.</p>" + faqHtml + "</section>";
    const moreHtml = (d.more && d.more.length) ? '<section class="tp-card tp-more"><h2>Similar Sinhala subtitles <span lang="si" style="font-weight:600;opacity:.7">· සමාන උපසිරැසි</span></h2><div class="tp-mrow">' + d.more.map(x =>
        '<a class="tp-mc" href="/' + (x.type === "tv" ? "tv" : "film") + "/" + esc(pub(x.slug)) + '"><img src="' + esc(x.poster) + '" alt="' + esc(x.title) + ' Sinhala subtitles" loading="lazy" width="120" height="180"><span>' + esc(x.title) + (x.year ? " (" + esc(x.year) + ")" : "") + "</span></a>").join("") + "</div></section>" : "";
    const seed = JSON.stringify(d).replace(/</g, "\\u003c");
    const noscript = (d.overview ? "<h1>" + esc(d.title) + " Sinhala Subtitles</h1><p>" + esc(d.overview) + "</p>" + (d.si ? "<p>" + esc(d.si) + "</p>" : "") : "") + (!isTv ? '<p><a href="/api/stats?ready=get&amp;id=' + esc(d.id) + '&amp;s=0&amp;e=0">Download ' + esc(d.title) + " Sinhala subtitle (.srt)</a></p>" : "") + (!isTv ? "" : Object.keys(d.seasons).map(n => "<h3>Season " + esc(n) + "</h3><ul>" + d.seasons[n].filter(e => e.ready).map(e =>
        '<li><a href="/api/stats?ready=get&amp;id=' + esc(d.id) + "&amp;s=" + esc(n) + "&amp;e=" + esc(e.e) + '">S' + String(n).padStart(2, "0") + "E" + String(e.e).padStart(2, "0") + (e.name ? " " + esc(e.name) : "") + " Sinhala subtitle (.srt)</a></li>").join("") + "</ul>").join(""));
    return '<!DOCTYPE html>\n<html lang="en" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        "<title>" + esc(ttl) + '</title><meta name="description" content="' + esc(desc) + '"><meta name="theme-color" content="#07080d">' +
        '<link rel="canonical" href="' + esc(d.url) + '"><meta property="og:type" content="website"><meta property="og:site_name" content="SinSubz">' +
        '<meta property="og:title" content="' + esc(ttl) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:url" content="' + esc(d.url) + '">' +
        '<meta property="og:image" content="' + esc(d.poster || SITE + "/og-image.png") + '"><meta name="twitter:card" content="summary_large_image">' +
        '<link rel="icon" href="/favicon.ico?v=1133" sizes="48x48"><link rel="icon" href="/favicon.svg?v=1133" type="image/svg+xml" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1133">' +
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">' +
        '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/title.css?v=6"><link rel="stylesheet" href="/comments.css"><link rel="stylesheet" href="/web-acct.css">' +
        '<script>try{var t=localStorage.getItem("sinsubz-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>' +
        '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>" + "</head>" +
        '<body class="tp-page"><div class="tp-wrap"><div class="web-acct tp-acct" id="webAcct"></div><nav class="tp-crumb" aria-label="Breadcrumb"><a href="/">SinSubz</a> › <a href="/#readyTitles">' + crumbName + '</a> › <span>' + esc(d.title) + '</span></nav><div id="tp"><noscript>' + noscript + "</noscript></div>" + seoBlock + moreHtml +
        '<section class="comments-section tp-comments" id="comments"><div class="cm-wrap" id="commentsRoot" hidden data-imdb="' + esc(d.id) + '" data-film="' + esc(d.title) + '"></div></section>' +
        '<p class="tp-foot">Subtitles made by SinSubz. Only the subtitle is provided, not the video.</p></div>' +
        '<script type="application/json" id="tp-data">' + seed + '</script><script src="/title.js?v=7"></script><script src="/web-account.js" defer></script><script src="/comments.js" defer></script><script src="/aads.js" defer></script><script src="/ad300.js" defer></script><script src="/popunder.js" defer></script><script src="/push.js" defer></script></body></html>';
}

function isAdmin(req) { return require("./_admin.js").isAdmin(req); }

module.exports = async function ready(req, res) {
    const act = String(q(req).ready || "");
    try {
        if (!hasRedis()) { return res.status(act === "list" ? 200 : 503).json(act === "list" ? { items: [] } : { error: "Database not connected" }); }

        if (act === "list" && req.method === "GET") {
            res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
            const [flat, rtFlat] = await redis([["HGETALL", "rdy:idx"], ["HGETALL", "rdy:rt"]]);
            const rt = {};
            for (let i = 0; rtFlat && i < rtFlat.length; i += 2) { rt[rtFlat[i]] = rtFlat[i + 1]; }      // imdb id -> "i:8.1" (IMDb) or "t:7.8" (TMDB)
            const items = [];
            const need = [];
            const needRt = [];
            for (let i = 0; flat && i < flat.length; i += 2) {
                const m = parse(flat[i + 1]);
                if (!m) { continue; }
                if (!m.gt && need.length < 6) { need.push(m); }
                const eps = Object.values(m.eps || {}).map(x => ({ s: x.s, e: x.e, n: x.n, ts: x.ts }))
                    .sort((a, b) => a.s - b.s || a.e - b.e);
                if (!rt[m.id] && needRt.length < 4) { needRt.push(m); }
                items.push({ id: m.id, slug: pub(m.slug || slugify(m.t)), t: m.t, y: m.y, p: m.p, g: m.g || [], r: rt[m.id] || "", type: m.type, eps, ts: Math.max(0, ...eps.map(x => x.ts || 0)) });
            }
            // titles saved before genres existed: look up a few per request (TMDB), remember them, so the filter fills itself
            if (need.length && process.env.TMDB_API_KEY) {
                await Promise.all(need.map(async m => {
                    try {
                        const f = await tmdbRaw("/find/" + m.id + "?external_source=imdb_id");
                        const hit = (m.type === "tv" ? (f.tv_results || [])[0] : (f.movie_results || [])[0]);
                        const g = hit ? genreNames(hit.genre_ids) : [];
                        m.g = g; m.gt = 1;
                        await redis([["HSET", "rdy:idx", m.id, JSON.stringify(m)]]);
                        const it = items.find(x => x.id === m.id); if (it) { it.g = g; }
                    } catch (e) { /* try again next time */ }
                }));
            }
            // titles without a rating yet: a few per request (from the cached TMDB / OMDb info), remembered in rdy:rt, so the tags fill themselves
            if (needRt.length && process.env.TMDB_API_KEY) {
                await Promise.all(needRt.map(async m => {
                    try {
                        const inf = await tmdbInfo(m);
                        const v = inf ? (inf.imdb ? "i:" + inf.imdb : (inf.rating ? "t:" + inf.rating : "")) : "";
                        if (v) { await redis([["HSET", "rdy:rt", m.id, v]]); const it = items.find(x => x.id === m.id); if (it) { it.r = v; } }
                    } catch (e) { /* next time */ }
                }));
            }
            items.sort((a, b) => b.ts - a.ts);
            return res.status(200).json({ items });
        }

        if ((act === "page" || act === "title") && req.method === "GET") {
            let slug = String(q(req).slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 100);
            const hadSuf = slug.length > SUF.length && slug.slice(-SUF.length) === SUF;
            if (hadSuf) { slug = slug.slice(0, -SUF.length); }
            slug = slug.slice(0, 80);
            let d = null;
            try { d = slug ? await titleData(slug) : null; }
            catch (e) {
                // the database is unreachable (for example its quota): say "try again", not "Not found" (so search engines keep the page)
                res.setHeader("Cache-Control", "no-store"); res.setHeader("Retry-After", "300");
                if (act === "title") { return res.status(503).json({ error: "Temporarily unavailable" }); }
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                return res.status(503).send('<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Please try again | SinSubz</title><body style="font-family:system-ui;background:#07080d;color:#eee;text-align:center;padding:80px 20px"><h1>Please try again in a few minutes</h1><p><a style="color:#9aa6ff" href="/">Go to SinSubz</a></p></body>');
            }
            if (!d && slug && act === "page") {
                // a near-miss address (cut-off, or with/without the year) goes to the one title it clearly means
                const base = slug.replace(/-(19|20)\d\d$/, "");
                const near = (await allTitles()).filter(x => x.slug && (x.slug.indexOf(base) === 0 || base.indexOf(x.slug) === 0 || x.slug.replace(/-(19|20)\d\d$/, "") === base));
                if (near.length === 1) { res.setHeader("Location", (near[0].type === "tv" ? "/tv/" : "/film/") + pub(near[0].slug)); return res.status(301).end(); }
            }
            if (d && act === "page" && !hadSuf) {
                // old address (without -sinhala-subtitles, or by IMDb id): one permanent address per title
                res.setHeader("Location", (d.type === "tv" ? "/tv/" : "/film/") + pub(d.slug));
                return res.status(301).end();
            }
            if (!d) {
                if (act === "title") { return res.status(404).json({ error: "Not found" }); }
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                return res.status(404).send('<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found | SinSubz</title><body style="font-family:system-ui;background:#07080d;color:#eee;text-align:center;padding:80px 20px"><h1>Not found</h1><p>This title has no ready Sinhala subtitle yet.</p><p><a style="color:#9aa6ff" href="/">Search and translate it on SinSubz</a> &middot; <a style="color:#9aa6ff" href="/ready.html">See all ready subtitles</a></p></body>');
            }
            res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
            if (act === "title") { return res.status(200).json(d); }
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(pageHtml(d));
        }

        if (act === "sitemap" && req.method === "GET") {
            const list = await allTitles();
            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.setHeader("Cache-Control", "public, s-maxage=3600");
            return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
                list.map(m => "<url><loc>" + esc(pageUrl(m)) + "</loc><lastmod>" + new Date(Math.max(0, ...Object.values(m.eps || {}).map(x => x.ts || 0)) || Date.now()).toISOString().slice(0, 10) + "</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>").join("") + "</urlset>");
        }

        if (act === "get" && req.method === "GET") {
            const p = q(req);
            if (!imdbOk(p.id)) { return res.status(400).json({ error: "Bad id" }); }
            // downloading needs a Google sign-in (the page itself stays public for search engines)
            const dlUser = await verifyGoogleUser(req).catch(() => null);
            if (!dlUser) { res.setHeader("Cache-Control", "no-store"); return res.status(401).json({ error: "Sign in with Google to download", needLogin: true }); }
            const s = num(p.s), e = num(p.e);
            const [packed, idx] = await redis([["GET", srtKey(p.id, s, e)], ["HGET", "rdy:idx", p.id]]);
            if (!packed) { return res.status(404).json({ error: "Not found" }); }
            const meta = parse(idx) || {};
            try {
                const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);   // Sri Lanka day
                const who = String(dlUser.name || (dlUser.email || "").split("@")[0] || "visitor").slice(0, 40);
                await redis([["HINCRBY", "rdy:dl", p.id, 1], ["HINCRBY", "rdy:dle:" + p.id, s + "x" + e, 1],
                    ["INCR", "rdy:dlday:" + day], ["EXPIRE", "rdy:dlday:" + day, 40 * 86400],
                    ["LPUSH", "rdy:dllog", JSON.stringify({ t: Date.now(), id: p.id, n: String(meta.t || p.id).slice(0, 80), y: meta.type === "tv" ? 1 : 0, s, e, u: who })],
                    ["LTRIM", "rdy:dllog", 0, 199]]);
            } catch (x) { /* counting must never block the file */ }
            const ep = (meta.eps || {})[s + "x" + e] || {};
            const name = String(ep.f || (p.id + ".Sinhala.SinSubz.srt")).replace(/[^\w .()\-\[\]]+/g, "_");
            const text = withCredit(zlib.gunzipSync(Buffer.from(packed, "base64")).toString("utf8"));
            res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
            res.setHeader("Content-Disposition", 'attachment; filename="' + name + '"');
            res.setHeader("Cache-Control", "no-store");
            return res.status(200).send("﻿" + text);
        }

        if (act === "dlstats" && req.method === "GET") {
            res.setHeader("Cache-Control", "no-store");
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const days = [];
            for (let i = 0; i < 7; i++) { days.push(new Date(Date.now() + 5.5 * 3600e3 - i * 86400e3).toISOString().slice(0, 10)); }
            const [flat, log, idx] = (await redis([["HGETALL", "rdy:dl"], ["LRANGE", "rdy:dllog", 0, 59], ["HGETALL", "rdy:idx"]]));
            const per = await redis(days.map(d => ["GET", "rdy:dlday:" + d]));
            const names = {};
            for (let i = 0; idx && i + 1 < idx.length; i += 2) { const m = parse(idx[i + 1]); if (m) { names[idx[i]] = m.t; } }
            const top = []; let total = 0;
            for (let i = 0; flat && i + 1 < flat.length; i += 2) { const n = Number(flat[i + 1]) || 0; total += n; top.push({ id: flat[i], n: names[flat[i]] || flat[i], c: n }); }
            top.sort((a, b) => b.c - a.c);
            return res.status(200).json({ total, today: Number(per[0]) || 0, week: per.reduce((a, v) => a + (Number(v) || 0), 0), days: days.map((d, i) => ({ d, c: Number(per[i]) || 0 })), top: top.slice(0, 10), recent: (log || []).map(parse).filter(Boolean) });
        }

        if (act === "count" && req.method === "GET") {
            const p = q(req);
            if (!imdbOk(p.id)) { return res.status(400).json({ error: "Bad id" }); }
            const [n, flat] = await redis([["HGET", "rdy:dl", p.id], ["HGETALL", "rdy:dle:" + p.id]]);
            const eps = {};   // per episode: "<season>x<episode>" -> downloads
            if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) { eps[flat[i]] = Number(flat[i + 1]) || 0; } }
            res.setHeader("Cache-Control", "public, s-maxage=60");
            return res.status(200).json({ n: Number(n) || 0, eps });
        }

        if (act === "backfill" && req.method === "POST") { return backfill(req, res); }
        if (act === "intros" && req.method === "POST") { return intros(req, res); }


        // ---- visitors suggest an uploaded translation for the Ready list; the owner approves it in the admin panel ----
        if (act === "submit" && req.method === "POST") {
            res.setHeader("Cache-Control", "no-store");
            const who = await verifyGoogleUser(req).catch(() => null);
            if (!who) { return res.status(401).json({ error: "Please sign in with Google first." }); }
            const b = req.body && typeof req.body === "object" ? req.body : {};
            const unsorted = b.unsorted === true;      // the site could not tell which film this is: the owner picks it in the admin panel
            if (!unsorted && !imdbOk(b.imdb)) { return res.status(400).json({ error: "Pick the film or series first." }); }
            const srt = String(b.srt || "");
            if (srt.length < 400 || srt.length > MAX_SRT || srt.indexOf("-->") < 0) { return res.status(400).json({ error: "That subtitle file is not valid." }); }
            const cues = (srt.match(/-->/g) || []).length;
            const letters = (srt.match(/[\u0D80-\u0DFF]/g) || []).length;
            if (cues < 20 || letters < cues * 3) { return res.status(400).json({ error: "This does not look like a finished Sinhala subtitle." }); }
            const type = b.type === "tv" ? "tv" : "movie";
            const s = type === "tv" ? num(b.season) : 0, e = type === "tv" ? num(b.episode) : 0;
            if (type === "tv" && !(s && e) && !unsorted) { return res.status(400).json({ error: "Enter the season and episode number." }); }
            const title = clean(b.title, 100);
            if (!title) { return res.status(400).json({ error: "Missing title." }); }
            const uk = sha(String(who.uid)).toString("hex").slice(0, 24);
            if (await overLimit("rdysub", uk, 6, 86400)) { return res.status(429).json({ error: "You sent enough for today. Please try again tomorrow." }); }
            const dup = unsorted ? 0 : (await redis([["EXISTS", "rdy:pk:" + b.imdb + ":" + s + ":" + e]]))[0];
            if (Number(dup) === 1) { return res.status(200).json({ ok: true, dup: true }); }
            const id = require("crypto").randomBytes(7).toString("hex");
            const item = { id, t: Date.now(), imdb: unsorted ? "" : b.imdb, unsorted: unsorted, title, year: clean(b.year, 8), poster: https(b.poster) || "", type, s, e, lines: cues, by: clean(who.name, 60) || "Google user", maybe: b.maybe === true,
                filename: clean(b.filename, 140), srt: zlib.gzipSync(Buffer.from(srt, "utf8")).toString("base64") };
            await redis([["SET", "rdy:pend:" + id, JSON.stringify(item), "EX", 30 * 86400], ["LPUSH", "rdy:pendl", id], ["LTRIM", "rdy:pendl", 0, 199]].concat(unsorted ? [] : [["SET", "rdy:pk:" + b.imdb + ":" + s + ":" + e, "1", "EX", 30 * 86400]]));
            try { await require("./_admin.js").logActivity("translate", "Suggested for Ready: " + title + (type === "tv" ? " S" + s + "E" + e : "")); } catch (x) { /* ignore */ }
            return res.status(200).json({ ok: true });
        }
        if (act === "pending" && req.method === "GET") {
            res.setHeader("Cache-Control", "no-store");
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const one = String(q(req).id || "").replace(/[^a-f0-9]/g, "").slice(0, 20);
            if (one) {
                const it = parse((await redis([["GET", "rdy:pend:" + one]]))[0]);
                if (!it) { return res.status(404).json({ error: "Not found" }); }
                it.srt = zlib.gunzipSync(Buffer.from(it.srt, "base64")).toString("utf8");
                return res.status(200).json(it);
            }
            const ids = (await redis([["LRANGE", "rdy:pendl", 0, 99]]))[0] || [];
            const rows = ids.length ? (await redis([["MGET", ...ids.map(i => "rdy:pend:" + i)]]))[0] || [] : [];
            const out = rows.map(parse).filter(Boolean).map(it => {
                let sample = "";
                try { sample = zlib.gunzipSync(Buffer.from(it.srt, "base64")).toString("utf8").split(/\r?\n/).filter(l => /[\u0D80-\u0DFF]/.test(l)).slice(0, 3).join(" / ").slice(0, 160); } catch (x) { /* ignore */ }
                return { id: it.id, t: it.t, imdb: it.imdb, unsorted: !!it.unsorted, title: it.title, year: it.year, type: it.type, s: it.s, e: it.e, lines: it.lines, by: it.by, maybe: !!it.maybe, filename: it.filename, sample };
            });
            return res.status(200).json({ items: out });
        }
        if (act === "recover" && req.method === "POST") { return recover(req, res); }
        if (act === "pdel" && req.method === "POST") {
            res.setHeader("Cache-Control", "no-store");
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const id = String((req.body && req.body.id) || "").replace(/[^a-f0-9]/g, "").slice(0, 20);
            const it = id && parse((await redis([["GET", "rdy:pend:" + id]]))[0]);
            await redis([["DEL", "rdy:pend:" + id], ["LREM", "rdy:pendl", 0, id]].concat(it ? [["DEL", "rdy:pk:" + it.imdb + ":" + it.s + ":" + it.e]] : []));
            return res.status(200).json({ ok: true });
        }

        if ((act === "put" || act === "del") && req.method === "POST") {
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const b = req.body && typeof req.body === "object" ? req.body : {};
            if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Bad imdb id" }); }
            const s = num(b.season), e = num(b.episode);

            if (act === "del") {
                if (!s && !e) {
                    const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
                    const m = parse(raw);
                    const cmds = [["HDEL", "rdy:idx", b.imdb]];
                    Object.values((m && m.eps) || {}).forEach(x => cmds.push(["DEL", srtKey(b.imdb, x.s, x.e)]));
                    await redis(cmds);
                } else {
                    const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
                    const m = parse(raw);
                    if (m && m.eps) {
                        delete m.eps[s + "x" + e];
                        await redis([["DEL", srtKey(b.imdb, s, e)], Object.keys(m.eps).length ? ["HSET", "rdy:idx", b.imdb, JSON.stringify(m)] : ["HDEL", "rdy:idx", b.imdb]]);
                    }
                }
                return res.status(200).json({ ok: true });
            }

            const srt = String(b.srt || "");
            if (srt.length < 200 || srt.length > MAX_SRT || srt.indexOf("-->") < 0) { return res.status(400).json({ error: "Bad subtitle" }); }
            const title = clean(b.title, 100);
            if (!title) { return res.status(400).json({ error: "Missing title" }); }
            const type = b.type === "tv" ? "tv" : "movie";
            if (type === "tv" && !(s && e)) { return res.status(400).json({ error: "Missing season / episode" }); }
            const [raw] = await redis([["HGET", "rdy:idx", b.imdb]]);
            const isNew = !parse(raw);
            const m = parse(raw) || { id: b.imdb, eps: {} };
            m.t = clean(b.title, 100); m.y = clean(b.year, 8); m.type = type;
            if (!m.slug) {
                const taken = new Set((await allTitles()).filter(x => x.id !== b.imdb).map(x => x.slug));
                let sl = slugify(m.t);
                if (taken.has(sl) && m.y) { sl = slugify(m.t + " " + m.y); }
                if (taken.has(sl)) { sl = sl + "-" + b.imdb; }
                m.slug = sl;
            }
            m.p = https(b.poster) || m.p || "";
            m.eps = m.eps || {};
            m.eps[s + "x" + e] = {
                s, e, f: clean(b.filename, 140).replace(/[\\/:*?"<>|]+/g, "_") || (title + ".Sinhala.SinSubz.srt"),
                r: clean(b.release, 120),
                n: num(b.count) || (srt.match(/-->/g) || []).length, ts: Date.now()
            };
            const packed = zlib.gzipSync(Buffer.from(srt, "utf8")).toString("base64");
            await redis([["SET", srtKey(b.imdb, s, e), packed], ["HSET", "rdy:idx", b.imdb, JSON.stringify(m)]]);
            if (isNew) { await warmTitle(m, 14000); await require("./_push.js").notifyNewTitle(m); }
            if (isNew) { await require("./_requests.js").mailRequesters(m); }          // e-mail the visitors who requested this title
            await require("./_telegram.js").postNew(m, type === "tv" ? s : 0, type === "tv" ? e : 0);
            if (type === "tv") { await require("./_telegram.js").postSeasonDone(m, s); }          // season / whole-series summary when complete          // Telegram channel: once per film / per TV season          // browser notification (at most one per 6 hours)
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
};
module.exports.pageHtml = pageHtml;
// how many Ready Sinhala subtitles there are: a film counts 1, every ready episode of a series counts 1 (home page counter)
module.exports.tmdbInfo = tmdbInfo;
module.exports.tmdbRaw = tmdbRaw;
module.exports.countReady = async function () {
    const list = await allTitles();
    return list.reduce((n, m) => n + (m.type === "tv" ? Object.keys(m.eps || {}).length : 1), 0);
};
module.exports.registerFilm = registerFilm;
module.exports.fillMissingIntros = fillMissingIntros;
