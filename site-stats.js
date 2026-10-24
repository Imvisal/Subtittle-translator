/* SinSubz — usage counters on the home page (website only).
   Fetches /api/stats and shows ONE figure at a time: it counts up, stays a moment,
   then fades to the next one (translated, movies, series, episodes, synced, merged). */
(function () {
    "use strict";

    var box = document.getElementById("siteStats");
    if (!box) { return; }

    var num = document.getElementById("ssNum");
    var label = document.getElementById("ssLabel");
    var ico = document.getElementById("ssIco");
    var dots = document.getElementById("ssDots");
    var pill = box.querySelector(".ss-pill");

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // key, icon, label (one / many)
    var DEFS = [
        ["translated", "fa-language",  "Subtitle translated",  "Subtitles translated"],
        ["movies",     "fa-film",      "Movie translated",     "Movies translated"],
        ["series",     "fa-tv",        "TV series translated", "TV series translated"],
        ["episodes",   "fa-clapperboard", "Episode translated", "Episodes translated"],
        ["synced",     "fa-rotate",    "File synced",          "Files synced"],
        ["merged",     "fa-layer-group", "Video merged",       "Videos merged"]
    ];

    function fmt(n) { try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }

    var raf = 0;
    function countUp(to) {
        cancelAnimationFrame(raf);
        if (reduce || to < 2) { num.textContent = fmt(to); return; }
        var start = performance.now();
        var dur = Math.min(2200, 900 + Math.log10(to + 1) * 350);
        (function tick(now) {
            var t = Math.max(0, Math.min(1, (now - start) / dur));   // rAF time can be a hair before "start"
            var eased = 1 - Math.pow(1 - t, 3);
            num.textContent = fmt(Math.round(to * eased));
            if (t < 1) { raf = requestAnimationFrame(tick); }
        })(start);
    }

    function show(data) {
        var items = DEFS.map(function (d) {
            return { icon: d[1], one: d[2], many: d[3], to: Number(data[d[0]]) || 0 };
        }).filter(function (it) { return it.to > 0; });
        if (!items.length) { return; }              // nothing to show yet: keep it hidden

        dots.innerHTML = items.map(function () { return "<i></i>"; }).join("");
        dots.hidden = items.length < 2;
        box.hidden = false;

        var i = 0;

        function paint() {
            var it = items[i % items.length];
            ico.innerHTML = '<i class="fa-solid ' + it.icon + '"></i>';
            label.textContent = it.to === 1 ? it.one : it.many;
            Array.prototype.forEach.call(dots.children, function (d, k) {
                d.className = k === i % items.length ? "on" : "";
            });
            pill.classList.remove("out");
            pill.classList.add("in");
            countUp(it.to);
            i++;
        }

        function next() {
            if (items.length < 2) { return; }
            pill.classList.remove("in");
            pill.classList.add("out");
            setTimeout(function () { paint(); setTimeout(next, 4200); }, reduce ? 0 : 380);
        }

        function begin() { paint(); setTimeout(next, 4200); }

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
