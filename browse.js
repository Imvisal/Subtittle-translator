/* SinSubz - Movies / TV Series pages. Pick a category (list + genre), see posters, open one.
   Ready (translated) titles open their own page; the others open the translate flow on the home page. */
(function () {
    "use strict";
    var root = document.getElementById("bz");
    if (!root) { return; }
    var KIND = root.getAttribute("data-kind") === "tv" ? "tv" : "movie";
    var LISTS = [["popular", "Popular"], ["top", "Top rated"], ["new", "New"], ["ready", "Sinhala ready"]];
    var GENRES = KIND === "tv"
        ? [["", "All"], ["10759", "Action & Adventure"], ["35", "Comedy"], ["80", "Crime"], ["99", "Documentary"], ["18", "Drama"], ["10751", "Family"], ["9648", "Mystery"], ["10765", "Sci-Fi & Fantasy"], ["10768", "War & Politics"], ["37", "Western"]]
        : [["", "All"], ["28", "Action"], ["12", "Adventure"], ["35", "Comedy"], ["80", "Crime"], ["99", "Documentary"], ["18", "Drama"], ["10751", "Family"], ["14", "Fantasy"], ["27", "Horror"], ["9648", "Mystery"], ["10749", "Romance"], ["878", "Sci-Fi"], ["53", "Thriller"], ["10752", "War"]];
    var st = { list: "popular", genre: "", page: 1, busy: false };
    var elLists = document.getElementById("bzLists"), elGenres = document.getElementById("bzGenres"),
        elGrid = document.getElementById("bzGrid"), elMore = document.getElementById("bzMore"), elMsg = document.getElementById("bzMsg");
    var readyP = null;
    try {                                                   // opened from the header menu: ?genre=28&list=new
        var qs = new URLSearchParams(location.search), g = qs.get("genre"), l = qs.get("list");
        if (g && GENRES.some(function (x) { return x[0] === g; })) { st.genre = g; }
        if (l && LISTS.some(function (x) { return x[0] === l; })) { st.list = l; }
    } catch (e) { /* ignore */ }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function getReady() {
        if (!readyP) {
            readyP = fetch("/api/stats?ready=list").then(function (r) { return r.ok ? r.json() : { items: [] }; })
                .then(function (d) { return Array.isArray(d.items) ? d.items : []; }).catch(function () { return []; });
        }
        return readyP;
    }
    function chips(box, arr, cur, onPick) {
        box.innerHTML = "";
        arr.forEach(function (a) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "bz-chip" + (a[0] === cur ? " on" : ""); b.textContent = a[1];
            b.setAttribute("aria-pressed", a[0] === cur ? "true" : "false");
            b.addEventListener("click", function () { onPick(a[0]); });
            box.appendChild(b);
        });
    }
    function card(it, ready) {
        var a = document.createElement("a");
        var href = ready ? "/" + (ready.type === "tv" ? "tv" : "film") + "/" + (ready.slug || ready.id)
            : "/?pick=" + encodeURIComponent(it.imdbID) + "&t=" + encodeURIComponent((it.title || "").slice(0, 150)) + "&y=" + encodeURIComponent(it.year || "") +
              "&ty=" + (KIND === "tv" ? "series" : "movie") + (it.poster ? "&p=" + encodeURIComponent(it.poster) : "");
        a.href = href; a.className = "bz-card" + (ready ? " ready" : "");
        a.innerHTML = (it.poster ? '<img loading="lazy" alt="" src="' + esc(it.poster) + '">' : '<span class="bz-noimg">🎬</span>') +
            '<span class="bz-cc" title="' + (ready ? "Sinhala subtitle ready" : "Not translated yet") + '"><i class="fa-solid fa-closed-captioning" aria-hidden="true"></i><span class="bz-sr">' + (ready ? "Sinhala subtitle ready" : "Not translated yet") + '</span></span>' +
            '<span class="bz-t">' + esc(it.title) + '</span><span class="bz-y">' + esc(it.year || "") + "</span>";
        return a;
    }
    function msg(t) { elMsg.textContent = t || ""; }

    async function load(reset) {
        if (st.busy) { return; }
        st.busy = true;
        if (reset) { st.page = 1; elGrid.innerHTML = ""; }
        msg("Loading…"); elMore.hidden = true;
        try {
            var ready = await getReady();
            var byId = {}; ready.forEach(function (x) { if (x && x.id) { byId[x.id] = x; } });
            if (st.list === "ready") {
                var mine = ready.filter(function (x) { return (KIND === "tv") === (x.type === "tv"); });
                if (st.genre) { /* genre filter has no meaning for our own list */ }
                mine.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
                mine.forEach(function (x) { elGrid.appendChild(card({ imdbID: x.id, title: x.t, year: x.y, poster: x.p }, x)); });
                msg(mine.length ? "" : "No Sinhala subtitles ready here yet.");
            } else {
                var r = await fetch("/api/categories?category=browse&kind=" + KIND + "&list=" + st.list + "&genre=" + st.genre + "&page=" + st.page);
                var d = await r.json();
                if (!r.ok || !d.results) { throw new Error(d.error || "failed"); }
                d.results.forEach(function (it) { elGrid.appendChild(card(it, byId[it.imdbID])); });
                msg(elGrid.children.length ? "" : "Nothing found for this category.");
                elMore.hidden = !d.results.length || st.page >= 20;
            }
        } catch (e) { msg("Could not load. Please try again."); }
        st.busy = false;
    }
    function draw() {
        chips(elLists, LISTS, st.list, function (v) { st.list = v; draw(); load(true); });
        elGenres.hidden = st.list === "ready";
        chips(elGenres, GENRES, st.genre, function (v) { st.genre = v; draw(); load(true); });
    }
    elMore.addEventListener("click", function () { st.page++; load(false); });
    draw(); load(true);
})();
