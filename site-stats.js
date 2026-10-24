/* SinSubz — usage counters on the home page (website only).
   Fetches /api/stats and shows every non-zero figure at once as a slim row of chips under
   the hero buttons (translated, movies, series, episodes, synced, merged). Each one counts up. */
(function () {
    "use strict";

    var box = document.getElementById("siteStats");
    if (!box) { return; }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // key, icon, label (one / many)
    var DEFS = [
        ["translated", "fa-language",     "Subtitle translated",  "Subtitles translated"],
        ["movies",     "fa-film",         "Movie translated",     "Movies translated"],
        ["series",     "fa-tv",           "TV series translated", "TV series translated"],
        ["episodes",   "fa-clapperboard", "Episode translated",   "Episodes translated"],
        ["synced",     "fa-rotate",       "File synced",          "Files synced"],
        ["merged",     "fa-layer-group",  "Video merged",         "Videos merged"]
    ];

    function fmt(n) { try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }

    function countUp(el, to) {
        if (reduce || to < 2) { el.textContent = fmt(to); return; }
        var start = performance.now();
        var dur = Math.min(2000, 800 + Math.log10(to + 1) * 350);
        (function tick(now) {
            var t = Math.max(0, Math.min(1, (now - start) / dur));   // rAF time can be a hair before "start"
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = fmt(Math.round(to * eased));
            if (t < 1) { requestAnimationFrame(tick); }
        })(start);
    }

    function show(data) {
        var items = DEFS.map(function (d) {
            return { icon: d[1], one: d[2], many: d[3], to: Number(data[d[0]]) || 0 };
        }).filter(function (it) { return it.to > 0; });
        if (!items.length) { return; }              // nothing to show yet: keep it hidden

        box.innerHTML = items.map(function (it, k) {
            return '<div class="ss-item" style="--i:' + k + '">' +
                '<span class="ss-ico"><i class="fa-solid ' + it.icon + '"></i></span>' +
                '<b class="ss-num">0</b>' +
                '<span class="ss-label">' + (it.to === 1 ? it.one : it.many) + '</span>' +
                '</div>';
        }).join("");
        box.hidden = false;

        function begin() {
            box.classList.add("in");
            Array.prototype.forEach.call(box.querySelectorAll(".ss-num"), function (el, k) {
                countUp(el, items[k].to);
            });
        }

        if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); begin(); }
            }, { threshold: 0.3 });
            io.observe(box);
        } else {
            begin();
        }
    }

    fetch("/api/stats")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.enabled) { show(d); } })
        .catch(function () { /* stays hidden */ });
})();
