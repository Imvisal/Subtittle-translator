/* SinSubz website: Sponsored popup (Media RPC GIF) shown once in the MIDDLE of a translation.
   - appears when a translation passes ~45% (never at the start or the end), at most once per 15 minutes per visitor
   - no close button: "Ad closes in N s" counts down the length of the GIF (12 s), then "Close" appears
   - the page behind is dimmed + lightly blurred; hidden for Premium members. Website only (WEBONLY in index.html). */
(function () {
    "use strict";
    var KEY = "sinsubz_sponsor_at", GAP = 15 * 60 * 1000, SECS = 14, SHOW_AT = 45, LINK = "https://discord-media-player-rpc-site.vercel.app/";
    function premium() {
        if (document.documentElement.classList.contains("is-premium")) { return true; }
        try { return Number(localStorage.getItem("sinsubz-web-premium")) > Date.now(); } catch (e) { return false; }   // title pages do not set the class
    }
    var armed = true, shown = false, last = 0;

    function seenRecently() { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < GAP; } catch (e) { return false; } }
    function mark() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ } }
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text) { n.textContent = text; } return n; }

    function show(onEnd) {
        shown = true; mark();
        var st = document.createElement("style");
        st.textContent =
            ".spn-back{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,6,12,.55);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}" +
            ".spn-card{width:100%;max-width:560px;border-radius:18px;overflow:hidden;background:#0d1020;border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.6);color:#eef0fa;font-family:inherit}" +
            ".spn-top{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;font-size:12px;color:#aab0c8}" +
            ".spn-top b{font-weight:700;letter-spacing:.06em;text-transform:uppercase}" +
            ".spn-card img{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#0a0d14}" +
            ".spn-bar{height:3px;background:rgba(255,255,255,.1)}.spn-bar i{display:block;height:100%;width:0;background:#8b8bff;transition:width 14s linear}" +
            ".spn-act{display:flex;gap:10px;padding:12px 14px}" +
            ".spn-act a,.spn-act button{flex:1;text-align:center;border:0;border-radius:12px;padding:12px;font:700 15px inherit;cursor:pointer;text-decoration:none}" +
            ".spn-get{background:linear-gradient(135deg,#7c7cff,#b58cff);color:#0b0c16}" +
            ".spn-close{background:rgba(255,255,255,.1);color:#e6e8f6}.spn-close[hidden]{display:none}";
        document.head.appendChild(st);
        var back = el("div", "spn-back"), card = el("div", "spn-card");
        card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true"); card.setAttribute("aria-label", "Sponsored");
        var top = el("div", "spn-top"), tag = el("b", "", "Sponsored"), cnt = el("span", "", "Ad closes in " + SECS + "s");
        top.appendChild(tag); top.appendChild(cnt);
        var img = el("img"); img.alt = "Discord Media Player RPC: show what you are watching on Discord"; img.width = 720; img.height = 405; img.decoding = "async";
        var bar = el("div", "spn-bar"), fill = el("i"); bar.appendChild(fill);
        var act = el("div", "spn-act"), get = el("a", "spn-get", "Get Media RPC");
        get.href = LINK; get.target = "_blank"; get.rel = "noopener sponsored";
        var close = el("button", "spn-close", "Close"); close.type = "button"; close.hidden = true;
        act.appendChild(get); act.appendChild(close);
        card.appendChild(top); card.appendChild(img); card.appendChild(bar); card.appendChild(act); back.appendChild(card);

        function finish() { if (back.parentNode) { back.parentNode.removeChild(back); } if (onEnd) { var f = onEnd; onEnd = null; f(); } }
        function start() {
            if (start.done) { return; } start.done = true;
            var left = SECS;
            requestAnimationFrame(function () { fill.style.width = "100%"; });
            var t = setInterval(function () {
                left--;
                if (left > 0) { cnt.textContent = "Ad closes in " + left + "s"; return; }
                clearInterval(t); cnt.textContent = "Ad finished"; close.hidden = false; close.focus();   // never closes by itself: the visitor presses Close (the zip is then saved)
            }, 1000);
        }
        img.addEventListener("load", function () { (img.decode ? img.decode() : Promise.resolve()).then(start, start); });
        img.addEventListener("error", finish);   // no picture: no popup
        close.addEventListener("click", finish);
        img.src = "mediarpc-ad.gif?v=2&t=" + Date.now();   // fresh load = the GIF starts from its first frame every time
        document.body.appendChild(back);
    }

    /* whole-season download (title.js): show the ad while the files are prepared; resolves when the ad has finished (or at once for Premium) and then closes itself */
    window.__sinsubzSponsor = function () {
        return new Promise(function (resolve) {
            if (premium()) { resolve(); return; }
            show(resolve);
        });
    };

    window.addEventListener("sinsubz:progress", function (ev) {
        var p = Number(ev && ev.detail && ev.detail.percent) || 0;
        if (p < last - 20) { armed = true; shown = false; }        // a new translation started (progress went back down)
        last = p;
        if (!armed || shown || p < SHOW_AT || p > 85) { return; }
        if (premium() || seenRecently()) { armed = false; return; }
        armed = false; show();
    });
})();
