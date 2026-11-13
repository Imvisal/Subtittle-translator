/* SinSubz: the owner's auto-translate SERIES LIST (worked through by scripts/auto-translate.js on GitHub Actions).
   Served through /api/stats (?autoq=...), so it is not a serverless function of its own. Every call needs x-admin-key.

   The list is ordered. The runner translates the FIRST series until all its episodes are done (over as many days as
   it takes), then the next one. Once a week up to 10 new series without a Sinhala subtitle are added to the end,
   picked from three sources in this order:  1) demand  2) newly released  3) random good ones.

   GET  ?autoq=get                      -> { meta, list: [ { imdb, title, year, poster, src, total, done, skipped, todo: [[s,e],...] } ] }
   GET  ?autoq=candidates               -> { items: [ { imdb, tmdb, title, year, poster, src, seasons: [{ s, n, air }], total } ] }
                                           (series that are NOT in the list / Ready store yet; the runner checks Sinhala subs)
   GET  ?autoq=find&q=name|tt1234567    -> { items: [ same as candidates + inList ] }  (admin search box: pick any series by hand)
   POST ?autoq=add     { items: [...], top? } -> appends (no duplicates); top:true puts them first, so they are worked on next
   POST ?autoq=mark    { imdb, eps: [[s,e],...] } -> episodes with no English subtitle: not tried again for 7 days
   POST ?autoq=unskip  { imdb? }        -> clears the "no English subtitle" marks (all series, or one)
   POST ?autoq=drop    { imdb }         -> remove a series from the list
   POST ?autoq=meta    { lastRefill }   -> remembers when the weekly refill ran

   Redis:  aq:list (JSON array)   aq:meta (JSON)   sq:z (zset of what visitors typed into the search box, see api/search.js)  */
"use strict";

const { hasRedis, redis, clean } = require("./_google");

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_LIST = 80;
const MAX_EPISODES = 200;          // longer series (soap operas ...) are skipped
const SKIP_DAYS = 7;
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const imdbOk = v => /^tt\d{5,10}$/.test(String(v || ""));
const q = req => { try { return Object.fromEntries(new URL(req.url, "http://x").searchParams); } catch (e) { return {}; } };
const today = () => new Date().toISOString().slice(0, 10);
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function isAdmin(req) { return require("./_admin.js").isAdmin(req); }

async function tmdb(endpoint) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) { throw new Error("TMDB_API_KEY is not configured"); }
    const isToken = apiKey.length > 40;
    const sep = endpoint.includes("?") ? "&" : "?";
    const url = TMDB_BASE + endpoint + sep + "language=en-US&include_adult=false" + (isToken ? "" : "&api_key=" + encodeURIComponent(apiKey));
    const r = await fetch(url, { headers: isToken ? { Authorization: "Bearer " + apiKey } : {}, signal: AbortSignal.timeout(7000) });
    if (!r.ok) { throw new Error("TMDB " + r.status); }
    return r.json();
}

async function readList() {
    const [raw, meta] = await redis([["GET", "aq:list"], ["GET", "aq:meta"]]);
    const list = parse(raw);
    return { list: Array.isArray(list) ? list : [], meta: parse(meta) || {} };
}

async function readyEpisodes() {
    const [flat] = await redis([["HGETALL", "rdy:idx"]]);
    const map = {};
    for (let i = 0; flat && i < flat.length; i += 2) {
        const m = parse(flat[i + 1]);
        if (m) { map[flat[i]] = new Set(Object.keys(m.eps || {})); }
    }
    return map;
}

// what is left to do for one series
function progress(item, have) {
    const done = have[item.imdb] || new Set();
    const now = Date.now();
    const t = today();
    let total = 0, doneN = 0, skipped = 0;
    const todo = [];
    (item.seasons || []).forEach(se => {
        if (se.air && se.air > t) { return; }                      // season has not started yet
        for (let e = 1; e <= Number(se.n || 0); e++) {
            total++;
            const key = se.s + "x" + e;
            if (done.has(key)) { doneN++; continue; }
            const sk = item.skips && item.skips[key];
            if (sk && now - sk < SKIP_DAYS * 864e5) { skipped++; continue; }
            todo.push([se.s, e]);
        }
    });
    return { total, done: doneN, skipped, todo };
}

function seasonsOf(d) {
    return (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0)
        .map(s => ({ s: s.season_number, n: s.episode_count, air: s.air_date || "" }));
}

async function detailOf(tmdbId, src, base, big) {
    const d = await tmdb("/tv/" + tmdbId + "?append_to_response=external_ids");
    const imdb = (d.external_ids && d.external_ids.imdb_id) || "";
    if (!imdbOk(imdb)) { return null; }
    const seasons = seasonsOf(d);
    const total = seasons.reduce((a, s) => a + s.n, 0);
    if (!total || (total > MAX_EPISODES && !big)) { return null; }   // long series only when added by hand
    return {
        imdb, tmdb: tmdbId, title: clean(d.name || base.name || "", 100), year: String(d.first_air_date || base.first_air_date || "").slice(0, 4),
        poster: d.poster_path ? "https://image.tmdb.org/t/p/w342" + d.poster_path : "", src, seasons, total
    };
}

// 1) demand: what visitors translated (stats:top, only series) and typed into the search box (sq:z)
async function demandCandidates() {
    const [top, series, typed] = await redis([["ZREVRANGE", "stats:top", 0, 59, "WITHSCORES"], ["SMEMBERS", "stats:series"], ["ZREVRANGE", "sq:z", 0, 39, "WITHSCORES"]]);
    const seriesSet = new Set((series || []).map(norm));
    const names = [];
    for (let i = 0; top && i < top.length; i += 2) { if (seriesSet.has(norm(top[i]))) { names.push({ name: top[i], w: Number(top[i + 1]) + 1000 }); } }
    for (let i = 0; typed && i < typed.length; i += 2) { names.push({ name: typed[i], w: Number(typed[i + 1]) }); }
    names.sort((a, b) => b.w - a.w);
    const seen = new Set(), out = [];
    for (const n of names.slice(0, 40)) {
        const key = norm(n.name);
        if (!key || seen.has(key)) { continue; }
        seen.add(key);
        try {
            const r = await tmdb("/search/tv?query=" + encodeURIComponent(n.name) + "&page=1");
            const hit = (r.results || []).find(x => norm(x.name) === key || norm(x.original_name) === key);
            if (hit) { out.push({ id: hit.id, base: hit }); }
        } catch (e) { /* ignore */ }
        if (out.length >= 15) { break; }
    }
    return out;
}

async function newCandidates() {
    const d = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const r = await tmdb("/discover/tv?sort_by=popularity.desc&first_air_date.gte=" + d + "&first_air_date.lte=" + today() + "&page=1");
    return (r.results || []).slice(0, 15).map(x => ({ id: x.id, base: x }));
}

// 3) random good series (popular, well rated, not talk shows / news / reality / soaps)
async function randomCandidates() {
    const pages = [1 + Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 12)];
    const out = [];
    for (const p of pages) {
        try {
            const r = await tmdb("/discover/tv?sort_by=popularity.desc&vote_average.gte=7.3&vote_count.gte=400&without_genres=10763,10767,10764,10766&page=" + p);
            (r.results || []).forEach(x => out.push({ id: x.id, base: x }));
        } catch (e) { /* ignore */ }
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out.slice(0, 20);
}

module.exports = async function autoq(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const act = String(q(req).autoq || "");
    try {
        if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
        if (!hasRedis()) { return res.status(503).json({ error: "Database not connected" }); }
        const b = req.body && typeof req.body === "object" ? req.body : {};

        if (act === "get" && req.method === "GET") {
            const [{ list, meta }, have] = await Promise.all([readList(), readyEpisodes()]);
            const out = list.map(it => Object.assign({ imdb: it.imdb, tmdb: it.tmdb, title: it.title, year: it.year, poster: it.poster, src: it.src, added: it.added }, progress(it, have)));
            return res.status(200).json({ meta, list: out });
        }

        if (act === "candidates" && req.method === "GET") {
            const [{ list }, have] = await Promise.all([readList(), readyEpisodes()]);
            const known = new Set(list.map(x => x.imdb).concat(Object.keys(have)));
            const picks = [];
            const addAll = (arr, src) => arr.forEach(c => picks.push({ id: c.id, base: c.base, src }));
            const [dem, nw, rnd] = await Promise.all([demandCandidates().catch(() => []), newCandidates().catch(() => []), randomCandidates().catch(() => [])]);
            addAll(dem, "demand"); addAll(nw, "new"); addAll(rnd, "random");
            const seen = new Set(), uniq = [];
            picks.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); uniq.push(p); } });
            const items = [];
            for (let i = 0; i < uniq.length && items.length < 40; i += 8) {
                const batch = await Promise.all(uniq.slice(i, i + 8).map(p => detailOf(p.id, p.src, p.base).catch(() => null)));
                batch.forEach(d => { if (d && !known.has(d.imdb) && !items.some(x => x.imdb === d.imdb)) { items.push(d); } });
            }
            return res.status(200).json({ items });
        }

        if (act === "find" && req.method === "GET") {
            const text = String(q(req).q || "").trim().slice(0, 80);
            if (text.length < 2) { return res.status(400).json({ error: "Type at least 2 letters" }); }
            const { list } = await readList();
            let ids = [];
            if (imdbOk(text)) {
                const f = await tmdb("/find/" + text + "?external_source=imdb_id");
                ids = (f.tv_results || []).map(x => ({ id: x.id, base: x }));
            } else {
                const r = await tmdb("/search/tv?query=" + encodeURIComponent(text) + "&page=1");
                ids = (r.results || []).slice(0, 8).map(x => ({ id: x.id, base: x }));
            }
            const det = await Promise.all(ids.map(p => detailOf(p.id, "manual", p.base, true).catch(() => null)));
            const items = det.filter(Boolean).map(d => Object.assign(d, { inList: list.some(l => l.imdb === d.imdb) }));
            return res.status(200).json({ items, hidden: ids.length - items.length });
        }

        if (act === "add" && req.method === "POST") {
            const { list } = await readList();
            let added = 0;
            const fresh = [];
            (Array.isArray(b.items) ? b.items : []).slice(0, 30).forEach(x => {
                if (!imdbOk(x && x.imdb) || list.some(l => l.imdb === x.imdb) || fresh.some(l => l.imdb === x.imdb) || list.length + fresh.length >= MAX_LIST) { return; }
                const seasons = (Array.isArray(x.seasons) ? x.seasons : []).slice(0, 60)
                    .map(s => ({ s: Number(s.s) || 0, n: Math.min(Number(s.n) || 0, 300), air: String(s.air || "").slice(0, 10) })).filter(s => s.s > 0 && s.n > 0);
                if (!seasons.length) { return; }
                fresh.push({
                    imdb: x.imdb, tmdb: Number(x.tmdb) || 0, title: clean(x.title, 100), year: clean(x.year, 8),
                    poster: /^https:\/\/[^\s"'<>]{4,300}$/.test(String(x.poster || "")) ? x.poster : "",
                    src: ["demand", "new", "random", "manual"].includes(x.src) ? x.src : "manual", added: Date.now(), seasons, skips: {}
                });
                added++;
            });
            if (b.top === true) { list.unshift(...fresh); } else { list.push(...fresh); }
            await redis([["SET", "aq:list", JSON.stringify(list)]]);
            return res.status(200).json({ ok: true, added, size: list.length });
        }

        if (act === "mark" && req.method === "POST") {
            if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Bad imdb id" }); }
            const { list } = await readList();
            const it = list.find(l => l.imdb === b.imdb);
            if (!it) { return res.status(404).json({ error: "Not in the list" }); }
            it.skips = it.skips || {};
            (Array.isArray(b.eps) ? b.eps : []).slice(0, 500).forEach(p => {
                const s = Number(p && p[0]), e = Number(p && p[1]);
                if (s > 0 && e > 0) { it.skips[s + "x" + e] = Date.now(); }
            });
            await redis([["SET", "aq:list", JSON.stringify(list)]]);
            return res.status(200).json({ ok: true });
        }

        if (act === "drop" && req.method === "POST") {
            if (!imdbOk(b.imdb)) { return res.status(400).json({ error: "Bad imdb id" }); }
            const { list } = await readList();
            await redis([["SET", "aq:list", JSON.stringify(list.filter(l => l.imdb !== b.imdb))]]);
            return res.status(200).json({ ok: true });
        }

        if (act === "unskip" && req.method === "POST") {
            // forget the "no English subtitle" marks (all series, or one) so the runner tries those episodes again
            const { list } = await readList();
            let n = 0;
            list.forEach(l => { if (l.skips && (!b.imdb || l.imdb === b.imdb)) { n += Object.keys(l.skips).length; delete l.skips; } });
            await redis([["SET", "aq:list", JSON.stringify(list)]]);
            return res.status(200).json({ ok: true, cleared: n });
        }

        if (act === "meta" && req.method === "POST") {
            const { meta } = await readList();
            if (b.lastRefill) { meta.lastRefill = Date.now(); }
            await redis([["SET", "aq:meta", JSON.stringify(meta)]]);
            return res.status(200).json({ ok: true, meta });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
};
