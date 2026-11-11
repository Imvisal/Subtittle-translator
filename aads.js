/* SinSubz - A-Ads (crypto ad network, no approval needed). Website only, never in the Android/Windows apps.
 * Off until UNIT_ID is set: create an ad unit at a-ads.com (Dashboard -> Ad units -> New) and paste its number here.
 * Shown on: the English guide pages (<body data-ads="on">) and the title pages /film/... /tv/... (.tp-wrap).
 * Never on the home/tool page, login, admin, premium. Change SIZE to the size you picked when you made the unit. */
(function () {
    "use strict";
    var UNIT_ID = "";               // e.g. "2412345"
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
        var f = document.createElement("iframe");
        f.setAttribute("data-aa", UNIT_ID);
        f.src = "https://acceptable.a-ads.com/" + UNIT_ID;
        f.loading = "lazy";
        f.referrerPolicy = "no-referrer-when-downgrade";
        f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin");
        f.style.cssText = "border:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;";
        box.appendChild(f); d.appendChild(small); d.appendChild(box);
        return d;
    }

    var guide = document.querySelector("article.guide");
    if (document.body.getAttribute("data-ads") === "on" && guide) {
        var h2 = guide.querySelectorAll("h2");
        if (h2.length >= 3) { h2[2].parentNode.insertBefore(slot(), h2[2]); }
        guide.appendChild(slot());
        return;
    }
    var tp = document.querySelector(".tp-wrap");
    if (tp) {
        var foot = tp.querySelector(".tp-foot");
        tp.insertBefore(slot(), foot || null);
    }
})();
