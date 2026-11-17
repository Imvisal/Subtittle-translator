/* SinSubz - Adsterra 300x250 banner. Website only. Shown on the film / TV pages and the Ready list.
 * The ad lives in /ad-box.html inside a sandboxed iframe (no access to the SinSubz sign-in or storage).
 * Never on the home/tool page, login, admin, premium or the AdSense guide pages. */
(function () {
    "use strict";
    if (/^(capacitor|file|app):/.test(location.protocol) || !document.body) { return; }
    var tp = document.querySelector(".tp-wrap");
    var host = tp || document.querySelector("main.legal-container");
    if (!host || document.querySelector(".ad300")) { return; }
    var d = document.createElement("div");
    d.className = "ad300";
    d.setAttribute("aria-label", "Advertisement");
    d.style.cssText = "width:300px;max-width:100%;margin:22px auto;text-align:center;";
    var small = document.createElement("div");
    small.textContent = "Advertisement";
    small.style.cssText = "font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px;";
    var f = document.createElement("iframe");
    f.src = "/ad-box.html";
    f.width = "300"; f.height = "250"; f.loading = "lazy"; f.title = "Advertisement";
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    f.referrerPolicy = "no-referrer-when-downgrade";
    f.style.cssText = "border:0;width:300px;height:250px;max-width:100%;display:block;margin:0 auto;background:transparent;";
    d.appendChild(small); d.appendChild(f);
    if (tp) {
        var seo = tp.querySelector(".tp-seo") || tp.querySelector(".tp-foot");
        tp.insertBefore(d, seo || null);
    } else {
        host.appendChild(d);
    }
})();
