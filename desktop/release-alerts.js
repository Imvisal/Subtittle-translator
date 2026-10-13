/* SinSubz AI — new release alerts (Windows app).

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
                        toasts.push({
                            title: (item.type === "series" ? "New series available: " : "New movie available: ") + label(item),
                            body: sinhala
                                ? "Sinhala subtitle is already available (" + item.sinhala.source + ")."
                                : "Open SinSubz AI to find or translate subtitles."
                        });
                    }
                } else if (sinhala && !known.sinhala) {
                    known.sinhala = true;
                    if (state.init) {
                        toasts.push({
                            title: "Sinhala subtitle available: " + label(item),
                            body: "Found on " + (item.sinhala.source || "a Sinhala subtitle site") + ". Open SinSubz AI to get it."
                        });
                    }
                }
            });

            state.init = true;
            save(state);

            toasts.slice(0, MAX_TOASTS).forEach(function (t) {
                window.desktopApi.notify({ type: "toast", title: t.title, body: t.body });
            });

            if (toasts.length > MAX_TOASTS) {
                window.desktopApi.notify({
                    type: "toast",
                    title: "SinSubz AI",
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
