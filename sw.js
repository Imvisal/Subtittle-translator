/* SinSubz service worker: only shows push notifications (no caching, so nothing can go stale). */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
    var d = {};
    try { d = e.data ? e.data.json() : {}; } catch (x) { d = { t: "SinSubz", b: e.data ? e.data.text() : "" }; }
    e.waitUntil(self.registration.showNotification(d.t || "SinSubz", {
        body: d.b || "", icon: "/favicon-192.png", badge: "/favicon-96.png", data: { u: d.u || "/" }, tag: "sinsubz"
    }));
});
self.addEventListener("notificationclick", function (e) {
    e.notification.close();
    var u = (e.notification.data && e.notification.data.u) || "/";
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(self.location.origin) === 0 && "focus" in list[i]) { list[i].navigate(u); return list[i].focus(); } }
        return self.clients.openWindow(u);
    }));
});
