/* SinSubz title page (/tv/<slug>, /film/<slug>): poster, story, season tabs, episode list, download.
   Data is embedded in the page by api/_ready.js (#tp-data). Download asks which video version the person has:
   "download now" (the ready file) or "match my video" (home page, pick the release, the saved Sinhala lines are synced to it). */
(function () {
    "use strict";
    var root = document.getElementById("tp");
    var seed = document.getElementById("tp-data");
    if (!root || !seed) { return; }
    var D;
    try { D = JSON.parse(seed.textContent); } catch (e) { return; }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return String(n).padStart(2, "0"); }
    function airText(a) { if (!a) { return ""; } var d = new Date(a + "T00:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    var isTv = D.type === "tv";
    var seasonKeys = Object.keys(D.seasons || {}).map(Number).sort(function (a, b) { return a - b; });
    var cur = seasonKeys.length ? seasonKeys[0] : 0;
    try { var saved = Number(sessionStorage.getItem("tp-season-" + D.id)); if (saved && seasonKeys.indexOf(saved) >= 0) { cur = saved; } } catch (e) { /* ignore */ }

    function fileUrl(s, e) { return "/api/stats?ready=get&id=" + encodeURIComponent(D.id) + "&s=" + (s || 0) + "&e=" + (e || 0); }
    function matchUrl(s, e) {
        var q = "match=" + encodeURIComponent(D.id) + "&t=" + encodeURIComponent(D.title) + "&y=" + encodeURIComponent(D.year || "") + (D.poster ? "&p=" + encodeURIComponent(D.poster) : "");
        if (isTv) { q += "&s=" + s + "&e=" + e; }
        return "/?" + q;
    }

    function readyCount() { var n = 0; seasonKeys.forEach(function (k) { D.seasons[k].forEach(function (e) { if (e.ready) { n++; } }); }); return n; }

    function runtimeText(m) { m = Number(m) || 0; if (!m) { return ""; } return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60 ? m % 60 + "m" : "") : m + " min"; }
    function initials(n) { return String(n || "").split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); }
    function rest() { return Number(D.rating) ? '<span class="tp-score tp-tmdb"><b>TMDB</b> \u2605 ' + esc(D.rating) + '</span>' : ""; }

    // the top block: backdrop picture behind, poster + facts + the buttons in front. Trailer plays in place of it.
    function hero() {
        var scores = "";
        if (D.imdb) { scores += '<span class="tp-score tp-imdb" title="IMDb rating"><b>IMDb</b> \u2605 ' + esc(D.imdb) + '<small>/10' + (D.votes ? " \u00B7 " + esc(D.votes) : "") + '</small></span>'; }
        if (D.rt) { scores += '<span class="tp-score tp-rt" title="Rotten Tomatoes">\uD83C\uDF45 ' + esc(D.rt) + '</span>'; }
        if (D.mc) { scores += '<span class="tp-score tp-mc" title="Metascore"><b>Metascore</b> ' + esc(D.mc) + '</span>'; }
        if (!D.imdb) { scores += rest(); }
        var facts = [];
        if (D.year) { facts.push(esc(D.year)); }
        if (runtimeText(D.runtime)) { facts.push(runtimeText(D.runtime) + (isTv ? " / episode" : "")); }
        if (D.rated) { facts.push('<span class="tp-rated">' + esc(D.rated) + '</span>'); }
        var n = readyCount();
        var actions = "";
        if (D.trailer && /^[\w-]{6,20}$/.test(D.trailer)) { actions += '<button type="button" class="tp-cta tp-cta-tr" data-act="trailer">\u25B6 Watch trailer</button>'; }
        return '<section class="tp-hero" id="tpHero">' +
            '<div class="tp-bd">' + (D.backdrop ? '<img src="' + esc(D.backdrop) + '" alt="" referrerpolicy="no-referrer">' : "") + '</div>' +
            '<div class="tp-stage" id="tpStage" hidden></div>' +
            '<button type="button" class="tp-tclose" hidden>\u2715 Close trailer</button>' +
            '<div class="tp-in">' +
            '<div class="tp-poster">' + (D.poster ? '<img src="' + esc(D.poster) + '" alt="' + esc(D.title) + ' poster" referrerpolicy="no-referrer">' : "<i>\uD83C\uDFAC</i>") + '</div>' +
            '<div class="tp-info"><span class="tp-kind">' + (isTv ? "TV series" : "Film") + '</span>' +
            '<h1>' + esc(D.title) + ' <span class="tp-h1s">Sinhala Subtitle | සිංහල උපසිරැසි</span></h1>' +
            (facts.length ? '<div class="tp-meta">' + facts.join('<i class="tp-dot"></i>') + '</div>' : "") +
            (scores ? '<div class="tp-scores">' + scores + '</div>' : "") +
            (D.genres && D.genres.length ? '<div class="tp-chips">' + D.genres.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + '</div>' : "") +
            (D.tagline ? '<p class="tp-tag">\u201C' + esc(D.tagline) + '\u201D</p>' : "") +
            (D.overview ? '<p class="tp-over">' + esc(D.overview) + '</p>' : "") +
            (D.by && D.by.length ? '<p class="tp-by"><span>' + (isTv ? "Created by" : "Directed by") + '</span> ' + D.by.map(esc).join(", ") + '</p>' : "") +
            '<div class="tp-badge">\uD83C\uDDF1\uD83C\uDDF0 ' + (isTv ? n + " Sinhala subtitle" + (n === 1 ? "" : "s") + " ready" : "Sinhala subtitle ready") + '</div>' +
            '<div class="tp-actions">' + actions + '</div>' +
            '</div></div></section>';
    }

    function castCard() {
        if (!D.cast || !D.cast.length) { return ""; }
        return '<section class="tp-card tp-cast"><h2>Cast</h2><div class="tp-cast-row">' + D.cast.map(function (c) {
            return '<div class="tp-cm"><span class="tp-ph">' + (c.p ? '<img src="' + esc(c.p) + '" alt="' + esc(c.n) + '" loading="lazy" referrerpolicy="no-referrer">' : "<b>" + esc(initials(c.n)) + "</b>") + '</span>' +
                '<strong>' + esc(c.n) + '</strong>' + (c.c ? '<small>' + esc(c.c) + '</small>' : "") + '</div>';
        }).join("") + '</div></section>';
    }

    function episodes() {
        if (!isTv) {
            var f0 = (D.seasons[0] && D.seasons[0][0]) || {};
            return '<section class="tp-card tp-dcard" id="tpEps"><h2>Download Sinhala subtitle</h2>' +
                '<button type="button" class="tp-bigdl tp-dl" data-s="0" data-e="0"><span class="tp-di">\u2B07</span><span class="tp-bt"><b>Download Sinhala subtitle</b>' +
                '<small>' + (f0.n ? f0.n + ' lines \u00B7 ' : '') + 'free .srt \u00B7 pick your video version</small></span></button>' +
                '<p class="tp-dcount" id="tpDlCount" hidden></p></section>';
        }
        var tabs = seasonKeys.length > 1 ? '<div class="tp-tabs" role="tablist">' + seasonKeys.map(function (k) {
            return '<button type="button" role="tab" class="tp-tab' + (k === cur ? " on" : "") + '" data-season="' + k + '">Season ' + k + '</button>';
        }).join("") + '</div>' : "";
        var list = (D.seasons[cur] || []).map(function (e) {
            var left = '<span class="tp-en">E' + pad(e.e) + '</span><span class="tp-nm"><b>' + (e.name ? esc(e.name) : "Episode " + e.e) + '</b>' + (airText(e.air) ? "<small>" + airText(e.air) + "</small>" : "") + '</span>';
            var right = e.ready ? '<button type="button" class="tp-dl" data-s="' + cur + '" data-e="' + e.e + '">⬇ Download</button>' : '<span class="tp-soon">Coming soon</span>';
            return '<li class="tp-ep' + (e.ready ? " is-ready" : "") + '">' + left + right + '</li>';
        }).join("");
        return '<section class="tp-card" id="tpEps"><h2>Episodes</h2>' + tabs + '<ul class="tp-eps">' + list + '</ul></section>';
    }

    function startTrailer() {
        var hero = document.getElementById("tpHero"), stage = document.getElementById("tpStage");
        if (!hero || !stage || !D.trailer) { return; }
        stage.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(D.trailer) +
            '?autoplay=1&rel=0&modestbranding=1" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
        stage.hidden = false;
        hero.classList.add("is-playing");
        hero.querySelector(".tp-tclose").hidden = false;
        if (hero.scrollIntoView) { hero.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    function stopTrailer() {
        var hero = document.getElementById("tpHero"), stage = document.getElementById("tpStage");
        if (!hero || !stage) { return; }
        stage.innerHTML = ""; stage.hidden = true;
        hero.classList.remove("is-playing");
        hero.querySelector(".tp-tclose").hidden = true;
    }

    function render() { root.innerHTML = hero() + castCard() + episodes(); }
    render();
    (function dlCount() {
        var el = document.getElementById("tpDlCount");
        if (!el) { return; }
        fetch("/api/stats?ready=count&id=" + encodeURIComponent(D.id)).then(function (r) { return r.json(); }).then(function (j) {
            var n = Number(j && j.n) || 0;
            if (n < 1) { return; }
            el.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg><b>' + n.toLocaleString("en-US") + '</b> downloads';
            el.hidden = false;
        }).catch(function () { /* hidden */ });
    })();

    root.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest('[data-act="trailer"]')) { startTrailer(); return; }
        if (ev.target.closest && ev.target.closest(".tp-tclose")) { stopTrailer(); return; }
        var t = ev.target.closest && ev.target.closest(".tp-tab");
        if (t) { cur = Number(t.getAttribute("data-season")); try { sessionStorage.setItem("tp-season-" + D.id, String(cur)); } catch (e) { /* ignore */ } render(); return; }
        var b = ev.target.closest && ev.target.closest(".tp-dl");
        if (b) { ask(Number(b.getAttribute("data-s")), Number(b.getAttribute("data-e"))); }
    });

    var DL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>Download';
    function find(s, e) { var l = D.seasons[s] || []; for (var i = 0; i < l.length; i++) { if (l[i].e === e) { return l[i]; } } return null; }

    function ask(s, e) {
        var ep = isTv ? find(s, e) : (D.seasons[0] && D.seasons[0][0]) || null;
        var label = isTv ? D.title + " · S" + pad(s) + "E" + pad(e) + (ep && ep.name ? " · " + ep.name : "") : D.title;
        var rel = ep && ep.r ? ep.r : "";
        var ov = document.createElement("div");
        ov.className = "tp-ov";
        var si = isTv ? s : 0, ei = isTv ? e : 0;
        ov.innerHTML = '<div class="tp-modal" role="dialog" aria-modal="true" aria-label="Download Sinhala subtitle">' +
            '<button type="button" class="tp-x" aria-label="Close">\u2715</button>' +
            '<div class="tp-mt">Download Sinhala subtitle</div><div class="tp-ms">' + esc(label) + '</div>' +
            '<div class="tp-sec">Original subtitle</div>' +
            '<a class="tp-opt tp-opt-a" href="' + fileUrl(si, ei) + '" download><span class="tp-ot"><b>' + (rel ? esc(rel) : "Ready subtitle") + ' <i class="tp-tag-si">Sinhala</i></b><span>Works with most versions. Ready now.</span></span><span class="tp-obtn">'+DL+'</span></a>' +
            '<div class="tp-sec">Other Sinhala subtitle video versions <small>synced to your file</small></div>' +
            '<div class="tp-rels" id="tpRels"><p class="tp-mp">Loading versions\u2026</p></div>' +
            '</div>';
        (function loadRels() {
            var box = null;
            var q = "/api/subtitles?imdb_id=" + encodeURIComponent(D.id) + (isTv ? "&type=tv&season=" + s + "&episode=" + e : "&type=movie");
            fetch(q).then(function (r) { return r.json(); }).then(function (j) {
                box = ov.querySelector("#tpRels"); if (!box) { return; }
                var seen = {}, out = [];
                (j.results || []).forEach(function (x) {
                    var r = String(x.release || x.fileName || ""); if (!r || seen[r]) { return; }
                    var lab = r.replace(/\.(srt|zip)$/i, "");
                    if (rel && lab.toLowerCase() === rel.toLowerCase()) { return; }
                    seen[r] = 1; out.push({ r: r, lab: lab });
                });
                if (!out.length) { box.innerHTML = '<p class="tp-mp">No other versions found. Use the original above.</p>'; return; }
                box.innerHTML = out.slice(0, 12).map(function (o) {
                    return '<a class="tp-opt tp-opt-r" href="' + matchUrl(s, e) + '&rel=' + encodeURIComponent(o.r) + '"><span class="tp-ot"><b>' + esc(o.lab) + ' <i class="tp-tag-si">Sinhala</i></b></span><span class="tp-obtn">'+DL+'</span></a>';
                }).join("");
            }).catch(function () { box = ov.querySelector("#tpRels"); if (box) { box.innerHTML = '<p class="tp-mp">Could not load other versions. Use the original above.</p>'; } });
        })();
        function close() { if (ov.parentNode) { ov.parentNode.removeChild(ov); } document.removeEventListener("keydown", onKey); }
        function onKey(k) { if (k.key === "Escape") { close(); } }
        ov.addEventListener("click", function (c) { if (c.target === ov || (c.target.closest && c.target.closest(".tp-x"))) { close(); } });
        ov.querySelector(".tp-opt-a").addEventListener("click", function () { setTimeout(close, 400); });
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
    }
})();
