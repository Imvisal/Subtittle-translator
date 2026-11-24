/* SinSubz - Adsterra Popunder (opens one new tab behind the page after a click; Adsterra decides how often).
 * Website only. NOT loaded on: the apps, Premium members, the AdSense guide pages, admin, login, premium, privacy/terms. */
(function () {
    "use strict";
    if (/^(capacitor|file|app):/.test(location.protocol) || !document.body) { return; }
    try { if (localStorage.getItem("sinsubz-web-premium") > String(Date.now())) { return; } } catch (e) { /* no storage: show it */ }
    if (document.documentElement.classList.contains("is-premium")) { return; }
    var p = location.pathname.toLowerCase();
    if (/^\/(admin|login|premium|privacy|terms|cookie|dmca)/.test(p) || document.querySelector('[data-ads="on"]')) { return; }
    var s = document.createElement("script");
    s.setAttribute("data-cfasync", "false");
    s.async = true;
    s.src = "https://aarems.org/1/9b4268ef51976d567ff537196aed6256";
    document.body.appendChild(s);
})();
