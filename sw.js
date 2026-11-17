/* SinSubz service worker (no caching, so nothing can go stale).
 * 1. Shows SinSubz's own push notifications (payload {t, b, u} sent by /api/stats?push=...).
 * 2. Also loads the Monetag push service worker (zone 12279617), so both can live in the one /sw.js file.
 *    Monetag's own pushes are left to its script: we only show a notification when the payload has our "t" field. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
    var d = null;
    try { d = e.data ? e.data.json() : null; } catch (x) { d = null; }
    if (!d || typeof d !== "object" || !d.t) { return; }
    e.waitUntil(self.registration.showNotification(String(d.t), {
        body: d.b || "", icon: "/favicon-192.png", badge: "/favicon-96.png", data: { u: d.u || "/" }, tag: "sinsubz"
    }));
});
self.addEventListener("notificationclick", function (e) {
    var u = e.notification.data && e.notification.data.u;
    if (!u) { return; }      // not ours (Monetag handles its own clicks)
    e.notification.close();
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(self.location.origin) === 0 && "focus" in list[i]) { list[i].navigate(u); return list[i].focus(); } }
        return self.clients.openWindow(u);
    }));
});

self.options = {
    "domain": "3nbf4.com",
    "zoneId": 12279617
};
self.lary = "";
try { importScripts("https://3nbf4.com/act/files/service-worker.min.js?r=sw"); } catch (e) { /* Monetag unreachable: SinSubz notifications still work */ }
