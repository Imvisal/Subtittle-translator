/* =========================================================
   SubLanka AI — Android app shim
   Only included in the app build (scripts/build-www.js adds it
   to www/index.html). The website itself never loads this file.

   1. The app has no server, so relative /api/... calls are sent
      to the deployed site instead.
   2. Blob downloads do not work in an Android WebView, so SRT
      files are saved straight into Download/SubLanka AI/ (native
      Downloads plugin). If that fails, the share sheet opens instead.
   3. Notifications (translating / finished / failed / update available).
   4. Update check against /version.json (app-update.js).
========================================================= */
(function () {
    "use strict";

    var API_ORIGIN = "https://subtittle-translator.vercel.app";

    var cap = window.Capacitor;
    var isApp = !!(cap && (
        (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) ||
        (typeof cap.getPlatform === "function" && cap.getPlatform() !== "web")
    ));

    if (!isApp) {
        return;
    }

    // ---- 1. API calls -> deployed site --------------------
    var originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        if (typeof input === "string" && input.indexOf("/api/") === 0) {
            input = API_ORIGIN + input;
        }
        return originalFetch(input, init);
    };

    // ---- 2. Save SRT files into Downloads ------------------
    function shareFallback(text, filename) {
        var plugins = cap.Plugins || {};
        var Filesystem = plugins.Filesystem;
        var Share = plugins.Share;

        if (!Filesystem) {
            alert("File saving is not available in this build.");
            return;
        }

        Filesystem.writeFile({
            path: filename,
            data: "\uFEFF" + text,
            directory: "CACHE",
            encoding: "utf8"
        }).then(function (result) {
            if (Share) {
                return Share.share({
                    title: filename,
                    dialogTitle: "Save or share subtitle",
                    url: result.uri
                });
            }
        }).catch(function (error) {
            var msg = String((error && error.message) || error || "");
            if (/cancel|dismiss/i.test(msg)) { return; }
            alert("Could not save the file:\n\n" + msg);
        });
    }

    window.__appSaveTextFile = function (text, filename) {
        var Downloads = (cap.Plugins || {}).Downloads;

        if (!Downloads) {
            shareFallback(text, filename);
            return;
        }

        Downloads.saveText({ text: text, filename: filename }).then(function (result) {
            var where = (result && result.path) || ("Download/SubLanka AI/" + filename);
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().schedule({
                    notifications: [{
                        id: NOTE_SAVED_ID,
                        title: "Subtitle saved to Downloads",
                        body: where,
                        channelId: "translate-done"
                    }]
                });
            });
        }).catch(function (error) {
            var msg = String((error && error.message) || error || "");
            console.error("SAVE ERROR:", error);
            alert("Could not save to Downloads:\n\n" + msg + "\n\nOpening the share sheet instead.");
            shareFallback(text, filename);
        });
    };

    // ---- 3. Notifications (translating / finished / failed) ----
    var NOTE_PROGRESS_ID = 1001;
    var NOTE_RESULT_ID = 1002;
    var NOTE_SAVED_ID = 1003;
    var NOTE_UPDATE_ID = 1004;
    var noteReady = null;
    var lastPercent = -1;

    function notes() {
        return (cap.Plugins || {}).LocalNotifications;
    }

    function prepareNotes() {
        var LN = notes();
        if (!LN) { return Promise.resolve(false); }
        if (noteReady) { return noteReady; }

        noteReady = LN.requestPermissions().then(function (perm) {
            if (!perm || perm.display !== "granted") { return false; }
            return Promise.all([
                LN.createChannel({
                    id: "translate-progress",
                    name: "Translation progress",
                    description: "Shown while a subtitle is being translated",
                    importance: 2,
                    vibration: false
                }),
                LN.createChannel({
                    id: "app-updates",
                    name: "App updates",
                    description: "Shown when a new version of SubLanka AI is available",
                    importance: 3
                }),
                LN.createChannel({
                    id: "translate-done",
                    name: "Translation finished",
                    description: "Shown when a subtitle translation finishes",
                    importance: 4,
                    vibration: true
                })
            ]).then(function () { return true; });
        }).catch(function () { return false; });

        return noteReady;
    }

    function bar(percent) {
        var filled = Math.round(percent / 10);
        return new Array(filled + 1).join("\u2593") +
            new Array(10 - filled + 1).join("\u2591");
    }

    window.__appNotify = {

        progress: function (percent, completed, total) {
            if (percent === lastPercent) { return; }
            lastPercent = percent;
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().schedule({
                    notifications: [{
                        id: NOTE_PROGRESS_ID,
                        title: "Translating subtitle... " + percent + "%",
                        body: bar(percent) + "  " + completed + " / " + total + " lines",
                        channelId: "translate-progress",
                        ongoing: true,
                        autoCancel: false
                    }]
                });
            });
        },

        done: function (count) {
            lastPercent = -1;
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().cancel({ notifications: [{ id: NOTE_PROGRESS_ID }] }).then(function () {
                    return notes().schedule({
                        notifications: [{
                            id: NOTE_RESULT_ID,
                            title: "Translation finished \u2713",
                            body: count + " subtitles translated to Sinhala. Your file is ready.",
                            channelId: "translate-done"
                        }]
                    });
                });
            });
        },

        failed: function (message) {
            lastPercent = -1;
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().cancel({ notifications: [{ id: NOTE_PROGRESS_ID }] }).then(function () {
                    return notes().schedule({
                        notifications: [{
                            id: NOTE_RESULT_ID,
                            title: "Translation failed",
                            body: String(message || "Something went wrong. Please try again."),
                            channelId: "translate-done"
                        }]
                    });
                });
            });
        }
    };

    // ---- 4. Update check ----------------------------------
    if (window.__appUpdates) {
        window.__appUpdates.start({
            currentVersion: "__APP_VERSION__",
            platform: "android",

            fetchJson: function () {
                return originalFetch(API_ORIGIN + "/version.json?t=" + Date.now(), { cache: "no-store" })
                    .then(function (r) { return r.json(); });
            },

            openUrl: function (url) {
                window.open(url, "_blank");
            },

            notify: function (title, body) {
                prepareNotes().then(function (ok) {
                    if (!ok) { return; }
                    return notes().schedule({
                        notifications: [{
                            id: NOTE_UPDATE_ID,
                            title: title,
                            body: body,
                            channelId: "app-updates"
                        }]
                    });
                });
            }
        });
    }
})();
