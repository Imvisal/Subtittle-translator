/* SinSubz - A-Ads (crypto ad network, no approval needed). Website only, never in the Android/Windows apps.
 * Off until UNIT_ID is set: create an ad unit at a-ads.com (Dashboard -> Ad units -> New) and paste its number here.
 * Shown on: the English guide pages (<body data-ads="on">) and the title pages /film/... /tv/... (.tp-wrap).
 * Never on the home/tool page, login, admin, premium. Change SIZE to the size you picked when you made the unit. */
(function () {
    "use strict";
    var UNIT_ID = "2461670";
    var WIDTH = 728, HEIGHT = 90;   // the unit size you created (728x90, 468x60, 300x250...)
    if (!/^\d{4,12}$/.test(UNIT_ID)) { return; }
    if (/^(capacitor|file|app):/.test(location.protocol)) { return; }
    if (!document.body) { return; }

    function slot() {
        var d = document.createElement("div");
        d.className = "aads-slot";
        d.setAttribute("aria-label", "Advertisement");
        d.style.cssText = "width:100%;max-width:" + WIDTH + "px;margin:22px auto;text-align:center;";
        var small = document.createElement("div");
        small.textContent = "Advertisement";
        small.style.cssText = "font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px;";
        var box = document.createElement("div");
        box.style.cssText = "position:relative;width:100%;height:" + HEIGHT + "px;overflow:hidden;";
        box.className = "aads-box";
        var f = document.createElement("iframe");
        f.setAttribute("data-aa", UNIT_ID);
        f.src = "https://ad.a-ads.com/" + UNIT_ID + "/?size=" + WIDTH + "x" + HEIGHT;
        f.loading = "lazy";
        f.referrerPolicy = "no-referrer-when-downgrade";
        f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin");
        f.style.cssText = "border:0;padding:0;width:" + WIDTH + "px;height:" + HEIGHT + "px;overflow:hidden;background:transparent;display:block;";
        box.appendChild(f); d.appendChild(small); d.appendChild(box);
        return d;
    }

    /* The unit is a fixed 728x90: on a phone scale it down to the screen width instead of cutting it off. */
    function fit() {
        var boxes = document.querySelectorAll(".aads-slot .aads-box");
        for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i], f = b.querySelector("iframe");
            var w = b.parentNode.clientWidth || WIDTH;
            var k = Math.min(1, w / WIDTH);
            f.style.width = WIDTH + "px"; f.style.height = HEIGHT + "px";
            f.style.transformOrigin = "0 0";
            f.style.transform = k < 1 ? "scale(" + k + ")" : "none";
            b.style.height = Math.round(HEIGHT * k) + "px";
            b.style.width = Math.round(WIDTH * k) + "px";
            b.style.margin = "0 auto";
        }
    }
    window.addEventListener("resize", fit);

    /* ---- side banners (wide desktop screens only), home page: the two tall units (160x600) are written in
       index.html (so the a-ads bot finds the code); this only shows them when there is room beside the content. */
    var SIDE_W = 160, SIDE_H = 600;
    function sideRails() {
        var rails = document.querySelectorAll(".aads-side");
        if (!rails.length) { return; }
        var main = document.querySelector("main") || document.querySelector(".pm-wrap");
        function place() {
            var r = main ? main.getBoundingClientRect() : null;
            var free = r ? Math.min(r.left, window.innerWidth - r.right) : 0;
            var ok = free >= SIDE_W + 14 && window.innerHeight >= SIDE_H + 150;
            for (var i = 0; i < rails.length; i++) { rails[i].style.display = ok ? "block" : "none"; }
        }
        place(); window.addEventListener("resize", place);
    }

    sideRails();

    var guide = document.querySelector("article.guide");
    if (document.body.getAttribute("data-ads") === "on" && guide) {
        var h2 = guide.querySelectorAll("h2");
        if (h2.length >= 3) { h2[2].parentNode.insertBefore(slot(), h2[2]); }
        if (!guide.querySelector(".aads-slot")) { guide.appendChild(slot()); }
        fit();
        return;
    }
    if (document.querySelector(".aads-slot") && !guide && !document.querySelector(".tp-wrap")) { fit(); return; }
    var tp = document.querySelector(".tp-wrap");
    if (tp) {
        var foot = tp.querySelector(".tp-foot");
        tp.insertBefore(slot(), foot || null);
        fit();
    }
})();
