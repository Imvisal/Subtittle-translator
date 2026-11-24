/* SinSubz – Google AdSense loader.
 * Loads Google's script ONLY when all are true:
 *   1. PUB_ID is set (run: node scripts/set-adsense.js ca-pub-XXXXXXXXXXXXXXXX)
 *   2. the page is English (<html lang="en">)
 *   3. <body data-ads="on"> (guide/article pages only – never the tool or app screens)
 * Never included in the Android/Windows app builds. */
(function () {
    var PUB_ID = "ca-pub-5082678285312215"; // e.g. "ca-pub-1234567890123456"
    if (!PUB_ID) return;
    if (document.documentElement.lang !== "en") return;
    if (!document.body || document.body.getAttribute("data-ads") !== "on") return;
    if (/^(capacitor|file|app):/.test(location.protocol)) return;
    var s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(PUB_ID);
    document.head.appendChild(s);
})();
