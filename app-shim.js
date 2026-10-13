/* =========================================================
   SubLanka AI — Android app shim
   Only included in the app build (scripts/build-www.js adds it
   to www/index.html). The website itself never loads this file.

   1. The app has no server, so relative /api/... calls are sent
      to the deployed site instead.
   2. Blob downloads do not work in an Android WebView, so SRT
      files are written to the cache folder and the system share
      sheet opens (Save to Files / Drive / WhatsApp / ...).
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

    // ---- 2. Save + share SRT files ------------------------
    window.__appSaveTextFile = function (text, filename) {
        var plugins = cap.Plugins || {};
        var Filesystem = plugins.Filesystem;
        var Share = plugins.Share;

        if (!Filesystem) {
            alert("File saving is not available in this build.");
            return;
        }

        // keep the BOM the website adds so Sinhala opens correctly
        var data = "﻿" + text;

        Filesystem.writeFile({
            path: filename,
            data: data,
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
            alert("Saved: " + filename);
        }).catch(function (error) {
            // user closing the share sheet is not an error
            var msg = String((error && error.message) || error || "");
            if (/cancel|dismiss/i.test(msg)) {
                return;
            }
            console.error("SAVE ERROR:", error);
            alert("Could not save the file:\n\n" + msg);
        });
    };
})();
