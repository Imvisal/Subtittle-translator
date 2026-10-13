"use strict";

/*
========================================================
SUBLANKA AI — sync.js
Sync a Sinhala SRT to a movie release:

 1. user uploads a Sinhala .srt
 2. user picks the movie file (only its NAME is used — it is
    never uploaded or read)
 3. English subtitles for that release are listed, best match first
 4. the chosen English subtitle is used purely as a timing
    reference: speech-activity timelines are cross-correlated
    (FFT) to find fps scale + offset, then refined line-by-line.
    The Sinhala TEXT is never changed — only timestamps.

Uses parseSRT(), buildSRT(), downloadTextFile() from script.js
and the existing /api/search, /api/subtitles and
/api/subtitle-download routes.
========================================================
*/

(function () {

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const $ = function (id) { return document.getElementById(id); };

    const section = $("sync");
    const heroBtn = $("syncHeroBtn");
    const sinhalaInput = $("syncSinhalaFile");
    const movieInput = $("syncMovieFile");
    const sinhalaInfo = $("syncSinhalaInfo");
    const movieInfo = $("syncMovieInfo");
    const step1 = $("syncStep1");
    const step2 = $("syncStep2");
    const step3 = $("syncStep3");
    const listBox = $("syncEnglishList");
    const syncBtn = $("syncBtn");
    const note = $("syncNote");
    const resultBox = $("syncResult");
    const statsBox = $("syncStats");
    const warnBox = $("syncWarn");
    const previewBox = $("syncPreview");
    const tuneVal = $("syncTuneVal");
    const downloadBtn = $("syncDownload");

    if (!section) { return; }


    // ====================================================
    // HERO BUTTON -> scroll to the sync area
    // ====================================================

    if (heroBtn) {

        heroBtn.addEventListener("click", function (event) {

            event.preventDefault();

            heroBtn.classList.add("is-clicked");
            setTimeout(function () {
                heroBtn.classList.remove("is-clicked");
            }, 1300);

            section.classList.add("in");
            section.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "start"
            });

            section.classList.remove("arrive");
            void section.offsetWidth;
            setTimeout(function () {
                section.classList.add("arrive");
            }, reduceMotion ? 0 : 450);

            if (history.replaceState) {
                history.replaceState(null, "", "#sync");
            }

        });

    }


    // ====================================================
    // SMALL HELPERS
    // ====================================================

    function clear(el) { el.textContent = ""; }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;",
                     '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function line(parent, html, cls) {
        const d = document.createElement("div");
        if (cls) { d.className = cls; }
        d.innerHTML = html;
        parent.appendChild(d);
        return d;
    }

    function tsToMs(t) {
        const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(t || "");
        if (!m) { return null; }
        return (+m[1]) * 3600000 + (+m[2]) * 60000 +
               (+m[3]) * 1000 + Number(m[4].padEnd(3, "0").slice(0, 3));
    }

    function msToTs(ms) {
        ms = Math.max(0, Math.round(ms));
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const x = ms % 1000;
        const p = function (n, l) { return String(n).padStart(l, "0"); };
        return p(h, 2) + ":" + p(m, 2) + ":" + p(s, 2) + "," + p(x, 3);
    }

    function fmtDur(ms) {
        const s = Math.round(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const x = s % 60;
        return (h ? h + "h " : "") + m + "m " + x + "s";
    }

    function fmtSize(b) {
        if (b >= 1073741824) { return (b / 1073741824).toFixed(2) + " GB"; }
        return (b / 1048576).toFixed(0) + " MB";
    }

    function setState(card, st) {
        card.classList.toggle("is-locked", st === "locked");
        card.classList.toggle("is-done", st === "done");
    }

    function spinner(text) {
        const p = document.createElement("p");
        p.className = "sync-empty";
        const sp = document.createElement("span");
        sp.className = "sync-spin";
        p.appendChild(sp);
        p.appendChild(document.createTextNode(text));
        return p;
    }

    function median(arr) {
        if (!arr.length) { return 0; }
        const a = arr.slice().sort(function (x, y) { return x - y; });
        const m = a.length >> 1;
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    function nap() {
        return new Promise(function (r) { setTimeout(r, 0); });
    }

    function norm(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function toSubs(parsed) {

        const out = [];

        parsed.forEach(function (p) {

            const parts = p.timestamp.split("-->");
            const s = tsToMs(parts[0]);
            const e = tsToMs(parts[1]);

            if (s === null || e === null) { return; }

            out.push({ s: s, e: Math.max(e, s + 50), text: p.text });

        });

        out.sort(function (a, b) { return a.s - b.s; });

        return out;

    }


    // ====================================================
    // STATE
    // ====================================================

    const state = {
        sinhala: null,        // { name, subs, parsed }
        movie: null,          // { name, size, release, durationMs }
        candidates: [],
        selected: null,       // chosen English candidate
        loadToken: 0,
        result: null,         // engine result
        extraMs: 0
    };

    function refresh() {

        const ready = !!(state.sinhala && state.movie);

        setState(step2, state.sinhala ? (state.movie ? "done" : "open") : "locked");
        setState(step3, ready ? (state.selected ? "done" : "open") : "locked");

        syncBtn.disabled = !(ready && state.selected);

    }


    // ====================================================
    // STEP 1 — Sinhala SRT
    // ====================================================

    sinhalaInput.addEventListener("change", async function () {

        const file = sinhalaInput.files && sinhalaInput.files[0];

        clear(sinhalaInfo);
        state.sinhala = null;
        resetResult();
        setState(step1, "open");

        if (!file) { refresh(); return; }

        if (!/\.srt$/i.test(file.name)) {
            line(sinhalaInfo, "Please choose an .srt file.", "bad");
            refresh();
            return;
        }

        try {

            const text = await file.text();
            const parsed = (typeof parseSRT === "function") ? parseSRT(text) : [];
            const subs = toSubs(parsed);

            if (!subs.length) {
                line(sinhalaInfo, "No subtitle lines found in this file.", "bad");
                refresh();
                return;
            }

            state.sinhala = { name: file.name, subs: subs, parsed: parsed };

            const lastMs = subs[subs.length - 1].e;

            line(sinhalaInfo, "<span class='ok'>✓ Loaded</span> " + esc(file.name));
            line(sinhalaInfo, "<strong>" + subs.length + "</strong> lines · ends at <strong>" +
                fmtDur(lastMs) + "</strong>");

            setState(step1, "done");

        } catch (error) {
            console.error(error);
            line(sinhalaInfo, "Could not read this file.", "bad");
        }

        refresh();

        if (state.sinhala && state.movie) { loadCandidates(); }

    });


    // ====================================================
    // STEP 2 — movie file name -> release info
    // ====================================================

    const JUNK = "english|sinhala|tamil|hindi|dubbed|subbed|multi|dual|audio|" +
        "web[- ]?dl|webrip|web|blu[- ]?ray|bdrip|brrip|hdrip|hdtv|dvdrip|hdcam|" +
        "cam|hdts|telesync|x264|x265|hevc|h[ .]?264|h[ .]?265|aac|ddp?5?|10bit|" +
        "2160p|4k|1080p|720p|480p|S\\d{1,2}E\\d{1,3}";

    function parseRelease(fileName) {

        const base = fileName.replace(/\.[^.]+$/, "");
        const clean = base.replace(/[._]+/g, " ");

        const pick = function (re) {
            const m = re.exec(clean);
            return m ? m[0] : null;
        };

        const resolution = pick(/\b(2160p|4k|1080p|720p|480p)\b/i);
        let source = pick(/\b(blu[- ]?ray|bdrip|brrip|web[- ]?dl|webrip|web|hdrip|hdtv|dvdrip|hdcam|cam|hdts|telesync)\b/i);
        const codec = pick(/\b(x264|x265|h[ .]?264|h[ .]?265|hevc|av1|xvid)\b/i);
        const episode = pick(/\bS\d{1,2}E\d{1,3}\b/i);

        // a year inside (...) or [...] is the most reliable one
        const parenYear = (/[(\[]\s*((?:19|20)\d{2})\s*[)\]]/.exec(base) || [])[1] || null;
        const year = parenYear || pick(/\b(19|20)\d{2}\b/);

        let group = (/-\s*([A-Za-z0-9]+)\s*$/.exec(base) || [])[1] || null;

        if (group && (/^\d{3,4}p$/i.test(group) ||
                      new RegExp("^(" + JUNK + ")$", "i").test(group))) {
            group = null;
        }

        if (source) { source = source.replace(/\s+/g, "").toUpperCase(); }

        // title: drop [site tags] and (...) groups, then cut at the
        // first release word / year / season marker
        const titleSrc = base
            .replace(/\[[^\]]*\]/g, " ")
            .replace(/\([^)]*\)/g, " ")
            .replace(/[._]+/g, " ");

        const cutRe = parenYear
            ? new RegExp("\\b(" + JUNK + ")\\b", "i")
            : new RegExp("\\b((19|20)\\d{2}|" + JUNK + ")\\b", "i");

        const cut = titleSrc.search(cutRe);

        const title = (cut > 0 ? titleSrc.slice(0, cut) : titleSrc)
            .replace(/[-–—:,]+\s*$/g, "")
            .replace(/\s+/g, " ")
            .trim();

        return { title: title, year: year, episode: episode,
                 resolution: resolution && resolution.toLowerCase(),
                 source: source, codec: codec, group: group };

    }

    function probeDuration(file) {

        return new Promise(function (resolve) {

            let url = null;
            const v = document.createElement("video");
            let done = false;

            function finish(ms) {
                if (done) { return; }
                done = true;
                if (url) { URL.revokeObjectURL(url); }
                v.removeAttribute("src");
                resolve(ms);
            }

            v.preload = "metadata";
            v.onloadedmetadata = function () {
                finish(isFinite(v.duration) ? Math.round(v.duration * 1000) : null);
            };
            v.onerror = function () { finish(null); };
            setTimeout(function () { finish(null); }, 4000);

            try {
                url = URL.createObjectURL(file);
                v.src = url;
            } catch (e) {
                finish(null);
            }

        });

    }

    movieInput.addEventListener("change", async function () {

        const file = movieInput.files && movieInput.files[0];

        clear(movieInfo);
        state.movie = null;
        state.candidates = [];
        state.selected = null;
        resetResult();
        clear(listBox);
        titleBar.hidden = true;
        setState(step2, state.sinhala ? "open" : "locked");

        if (!file) { refresh(); return; }

        const release = parseRelease(file.name);
        const durationMs = await probeDuration(file);

        state.movie = { name: file.name, size: file.size,
                        release: release, durationMs: durationMs };

        line(movieInfo, "<span class='ok'>✓ Selected</span> " + esc(file.name));

        line(movieInfo,
            "<strong>" + esc(release.title || "Unknown title") + "</strong>" +
            (release.year ? " (" + esc(release.year) + ")" : "") +
            (release.episode ? " · " + esc(release.episode.toUpperCase()) : "") +
            " · " + fmtSize(file.size) +
            (durationMs ? " · " + fmtDur(durationMs) : ""));

        const tags = document.createElement("div");
        tags.className = "sync-tags";

        [release.resolution, release.source, release.codec, release.group]
            .filter(Boolean)
            .forEach(function (t) {
                const s = document.createElement("span");
                s.textContent = t;
                tags.appendChild(s);
            });

        movieInfo.appendChild(tags);

        refresh();

        if (state.sinhala) { loadCandidates(); }

    });


    // editable title box (shown once a movie file is chosen)
    const titleBar = document.createElement("div");
    titleBar.className = "sync-titlebar";
    titleBar.hidden = true;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "sync-select";
    titleInput.placeholder = "Movie or series title";
    titleInput.setAttribute("aria-label", "Movie or series title");

    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.textContent = "Search";

    titleBar.appendChild(titleInput);
    titleBar.appendChild(titleBtn);
    listBox.parentNode.insertBefore(titleBar, listBox);

    function searchTyped() {
        if (state.sinhala && state.movie) { loadCandidates(titleInput.value); }
    }

    titleBtn.addEventListener("click", searchTyped);
    titleInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); searchTyped(); }
    });

    // ====================================================
    // STEP 3 — find + rank English subtitles for this release
    // ====================================================

    function scoreCandidate(cand, release) {

        const r = norm(cand.release + " " + cand.fileName);
        const hits = [];
        let score = 0;

        if (release.group && r.indexOf(norm(release.group)) !== -1) {
            score += 4; hits.push("group");
        }

        if (release.source) {
            const src = norm(release.source);
            const alias = src === "BLURAY" || src === "bluray"
                ? ["bluray", "bdrip", "brrip"] : [src];
            if (alias.some(function (a) { return r.indexOf(a) !== -1; })) {
                score += 3; hits.push("source");
            }
        }

        if (release.resolution && r.indexOf(norm(release.resolution)) !== -1) {
            score += 2; hits.push("resolution");
        }

        if (release.codec) {
            const c = norm(release.codec).replace("h264", "x264").replace("h265", "x265");
            if (r.replace(/h264/g, "x264").replace(/h265/g, "x265").indexOf(c) !== -1) {
                score += 1; hits.push("codec");
            }
        }

        if (cand.hearingImpaired) { score -= 0.5; }

        return { score: score, hits: hits };

    }

    async function apiJson(url) {

        const response = await fetch(url);
        let data = null;

        try { data = await response.json(); } catch (e) { /* keep null */ }

        if (!response.ok) {
            throw new Error((data && data.error) || "Request failed (" + response.status + ")");
        }

        return data || {};

    }

    function titleScore(item, release) {

        let s = 0;
        const a = norm(item.title);
        const b = norm(release.title);

        if (a === b) { s += 5; }
        else if (a && b && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)) { s += 2; }

        if (release.year && String(item.year || "").indexOf(release.year) !== -1) { s += 3; }

        if (release.episode) { s += item.type === "series" ? 2 : -2; }
        else { s += item.type === "movie" ? 1 : -1; }

        return s;

    }

    function queryVariants(title) {

        const words = title.split(/\s+/).filter(Boolean);
        const out = [];

        for (let n = words.length; n >= 1 && out.length < 3; n--) {
            out.push(words.slice(0, n).join(" "));
        }

        return out;

    }

    async function loadCandidates(titleOverride) {

        const token = ++state.loadToken;
        const base = state.movie.release;
        const typed = (titleOverride || base.title || "").trim();

        // used for ranking: the typed title plus year/episode from the file
        const release = { title: typed, year: base.year, episode: base.episode };

        state.candidates = [];
        state.selected = null;
        resetResult();
        refresh();

        titleBar.hidden = false;
        titleInput.value = typed;

        clear(listBox);
        listBox.appendChild(spinner("Finding this title…"));

        try {

            if (!typed) {
                throw new Error("Could not read a title from the file name. Type it above.");
            }

            let results = [];

            for (const q of queryVariants(typed)) {

                try {

                    const found = await apiJson(
                        "/api/search?query=" + encodeURIComponent(q)
                    );

                    results = found.results || [];

                } catch (e) {
                    results = [];       // "not found" – try a shorter title
                }

                if (token !== state.loadToken) { return; }

                if (results.length) { break; }

            }

            const titles = results.slice()
                .sort(function (x, y) {
                    return titleScore(y, release) - titleScore(x, release);
                })
                .slice(0, 6);

            if (!titles.length) {
                throw new Error("Couldn't find “" + typed +
                    "”. Check the spelling above and press Search.");
            }

            state.titles = titles;

            await loadSubtitlesFor(titles[0], token);

        } catch (error) {

            if (token !== state.loadToken) { return; }

            clear(listBox);
            const p = document.createElement("p");
            p.className = "sync-empty bad";
            p.textContent = error.message || "Could not load subtitles.";
            listBox.appendChild(p);

        }

    }

    async function loadSubtitlesFor(title, token) {

        const release = state.movie.release;

        clear(listBox);
        listBox.appendChild(spinner("Finding English subtitles…"));

        const params = new URLSearchParams();
        params.set("imdb_id", title.imdbID);

        const ep = release.episode ? /S(\d+)E(\d+)/i.exec(release.episode) : null;

        if (ep) {
            params.set("type", "episode");
            params.set("season", String(parseInt(ep[1], 10)));
            params.set("episode", String(parseInt(ep[2], 10)));
        } else {
            params.set("type", "movie");
        }

        const data = await apiJson("/api/subtitles?" + params.toString());

        if (token !== state.loadToken) { return; }

        const list = (data.results || []).map(function (c) {
            const sc = scoreCandidate(c, release);
            c._score = sc.score;
            c._hits = sc.hits;
            return c;
        }).sort(function (a, b) { return b._score - a._score; });

        state.candidates = list;
        state.selected = null;

        renderList(title);
        refresh();

    }

    function renderList(activeTitle) {

        clear(listBox);

        // title picker (only when there is more than one candidate title)
        if (state.titles && state.titles.length > 1) {

            const sel = document.createElement("select");
            sel.className = "sync-select";
            sel.setAttribute("aria-label", "Choose title");

            state.titles.forEach(function (t, i) {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = t.title + (t.year ? " (" + t.year + ")" : "") +
                    " · " + (t.type === "series" ? "TV" : "Movie");
                if (t.imdbID === activeTitle.imdbID) { o.selected = true; }
                sel.appendChild(o);
            });

            sel.addEventListener("change", async function () {
                const token = ++state.loadToken;
                try {
                    await loadSubtitlesFor(state.titles[+sel.value], token);
                } catch (error) {
                    clear(listBox);
                    const p = document.createElement("p");
                    p.className = "sync-empty bad";
                    p.textContent = error.message || "Could not load subtitles.";
                    listBox.appendChild(p);
                }
            });

            listBox.appendChild(sel);

        }

        if (!state.candidates.length) {
            const p = document.createElement("p");
            p.className = "sync-empty";
            p.textContent = "No English subtitles found for this title.";
            listBox.appendChild(p);
            return;
        }

        state.candidates.forEach(function (cand, i) {

            const label = document.createElement("label");
            label.className = "sync-cand";

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "syncEnglish";

            const name = document.createElement("div");
            name.className = "sync-cand-name";
            name.textContent = cand.release || cand.fileName;

            const meta = document.createElement("div");
            meta.className = "sync-cand-meta";

            if (i === 0 && cand._score > 0) {
                const b = document.createElement("span");
                b.className = "best";
                b.textContent = "Best match";
                meta.appendChild(b);
            }

            cand._hits.forEach(function (h) {
                const s = document.createElement("span");
                s.className = "hit";
                s.textContent = h;
                meta.appendChild(s);
            });

            if (cand.fps) {
                const s = document.createElement("span");
                s.textContent = cand.fps + " fps";
                meta.appendChild(s);
            }

            if (cand.hearingImpaired) {
                const s = document.createElement("span");
                s.textContent = "HI";
                meta.appendChild(s);
            }

            label.appendChild(radio);
            label.appendChild(name);
            label.appendChild(meta);

            radio.addEventListener("change", function () {
                state.selected = cand;
                resetResult();
                listBox.querySelectorAll(".sync-cand").forEach(function (el) {
                    el.classList.remove("is-selected");
                });
                label.classList.add("is-selected");
                refresh();
            });

            listBox.appendChild(label);

        });

    }


    // ====================================================
    // ENGINE — FFT cross-correlation + line refinement
    // ====================================================

    const BIN = 200;                    // ms per bin
    const MAX_LAG_MS = 15 * 60 * 1000;  // search ±15 minutes
    const FPS_LIST = [23.976, 24, 25, 29.97, 30];

    function scaleCandidates() {

        const out = [{ a: 1, label: null }];

        FPS_LIST.forEach(function (from) {
            FPS_LIST.forEach(function (to) {

                if (from === to) { return; }

                const a = from / to;

                if (!out.some(function (o) { return Math.abs(o.a - a) < 0.0003; })) {
                    out.push({ a: a, label: from + " → " + to + " fps" });
                }

            });
        });

        return out;

    }

    function fft(re, im, invert) {

        const n = re.length;

        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) { j ^= bit; }
            j ^= bit;
            if (i < j) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }

        for (let len = 2; len <= n; len <<= 1) {

            const ang = 2 * Math.PI / len * (invert ? -1 : 1);
            const wr = Math.cos(ang);
            const wi = Math.sin(ang);
            const half = len >> 1;

            for (let i = 0; i < n; i += len) {

                let cr = 1, ci = 0;

                for (let j = 0; j < half; j++) {

                    const a = i + j, b = a + half;
                    const vr = re[b] * cr - im[b] * ci;
                    const vi = re[b] * ci + im[b] * cr;

                    re[b] = re[a] - vr;
                    im[b] = im[a] - vi;
                    re[a] += vr;
                    im[a] += vi;

                    const nr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = nr;

                }

            }

        }

        if (invert) {
            for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
        }

    }

    function signal(subs, scale, size) {

        const sig = new Float64Array(size);

        subs.forEach(function (x) {

            const a = Math.floor(x.s * scale / BIN);
            const b = Math.ceil(x.e * scale / BIN);

            for (let i = Math.max(0, a); i < Math.min(size, b); i++) {
                sig[i] = 1;
            }

        });

        return sig;

    }

    function nearestIndex(arr, x) {

        let lo = 0, hi = arr.length - 1;

        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < x) { lo = mid + 1; } else { hi = mid; }
        }

        if (lo > 0 && Math.abs(arr[lo - 1] - x) <= Math.abs(arr[lo] - x)) {
            return lo - 1;
        }

        return lo;

    }

    function linFit(pts) {

        const n = pts.length;
        let mx = 0, my = 0;

        pts.forEach(function (p) { mx += p[0]; my += p[1]; });
        mx /= n; my /= n;

        let sxx = 0, sxy = 0;

        pts.forEach(function (p) {
            sxx += (p[0] - mx) * (p[0] - mx);
            sxy += (p[0] - mx) * (p[1] - my);
        });

        if (sxx === 0) { return { a: 1, b: my - mx }; }

        const a = sxy / sxx;

        return { a: a, b: my - a * mx };

    }

    function matchedPercent(S, E, fn) {

        if (!S.length) { return 0; }

        const starts = E.map(function (x) { return x.s; });
        let ok = 0;

        S.forEach(function (sub, i) {

            const ns = fn(sub.s, i);
            const ne = fn(sub.e, i);
            const dur = Math.max(1, ne - ns);

            let j = nearestIndex(starts, ns);
            let best = 0;

            for (let k = Math.max(0, j - 2); k <= Math.min(E.length - 1, j + 2); k++) {
                const ov = Math.min(ne, E[k].e) - Math.max(ns, E[k].s);
                if (ov > best) { best = ov; }
            }

            if (best >= 0.3 * dur) { ok++; }

        });

        return Math.round(100 * ok / S.length);

    }

    async function runEngine(S, E, durationMs, onProgress) {

        const maxEnd = Math.max(
            E[E.length - 1].e,
            S[S.length - 1].e * 1.3
        );

        const size = Math.ceil(maxEnd / BIN) + 2;

        let M = 1;
        while (M < size * 2) { M <<= 1; }

        const maxLag = Math.round(MAX_LAG_MS / BIN);

        // reference spectrum (once)
        const eRe = new Float64Array(M);
        const eIm = new Float64Array(M);
        eRe.set(signal(E, 1, size));
        fft(eRe, eIm, false);

        let sumE = 0;
        for (let i = 0; i < size; i++) { sumE += eRe[i] > 0 ? 0 : 0; }
        const sigE = signal(E, 1, size);
        sumE = 0;
        for (let i = 0; i < size; i++) { sumE += sigE[i]; }

        const cands = scaleCandidates();
        let best = { score: -1, a: 1, lagBins: 0, label: null };

        for (let ci = 0; ci < cands.length; ci++) {

            onProgress("Aligning timelines… " + Math.round(100 * ci / cands.length) + "%");
            await nap();

            const cand = cands[ci];
            const sig = signal(S, cand.a, size);

            let sumS = 0;
            for (let i = 0; i < size; i++) { sumS += sig[i]; }
            if (!sumS) { continue; }

            const sRe = new Float64Array(M);
            const sIm = new Float64Array(M);
            sRe.set(sig);
            fft(sRe, sIm, false);

            // E * conj(S)
            for (let i = 0; i < M; i++) {
                const r = eRe[i] * sRe[i] + eIm[i] * sIm[i];
                const m = eIm[i] * sRe[i] - eRe[i] * sIm[i];
                sRe[i] = r;
                sIm[i] = m;
            }

            fft(sRe, sIm, true);

            const norm2 = Math.sqrt(sumE * sumS) || 1;

            for (let k = -maxLag; k <= maxLag; k++) {
                const v = sRe[(k + M) % M] / norm2;
                if (v > best.score) {
                    best = { score: v, a: cand.a, lagBins: k, label: cand.label };
                }
            }

        }

        // ---- refine line by line -------------------------------
        const Es = E.map(function (x) { return x.s; });

        let A = best.a;
        let B = best.lagBins * BIN;

        for (let it = 0; it < 3; it++) {

            const win = it === 0 ? 3000 : 1500;
            const pts = [];

            S.forEach(function (sub) {
                const t = A * sub.s + B;
                const j = nearestIndex(Es, t);
                if (Math.abs(Es[j] - t) <= win) { pts.push([sub.s, Es[j]]); }
            });

            if (pts.length < 12) { break; }

            const fit = linFit(pts);

            if (Math.abs(fit.a - best.a) < 0.003) {
                A = fit.a;
                B = fit.b;
            } else {
                B += median(pts.map(function (p) { return p[1] - (A * p[0] + B); }));
            }

        }

        // ---- piecewise check (cuts / scene differences) -------
        const adj = new Array(S.length).fill(0);
        let piecewise = false;
        const K = Math.min(8, Math.floor(S.length / 15));

        if (K >= 3) {

            const size2 = Math.ceil(S.length / K);
            const meds = [];

            for (let k = 0; k < K; k++) {

                const res = [];

                for (let i = k * size2; i < Math.min(S.length, (k + 1) * size2); i++) {
                    const t = A * S[i].s + B;
                    const j = nearestIndex(Es, t);
                    const r = Es[j] - t;
                    if (Math.abs(r) <= 8000) { res.push(r); }
                }

                meds.push(res.length >= 5 ? median(res) : null);

            }

            const valid = meds.filter(function (m) { return m !== null; });
            const base = median(valid);

            piecewise = valid.some(function (m) { return Math.abs(m - base) > 1200; });

            if (piecewise) {

                // per-line residuals, smoothed with a running median
                // so a jump is followed within a few lines
                const smooth = function (win, around) {

                    const res = S.map(function (sub, i) {
                        const t = A * sub.s + B + (around ? around[i] : 0);
                        const j = nearestIndex(Es, t);
                        const r = Es[j] - t;
                        return Math.abs(r) <= win ? r : null;
                    });

                    const out = new Array(S.length).fill(0);
                    let last = 0;

                    for (let i = 0; i < S.length; i++) {

                        const w = [];

                        for (let k = Math.max(0, i - 6); k <= Math.min(S.length - 1, i + 6); k++) {
                            if (res[k] !== null) { w.push(res[k]); }
                        }

                        if (w.length >= 4) { last = median(w); }

                        out[i] = last;

                    }

                    return out;

                };

                // coarse shift per line: let the neighbouring lines vote
                // (one wrong neighbour is outvoted by consistent ones)
                const vote = function () {

                    const WIN = 9000, HB = 250, R = 12;
                    const nb = Math.ceil(WIN / HB);
                    const per = S.map(function (sub) {

                        const t = A * sub.s + B;
                        const list = [];
                        let j = nearestIndex(Es, t);

                        while (j > 0 && t - Es[j - 1] <= WIN) { j--; }

                        for (; j < Es.length && Es[j] - t <= WIN; j++) {
                            list.push(Es[j] - t);
                        }

                        return list;

                    });

                    const out = new Array(S.length).fill(0);
                    let last = 0;

                    for (let i = 0; i < S.length; i++) {

                        const hist = new Float64Array(2 * nb + 3);

                        for (let k = Math.max(0, i - R); k <= Math.min(S.length - 1, i + R); k++) {
                            per[k].forEach(function (r) {
                                const bi = Math.round(r / HB) + nb + 1;
                                hist[bi] += 1;
                                hist[bi - 1] += 0.5;
                                hist[bi + 1] += 0.5;
                            });
                        }

                        let bestBin = -1, bestV = 0;

                        for (let b = 0; b < hist.length; b++) {
                            if (hist[b] > bestV) { bestV = hist[b]; bestBin = b; }
                        }

                        if (bestBin >= 0 && bestV >= 6) {

                            const centre = (bestBin - nb - 1) * HB;
                            const near = [];

                            for (let k = Math.max(0, i - R); k <= Math.min(S.length - 1, i + R); k++) {
                                per[k].forEach(function (r) {
                                    if (Math.abs(r - centre) <= 400) { near.push(r); }
                                });
                            }

                            last = near.length ? median(near) : centre;

                        }

                        out[i] = last;

                    }

                    return out;

                };

                const first = vote();
                const second = smooth(2500, first);

                for (let i = 0; i < S.length; i++) {
                    adj[i] = first[i] + second[i];
                }

            }

        }

        const before = matchedPercent(S, E, function (t) { return t; });
        const after = matchedPercent(S, E, function (t, i) { return A * t + B + adj[i]; });

        let scaleLabel = "none";

        if (Math.abs(A - 1) > 0.0002) {
            const m = scaleCandidates().find(function (c) {
                return c.label && Math.abs(c.a - A) < 0.0006;
            });
            scaleLabel = m ? m.label : "×" + A.toFixed(5);
        }

        return {
            a: A, b: B, adj: adj, piecewise: piecewise,
            before: before, after: after,
            scaleLabel: scaleLabel,
            corr: best.score
        };

    }


    // ====================================================
    // RESULT — build, preview, download
    // ====================================================

    function resetResult() {
        state.result = null;
        state.extraMs = 0;
        if (resultBox) { resultBox.hidden = true; }
        if (note) { note.textContent = ""; }
    }

    function mapTime(t, i) {

        const r = state.result;

        return Math.max(0, Math.round(r.a * t + r.b + r.adj[i] + state.extraMs));

    }

    function buildOutput() {

        const subs = state.sinhala.subs;

        // parsed[] and subs[] are in the same order unless the file
        // was unsorted, so rebuild from subs (sorted) to stay safe
        const out = subs.map(function (sub, i) {

            const ns = mapTime(sub.s, i);
            const ne = Math.max(ns + 50, mapTime(sub.e, i));

            return {
                number: i + 1,
                timestamp: msToTs(ns) + " --> " + msToTs(ne),
                text: sub.text
            };

        });

        return buildSRT(out);

    }

    function renderResult() {

        const r = state.result;
        const subs = state.sinhala.subs;

        clear(statsBox);

        const stat = function (label, value, cls) {
            const d = document.createElement("div");
            d.className = "sync-stat" + (cls ? " " + cls : "");
            const s = document.createElement("small");
            s.textContent = label;
            const b = document.createElement("b");
            b.textContent = value;
            d.appendChild(s);
            d.appendChild(b);
            statsBox.appendChild(d);
        };

        const offsetSec = (r.b / 1000);
        const conf = r.after >= 75 ? "good" : (r.after >= 50 ? "mid" : "low");
        const confText = r.after >= 75 ? "High" : (r.after >= 50 ? "Medium" : "Low");

        stat("Offset", (offsetSec >= 0 ? "+" : "") + offsetSec.toFixed(2) + " s");
        stat("Frame-rate fix", r.scaleLabel);
        stat("Lines in sync", r.before + "% → " + r.after + "%", conf);
        stat("Confidence", confText, conf);

        clear(warnBox);

        const warns = [];

        if (r.after < 50) {
            warns.push("Low confidence: this English subtitle may be a different cut of the movie. Try another one from the list, or fine-tune below.");
        }

        if (r.piecewise) {
            warns.push("Different parts of the movie needed different shifts, so the subtitle was adjusted in sections. Check a few scenes.");
        }

        const lastEnd = mapTime(subs[subs.length - 1].e, subs.length - 1);

        if (state.movie.durationMs && lastEnd > state.movie.durationMs + 30000) {
            warns.push("The last subtitle ends after the movie does (" +
                fmtDur(lastEnd) + " vs " + fmtDur(state.movie.durationMs) + ").");
        }

        warnBox.textContent = warns.join(" ");

        // preview of three lines spread through the file
        clear(previewBox);

        const picks = [0, Math.floor(subs.length / 2), subs.length - 1]
            .filter(function (v, i, a) { return a.indexOf(v) === i; });

        picks.forEach(function (i) {

            const row = document.createElement("div");
            row.className = "sync-prev-row";

            const t = document.createElement("div");
            const o = document.createElement("span");
            o.className = "t-old";
            o.textContent = msToTs(subs[i].s);
            const n = document.createElement("span");
            n.className = "t-new";
            n.textContent = msToTs(mapTime(subs[i].s, i));
            t.appendChild(o);
            t.appendChild(document.createTextNode("  →  "));
            t.appendChild(n);

            const tx = document.createElement("div");
            tx.className = "txt";
            tx.textContent = subs[i].text.slice(0, 120);

            row.appendChild(t);
            row.appendChild(tx);
            previewBox.appendChild(row);

        });

        tuneVal.textContent = (state.extraMs > 0 ? "+" : "") + state.extraMs + " ms";

        resultBox.hidden = false;

    }

    document.querySelectorAll(".sync-tune button").forEach(function (btn) {

        btn.addEventListener("click", function () {

            if (!state.result) { return; }

            const v = parseInt(btn.getAttribute("data-ms"), 10);

            state.extraMs = v === 0 ? 0 : state.extraMs + v;
            renderResult();

        });

    });

    downloadBtn.addEventListener("click", function () {

        if (!state.result || typeof downloadTextFile !== "function") { return; }

        const base = state.sinhala.name.replace(/\.srt$/i, "");

        downloadTextFile(buildOutput(), base + ".synced.srt");

    });


    // ====================================================
    // SYNC BUTTON
    // ====================================================

    syncBtn.addEventListener("click", async function () {

        if (!state.sinhala || !state.movie || !state.selected) { return; }

        syncBtn.disabled = true;
        resetResult();
        note.textContent = "";
        note.appendChild(spinner("Downloading the English subtitle…"));

        try {

            let url = state.selected.downloadUrl;

            if (url && url.charAt(0) === "/") {
                url = "https://dl.subdl.com" + url;
            }

            if (!url) { throw new Error("This subtitle has no download link."); }

            const data = await apiJson("/api/subtitle-download?url=" + encodeURIComponent(url));

            if (!data.data) { throw new Error("The English subtitle was empty."); }

            const bin = atob(data.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }

            const text = new TextDecoder("utf-8").decode(bytes);
            const E = toSubs(parseSRT(text));

            if (E.length < 20) {
                throw new Error("The English subtitle has too few lines to use as a reference.");
            }

            const S = state.sinhala.subs;

            if (S.length < 20) {
                throw new Error("The Sinhala subtitle has too few lines to align reliably.");
            }

            const setNote = function (msg) {
                clear(note);
                note.appendChild(spinner(msg));
            };

            setNote("Aligning timelines…");

            state.result = await runEngine(S, E, state.movie.durationMs, setNote);
            state.extraMs = 0;

            clear(note);
            renderResult();

            resultBox.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "nearest"
            });

        } catch (error) {

            console.error(error);
            clear(note);
            note.textContent = error.message || "Sync failed.";

        }

        refresh();

    });

    refresh();

})();
