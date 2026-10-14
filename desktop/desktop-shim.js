/* SinSubz — Windows desktop shim.
   Only included in the desktop build (desktop/build-app.js adds it to
   app/index.html). The website itself never loads this file.

   Relative /api/... calls are sent to the deployed site through the
   Electron main process. */
(function () {
    "use strict";

    var API_ORIGIN = "https://subtittle-translator.vercel.app";

    if (!window.desktopApi) return;

    var originalFetch = window.fetch.bind(window);
    var NO_BODY = { 101: 1, 204: 1, 205: 1, 304: 1 };

    window.fetch = function (input, init) {
        if (typeof input === "string" && input.indexOf("/api/") === 0) {
            var opts = {
                method: (init && init.method) || "GET",
                headers: (init && init.headers) || {},
                body: init && typeof init.body === "string" ? init.body : undefined
            };

            return window.desktopApi.fetch(API_ORIGIN + input, opts).then(function (r) {
                return new Response(NO_BODY[r.status] ? null : r.body, {
                    status: r.status,
                    statusText: r.statusText,
                    headers: r.contentType ? { "Content-Type": r.contentType } : {}
                });
            });
        }
        return originalFetch(input, init);
    };

    // Notifications + taskbar progress (the site calls window.__appNotify)
    var lastPercent = -1;

    window.__appNotify = {
        progress: function (percent, completed, total) {
            if (percent === lastPercent) return;
            lastPercent = percent;
            window.desktopApi.notify({ type: "progress", percent: percent, completed: completed, total: total });
        },
        done: function (count) {
            lastPercent = -1;
            window.desktopApi.notify({ type: "done", count: count });
        },
        failed: function (message) {
            lastPercent = -1;
            window.desktopApi.notify({ type: "failed", message: message });
        }
    };

    // Save the translated / synced SRT straight into Downloads\SinSubz
    window.__appSaveTextFile = function (text, filename) {
        window.desktopApi.saveFile(text, filename).catch(function (error) {
            alert("Could not save the file:\n\n" + String((error && error.message) || error));
        });
    };

    // Update check (app-update.js)
    if (window.__appUpdates) {
        window.__appUpdates.start({
            currentVersion: "__APP_VERSION__",
            platform: "windows",
            origin: API_ORIGIN,

            fetchJson: function (path) {
                return window.desktopApi.fetch(API_ORIGIN + (path || "/version.json") + "?t=" + Date.now(), { method: "GET" })
                    .then(function (r) {
                        return JSON.parse(new TextDecoder("utf-8").decode(r.body));
                    });
            },

            openUrl: function (url) {
                window.desktopApi.openExternal(url);
            },

            notify: function (title, body) {
                window.desktopApi.notify({ type: "update", title: title, body: body });
            }
        });
    }
})();
