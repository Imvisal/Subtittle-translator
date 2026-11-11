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

    function dl(it, ep) {
        return "/api/stats?ready=get&id=" + encodeURIComponent(it.id) + "&s=" + (ep ? ep.s : 0) + "&e=" + (ep ? ep.e : 0);
    }

    function render() {
        var grid = host.querySelector(".rd-grid");
        grid.innerHTML = items.map(function (it) {
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

    fetch("/api/stats?ready=list").then(function (r) { return r.ok ? r.json() : { items: [] }; }).then(function (d) {
        items = Array.isArray(d.items) ? d.items.filter(function (x) { return x && x.id && x.eps && x.eps.length; }) : [];
        if (!items.length) { return; }
        host.hidden = false;
        render();
    }).catch(function () { /* section stays hidden */ });
})();
