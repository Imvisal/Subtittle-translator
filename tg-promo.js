"use strict";

/* SinSubz — "Join our Telegram group" popup (website only).
   Opens in the middle of the screen a few seconds after the page opens (or soon after a translation starts).
   Close it (x, "Maybe later", the dark area or Esc) and it stays away for 3 days, then asks once more.
   Press "Join" and this browser never sees it again. Never shown inside the Android / Windows apps.
   Change the link below if the group address changes. */
(function () {

    var LINK = "https://t.me/sinsubz";
    var KEY = "sinsubz-tg-promo";
    var SHOW_AFTER_MS = 15000;     // on any page time
    var TRANSLATING_AFTER_MS = 2500;
    var HIDE_X_DAYS = 3;
    var HIDE_JOIN_DAYS = 3650;      // joined: never again

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

        box = document.createElement("div");
        box.className = "tgp";
        box.innerHTML =
            '<div class="tgp-card" role="dialog" aria-modal="true" aria-labelledby="tgpT">' +
                '<button type="button" class="tgp-x" aria-label="Close">&times;</button>' +
                '<div class="tgp-hero"><img class="tgp-img" src="announce-telegram.jpg" alt="" width="1200" height="630"></div>' +
                '<div class="tgp-body">' +
                    '<strong id="tgpT">Join our Telegram group</strong>' +
                    '<span>New Sinhala subtitles, updates and quick help from the community.</span>' +
                    '<a class="tgp-btn" href="' + LINK + '" target="_blank" rel="noopener"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Join now</a>' +
                    '<button type="button" class="tgp-later">Maybe later</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(box);

        var card = box.querySelector(".tgp-card");
        box.querySelector(".tgp-x").addEventListener("click", function () { close(HIDE_X_DAYS); });
        box.querySelector(".tgp-later").addEventListener("click", function () { close(HIDE_X_DAYS); });
        box.querySelector(".tgp-btn").addEventListener("click", function () { close(HIDE_JOIN_DAYS); });
        box.addEventListener("click", function (e) { if (e.target === box) { close(HIDE_X_DAYS); } });
        document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && box) { document.removeEventListener("keydown", esc); close(HIDE_X_DAYS); } });
        requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add("show"); }); });
    }

    var css = document.createElement("style");
    css.textContent =
        ".tgp{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,7,18,.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .28s ease}" +
        ".tgp.show{opacity:1;pointer-events:auto}" +
        ".tgp-card{position:relative;width:100%;max-width:380px;border-radius:24px;overflow:hidden;color:var(--text,#f2f2ff);background:linear-gradient(170deg,#181c34,#0e1122);border:1px solid rgba(120,160,255,.35);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 6px rgba(42,165,232,.1);transform:translateY(18px) scale(.96);transition:transform .32s cubic-bezier(.2,.9,.3,1.2)}" +
        ".tgp.show .tgp-card{transform:none}" +
        ".tgp-hero{position:relative}" +
        ".tgp-hero::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,#0e1122 0%,rgba(14,17,34,0) 55%)}" +
        ".tgp-img{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover}" +
        ".tgp-body{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:4px 24px 22px}" +
        ".tgp-body strong{font-size:22px;font-weight:800;line-height:1.2}" +
        ".tgp-body span{font-size:14.5px;opacity:.78;line-height:1.5;max-width:300px}" +
        ".tgp-btn{margin-top:14px;display:flex;width:100%;align-items:center;justify-content:center;gap:9px;padding:14px;border-radius:14px;font-weight:800;font-size:16px;color:#fff;text-decoration:none;background:linear-gradient(135deg,#2aa5e8,#5b6cff);box-shadow:0 12px 26px -10px rgba(42,165,232,.9)}" +
        ".tgp-btn:hover{filter:brightness(1.08)}" +
        ".tgp-later{all:unset;cursor:pointer;margin-top:8px;padding:8px 14px;font-size:14px;font-weight:600;color:var(--text-2,#aab);opacity:.8;border-radius:10px}" +
        ".tgp-later:hover{opacity:1;background:rgba(255,255,255,.06)}" +
        ".tgp-x{position:absolute;top:10px;right:10px;z-index:2;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:22px;line-height:1;cursor:pointer}" +
        ".tgp-x:hover{background:rgba(0,0,0,.75)}" +
        ".tgp-btn:focus-visible,.tgp-x:focus-visible,.tgp-later:focus-visible{outline:2px solid #fff;outline-offset:2px}" +
        "@media (prefers-reduced-motion:reduce){.tgp,.tgp-card{transition:none}}";
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
