/* SinSubz website: makes the search box inviting.
   - "Try:" chips under it with a few of our ready titles: one tap searches for them
   No effect on the search itself (it only fills the same input and presses the same button). */
(function () {
    "use strict";
    var input = document.getElementById("searchInput");
    var btn = document.getElementById("searchBtn");
    var row = document.querySelector(".search-row");
    if (!input || !btn || !row) { return; }

    input.placeholder = "Search a movie or TV series…";

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
