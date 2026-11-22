/* SinSubz website: makes the search box inviting.
   - the placeholder types out example titles ("Breaking Bad", ...) while the box is empty
   - "Try:" chips under it with a few of our ready titles: one tap searches for them
   No effect on the search itself (it only fills the same input and presses the same button). */
(function () {
    "use strict";
    var input = document.getElementById("searchInput");
    var btn = document.getElementById("searchBtn");
    var row = document.querySelector(".search-row");
    if (!input || !btn || !row) { return; }

    var names = ["Breaking Bad", "Stranger Things", "Money Heist", "Squid Game", "The Last of Us", "Interstellar", "Wednesday", "Game of Thrones"];
    var base = "Search a movie or TV series…";
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* ignore */ }

    // typing placeholder
    var ni = 0, ci = 0, dir = 1, timer = 0;
    function tick() {
        clearTimeout(timer);
        if (input.value) { input.placeholder = base; timer = setTimeout(tick, 1500); return; }
        var w = names[ni];
        ci += dir;
        input.placeholder = "Try “" + w.slice(0, ci) + (ci < w.length || dir < 0 ? "▏" : "") + "”";
        var wait = 70;
        if (dir > 0 && ci >= w.length) { dir = -1; wait = 1500; }
        else if (dir < 0 && ci <= 0) { dir = 1; ni = (ni + 1) % names.length; wait = 350; }
        else if (dir < 0) { wait = 35; }
        timer = setTimeout(tick, wait);
    }
    if (reduce) { input.placeholder = base; } else { input.placeholder = base; timer = setTimeout(tick, 1200); }

    // "Try:" chips from the newest ready titles
    var box = document.createElement("div");
    box.className = "sh-try";
    box.hidden = true;
    row.insertAdjacentElement("afterend", box);
    function go(name) { input.value = name; input.dispatchEvent(new Event("input", { bubbles: true })); btn.click(); }
    fetch("/api/stats?ready=list").then(function (r) { return r.ok ? r.json() : { items: [] }; }).then(function (d) {
        var items = (Array.isArray(d.items) ? d.items : []).filter(function (x) { return x && x.t; })
            .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 4);
        if (items.length < 2) { return; }
        var lbl = document.createElement("span");
        lbl.textContent = "Try:";
        box.appendChild(lbl);
        items.forEach(function (x) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = x.t;
            b.addEventListener("click", function () { go(x.t); });
            box.appendChild(b);
        });
        box.hidden = false;
    }).catch(function () { /* no chips, nothing else changes */ });
})();
