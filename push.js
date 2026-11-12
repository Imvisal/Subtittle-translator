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
        css.textContent = ".pn-card{position:fixed;left:16px;bottom:16px;z-index:9999;max-width:340px;padding:16px 18px;border-radius:16px;background:#14162c;color:#eceaff;border:1px solid #2a2d52;box-shadow:0 18px 50px rgba(0,0,0,.5);font:500 14px/1.45 system-ui,sans-serif}" +
            ".pn-card b{display:block;font-size:15px;margin-bottom:4px}.pn-card p{margin:0 0 12px;color:#b9b6df}.pn-row{display:flex;gap:10px}" +
            ".pn-card button{flex:1;height:40px;border-radius:12px;border:1px solid #2a2d52;background:transparent;color:#eceaff;font:700 14px system-ui,sans-serif;cursor:pointer}" +
            ".pn-card button.pn-on{border:0;background:#8b7bff;color:#0a0b1a}@media(max-width:520px){.pn-card{left:12px;right:12px;max-width:none}}";
        document.head.appendChild(css);
        var d = document.createElement("div");
        d.className = "pn-card"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Notifications");
        d.innerHTML = "<b>Get a notification</b><p>We will tell you when new Sinhala subtitles are ready, even when SinSubz is closed. No spam.</p>" +
            '<div class="pn-row"><button type="button" class="pn-off">Not now</button><button type="button" class="pn-on">Turn on</button></div>';
        document.body.appendChild(d);
        d.querySelector(".pn-off").addEventListener("click", function () { set(DISMISS, String(Date.now())); d.remove(); });
        d.querySelector(".pn-on").addEventListener("click", function () {
            var on = d.querySelector(".pn-on"); on.disabled = true;
            Notification.requestPermission().then(function (p) {
                if (p !== "granted") { set(DISMISS, String(Date.now())); d.remove(); return; }
                return serverKey().then(subscribe).then(function () { d.querySelector("p").textContent = "Done. You will be notified."; d.querySelector(".pn-row").remove(); setTimeout(function () { d.remove(); }, 2500); });
            }).catch(function () { d.remove(); });
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
