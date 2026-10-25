/* SinSubz — "Live" usage counters on the home page (website only).
   Fetches /api/stats and shows every figure at once as floating cards around a glowing "Live Now" ring.
   Each figure counts up when the widget scrolls into view. Hidden until there is something to show. */
(function () {
    "use strict";

    var box = document.getElementById("siteStats");
    if (!box) { return; }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // key, icon, short label, long label (for screen readers)
    var DEFS = [
        ["translated", "fa-language",     "Subtitles", "Subtitles translated"],
        ["movies",     "fa-film",         "Movies",    "Movies translated"],
        ["series",     "fa-tv",           "TV Series", "TV series translated"],
        ["episodes",   "fa-clapperboard", "Episodes",  "Episodes translated"],
        ["synced",     "fa-rotate",       "Synced",    "Files synced"],
        ["merged",     "fa-layer-group",  "Merged",    "Videos merged"]
    ];

    // card centres as % of the square box (x, y), clockwise from the top-left
    var SLOTS = {
        6: [[27, 9], [75, 17], [84, 52], [73, 90], [26, 84], [16, 47]],
        5: [[27, 9], [77, 24], [80, 74], [28, 88], [15, 48]],
        4: [[27, 14], [76, 24], [74, 82], [24, 76]],
        3: [[50, 8], [80, 70], [20, 70]],
        2: [[26, 22], [74, 76]],
        1: [[50, 14]]
    };

    function fmt(n) { try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }

    function show(data) {
        var items = DEFS.map(function (d) {
            return { key: d[0], icon: d[1], label: d[2], full: d[3], to: Number(data[d[0]]) || 0 };
        }).filter(function (it) { return it.to > 0; });
        if (!items.length) { return; }              // nothing to show yet: keep it hidden

        var slots = SLOTS[items.length];
        var html =
            '<div class="ss-orbit">' +
            '<span class="ss-ring ss-ring-out" aria-hidden="true"></span>' +
            '<span class="ss-ring ss-ring-in" aria-hidden="true"></span>' +
            '<div class="ss-core"><span class="ss-dot" aria-hidden="true"></span><span class="ss-live">Live Now</span></div>';

        items.forEach(function (it, k) {
            html +=
                '<div class="ss-card" style="left:' + slots[k][0] + '%;top:' + slots[k][1] + '%;--d:' + (k * 0.55).toFixed(2) + 's" ' +
                'role="text" aria-label="' + fmt(it.to) + ' ' + it.full + '">' +
                '<span class="ss-tag"><i class="fa-solid ' + it.icon + '" aria-hidden="true"></i>' + it.label + '</span>' +
                '<b class="ss-val" data-to="' + it.to + '">0</b>' +
                '</div>';
        });

        html += '</div>';
        box.innerHTML = html;
        box.hidden = false;

        var vals = box.querySelectorAll(".ss-val");

        function countUp(el, to, delay) {
            if (reduce || to < 2) { el.textContent = fmt(to); return; }
            var dur = Math.min(2200, 900 + Math.log10(to + 1) * 380);
            setTimeout(function () {
                var start = performance.now();
                (function tick(now) {
                    var t = Math.max(0, Math.min(1, (now - start) / dur));
                    var eased = 1 - Math.pow(1 - t, 3);
                    el.textContent = fmt(Math.round(to * eased));
                    if (t < 1) { requestAnimationFrame(tick); }
                })(start);
            }, delay);
        }

        function begin() {
            box.classList.add("on");
            Array.prototype.forEach.call(vals, function (el, k) {
                countUp(el, Number(el.getAttribute("data-to")) || 0, reduce ? 0 : 150 + k * 120);
            });
        }

        if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); begin(); }
            }, { threshold: 0.25 });
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
