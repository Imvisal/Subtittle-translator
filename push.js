/* SinSubz web push: asks (politely, after a click) to send a notification when new Sinhala subtitles are ready.
   Needs sw.js + the VAPID keys on the server (/api/stats?push=key). Not used inside the Android / desktop apps. */
(function () {
    "use strict";
    if (window.Capacitor || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { return; }
    var DISMISS = "sinsubz-push-dismiss", SYNCED = "sinsubz-push-synced";
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
    function b64(s) { var p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) { o[i] = r.charCodeAt(i); } return o; }

    function serverKey() { return fetch("/api/stats?push=key").then(function (r) { return r.json(); }).then(function (d) { return d && d.key || ""; }).catch(function () { return ""; }); }
    function subscribe(key) {
        return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
            return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }); });
        }).then(function (sub) {
            return fetch("/api/stats?push=sub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON() }) })
                .then(function (r) { if (!r.ok) { throw new Error("save"); } set(SYNCED, String(Date.now())); return true; });
        });
    }

    function card() {
        var css = document.createElement("style");
        css.textContent =
            ".pn-card{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;width:min(420px,calc(100% - 24px));box-sizing:border-box;padding:18px;border-radius:22px;color:#eceaff;" +
            "background:linear-gradient(160deg,rgba(32,28,78,.96),rgba(14,16,38,.97));border:1px solid rgba(139,123,255,.35);box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04) inset;" +
            "backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:500 14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;animation:pnIn .45s cubic-bezier(.2,.9,.3,1.2) both}" +
            "@keyframes pnIn{from{opacity:0;transform:translate(-50%,24px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}" +
            ".pn-top{display:flex;gap:14px;align-items:flex-start}" +
            ".pn-ic{flex:0 0 46px;height:46px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#8b7bff,#5b3df5);box-shadow:0 8px 22px rgba(91,61,245,.5)}" +
            ".pn-ic svg{width:24px;height:24px;animation:pnRing 2.4s ease-in-out infinite;transform-origin:50% 12%}" +
            "@keyframes pnRing{0%,60%,100%{transform:rotate(0)}66%{transform:rotate(14deg)}72%{transform:rotate(-12deg)}78%{transform:rotate(8deg)}84%{transform:rotate(-5deg)}}" +
            ".pn-card b{display:block;font-size:16px;font-weight:800;letter-spacing:.1px;margin-bottom:3px}" +
            ".pn-card p{margin:0;color:#b9b6df;font-size:13.5px}.pn-si{display:block;margin-top:4px;color:#d9d6ff;font-size:13.5px}" +
            ".pn-msg{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);color:#e6e3ff;font-size:13px}" +
            ".pn-row{display:flex;gap:10px;margin-top:16px}" +
            ".pn-card button{flex:1;height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#eceaff;font:700 15px system-ui,sans-serif;cursor:pointer;transition:transform .15s,background .2s}" +
            ".pn-card button:active{transform:scale(.97)}.pn-card button.pn-on{flex:1.5;border:0;background:linear-gradient(135deg,#9a8cff,#6a4dff);color:#fff;box-shadow:0 10px 26px rgba(106,77,255,.45)}" +
            ".pn-card button:disabled{opacity:.6}.pn-x{position:absolute;top:8px;right:10px;width:30px!important;height:30px!important;flex:none!important;border:0!important;background:transparent!important;color:#8f8cb8!important;font-size:18px!important}";
        document.head.appendChild(css);
        var d = document.createElement("div");
        d.className = "pn-card"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Notifications");
        d.innerHTML = '<button type="button" class="pn-x" aria-label="Close">\u2715</button>' +
            '<div class="pn-top"><div class="pn-ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></div>' +
            '<div><b>Never miss a new subtitle</b><p>Get a notification when new Sinhala subtitles are ready, even when SinSubz is closed. No spam.</p>' +
            '<span class="pn-si" lang="si">අලුත් සිංහල උපසිරැසි ආපු ගමන් දැනුම් දෙන්නම්.</span></div></div>' +
            '<div class="pn-msg" hidden></div>' +
            '<div class="pn-row"><button type="button" class="pn-off">Not now</button><button type="button" class="pn-on">Turn on notifications</button></div>';
        document.body.appendChild(d);
        var msg = d.querySelector(".pn-msg"), on = d.querySelector(".pn-on");
        function say(t) { msg.hidden = !t; msg.textContent = t || ""; }
        function close(later) { if (later) { set(DISMISS, String(Date.now())); } d.remove(); }
        d.querySelector(".pn-off").addEventListener("click", function () { close(true); });
        d.querySelector(".pn-x").addEventListener("click", function () { close(true); });
        on.addEventListener("click", function () {
            on.disabled = true; say("Please tap Allow in the box your browser shows...");
            var asked = Notification.requestPermission();
            Promise.resolve(asked).then(function (p) {
                if (p === "denied") { say("Notifications are blocked for this site. Open the browser menu \u2192 Site settings \u2192 Notifications to allow them."); set(DISMISS, String(Date.now())); on.disabled = false; return; }
                if (p !== "granted") { say("The permission box was closed. Tap the button again and choose Allow."); on.disabled = false; return; }
                say("Turning on...");
                return serverKey().then(function (k) { if (!k) { throw new Error("Notifications are not available right now."); } return subscribe(k); }).then(function () {
                    say("All set! We will notify you when new subtitles are ready.");
                    d.querySelector(".pn-row").remove();
                    setTimeout(function () { close(false); }, 3000);
                });
            }).catch(function (e) { say("Could not turn on: " + String(e && e.message || e).slice(0, 90)); on.disabled = false; });
        });
    }

    serverKey().then(function (key) {
        if (!key) { return; }                                                       // push is not set up on the server
        if (Notification.permission === "denied") { return; }
        if (Notification.permission === "granted") {                                // already allowed: keep the subscription fresh (once a day)
            if (Date.now() - Number(get(SYNCED) || 0) > 86400000) { subscribe(key).catch(function () { /* try again next visit */ }); }
            return;
        }
        if (Date.now() - Number(get(DISMISS) || 0) < 14 * 86400000) { return; }    // said "not now": do not ask for 14 days
        setTimeout(function () { if (document.visibilityState === "visible") { card(); } }, 25000);
    });
})();
