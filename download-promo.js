"use strict";

/* SinSubz — "app available" popup (website only).
   Phone (Android)  -> "Mobile app available" -> Download -> download.html#android
   Windows PC       -> "PC version available" -> Download -> download.html#windows
   Never shown inside the Android / Windows apps themselves, on other
   devices (iPhone, Mac, Linux have no app), or on the download page.
   Once dismissed it stays away for 3 days. */
(function () {

    var DELAY = 2500;
    var HIDE_DAYS = 3;
    var KEY = "sinsubz-dl-popup";

    var root = document.documentElement;
    var ua = navigator.userAgent || "";

    // inside one of our apps? then do nothing
    if (root.classList.contains("app-mode") || window.Capacitor || window.desktopApi || /Electron/i.test(ua)) { return; }

    var platform = null;
    if (/Android/i.test(ua)) {
        platform = "android";
    } else if (/Windows NT/i.test(ua) && !/Windows Phone/i.test(ua)) {
        platform = "windows";
    }
    if (!platform) { return; }

    try {
        var until = Number(localStorage.getItem(KEY) || 0);
        if (until > Date.now()) { return; }
    } catch (e) { /* storage blocked: just show it */ }

    var text = platform === "android" ? {
        icon: "fa-brands fa-android",
        bg: "linear-gradient(135deg, #36e0c8, #2fa86a)",
        title: "Mobile app available",
        body: "SinSubz for Android is ready. Easy to use, with release alerts and background translation.",
        btn: "Download the app",
        href: "download.html#android"
    } : {
        icon: "fa-brands fa-windows",
        bg: "linear-gradient(135deg, #4aa8ff, #5b6cff)",
        title: "PC version available",
        body: "SinSubz for Windows is ready. Translate, sync and merge subtitles right from your desktop.",
        btn: "Download for Windows",
        href: "download.html#windows"
    };

    function dismiss(box) {
        try { localStorage.setItem(KEY, String(Date.now() + HIDE_DAYS * 864e5)); } catch (e) { /* ignore */ }
        box.classList.remove("show");
        setTimeout(function () { box.remove(); document.removeEventListener("keydown", onKey); }, 350);
    }

    var box;
    function onKey(e) { if (e.key === "Escape" && box) { dismiss(box); } }

    function open() {
        if (document.querySelector(".dl-pop-backdrop")) { return; }

        box = document.createElement("div");
        box.className = "dl-pop-backdrop";
        box.innerHTML =
            '<div class="dl-pop" role="dialog" aria-modal="true" aria-labelledby="dlPopTitle">' +
                '<button class="dl-pop-x" type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
                '<div class="dl-pop-icon" style="background:' + text.bg + '"><i class="' + text.icon + '"></i></div>' +
                '<h2 id="dlPopTitle">' + text.title + '</h2>' +
                '<p>' + text.body + '</p>' +
                '<a class="btn btn-primary dl-pop-go" href="' + text.href + '"><i class="fa-solid fa-download"></i> ' + text.btn + '</a>' +
                '<button class="dl-pop-later" type="button">Maybe later</button>' +
            '</div>';
        document.body.appendChild(box);

        box.querySelector(".dl-pop-x").addEventListener("click", function () { dismiss(box); });
        box.querySelector(".dl-pop-later").addEventListener("click", function () { dismiss(box); });
        box.querySelector(".dl-pop-go").addEventListener("click", function () {
            try { localStorage.setItem(KEY, String(Date.now() + HIDE_DAYS * 864e5)); } catch (e) { /* ignore */ }
        });
        box.addEventListener("click", function (e) { if (e.target === box) { dismiss(box); } });
        document.addEventListener("keydown", onKey);

        requestAnimationFrame(function () { box.classList.add("show"); });
    }

    // the stylesheet is loaded by index.html; wait until the page is ready
    function start() { setTimeout(open, DELAY); }
    if (document.readyState === "complete") { start(); } else { window.addEventListener("load", start); }

})();
