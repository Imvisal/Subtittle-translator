/* SinSubz — animated poster wall behind the home page title (website only).
   Tilted columns of poster cards; every second or so one random card swaps to a different current
   movie / TV series poster (TMDB, via /api/hero-posters). The static banner image stays as the
   fallback and is only faded out once enough posters have loaded. */
(function () {
    "use strict";

    var banner = document.querySelector(".hero-banner");
    if (!banner) { return; }

    var root = document.documentElement;
    var done = false;

    // the static banner is hidden while the wall is expected (class set in index.html);
    // any failure brings it back
    function giveUp() { if (!done) { done = true; root.classList.remove("wall-try"); } }
    setTimeout(function () { if (!banner.classList.contains("wall-on")) { giveUp(); } }, 7000);

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var IMG = "https://image.tmdb.org/t/p/w342";

    function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function build(pool) {
        var wide = window.innerWidth >= 961;
        var COLS = wide ? 6 : 4;
        var ROWS = 5;                                    // more than fits, columns drift up and down

        var wall = document.createElement("div");
        wall.className = "hero-wall";
        wall.setAttribute("aria-hidden", "true");

        var cards = [];
        var cols = [];
        for (var c = 0; c < COLS; c++) {
            var col = document.createElement("div");
            col.className = "hw-col";
            col.style.setProperty("--off", (c % 2 ? "-6%" : "-17%"));
            col.style.setProperty("--dur", (26 + c * 5) + "s");
            for (var r = 0; r < ROWS; r++) {
                var card = document.createElement("div");
                card.className = "hw-card";
                col.appendChild(card);
                cards.push({ el: card, img: null, url: "" });
            }
            wall.appendChild(col);
            cols.push(col);
        }

        var loaded = 0;
        var queue = shuffle(pool.slice());
        var inUse = {};

        function nextUrl() {
            for (var k = 0; k < queue.length; k++) {
                var u = IMG + queue[k].p;
                if (!inUse[u]) { var it = queue.splice(k, 1)[0]; queue.push(it); return u; }
            }
            return IMG + queue[0].p;
        }

        function setCard(card, url, instant) {
            var im = new Image();
            im.decoding = "async";
            im.alt = "";
            im.onload = function () {
                loaded++;
                if (loaded >= 6 && !done) { done = true; banner.classList.add("wall-on"); }
                var old = card.img;
                if (card.url) { delete inUse[card.url]; }
                inUse[url] = true;
                card.url = url;
                card.img = im;
                im.className = "hw-img";
                card.el.appendChild(im);
                requestAnimationFrame(function () {
                    im.classList.add("show");
                    if (old) { setTimeout(function () { if (old.parentNode) { old.parentNode.removeChild(old); } }, 1200); }
                });
            };
            im.onerror = function () { /* keep the previous poster */ };
            im.src = url;
        }

        // first fill, a little staggered so the wall "builds" itself
        cards.forEach(function (card, i) {
            setTimeout(function () { setCard(card, nextUrl()); }, reduce ? 0 : i * 90);
        });

        banner.appendChild(wall);

        // "wall-on" is added by the loader above once 6 posters are really there

        if (!reduce) {
            setInterval(function () {
                if (document.hidden) { return; }
                var card = cards[Math.floor(Math.random() * cards.length)];
                setCard(card, nextUrl());
            }, 1400);
        }
    }

    function start() {
        fetch("/api/hero-posters")
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && d.posters && d.posters.length >= 12) { build(d.posters); } else { giveUp(); } })
            .catch(giveUp);
    }

    // never compete with the first paint
    if ("requestIdleCallback" in window) { requestIdleCallback(start, { timeout: 2500 }); }
    else { setTimeout(start, 800); }
})();
