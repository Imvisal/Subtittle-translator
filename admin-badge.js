/* SinSubz - owner-only "Admin" link in the header (website only).
   Shows a red number = new activity since the owner last looked (translations, sync, merge, comments,
   messages, Premium requests, auto runner). Click: a small list of what happened + a link to the admin panel.
   Everybody else never sees it: the server answers { owner:false } unless the signed-in Google account is the owner. */
(function () {
    "use strict";

    var link = document.getElementById("navAdmin");
    if (!link) { return; }
    var badge = link.querySelector(".nav-badge");
    var panel = null;
    var data = { unread: 0, items: [] };
    var timer = 0;

    var LABEL = { translate: "Translated", sync: "Synced", merge: "Merged", comment: "Comment", message: "Message", premium: "Premium", auto: "Auto" };

    function token() {
        if (!window.__sinsubzIdToken) { return Promise.reject(new Error("no auth")); }
        return window.__sinsubzIdToken();
    }
    function call(method, body) {
        return token().then(function (tk) {
            var o = { method: method, headers: { Authorization: "Bearer " + tk }, cache: "no-store" };
            if (body) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
            return fetch("/api/stats?alerts=1", o);
        }).then(function (r) { return r.json(); });
    }

    function ago(t) {
        var s = Math.max(1, Math.round((Date.now() - t) / 1000));
        if (s < 60) { return s + "s"; }
        if (s < 3600) { return Math.round(s / 60) + "m"; }
        if (s < 86400) { return Math.round(s / 3600) + "h"; }
        return Math.round(s / 86400) + "d";
    }

    function paintBadge() {
        var n = data.unread || 0;
        badge.hidden = n < 1;
        badge.textContent = n > 99 ? "99+" : String(n);
        link.setAttribute("aria-label", n ? "Admin, " + n + " new" : "Admin");
    }

    function paintPanel() {
        if (!panel) { return; }
        panel.textContent = "";
        var head = document.createElement("div");
        head.className = "na-head";
        head.textContent = data.items.length ? "Recent activity" : "No activity yet";
        panel.appendChild(head);
        data.items.slice(0, 12).forEach(function (it) {
            var row = document.createElement("div");
            row.className = "na-row" + (it.t > (data.seen || 0) ? " new" : "");
            var k = document.createElement("span");
            k.className = "na-k na-" + it.k;
            k.textContent = LABEL[it.k] || it.k;
            var m = document.createElement("span");
            m.className = "na-m";
            m.textContent = it.m;
            var t = document.createElement("span");
            t.className = "na-t";
            t.textContent = ago(it.t);
            row.appendChild(k); row.appendChild(m); row.appendChild(t);
            panel.appendChild(row);
        });
        var go = document.createElement("a");
        go.className = "na-go";
        go.href = "admin.html";
        go.textContent = "Open admin panel";
        panel.appendChild(go);
    }

    function refresh() {
        call("GET").then(function (d) {
            if (!d || !d.owner) { link.hidden = true; return; }
            try { localStorage.setItem("sinsubz-owner", "1"); } catch (e) { /* ignore */ }
            data = { unread: d.unread || 0, items: d.items || [], seen: d.seen || 0 };
            link.hidden = false;
            paintBadge();
            paintPanel();
        }).catch(function () { /* not signed in yet */ });
    }

    function closePanel() { if (panel) { panel.hidden = true; link.setAttribute("aria-expanded", "false"); } }

    link.addEventListener("click", function (e) {
        e.preventDefault();
        if (!panel) {
            panel = document.createElement("div");
            panel.className = "nav-admin-panel";
            panel.hidden = true;
            link.parentNode.insertBefore(panel, link.nextSibling);
            paintPanel();
        }
        var open = panel.hidden;
        panel.hidden = !open;
        link.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && data.unread) {
            call("POST", { action: "seen" }).then(function () { data.unread = 0; paintBadge(); }).catch(function () { /* ignore */ });
        }
    });
    document.addEventListener("click", function (e) { if (panel && !panel.hidden && !panel.contains(e.target) && !link.contains(e.target)) { closePanel(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePanel(); } });

    // The account script signs in a moment after load; try a few times, then every minute while the tab is visible.
    var tries = 0;
    (function boot() {
        if (window.__sinsubzIdToken) { refresh(); }
        if (++tries < 6 && !timer) { setTimeout(boot, 1500 * tries); }
    })();
    timer = setInterval(function () { if (!document.hidden && window.__sinsubzIdToken) { refresh(); } }, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && window.__sinsubzIdToken) { refresh(); } });
})();
