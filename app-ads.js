/* =========================================================
   SinSubz — Android app ads (Google AdMob)
   Only included in the app build (scripts/build-www.js adds it
   to www/index.html). The website and the Windows app never load it.

   1. Consent (Google UMP) before any ad is requested
   2. Banner above the bottom tab bar (hidden while the keyboard is open)
   3. Interstitial after a translation finishes (max once / 5 min)

   BEFORE RELEASE: replace the TEST ad unit ids below with your real
   ones from admob.google.com, and put your real AdMob *app id* in
   android/app/src/main/AndroidManifest.xml.
========================================================= */
(function () {
    "use strict";

    var cap = window.Capacitor || {};
    var isAndroid = !!(window.Capacitor && typeof cap.getPlatform === "function" &&
        cap.getPlatform() === "android");
    if (!isAndroid) { return; }

    // ---- Google's official TEST ad units (safe to click while developing) ----
    var USE_TEST_ADS = false;                       // set to false for the release build
    var BANNER_ID = "ca-app-pub-3940256099942544/6300978111";
    var INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";
    // real units go here, e.g. "ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
    var REAL_BANNER_ID = "ca-app-pub-9347758659846355/7383209066";
    var REAL_INTERSTITIAL_ID = "ca-app-pub-9347758659846355/4677154678";

    // Temporary diagnostics: shows WHY an ad did not appear (error code + message) as a small toast.
    // Set to false once ads are confirmed working.
    var DEBUG_ADS = true;

    function dbg(msg) {
        if (!DEBUG_ADS) { return; }
        try {
            var t = document.createElement("div");
            t.textContent = "Ads: " + msg;
            t.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);" +
                "background:#222;color:#fff;padding:9px 14px;border-radius:12px;font-size:12.5px;" +
                "z-index:99999;max-width:88%;text-align:center;line-height:1.35";
            document.body.appendChild(t);
            setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 6000);
        } catch (e) { /* ignore */ }
    }

    function errText(e) {
        if (!e) { return "unknown"; }
        var c = e.code != null ? "code " + e.code + ": " : "";
        return c + String(e.message || e);
    }

    var INTERSTITIAL_GAP_MS = 5 * 60 * 1000;
    var lastInterstitial = 0;
    var ready = false;
    var interstitialLoaded = false;
    var bannerShown = false;

    var root = document.documentElement;

    function admob() { return (cap.Plugins || {}).AdMob || null; }
    function safe(p) { try { return Promise.resolve(p); } catch (e) { return Promise.resolve(); } }

    function bannerId() { return USE_TEST_ADS ? BANNER_ID : REAL_BANNER_ID; }
    function interstitialId() { return USE_TEST_ADS ? INTERSTITIAL_ID : REAL_INTERSTITIAL_ID; }

    // ---------- 1. init + consent ----------
    function init() {
        var ad = admob();
        if (!ad) { dbg("AdMob plugin not found in this build"); return; }

        try {
            ad.addListener("bannerAdLoaded", function () { dbg("banner loaded"); });
            ad.addListener("bannerAdFailedToLoad", function (e) { dbg("banner failed - " + errText(e)); });
            ad.addListener("onAdFailedToLoad", function (e) { dbg("ad failed - " + errText(e)); });
            ad.addListener("interstitialAdFailedToLoad", function (e) { dbg("interstitial failed - " + errText(e)); });
        } catch (e) { dbg("listener error - " + errText(e)); }

        safe(ad.initialize({ initializeForTesting: USE_TEST_ADS }))
            .then(function () { return ad.requestConsentInfo(); })
            .then(function (info) {
                if (info && info.isConsentFormAvailable && info.status === "REQUIRED") {
                    return ad.showConsentForm();
                }
            })
            .catch(function (e) { dbg("consent error - " + errText(e)); /* consent errors must never break the app */ })
            .then(function () {
                ready = true;
                showBanner();
                loadInterstitial();
            });
    }

    // ---------- 2. banner ----------
    function tabBarOffset() {
        var tabs = document.getElementById("appTabs");
        var h = tabs ? tabs.offsetHeight : 64;
        // tab bar floats 10px above the bottom edge
        return h + 10 + 8;
    }

    function showBanner() {
        var ad = admob();
        if (!ready || !ad || !bannerId() || bannerShown) { return; }
        safe(ad.showBanner({
            adId: bannerId(),
            adSize: "ADAPTIVE_BANNER",
            position: "BOTTOM_CENTER",
            margin: tabBarOffset(),
            isTesting: USE_TEST_ADS
        })).then(function () { bannerShown = true; dbg("banner requested"); }).catch(function (e) { dbg("showBanner error - " + errText(e)); });
    }

    function hideBanner() {
        var ad = admob();
        if (!ad || !bannerShown) { return; }
        safe(ad.hideBanner()).then(function () { bannerShown = false; }).catch(function () { /* ignore */ });
    }

    // hide the banner while the keyboard is open (app-ui.js toggles html.app-kb)
    new MutationObserver(function () {
        if (root.classList.contains("app-kb")) { hideBanner(); } else { showBanner(); }
    }).observe(root, { attributes: true, attributeFilter: ["class"] });

    // ---------- 3. interstitial after a finished translation ----------
    function loadInterstitial() {
        var ad = admob();
        if (!ready || !ad || !interstitialId()) { return; }
        safe(ad.prepareInterstitial({ adId: interstitialId(), isTesting: USE_TEST_ADS }))
            .then(function () { interstitialLoaded = true; })
            .catch(function (e) { interstitialLoaded = false; dbg("interstitial prepare error - " + errText(e)); });
    }

    function maybeShowInterstitial() {
        var ad = admob();
        if (!ready || !ad || !interstitialLoaded) { return; }
        if (document.hidden) { return; }                       // user left the app: don't ambush them later
        if (Date.now() - lastInterstitial < INTERSTITIAL_GAP_MS) { return; }
        interstitialLoaded = false;
        lastInterstitial = Date.now();
        safe(ad.showInterstitial())
            .catch(function () { /* ignore */ })
            .then(function () { setTimeout(loadInterstitial, 1000); });
    }

    // wrap the existing "translation finished" hook from app-shim.js
    function hookDone() {
        var n = window.__appNotify;
        if (!n || typeof n.done !== "function" || n.__adsHooked) { return false; }
        var orig = n.done;
        n.done = function () {
            var r = orig.apply(this, arguments);
            setTimeout(maybeShowInterstitial, 1200);          // let the result screen appear first
            return r;
        };
        n.__adsHooked = true;
        return true;
    }

    if (!hookDone()) {
        document.addEventListener("DOMContentLoaded", hookDone);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
