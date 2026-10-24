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
            var t = Math.max(0, Math.min(1, (now - start) / dur));   // rAF time can be a hair before "start"
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = fmt(Math.round(to * eased));
            if (t < 1) { requestAnimationFrame(tick); }
        })(start);
    }

    // one figure at a time: it counts up, stays a moment, then the text changes to the next one
    function show(data) {
        var items = [];
        box.querySelectorAll("[data-stat]").forEach(function (el) {
            var to = Number(data[el.getAttribute("data-stat")]) || 0;
            if (to > 0) { items.push({ span: el.parentNode, el: el, to: to }); }
        });
        if (!items.length) { return; }              // nothing to show yet: keep it hidden
        box.hidden = false;

        var i = 0;
        function step() {
            items.forEach(function (it) { it.span.classList.remove("on"); });
            var it = items[i % items.length];
            it.el.textContent = "0";
            it.span.classList.add("on");
            countUp(it.el, it.to);
            i++;
            if (items.length > 1) { setTimeout(step, 4200); }
        }

        if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); step(); }
            }, { threshold: 0.3 });
            io.observe(box);
        } else {
            step();
        }
    }

    fetch("/api/stats")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.enabled) { show(d); } })
        .catch(function () { /* hidden */ });
})();
