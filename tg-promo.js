"use strict";

/* SinSubz — small "Join our Telegram group" card (website only).
   Slides up in the bottom-left corner a few seconds after the page opens, and right away (after a short
   moment) once a translation starts. Never shown inside the Android / Windows apps. "x" hides it for
   7 days, "Join" for 60 days. Change the link below if the group address changes. */
(function () {

    var LINK = "https://t.me/sinsubz";
    var KEY = "sinsubz-tg-promo";
    var SHOW_AFTER_MS = 15000;     // on any page time
    var TRANSLATING_AFTER_MS = 2500;
    var HIDE_X_DAYS = 7;
    var HIDE_JOIN_DAYS = 60;

    var root = document.documentElement;
    var ua = navigator.userAgent || "";
    if (root.classList.contains("app-mode") || window.Capacitor || window.desktopApi || /Electron/i.test(ua)) { return; }

    try {
        if (Number(localStorage.getItem(KEY) || 0) > Date.now()) { return; }
    } catch (e) { /* storage blocked: just show it */ }

    var box = null, shown = false, timer = null, poll = null;

    function remember(days) {
        try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch (e) { /* ignore */ }
    }

    function close(days) {
        remember(days);
        clearTimeout(timer); clearInterval(poll);
        if (!box) { return; }
        box.classList.remove("show");
        setTimeout(function () { if (box) { box.remove(); box = null; } }, 400);
    }

    function show() {
        if (shown) { return; }
        // wait while another popup (app download, Premium, sign-in ...) is on screen
        if (document.querySelector(".dl-pop-backdrop, #premiumAsk, #signInAsk, .modal-backdrop.open")) { setTimeout(show, 4000); return; }
        shown = true;
        clearTimeout(timer); clearInterval(poll);

        box = document.createElement("aside");
        box.className = "tgp";
        box.setAttribute("role", "complementary");
        box.setAttribute("aria-label", "Join our Telegram group");
        box.innerHTML =
            '<button type="button" class="tgp-x" aria-label="Close">&times;</button>' +
            '<img class="tgp-img" src="announce-telegram.jpg" alt="" width="1200" height="630" loading="lazy">' +
            '<div class="tgp-body">' +
                '<strong>Join our Telegram group</strong>' +
                '<span>Updates, new subtitles and help. Come say hi!</span>' +
                '<a class="tgp-btn" href="' + LINK + '" target="_blank" rel="noopener"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Join now</a>' +
            '</div>';
        document.body.appendChild(box);

        box.querySelector(".tgp-x").addEventListener("click", function () { close(HIDE_X_DAYS); });
        box.querySelector(".tgp-btn").addEventListener("click", function () { close(HIDE_JOIN_DAYS); });
        requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add("show"); }); });
    }

    var css = document.createElement("style");
    css.textContent =
        ".tgp{position:fixed;left:16px;bottom:16px;z-index:9000;width:272px;max-width:calc(100vw - 32px);border-radius:16px;overflow:hidden;" +
        "background:var(--card,#16162a);color:var(--text,#f2f2ff);border:1px solid rgba(120,160,255,.35);box-shadow:0 14px 40px rgba(0,0,0,.5);" +
        "transform:translateY(24px);opacity:0;pointer-events:none;transition:transform .35s ease,opacity .35s ease}" +
        ".tgp.show{transform:none;opacity:1;pointer-events:auto}" +
        ".tgp-img{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover}" +
        ".tgp-body{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px}" +
        ".tgp-body strong{font-size:15px}.tgp-body span{font-size:13px;opacity:.75;line-height:1.35}" +
        ".tgp-btn{margin-top:8px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 14px;border-radius:10px;font-weight:700;font-size:14px;" +
        "color:#fff;text-decoration:none;background:linear-gradient(135deg,#2aa5e8,#5b6cff)}" +
        ".tgp-btn:hover{filter:brightness(1.08)}" +
        ".tgp-x{position:absolute;top:6px;right:6px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:18px;line-height:1;cursor:pointer}" +
        "@media (max-width:520px){.tgp{left:12px;bottom:12px;width:236px}.tgp-body span{display:none}}" +
        "@media (prefers-reduced-motion:reduce){.tgp{transition:none}}";
    document.head.appendChild(css);

    // a translation started (progress card is on the page) -> show soon
    poll = setInterval(function () {
        if (document.getElementById("autoTranslateProgress") || document.querySelector(".upload-progress-container[style*='block']")) {
            clearInterval(poll);
            timer = setTimeout(show, TRANSLATING_AFTER_MS);
        }
    }, 1500);

    timer = setTimeout(show, SHOW_AFTER_MS);
})();
