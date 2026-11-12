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

    function hero() {
        var meta = [];
        if (D.year) { meta.push(esc(D.year)); }
        if (D.rating) { meta.push("⭐ " + D.rating); }
        if (D.runtime) { meta.push(D.runtime + " min"); }
        return '<section class="tp-hero">' +
            '<div class="tp-poster">' + (D.poster ? '<img src="' + esc(D.poster) + '" alt="' + esc(D.title) + ' poster" referrerpolicy="no-referrer">' : "<i>🎬</i>") + '</div>' +
            '<div class="tp-info"><span class="tp-kind">' + (isTv ? "TV series" : "Film") + '</span>' +
            '<h1>' + esc(D.title) + '</h1>' +
            (meta.length ? '<div class="tp-meta">' + meta.join(" · ") + '</div>' : "") +
            (D.genres && D.genres.length ? '<div class="tp-chips">' + D.genres.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + '</div>' : "") +
            (D.tagline ? '<p class="tp-tag">“' + esc(D.tagline) + '”</p>' : "") +
            (D.overview ? '<p class="tp-over">' + esc(D.overview) + '</p>' : "") +
            '<div class="tp-badge">🇱🇰 ' + (isTv ? readyCount() + " Sinhala subtitle" + (readyCount() === 1 ? "" : "s") + " ready" : "Sinhala subtitle ready") + '</div>' +
            '</div></section>';
    }

    function episodes() {
        if (!isTv) {
            return '<section class="tp-card"><h2>Download</h2><button type="button" class="tp-dl tp-dl-big" data-s="0" data-e="0">⬇ Download Sinhala Subtitle</button></section>';
        }
        var tabs = seasonKeys.length > 1 ? '<div class="tp-tabs" role="tablist">' + seasonKeys.map(function (k) {
            return '<button type="button" role="tab" class="tp-tab' + (k === cur ? " on" : "") + '" data-season="' + k + '">Season ' + k + '</button>';
        }).join("") + '</div>' : "";
        var list = (D.seasons[cur] || []).map(function (e) {
            var left = '<span class="tp-en">E' + pad(e.e) + '</span><span class="tp-nm"><b>' + (e.name ? esc(e.name) : "Episode " + e.e) + '</b>' + (airText(e.air) ? "<small>" + airText(e.air) + "</small>" : "") + '</span>';
            var right = e.ready ? '<button type="button" class="tp-dl" data-s="' + cur + '" data-e="' + e.e + '">⬇ Download</button>' : '<span class="tp-soon">Coming soon</span>';
            return '<li class="tp-ep' + (e.ready ? " is-ready" : "") + '">' + left + right + '</li>';
        }).join("");
        return '<section class="tp-card"><h2>Episodes</h2>' + tabs + '<ul class="tp-eps">' + list + '</ul></section>';
    }

    // trailer: a picture first, the YouTube player (privacy mode) loads only after the click
    function trailerCard() {
        if (!D.trailer || !/^[\w-]{6,20}$/.test(D.trailer)) { return ""; }
        return '<section class="tp-card tp-trailer"><h2>Trailer</h2><div class="ti-trailer" data-yt="' + esc(D.trailer) + '">' +
            '<button type="button" class="ti-play" aria-label="Play trailer"><img src="https://img.youtube.com/vi/' + esc(D.trailer) + '/hqdefault.jpg" alt="" loading="lazy">' +
            '<span class="ti-play-icon">\u25B6</span><span class="ti-play-label">Watch trailer</span></button></div></section>';
    }

    function render() { root.innerHTML = hero() + trailerCard() + episodes(); }
    render();

    root.addEventListener("click", function (ev) {
        var pl = ev.target.closest && ev.target.closest(".ti-play");
        if (pl) {
            var box = pl.parentNode;
            box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(box.getAttribute("data-yt")) +
                '?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
            return;
        }
        var t = ev.target.closest && ev.target.closest(".tp-tab");
        if (t) { cur = Number(t.getAttribute("data-season")); try { sessionStorage.setItem("tp-season-" + D.id, String(cur)); } catch (e) { /* ignore */ } render(); return; }
        var b = ev.target.closest && ev.target.closest(".tp-dl");
        if (b) { ask(Number(b.getAttribute("data-s")), Number(b.getAttribute("data-e"))); }
    });

    function find(s, e) { var l = D.seasons[s] || []; for (var i = 0; i < l.length; i++) { if (l[i].e === e) { return l[i]; } } return null; }

    function ask(s, e) {
        var ep = isTv ? find(s, e) : (D.seasons[0] && D.seasons[0][0]) || null;
        var label = isTv ? D.title + " · S" + pad(s) + "E" + pad(e) + (ep && ep.name ? " · " + ep.name : "") : D.title;
        var rel = ep && ep.r ? ep.r : "";
        var ov = document.createElement("div");
        ov.className = "tp-ov";
        ov.innerHTML = '<div class="tp-modal" role="dialog" aria-modal="true" aria-label="Choose your video version">' +
            '<button type="button" class="tp-x" aria-label="Close">✕</button>' +
            '<div class="tp-mt">Which video version do you have?</div><div class="tp-ms">' + esc(label) + '</div>' +
            '<p class="tp-mp">Subtitles must fit your video file (WEB-DL, BluRay, WEBRip, HDTV, 1080p, 720p...). Pick one:</p>' +
            '<a class="tp-opt tp-opt-a" href="' + fileUrl(isTv ? s : 0, isTv ? e : 0) + '" download><b>⬇ Download now</b><span>Not sure, or just want it fast.' + (rel ? " Made from: <em>" + esc(rel) + "</em>." : "") + ' It can be a few seconds off on other versions.</span></a>' +
            '<a class="tp-opt tp-opt-b" href="' + matchUrl(s, e) + '"><b>🎯 Match my video (synced)</b><span>Choose your video version and we sync the Sinhala subtitle to it. No waiting, no AI.</span></a>' +
            '</div>';
        function close() { if (ov.parentNode) { ov.parentNode.removeChild(ov); } document.removeEventListener("keydown", onKey); }
        function onKey(k) { if (k.key === "Escape") { close(); } }
        ov.addEventListener("click", function (c) { if (c.target === ov || (c.target.closest && c.target.closest(".tp-x"))) { close(); } });
        ov.querySelector(".tp-opt-a").addEventListener("click", function () { setTimeout(close, 400); });
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
    }
})();
