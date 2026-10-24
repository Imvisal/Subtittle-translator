/* SinSubz — usage counters on the home page (website only).
   Fetches /api/stats and counts each number up one by one when it scrolls into view. */
(function () {
    "use strict";

    var box = document.getElementById("siteStats");
    if (!box) { return; }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function fmt(n) { try { return n.toLocaleString("en-US"); } catch (e) { return String(n); } }

    function countUp(el, to) {
        if (reduce || to < 2) { el.textContent = fmt(to); return; }
        var start = performance.now();
        var dur = Math.min(2200, 900 + Math.log10(to + 1) * 350);
        (function tick(now) {
            var t = Math.min(1, (now - start) / dur);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = fmt(Math.round(to * eased));
            if (t < 1) { requestAnimationFrame(tick); }
        })(start);
    }

    function show(data) {
        var els = box.querySelectorAll("[data-stat]");
        var any = false;
        els.forEach(function (el) { if ((data[el.getAttribute("data-stat")] || 0) > 0) { any = true; } });
        if (!any) { return; }                       // nothing to brag about yet: keep it hidden
        box.hidden = false;

        var run = function () {
            els.forEach(function (el, i) {
                var to = Number(data[el.getAttribute("data-stat")]) || 0;
                setTimeout(function () { countUp(el, to); }, i * 120);
            });
        };

        if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); run(); }
            }, { threshold: 0.3 });
            io.observe(box);
        } else {
            run();
        }
    }

    fetch("/api/stats")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.enabled) { show(d); } })
        .catch(function () { /* hidden */ });
})();
