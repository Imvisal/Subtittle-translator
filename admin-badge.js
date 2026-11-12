/* SinSubz admin badge.
   Shows an "Admin" link in the header (next to "How it works") ONLY when the admin key is saved
   in this browser tab (it is saved when you log in on admin.html). A red number on it adds up
   everything new since you last looked: translated, synced, merged, messages, comments, auto (ready files).
   It uses the same endpoints admin.js already uses. No secret is stored in this file. */
(function () {
    "use strict";

    var KEYNAME = "sinsubz-admin-key";   // same name admin.js uses
    var SEENNAME = "sinsubz-admin-seen"; // what you had already seen
    var POLL_MS = 60000;                 // check every 60 s

    var nav = document.getElementById("adminNav");
    if (!nav) { return; }

    var KEY = "";
    try { KEY = sessionStorage.getItem(KEYNAME) || ""; } catch (e) { /* ignore */ }
    if (!KEY) { return; }                // visitors never see the button

    var LABELS = [
        ["translate", "Translate"],
        ["sync", "Sync"],
        ["merge", "Merge"],
        ["message", "Messages"],
        ["comment", "Comments"],
        ["auto", "Auto (ready files)"]
    ];

    var cur = null;       // latest totals
    var panel = null;
    var badge = null;
    var timer = null;

    function css() {
        var s = document.createElement("style");
        s.textContent =
            "#adminNav{position:relative}" +
            "#adminNav[hidden]{display:none!important}" +
            ".adm-badge{position:absolute;top:-9px;right:-14px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;" +
            "background:#ef4444;color:#fff;font:700 11px/18px 'Plus Jakarta Sans',system-ui,sans-serif;text-align:center;" +
            "box-shadow:0 0 0 2px var(--bg,#07080d);pointer-events:none}" +
            ".adm-badge[hidden]{display:none}" +
            ".adm-panel{position:fixed;z-index:99998;width:260px;max-width:calc(100vw - 20px);padding:14px;border-radius:14px;" +
            "background:#11131d;color:#f2f3fa;border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 48px rgba(0,0,0,.5);" +
            "font:14px/1.4 'Plus Jakarta Sans',system-ui,sans-serif}" +
            ".adm-panel h4{margin:0 0 8px;font-size:.95rem}" +
            ".adm-row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid rgba(255,255,255,.08)}" +
            ".adm-row b{color:#ff6b6b}" +
            ".adm-row.zero b{color:#9a9db3;font-weight:500}" +
            ".adm-go{display:block;margin-top:10px;padding:10px;border-radius:10px;text-align:center;font-weight:700;" +
            "text-decoration:none;background:linear-gradient(180deg,#9a98ff,#8381f7);color:#0b0b1a}";
        document.head.appendChild(s);
    }

    function mk(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = text; }
        return n;
    }

    function readSeen() {
        try { return JSON.parse(localStorage.getItem(SEENNAME) || "null"); } catch (e) { return null; }
    }
    function writeSeen(o) {
        try { localStorage.setItem(SEENNAME, JSON.stringify(o)); } catch (e) { /* ignore */ }
    }

    // how many new since last seen, per activity
    function diff() {
        var seen = readSeen();
        if (!seen) { writeSeen(cur); seen = cur; }          // first run: start from zero
        var out = {}, changed = false;
        LABELS.forEach(function (l) {
            var k = l[0], c = cur[k] || 0, b = seen[k] || 0;
            if (c < b) { seen[k] = c; b = c; changed = true; } // something was deleted: follow it down
            out[k] = c - b;
        });
        if (changed) { writeSeen(seen); }
        return out;
    }

    function total(d) {
        return LABELS.reduce(function (a, l) { return a + d[l[0]]; }, 0);
    }

    function paint() {
        if (!cur) { return; }
        var d = diff(), n = total(d);
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = n === 0;
        nav.title = n ? n + " new activities" : "Admin";
        if (panel) { fillPanel(d); }
    }

    function fillPanel(d) {
        panel.textContent = "";
        panel.appendChild(mk("h4", "", total(d) ? "New since you last looked" : "Nothing new"));
        LABELS.forEach(function (l) {
            var row = mk("div", "adm-row" + (d[l[0]] ? "" : " zero"));
            row.appendChild(mk("span", "", l[1]));
            row.appendChild(mk("b", "", d[l[0]] ? "+" + d[l[0]] : "0"));
            panel.appendChild(row);
        });
        var go = mk("a", "adm-go", "Open admin panel");
        go.href = "admin.html";
        go.addEventListener("click", function () { writeSeen(cur); });   // opening admin = seen
        panel.appendChild(go);
    }

    function place() {
        var r = nav.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 10) + "px";
        panel.style.left = Math.max(10, Math.min(window.innerWidth - 270, Math.round(r.left))) + "px";
    }
    function closePanel() {
        if (panel) { panel.remove(); panel = null; }
    }
    function togglePanel(e) {
        e.preventDefault();
        if (panel) { closePanel(); return; }
        panel = mk("div", "adm-panel");
        document.body.appendChild(panel);
        fillPanel(diff());
        place();
    }

    function load() {
        var ready = null;
        fetch("/api/stats?ready=list", { cache: "no-store" })
            .then(function (r) { return r.json(); })
            .then(function (d) { ready = (d.items || []).reduce(function (a, i) { return a + (i.eps ? i.eps.length : 0); }, 0); })
            .catch(function () { /* keep the old number */ })
            .then(function () {
                return fetch("/api/stats?admin=1", { headers: { "x-admin-key": KEY }, cache: "no-store" });
            })
            .then(function (r) {
                if (!r.ok) { throw new Error("denied"); }
                return r.json();
            })
            .then(function (d) {
                if (!d || !d.totals) { throw new Error("no data"); }
                var t = d.totals;
                cur = {
                    translate: t.translated || 0,
                    sync: t.synced || 0,
                    merge: t.merged || 0,
                    message: t.messages || 0,
                    comment: t.comments || 0,
                    auto: ready != null ? ready : (cur ? cur.auto : 0)
                };
                nav.hidden = false;
                paint();
            })
            .catch(function () {
                // wrong / expired key: hide the button and stop checking
                nav.hidden = true;
                clearInterval(timer);
            });
    }

    css();
    badge = mk("span", "adm-badge", "0");
    badge.hidden = true;
    nav.appendChild(badge);
    nav.addEventListener("click", togglePanel);
    document.addEventListener("click", function (e) {
        if (panel && !panel.contains(e.target) && !nav.contains(e.target)) { closePanel(); }
    });
    window.addEventListener("resize", function () { if (panel) { place(); } });

    load();
    timer = setInterval(function () { if (!document.hidden) { load(); } }, POLL_MS);
})();
