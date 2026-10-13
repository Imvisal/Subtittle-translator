/* =========================================================
   SinSubz AI — Android app shim
   Only included in the app build (scripts/build-www.js adds it
   to www/index.html). The website itself never loads this file.

   1. The app has no server, so relative /api/... calls are sent
      to the deployed site instead.
   2. Blob downloads do not work in an Android WebView, so SRT
      files are saved straight into Download/SinSubz AI/ (native
      Downloads plugin). If that fails, the share sheet opens instead.
   3. Notifications (translating / finished / failed / update available).
   4. Update check against /version.json (app-update.js).
   5. Full-screen layout: status bar / navigation bar sizes for CSS,
      and dark / light system bar icons that follow the app theme.
   6. "No internet connection" popup with Retry / OK.
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
            var where = (result && result.path) || ("Download/SinSubz AI/" + filename);
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().schedule({
                    notifications: [{
                        id: NOTE_SAVED_ID,
                        title: "Subtitle saved to Downloads",
                        body: where,
                        channelId: "translate-done",
                        largeIcon: "ic_logo_large"
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
                    description: "Shown when a new version of SinSubz AI is available",
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

    // The "Translating..." notification is owned by a native foreground service
    // (TranslationService.java): one notification that updates its % in place, and
    // the translation keeps running when the app is in the background.
    function nativeDownloads() {
        var d = (cap.Plugins || {}).Downloads;
        return d && d.startTranslation && d.updateTranslation && d.stopTranslation ? d : null;
    }

    function stopNative() {
        var d = nativeDownloads();
        if (!d) { return Promise.resolve(); }
        return d.stopTranslation().catch(function () { /* ignore */ });
    }

    window.__appNotify = {

        start: function () {
            lastPercent = -1;
            var d = nativeDownloads();
            if (d) { d.startTranslation().catch(function () { /* ignore */ }); }
        },

        progress: function (percent, completed, total) {
            if (percent === lastPercent) { return; }
            lastPercent = percent;

            var d = nativeDownloads();
            if (d) {
                d.updateTranslation({ percent: percent, completed: completed, total: total })
                    .catch(function () { /* ignore */ });
                return;
            }

            // fallback (old native build): plain notification, no bar
            prepareNotes().then(function (ok) {
                if (!ok) { return; }
                return notes().schedule({
                    notifications: [{
                        id: NOTE_PROGRESS_ID,
                        title: "Translating subtitle... " + percent + "%",
                        body: completed + " / " + total + " lines",
                        channelId: "translate-progress",
                        largeIcon: "ic_logo_large",
                        ongoing: true,
                        autoCancel: false
                    }]
                });
            });
        },

        done: function (count) {
            lastPercent = -1;
            stopNative().then(function () { return prepareNotes(); }).then(function (ok) {
                if (!ok) { return; }
                return notes().cancel({ notifications: [{ id: NOTE_PROGRESS_ID }] }).then(function () {
                    return notes().schedule({
                        notifications: [{
                            id: NOTE_RESULT_ID,
                            title: "Translation finished \u2713",
                            body: count + " subtitles translated to Sinhala. Your file is ready.",
                            channelId: "translate-done",
                            largeIcon: "ic_logo_large"
                        }]
                    });
                });
            });
        },

        failed: function (message) {
            lastPercent = -1;
            stopNative().then(function () { return prepareNotes(); }).then(function (ok) {
                if (!ok) { return; }
                return notes().cancel({ notifications: [{ id: NOTE_PROGRESS_ID }] }).then(function () {
                    return notes().schedule({
                        notifications: [{
                            id: NOTE_RESULT_ID,
                            title: "Translation failed",
                            body: String(message || "Something went wrong. Please try again."),
                            channelId: "translate-done",
                            largeIcon: "ic_logo_large"
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
                var Downloads = (cap.Plugins || {}).Downloads;
                if (Downloads && Downloads.openUrl) {
                    Downloads.openUrl({ url: url }).catch(function () {
                        window.open(url, "_blank");
                    });
                    return;
                }
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
                            channelId: "app-updates",
                            largeIcon: "ic_logo_large"
                        }]
                    });
                });
            }
        });
    }

    // ---- 5. Full-screen layout ----------------------------
    // The page is drawn behind the status bar and navigation bar. The native
    // side tells us their height; style.css (app build) uses --native-sat /
    // --native-sab to keep the header and content clear of them.
    function applyInsets() {
        var Downloads = (cap.Plugins || {}).Downloads;
        if (!Downloads || !Downloads.getInsets) { return; }
        Downloads.getInsets().then(function (r) {
            var root = document.documentElement;
            root.style.setProperty("--native-sat", ((r && r.top) || 0) + "px");
            root.style.setProperty("--native-sab", ((r && r.bottom) || 0) + "px");
        }).catch(function () { /* page falls back to env(safe-area-inset-*) */ });
    }

    // dark theme -> light bar icons, light theme -> dark bar icons
    function applyBarStyle() {
        var Downloads = (cap.Plugins || {}).Downloads;
        if (!Downloads || !Downloads.setSystemBarsLight) { return; }
        var light = document.documentElement.getAttribute("data-theme") === "light";
        Downloads.setSystemBarsLight({ light: light }).catch(function () { /* ignore */ });
    }

    applyInsets();
    applyBarStyle();
    setTimeout(applyInsets, 400);
    setTimeout(applyInsets, 1500);
    window.addEventListener("resize", applyInsets);
    window.addEventListener("orientationchange", function () { setTimeout(applyInsets, 300); });

    try {
        new MutationObserver(applyBarStyle).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"]
        });
    } catch (e) { /* ignore */ }

    // ---- 6. No internet connection popup -------------------
    var offlineShowing = false;

    // Real connectivity test: any answer from our server means we are online.
    function checkOnline() {
        var timeout = new Promise(function (resolve) {
            setTimeout(function () { resolve(false); }, 8000);
        });
        var request = originalFetch(API_ORIGIN + "/version.json?t=" + Date.now(), { cache: "no-store" })
            .then(function () { return true; })
            .catch(function () { return false; });
        return Promise.race([request, timeout]);
    }

    function injectOfflineStyles() {
        if (document.getElementById("appOfflineStyles")) { return; }
        var st = document.createElement("style");
        st.id = "appOfflineStyles";
        st.textContent =
            ".net-back{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;" +
            "padding:20px;background:rgba(5,6,12,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}" +
            ".net-card{width:100%;max-width:380px;border-radius:22px;padding:26px 24px 22px;color:#f2f3fa;text-align:center;" +
            "background:linear-gradient(160deg,#171a2b,#0d0f1a);border:1px solid rgba(150,150,255,.28);" +
            "box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:'Plus Jakarta Sans','Noto Sans Sinhala',system-ui,sans-serif;}" +
            ".net-icon{font-size:38px;line-height:1;margin-bottom:12px;}" +
            ".net-card h3{margin:0 0 8px;font-size:21px;line-height:1.25;font-weight:800;}" +
            ".net-card p{margin:0 0 6px;font-size:14px;line-height:1.55;color:#b6b9cf;}" +
            ".net-status{min-height:20px;margin-top:8px;font-size:13px;font-weight:600;color:#ffb4b4;}" +
            ".net-actions{display:flex;gap:10px;margin-top:18px;}" +
            ".net-actions button{flex:1;border:0;border-radius:14px;padding:13px 14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;}" +
            ".net-actions button:disabled{opacity:.6;}" +
            ".net-ok{background:rgba(255,255,255,.08);color:#d7d9ea;}" +
            ".net-retry{background:linear-gradient(135deg,#7c7cff,#b58cff);color:#0b0c16;}";
        document.head.appendChild(st);
    }

    function mk(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text) { n.textContent = text; }
        return n;
    }

    function showOfflinePopup() {
        if (offlineShowing || !document.body) { return; }
        offlineShowing = true;
        injectOfflineStyles();

        var back = mk("div", "net-back");
        var card = mk("div", "net-card");
        card.setAttribute("role", "alertdialog");
        card.setAttribute("aria-modal", "true");

        card.appendChild(mk("div", "net-icon", "\uD83D\uDCE1"));
        card.appendChild(mk("h3", "", "No internet connection"));
        card.appendChild(mk("p", "", "SinSubz AI needs the internet to search and translate subtitles. Please check your connection and try again."));
        card.appendChild(mk("p", "", "\u0D85\u0DB1\u0DCA\u0DAD\u0DBB\u0DCA\u0DA2\u0DCF\u0DBD \u0DC3\u0DB8\u0DCA\u0DB6\u0DB1\u0DCA\u0DB0\u0DAD\u0DCF\u0DC0\u0DBA\u0D9A\u0DCA \u0DB1\u0DD0\u0DAD."));

        var status = mk("div", "net-status");
        card.appendChild(status);

        var actions = mk("div", "net-actions");
        var ok = mk("button", "net-ok", "OK");
        var retry = mk("button", "net-retry", "Retry");
        ok.type = "button";
        retry.type = "button";
        actions.appendChild(ok);
        actions.appendChild(retry);
        card.appendChild(actions);
        back.appendChild(card);
        document.body.appendChild(back);

        function close() {
            offlineShowing = false;
            if (back.parentNode) { back.parentNode.removeChild(back); }
        }

        ok.addEventListener("click", close);

        retry.addEventListener("click", function () {
            retry.disabled = true;
            retry.textContent = "Checking...";
            status.textContent = "";

            checkOnline().then(function (online) {
                if (online) {
                    // reload so fonts, icons and the lists load normally
                    close();
                    window.location.reload();
                    return;
                }
                retry.disabled = false;
                retry.textContent = "Retry";
                status.textContent = "Still no connection. Please try again.";
            });
        });
    }

    function startupConnectionCheck() {
        if (navigator.onLine === false) {
            showOfflinePopup();
            return;
        }
        checkOnline().then(function (online) {
            if (!online) { showOfflinePopup(); }
        });
    }

    window.addEventListener("offline", showOfflinePopup);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startupConnectionCheck);
    } else {
        startupConnectionCheck();
    }
})();
