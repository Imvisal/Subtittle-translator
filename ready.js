/* SinSubz: "Ready Sinhala subtitles" - titles the owner's auto-runner already translated.
   Cards with the poster; tapping one opens its episodes with a Download button each.
   Data: /api/stats?ready=list   file: /api/stats?ready=get&id=tt..&s=1&e=2   (api/_ready.js). Hidden when there are none. */
(function () {
    "use strict";
    var host = document.getElementById("readyTitles");
    if (!host) { return; }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return String(n).padStart(2, "0"); }
    function posterOk(u) { return /^https:\/\//.test(String(u || "")); }

    var items = [];
    var openId = "";
    var F = { q: "", t: "", g: "" };       // the small filter bar: words, Movies / TV, genre
    var LIMIT = 36, shown = LIMIT;         // when a filter is on, the row becomes a grid of up to 36 (then "Show more")
    var tools = document.getElementById("rdTools"), qBox = document.getElementById("rdQ"), gSel = document.getElementById("rdG"),
        seg = document.getElementById("rdSeg"), moreBox = document.getElementById("rdMore"), emptyBox = document.getElementById("rdEmpty");
    function filtering() { return !!(F.q || F.t || F.g); }
    function visible() {
        var q = F.q.toLowerCase();
        return items.filter(function (it) {
            if (F.t && it.type !== F.t) { return false; }
            if (F.g && (it.g || []).indexOf(F.g) < 0) { return false; }
            if (q && (String(it.t || "") + " " + String(it.y || "")).toLowerCase().indexOf(q) < 0) { return false; }
            return true;
        });
    }
    function fillGenres() {
        if (!gSel) { return; }
        var count = {};
        items.forEach(function (it) { (it.g || []).forEach(function (g) { count[g] = (count[g] || 0) + 1; }); });
        var names = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); });
        var keep = gSel.value;
        gSel.innerHTML = '<option value="">All genres</option>' + names.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + '</option>'; }).join("");
        gSel.value = names.indexOf(keep) >= 0 ? keep : "";
        F.g = gSel.value;
    }

    function dl(it, ep) {
        return "/api/stats?ready=get&id=" + encodeURIComponent(it.id) + "&s=" + (ep ? ep.s : 0) + "&e=" + (ep ? ep.e : 0);
    }

    function render() {
        var grid = host.querySelector(".rd-grid");
        var list = visible();
        var on = filtering();
        grid.classList.toggle("is-filtered", on);
        if (emptyBox) { emptyBox.hidden = !(on && !list.length); }
        if (moreBox) { moreBox.hidden = !(on && list.length > shown); }
        if (on) { list = list.slice(0, shown); }
        grid.innerHTML = list.map(function (it) {
            var n = it.eps.length;
            var tag = it.type === "tv" ? n + (n === 1 ? " episode" : " episodes") : "Film";
            return '<a class="rd-card" href="' + (it.type === "tv" ? "/tv/" : "/film/") + esc(it.slug || it.id) + '">' +
                '<span class="rd-poster">' + (posterOk(it.p) ? '<img src="' + esc(it.p) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<i>🎬</i>') +
                '<span class="rd-tag">' + esc(tag) + '</span></span>' +
                '<span class="rd-name">' + esc(it.t) + '</span>' +
                (it.y ? '<span class="rd-year">' + esc(it.y) + '</span>' : '') + '</a>';
        }).join("");

        var panel = host.querySelector(".rd-panel");
        var it = items.filter(function (x) { return x.id === openId; })[0];
        if (!it) { panel.hidden = true; panel.innerHTML = ""; return; }
        panel.hidden = false;
        var seasons = {};
        it.eps.forEach(function (ep) { (seasons[ep.s] = seasons[ep.s] || []).push(ep); });
        var body;
        if (it.type !== "tv") {
            body = '<a class="rd-dl rd-dl-big" href="' + dl(it, null) + '" download>⬇ Download Sinhala Subtitle</a>';
        } else {
            body = Object.keys(seasons).map(function (s) {
                return (Object.keys(seasons).length > 1 ? '<div class="rd-season">Season ' + s + '</div>' : '') +
                    '<div class="rd-eps">' + seasons[s].map(function (ep) {
                        return '<a class="rd-ep" href="' + dl(it, ep) + '" download title="Download S' + pad(ep.s) + 'E' + pad(ep.e) + '">' +
                            '<b>E' + pad(ep.e) + '</b><span>⬇ Download</span></a>';
                    }).join("") + '</div>';
            }).join("");
        }
        panel.innerHTML = '<div class="rd-ph"><strong>' + esc(it.t) + (it.y ? " <small>" + esc(it.y) + "</small>" : "") + '</strong>' +
            '<button type="button" class="rd-x" aria-label="Close">✕</button></div>' + body;
        panel.querySelector(".rd-x").addEventListener("click", function () { openId = ""; render(); });
    }

    host.addEventListener("click", function (ev) {
        var c = ev.target.closest && ev.target.closest(".rd-card");
        if (!c) { return; }
        openId = openId === c.getAttribute("data-id") ? "" : c.getAttribute("data-id");
        render();
        if (openId) { var p = host.querySelector(".rd-panel"); if (p && p.scrollIntoView) { p.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
    });

    if (qBox) { qBox.addEventListener("input", function () { F.q = qBox.value.trim(); shown = LIMIT; render(); }); }
    var findForm = document.getElementById("rdFind");
    if (findForm) { findForm.addEventListener("submit", function (e) { e.preventDefault(); F.q = qBox.value.trim(); shown = LIMIT; render(); }); }
    if (gSel) { gSel.addEventListener("change", function () { F.g = gSel.value; shown = LIMIT; render(); }); }
    if (seg) {
        seg.addEventListener("click", function (e) {
            var b = e.target.closest && e.target.closest("button[data-t]");
            if (!b) { return; }
            F.t = b.getAttribute("data-t");
            Array.prototype.forEach.call(seg.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
            shown = LIMIT; render();
        });
    }
    if (moreBox) { moreBox.addEventListener("click", function () { shown += LIMIT; render(); }); }

    fetch("/api/stats?ready=list").then(function (r) { return r.ok ? r.json() : { items: [] }; }).then(function (d) {
        items = Array.isArray(d.items) ? d.items.filter(function (x) { return x && x.id && x.eps && x.eps.length; }) : [];
        if (!items.length) { return; }
        host.hidden = false;
        if (tools) { tools.hidden = false; }
        fillGenres();
        render();
    }).catch(function () { /* section stays hidden */ });
})();
