/* SinSubz - Adsterra 300x250 banner. Website only. Shown on the film / TV pages and the Ready list.
 * The ad lives in /ad-box.html inside a sandboxed iframe (no access to the SinSubz sign-in or storage).
 * Never on the home/tool page, login, admin, premium or the AdSense guide pages. */
(function () {
    "use strict";
    if (/^(capacitor|file|app):/.test(location.protocol) || !document.body) { return; }
    var tp = document.querySelector(".tp-wrap");
    var host = tp || document.querySelector("main.legal-container");
    if (!host || document.querySelector(".ad300")) { return; }
    function slot(src, w, h) {
        var d = document.createElement("div");
        d.className = "ad300";
        d.setAttribute("aria-label", "Advertisement");
        d.style.cssText = "width:" + w + "px;max-width:100%;margin:22px auto;text-align:center;";
        var small = document.createElement("div");
        small.textContent = "Advertisement";
        small.style.cssText = "font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px;";
        var f = document.createElement("iframe");
        f.src = src;
        f.width = String(w); f.height = String(h); f.loading = "lazy"; f.title = "Advertisement";
        f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
        f.referrerPolicy = "no-referrer-when-downgrade";
        f.style.cssText = "border:0;width:" + w + "px;height:" + h + "px;max-width:100%;display:block;margin:0 auto;background:transparent;";
        d.appendChild(small); d.appendChild(f);
        return d;
    }
    var d = slot("/ad-box.html", 300, 250);
    /* phones: a slim 320x50 banner under the top block of the page as well */
    if (tp && window.innerWidth < 740) {
        var cast = tp.querySelector(".tp-cast") || tp.querySelector("#tpEps");
        if (cast) { tp.insertBefore(slot("/ad-box-320.html", 320, 50), cast); }
    }
    /* Adsterra native banner: at the end of the page; its frame grows to the height the ad reports */
    var nat = slot("/ad-box-native.html", 560, 300);
    nat.style.width = "100%"; nat.style.maxWidth = "560px";
    var nf = nat.querySelector("iframe"); nf.style.width = "100%"; nf.style.maxWidth = "560px"; nf.removeAttribute("width");
    window.addEventListener("message", function (ev) {
        if (ev.source !== nf.contentWindow || !ev.data || ev.data.sinsubzAd !== "native") { return; }
        var h = Math.max(60, Math.min(900, Number(ev.data.h) || 0));
        if (h) { nf.style.height = h + "px"; nf.height = String(h); }
    });
    if (tp) {
        tp.insertBefore(nat, tp.querySelector(".tp-foot") || null);
    } else { host.appendChild(nat); }
    if (tp) {
        var seo = tp.querySelector(".tp-seo") || tp.querySelector(".tp-foot");
        tp.insertBefore(d, seo || null);
    } else {
        host.appendChild(d);
    }
})();
