/* SinSubz — new release alerts (Windows app).

   Every few hours (and when the app starts) this asks /api/new-releases for
   newly released movies / TV series and shows a notification:
     - "New movie / series available" the first time a title appears
     - "Sinhala subtitle available"   when a Sinhala subtitle shows up for it

   The app keeps running in the system tray when its window is closed, so
   these notifications still arrive. (The Android app does the same job
   natively in ReleaseCheckWorker.java.) */
(function () {
    "use strict";

    var API_ORIGIN = "https://subtittle-translator.vercel.app";
    var KEY = "sinsubz_releases";
    var EVERY = 3 * 60 * 60 * 1000;     // 3 hours
    var MAX_TOASTS = 3;

    if (!window.desktopApi) { return; }

    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(KEY) || "null");
            if (s && s.items) { return s; }
        } catch (e) { /* ignore */ }
        return { init: false, items: {} };
    }

    function save(state) {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }

    function fetchReleases() {
        return window.desktopApi.fetch(API_ORIGIN + "/api/new-releases", { method: "GET" })
            .then(function (r) {
                if (r.status !== 200) { throw new Error("status " + r.status); }
                return JSON.parse(new TextDecoder("utf-8").decode(r.body));
            });
    }

    // In-app notification list (the Notifications tab). Newest first, 30 kept.
    var INBOX = "sinsubz_inbox";

    function addInbox(item, kind, sinhala) {
        var o = { items: [], seen: 0 };
        try {
            var p = JSON.parse(localStorage.getItem(INBOX) || "null");
            if (p && Array.isArray(p.items)) { o = p; }
        } catch (e) { /* ignore */ }
        o.items = o.items.filter(function (x) { return !(x.key === item.key && x.kind === kind); });
        o.items.unshift({
            key: item.key, kind: kind, title: item.title, year: item.year || "",
            type: item.type === "series" ? "series" : "movie", sinhala: !!sinhala,
            source: (item.sinhala && item.sinhala.source) || "", poster: item.poster || "", t: Date.now()
        });
        o.items = o.items.slice(0, 30);
        try { localStorage.setItem(INBOX, JSON.stringify(o)); } catch (e) { /* ignore */ }
    }

    function alertsOff() {
        try { return localStorage.getItem("sinsubz_alerts_off") === "1"; } catch (e) { return false; }
    }

    function label(item) {
        return item.title + (item.year ? " (" + item.year + ")" : "");
    }

    function check() {
        return fetchReleases().then(function (data) {
            var items = (data && data.items) || [];
            var state = load();
            var toasts = [];

            items.forEach(function (item) {
                var known = state.items[item.key];
                var sinhala = !!(item.sinhala && item.sinhala.found);

                if (!known) {
                    // First run: remember what is already out, do not flood the user.
                    state.items[item.key] = { sinhala: sinhala };
                    if (state.init) {
                        addInbox(item, "new", sinhala);
                        toasts.push({
                            title: (item.type === "series" ? "New series available: " : "New movie available: ") + label(item),
                            body: sinhala
                                ? "Sinhala subtitle is already available (" + item.sinhala.source + ")."
                                : "Open SinSubz to find or translate subtitles."
                        });
                    }
                } else if (sinhala && !known.sinhala) {
                    known.sinhala = true;
                    if (state.init) {
                        addInbox(item, "sinhala", true);
                        toasts.push({
                            title: "Sinhala subtitle available: " + label(item),
                            body: "Found on " + (item.sinhala.source || "a Sinhala subtitle site") + ". Open SinSubz to get it."
                        });
                    }
                }
            });

            state.init = true;
            save(state);

            if (alertsOff()) { toasts = []; }

            toasts.slice(0, MAX_TOASTS).forEach(function (t) {
                window.desktopApi.notify({ type: "toast", title: t.title, body: t.body });
            });

            if (toasts.length > MAX_TOASTS) {
                window.desktopApi.notify({
                    type: "toast",
                    title: "SinSubz",
                    body: "+" + (toasts.length - MAX_TOASTS) + " more new releases. Open the app to see them."
                });
            }
        }).catch(function () { /* offline / API error: try again next time */ });
    }

    setTimeout(function () {
        check();
        setInterval(check, EVERY);
    }, 8000);

    window.__releaseAlerts = { check: check };
})();
