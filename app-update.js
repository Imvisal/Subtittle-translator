/* =========================================================
   SinSubz — in-app update check (Android + Windows apps only)
   Included by scripts/build-www.js and desktop/build-app.js.
   The website itself never loads this file.

   Reads /version.json from the deployed site. When it lists a newer
   version than the one this app was built with, the app shows a
   notification (once per version) and an "Update available" popup
   (every time the app is opened).

   It also shows ONE-TIME announcements that you control from the website's
   /announcement.json (title, text, optional image, optional link with an
   "Open" button and a "Not now" button). Each announcement id is shown to
   each user only once. See ANNOUNCEMENTS.md.
========================================================= */
(function () {
    "use strict";

    var CHECK_EVERY = 6 * 60 * 60 * 1000;   // re-check every 6 hours while open
    var showing = false;

    function parse(v) {
        var m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ""));
        return m ? [+m[1], +m[2], +m[3]] : null;
    }

    function compare(a, b) {
        var pa = parse(a), pb = parse(b);
        if (!pa || !pb) { return 0; }
        for (var i = 0; i < 3; i++) {
            if (pa[i] !== pb[i]) { return pa[i] > pb[i] ? 1 : -1; }
        }
        return 0;
    }

    function getFlag(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function setFlag(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    function injectStyles() {
        if (document.getElementById("appUpdateStyles")) { return; }
        var st = document.createElement("style");
        st.id = "appUpdateStyles";
        st.textContent =
            ".upd-back{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
            "padding:20px;background:rgba(5,6,12,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}" +
            ".upd-card{width:100%;max-width:400px;border-radius:22px;padding:26px 24px 22px;color:#f2f3fa;" +
            "background:linear-gradient(160deg,#171a2b,#0d0f1a);border:1px solid rgba(150,150,255,.28);" +
            "box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:'Plus Jakarta Sans','Noto Sans Sinhala',system-ui,sans-serif;}" +
            ".upd-badge{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;padding:4px 10px;" +
            "border-radius:999px;background:rgba(124,124,255,.18);color:#b9b9ff;margin-bottom:12px;}" +
            ".upd-img{display:block;width:100%;max-height:190px;object-fit:cover;border-radius:14px;margin:0 0 14px;}" +
            ".upd-card h3{margin:0 0 8px;font-size:21px;line-height:1.25;font-weight:800;}" +
            ".upd-card p{margin:0 0 6px;font-size:14px;line-height:1.55;color:#b6b9cf;white-space:pre-line;}" +
            ".upd-actions{display:flex;gap:10px;margin-top:20px;}" +
            ".upd-actions button{flex:1;border:0;border-radius:14px;padding:13px 14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;}" +
            ".upd-later{background:rgba(255,255,255,.08);color:#d7d9ea;}" +
            ".upd-now{background:linear-gradient(135deg,#7c7cff,#b58cff);color:#0b0c16;}";
        document.head.appendChild(st);
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text) { n.textContent = text; }
        return n;
    }

    function showPopup(info, cfg) {
        if (showing) { return; }
        showing = true;
        injectStyles();

        var back = el("div", "upd-back");
        var card = el("div", "upd-card");
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");

        card.appendChild(el("span", "upd-badge", "NEW VERSION " + info.latest));
        card.appendChild(el("h3", "", "Update available"));
        card.appendChild(el("p", "",
            "A new version of SinSubz is ready (you have " + cfg.currentVersion + ")."));
        if (info.notes) { card.appendChild(el("p", "", info.notes)); }

        var actions = el("div", "upd-actions");
        var later = el("button", "upd-later", "Later");
        var now = el("button", "upd-now", "Update now");
        later.type = "button";
        now.type = "button";
        actions.appendChild(later);
        actions.appendChild(now);
        card.appendChild(actions);
        back.appendChild(card);
        document.body.appendChild(back);

        function close() {
            showing = false;
            if (back.parentNode) { back.parentNode.removeChild(back); }
        }

        later.addEventListener("click", close);
        now.addEventListener("click", function () {
            if (info.url) { cfg.openUrl(info.url); }
            close();
        });
    }

    // ---- One-time announcements (/announcement.json) -----------------------
    var AN_FLAG = "sinsubz_announce_seen";

    function absUrl(u, cfg) {
        u = String(u || "").trim();
        if (u.charAt(0) === "/" && u.charAt(1) !== "/") { return (cfg.origin || "") + u; }
        return u;
    }

    function httpsOnly(u) {
        return /^https:\/\/\S+$/i.test(u) ? u : "";
    }

    // returns a clean announcement object, or null when it must not be shown
    function readAnnouncement(a, cfg) {
        if (!a || a.enabled !== true || !a.id) { return null; }
        if (!a.title && !a.body) { return null; }

        if (a.platforms && a.platforms.length && a.platforms.indexOf(cfg.platform) === -1) {
            return null;
        }

        if (a.expires) {                      // "YYYY-MM-DD" = valid through that whole day
            var end = Date.parse(String(a.expires).slice(0, 10));
            if (!isNaN(end) && Date.now() > end + 24 * 60 * 60 * 1000) { return null; }
        }

        return {
            id: String(a.id),
            title: String(a.title || "SinSubz"),
            body: String(a.body || ""),
            image: httpsOnly(absUrl(a.image, cfg)),
            url: httpsOnly(absUrl(a.url, cfg)),
            openLabel: String(a.openLabel || "Open"),
            laterLabel: String(a.laterLabel || "Not now")
        };
    }

    function showAnnouncementPopup(n, cfg) {
        showing = true;
        injectStyles();

        var back = el("div", "upd-back");
        var card = el("div", "upd-card");
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");

        if (n.image) {
            var img = el("img", "upd-img");
            img.alt = "";
            img.addEventListener("error", function () {   // broken image: just hide it
                if (img.parentNode) { img.parentNode.removeChild(img); }
            });
            img.src = n.image;
            card.appendChild(img);
        }

        card.appendChild(el("h3", "", n.title));
        if (n.body) { card.appendChild(el("p", "", n.body)); }

        var actions = el("div", "upd-actions");
        var later = el("button", "upd-later", n.url ? n.laterLabel : "OK");
        later.type = "button";
        actions.appendChild(later);

        var open = null;
        if (n.url) {
            open = el("button", "upd-now", n.openLabel);
            open.type = "button";
            actions.appendChild(open);
        }
        card.appendChild(actions);
        back.appendChild(card);
        document.body.appendChild(back);

        function close() {
            showing = false;
            if (back.parentNode) { back.parentNode.removeChild(back); }
        }

        later.addEventListener("click", close);
        if (open) {
            open.addEventListener("click", function () {
                cfg.openUrl(n.url);
                close();
            });
        }
    }

    var lastCfg = null;

    // an announcement taken from the bell list (same shape as the native inbox entry)
    function showFromInbox(it) {
        if (!lastCfg || showing || !it) { return; }
        showAnnouncementPopup({
            id: String(it.key || it.id || ""),
            title: String(it.title || "SinSubz"),
            body: String(it.body || ""),
            image: httpsOnly(String(it.image || "")),
            url: httpsOnly(String(it.url || "")),
            openLabel: String(it.openLabel || "Open"),
            laterLabel: String(it.laterLabel || "Not now")
        }, lastCfg);
    }

    function checkAnnouncement(cfg) {
        return cfg.fetchJson("/announcement.json").then(function (data) {
            var n = readAnnouncement(data, cfg);
            if (!n) { return; }
            if (getFlag(AN_FLAG) === n.id) { return; }   // this user already saw it
            if (showing) { return; }                      // update popup is open: try next time

            setFlag(AN_FLAG, n.id);
            try { cfg.notify(n.title, n.body, "announcement"); } catch (e) { /* ignore */ }
            // Windows keeps its own bell list (Android's list is filled by the native worker)
            try {
                if (window.__appInbox && window.__appInbox.addAnnouncement) {
                    window.__appInbox.addAnnouncement(n);
                }
            } catch (e) { /* ignore */ }
            showAnnouncementPopup(n, cfg);
        }).catch(function () { /* offline / no announcement.json: ignore */ });
    }

    function runChecks(cfg) {
        return check(cfg).then(function () { return checkAnnouncement(cfg); });
    }

    function check(cfg) {
        return cfg.fetchJson().then(function (data) {
            if (!data || compare(data.version, cfg.currentVersion) <= 0) { return; }

            var entry = data[cfg.platform] || {};
            var info = { latest: data.version, notes: data.notes || "", url: entry.url || "" };

            if (getFlag("sinsubz_update_notified") !== info.latest) {
                setFlag("sinsubz_update_notified", info.latest);
                try {
                    cfg.notify(
                        "Update available — v" + info.latest,
                        info.notes || "A new version of SinSubz is ready. Open the app to update."
                    );
                } catch (e) { /* ignore */ }
            }

            showPopup(info, cfg);
        }).catch(function () { /* offline or no version.json: ignore */ });
    }

    window.__appUpdates = {
        _compare: compare,
        showAnnouncement: showFromInbox,
        start: function (cfg) {
            if (!parse(cfg && cfg.currentVersion)) { return; }
            lastCfg = cfg;
            setTimeout(function () {
                runChecks(cfg);
                setInterval(function () { runChecks(cfg); }, CHECK_EVERY);
            }, 2500);
        }
    };
})();
