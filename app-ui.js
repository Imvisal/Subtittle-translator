/* =========================================================
   SinSubz — Android app UI
   Only included in the app build (scripts/build-www.js adds it,
   with app-ui.css, to www/index.html). The website never loads
   this file, and it does not change script.js / ui.js / sync.js.

   1. Bottom tabs: Find / Upload / Sync / Settings
   2. Translation progress icon (header) + Translations panel
   3. Settings tab: dark mode, notifications, storage, battery
   4. "New releases" row on the Find tab (/api/new-releases)
   5. Android back button steps back through the tabs
========================================================= */
(function () {
    "use strict";

    var cap = window.Capacitor || {};
    var isAndroid = !!(window.Capacitor && (
        (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) ||
        (typeof cap.getPlatform === "function" && cap.getPlatform() !== "web")
    ));
    // Windows desktop app (Electron): same screens, sidebar layout (desktop-ui.css)
    var isDesktop = !isAndroid && !!window.desktopApi;

    if (!isAndroid && !isDesktop) {
        return;
    }

    var VERSION = "__APP_VERSION__";
    var JOBS_KEY = "sinsubz-app-jobs";
    var TABS = [
        { id: "find",     label: "Find",     icon: "fa-magnifying-glass" },
        { id: "upload",   label: "Upload",   icon: "fa-cloud-arrow-up" },
        { id: "sync",     label: "Sync",     icon: "fa-arrows-rotate" },
        { id: "settings", label: "Settings", icon: "fa-gear" }
    ];

    // Windows app only: preview a movie with a subtitle and merge the subtitle into the video (desktop-player.js)
    if (isDesktop) {
        TABS.splice(3, 0, { id: "play", label: "Merge", icon: "fa-film" });
    }

    var root = document.documentElement;
    root.classList.add("app-mode");
    if (isDesktop) { root.classList.add("desk-mode"); }
    if (!root.getAttribute("data-app-tab")) {
        root.setAttribute("data-app-tab", "find");
    }

    var curTab = "find";
    var jobsOpen = false;

    // ---------- helpers ----------
    function $(id) { return document.getElementById(id); }

    function plug(name) {
        return (cap.Plugins || {})[name] || null;
    }

    function make(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (html != null) { n.innerHTML = html; }
        return n;
    }

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    var toastTimer = null;
    function toast(msg) {
        var t = $("appToast");
        if (!t) {
            t = make("div");
            t.id = "appToast";
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
    }

    function timeAgo(ts) {
        var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
        if (s < 60) { return "just now"; }
        var m = Math.round(s / 60);
        if (m < 60) { return m + " min ago"; }
        var h = Math.round(m / 60);
        if (h < 24) { return h + " h ago"; }
        return Math.round(h / 24) + " d ago";
    }

    // =====================================================
    // JOBS (translation progress tracking)
    // =====================================================
    var cur = null;          // running translation
    var lastDone = null;     // most recent finished job (gets its file name)
    var jobHistory = [];

    try {
        jobHistory = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]");
        if (!Array.isArray(jobHistory)) { jobHistory = []; }
    } catch (e) { jobHistory = []; }

    function saveHistory() {
        jobHistory = jobHistory.slice(0, 12);
        try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobHistory)); } catch (e) { /* ignore */ }
    }

    var selectedTitle = "";

    function uploadName() {
        var n = "";
        try {
            if (typeof uploadedFileName !== "undefined" && uploadedFileName) { n = String(uploadedFileName); }
        } catch (e) { /* ignore */ }
        if (!n) {
            var f = $("fileName");
            n = f ? f.textContent.trim() : "";
        }
        return n.replace(/\.srt$/i, "") || "Uploaded subtitle";
    }

    function jobStart() {
        var kind = $("autoTranslateProgress") ? "search" : "upload";
        cur = {
            kind: kind,
            title: kind === "search" ? (selectedTitle || "Movie / TV subtitle") : uploadName(),
            percent: 0, completed: 0, total: 0, t0: Date.now()
        };
        updateRing();
        renderJobs();
    }

    function jobProgress(percent, completed, total) {
        if (!cur) { jobStart(); }
        cur.percent = percent;
        cur.completed = completed;
        cur.total = total;
        updateRing();
        renderJobs();
    }

    function finishJob(entry) {
        jobHistory.unshift(entry);
        cur = null;
        saveHistory();
        updateRing(true);
        renderJobs();
    }

    function jobDone(count) {
        var base = cur || { kind: "search", title: selectedTitle || "Subtitle" };
        lastDone = { status: "done", title: base.title, kind: base.kind, count: count, t: Date.now() };
        finishJob(lastDone);
    }

    function jobFailed(message) {
        var base = cur || { kind: "search", title: selectedTitle || "Subtitle" };
        finishJob({
            status: "failed", title: base.title, kind: base.kind,
            msg: String(message || "Something went wrong."), t: Date.now()
        });
    }

    function attachFile(filename) {
        if (!lastDone || lastDone.file || Date.now() - lastDone.t > 90000 || !filename) { return; }
        lastDone.file = filename;
        var t = String(filename).replace(/\.Sinhala\.SinSubz(AI)?\.srt$/i, "").replace(/\.srt$/i, "");
        if (lastDone.kind === "search") { t = t.replace(/[._]+/g, " ").trim(); }
        if (t) { lastDone.title = t; }
        saveHistory();
        renderJobs();
    }

    // hook into the existing app notification + save helpers
    (function hook() {
        var N = window.__appNotify;
        if (N) {
            var orig = { start: N.start, progress: N.progress, done: N.done, failed: N.failed };
            N.start = function () {
                jobStart();
                return orig.start && orig.start.apply(N, arguments);
            };
            N.progress = function (percent, completed, total) {
                jobProgress(percent, completed, total);
                return orig.progress && orig.progress.apply(N, arguments);
            };
            N.done = function (count) {
                jobDone(count);
                return orig.done && orig.done.apply(N, arguments);
            };
            N.failed = function (message) {
                jobFailed(message);
                return orig.failed && orig.failed.apply(N, arguments);
            };
        }

        var save = window.__appSaveTextFile;
        if (typeof save === "function") {
            window.__appSaveTextFile = function (text, filename) {
                attachFile(filename);
                return save.apply(this, arguments);
            };
        }
    })();

    // remember which title was picked (script.js writes "Selected: <title>")
    function watchSelectedTitle() {
        var status = $("searchStatus");
        if (!status || !window.MutationObserver) { return; }
        new MutationObserver(function () {
            var m = /^Selected:\s*(.+)$/.exec((status.textContent || "").trim());
            if (m) { selectedTitle = m[1].trim(); }
        }).observe(status, { childList: true, characterData: true, subtree: true });
    }

    // =====================================================
    // NEW RELEASE INBOX (the same alerts the phone notification shows)
    // Recorded natively by ReleaseCheckWorker, even while the app is closed.
    // =====================================================
    var inbox = [];
    var inboxUnread = 0;
    var inboxSeen = 0;       // "seen" time as stored natively
    var inboxMarkAt = 0;     // items newer than this are highlighted while the panel is open

    // Desktop: release-alerts.js keeps the list in localStorage
    var DESK_INBOX = "sinsubz_inbox";
    function deskInbox() {
        try {
            var o = JSON.parse(localStorage.getItem(DESK_INBOX) || "null");
            if (o && Array.isArray(o.items)) { return o; }
        } catch (e) { /* ignore */ }
        return { items: [], seen: 0 };
    }
    function deskSave(o) {
        try { localStorage.setItem(DESK_INBOX, JSON.stringify(o)); } catch (e) { /* ignore */ }
    }

    // announcements (Windows): app-update.js adds them to the bell list.
    // On Android the native worker (ReleaseCheckWorker.java) fills the list itself.
    window.__appInbox = {
        addAnnouncement: function (n) {
            if (!isDesktop || !n) { return; }
            var o = deskInbox();
            var key = "announcement:" + n.id;
            o.items = o.items.filter(function (it) { return !(it.kind === "announcement" && it.key === key); });
            o.items.unshift({
                key: key,
                kind: "announcement",
                title: n.title,
                body: n.body,
                image: n.image,
                url: n.url,
                openLabel: n.openLabel,
                laterLabel: n.laterLabel,
                t: Date.now()
            });
            o.items = o.items.slice(0, 30);
            deskSave(o);
            loadInbox();
        }
    };

    function inboxApi() {
        if (isDesktop) {
            return {
                get: function () {
                    var o = deskInbox();
                    var unread = o.items.filter(function (it) { return it.t > (o.seen || 0); }).length;
                    return Promise.resolve({ items: o.items, seen: o.seen || 0, unread: unread });
                },
                seen: function () { var o = deskInbox(); o.seen = Date.now(); deskSave(o); return Promise.resolve(); },
                clear: function () { deskSave({ items: [], seen: Date.now() }); return Promise.resolve(); }
            };
        }
        var D = plug("Downloads");
        if (!D || !D.getReleaseInbox) { return null; }
        return {
            get: function () { return D.getReleaseInbox(); },
            seen: function () { return D.markReleaseInboxSeen ? D.markReleaseInboxSeen() : Promise.resolve(); },
            clear: function () { return D.clearReleaseInbox ? D.clearReleaseInbox() : Promise.resolve(); }
        };
    }

    function loadInbox() {
        var api = inboxApi();
        if (!api) { return; }
        api.get().then(function (r) {
            inbox = (r && r.items) || [];
            inboxSeen = (r && r.seen) || 0;
            inboxUnread = (r && r.unread) || 0;
            if (jobsOpen) {
                // panel is open right now: nothing is "unread" any more
                if (inboxUnread) { markInboxSeen(); }
                inboxUnread = 0;
            }
            updateRing();
            renderJobs();
        }).catch(function () { /* old native build: no inbox */ });
    }

    function markInboxSeen() {
        var api = inboxApi();
        if (api) { api.seen().catch(function () { /* ignore */ }); }
    }

    function inboxLine(it) {
        if (it.kind === "announcement") {
            var firstLine = String(it.body || "").split("\n")[0];
            if (firstLine.length > 90) { firstLine = firstLine.slice(0, 87) + "..."; }
            return { title: it.title, meta: firstLine || "Announcement" };
        }
        var name = it.title + (it.year ? " (" + it.year + ")" : "");
        if (it.kind === "sinhala") {
            return { title: "Sinhala subtitle available: " + name,
                     meta: "Found on " + (it.source || "a Sinhala subtitle site") };
        }
        return { title: (it.type === "series" ? "New series available: " : "New movie available: ") + name,
                 meta: it.sinhala ? "Sinhala subtitle is already available" : "Find or translate subtitles" };
    }

    // =====================================================
    // UI: header ring, tabs, panel
    // =====================================================
    var jobsBtn, pillBtn, tabsEl, jobsEl, settingsEl;

    function updateRing(isNew) {
        if (!jobsBtn) { return; }
        var running = !!cur;
        jobsBtn.classList.toggle("run", running);
        var badge = jobsBtn.querySelector(".aj-badge");
        var unread = !running && inboxUnread > 0 && !jobsOpen;
        jobsBtn.classList.toggle("unread", unread);
        if (badge) { badge.textContent = running ? "1" : (unread ? (inboxUnread > 9 ? "9+" : String(inboxUnread)) : ""); }
        if (pillBtn) {
            pillBtn.classList.toggle("run", running);
            var bar = pillBtn.querySelector(".aj-pbar i");
            if (bar) { bar.style.width = (running ? cur.percent : 0) + "%"; }
            var txt = pillBtn.querySelector(".aj-ptxt");
            if (txt) { txt.textContent = running ? cur.percent + "%" : ""; }
            pillBtn.setAttribute("aria-label", running
                ? "Translation in progress, " + cur.percent + " percent"
                : "Translations");
        }
        jobsBtn.setAttribute("aria-label", running
            ? "Notifications, translation in progress, " + cur.percent + " percent"
            : (inboxUnread ? "Notifications, " + inboxUnread + " new" : "Notifications"));
        if (isNew && !jobsOpen) { jobsBtn.classList.add("has-new"); }
        if (isDesktop) { deskSync(); }
    }

    // Desktop sidebar: Notifications tab (badge) + the running translation card
    function deskSync() {
        var nb = $("deskNotifTab");
        if (nb) {
            nb.classList.toggle("on", jobsOpen);
            var bd = nb.querySelector(".dk-badge");
            if (bd) {
                var n = (!jobsOpen && inboxUnread > 0) ? (inboxUnread > 9 ? "9+" : String(inboxUnread)) : "";
                bd.textContent = n;
                bd.style.display = n ? "inline-block" : "none";
            }
        }
        if (jobsOpen && tabsEl) {
            Array.prototype.forEach.call(tabsEl.querySelectorAll("button[data-tab]"), function (b) { b.classList.remove("on"); });
        }
        var jc = $("deskJob");
        if (jc) {
            jc.classList.toggle("run", !!cur);
            if (cur) {
                jc.querySelector("p").textContent = cur.title;
                jc.querySelector(".dk-bar i").style.width = cur.percent + "%";
                jc.querySelector(".dk-pct").textContent = cur.percent + "% · " + etaText();
            }
        }
    }

    function etaText() {
        if (!cur || cur.percent < 3) { return "Working…"; }
        var left = (Date.now() - cur.t0) / cur.percent * (100 - cur.percent);
        var min = Math.round(left / 60000);
        return min < 1 ? "Less than a minute left" : "About " + min + " min left";
    }

    function renderJobs() {
        if (!jobsEl || !jobsOpen) { return; }
        var body = jobsEl.querySelector(".aj-body");
        var html = "";

        if (cur) {
            html += '<div class="ap-sec">In progress</div>' +
                '<div class="ap-card"><div class="ap-row">' +
                '<div class="ap-tile"><i class="fa-solid fa-language"></i></div>' +
                '<div class="ap-main"><div class="ap-title">' + esc(cur.title) + '</div>' +
                '<div class="ap-meta">English → Sinhala · ' +
                (cur.kind === "upload" ? "Uploaded SRT" : "Found subtitle") + '</div></div>' +
                '<div class="ap-pct">' + cur.percent + '%</div></div>' +
                '<div class="ap-bar"><i style="width:' + cur.percent + '%"></i></div>' +
                '<div class="ap-meta" style="margin-top:8px">' +
                (cur.total ? cur.completed + " of " + cur.total + " subtitles · " : "") + etaText() +
                '</div></div>';
        }

        if (inbox.length) {
            var hasNews = inbox.some(function (it) { return it.kind === "announcement"; });
            html += '<div class="ap-sec"><span>' + (hasNews ? "News &amp; new releases" : "New releases") +
                '</span><button type="button" id="ajClearNew">Clear</button></div>';
            inbox.forEach(function (it, idx) {
                var ln = inboxLine(it);
                var fresh = it.t > inboxMarkAt && inboxMarkAt > 0;
                var isNews = it.kind === "announcement";
                var pic = isNews ? it.image : it.poster;
                var tile = pic
                    ? '<div class="ap-tile poster"><img loading="lazy" alt="" src="' + esc(pic) + '"></div>'
                    : '<div class="ap-tile"><i class="fa-solid ' +
                      (isNews ? "fa-bullhorn" : (it.type === "series" ? "fa-tv" : "fa-film")) + '"></i></div>';
                html += '<div class="ap-card ap-click' + (fresh ? " fresh" : "") + '" data-inbox="' + idx + '" role="button" tabindex="0">' +
                    '<div class="ap-row">' + tile +
                    '<div class="ap-main"><div class="ap-title">' + esc(ln.title) + '</div>' +
                    '<div class="ap-meta">' + esc(ln.meta) + ' · ' + timeAgo(it.t) + '</div></div></div></div>';
            });
        }

        if (jobHistory.length) {
            html += '<div class="ap-sec"><span>Finished</span><button type="button" id="ajClear">Clear</button></div>';
            jobHistory.forEach(function (j) {
                var ok = j.status === "done";
                var meta = ok
                    ? (j.count ? j.count + " subtitles · " : "") + (j.file ? "Saved to Download/SinSubz · " : "") + timeAgo(j.t)
                    : esc(j.msg || "Failed") + " · " + timeAgo(j.t);
                html += '<div class="ap-card"><div class="ap-row">' +
                    '<div class="ap-tile ' + (ok ? "ok" : "bad") + '"><i class="fa-solid ' +
                    (ok ? "fa-check" : "fa-xmark") + '"></i></div>' +
                    '<div class="ap-main"><div class="ap-title">' + esc(j.title) + '</div>' +
                    '<div class="ap-meta">' + (ok ? esc(meta) : meta) + '</div></div></div></div>';
            });
        }

        if (!cur && !jobHistory.length && !inbox.length) {
            html += '<div class="ap-empty">Nothing here yet.<br>New movies, TV series and Sinhala subtitles, and your translation progress, will show here.' +
                '<br><button type="button" id="ajFind">Find subtitles</button></div>';
        }

        body.innerHTML = '<div class="aj-top-spacer"></div>' + html;

        var clr = $("ajClear");
        if (clr) {
            clr.addEventListener("click", function () {
                jobHistory = [];
                lastDone = null;
                saveHistory();
                renderJobs();
            });
        }
        var clrNew = $("ajClearNew");
        if (clrNew) {
            clrNew.addEventListener("click", function () {
                inbox = [];
                inboxUnread = 0;
                var api = inboxApi();
                if (api) { api.clear().catch(function () { /* ignore */ }); }
                updateRing();
                renderJobs();
            });
        }
        Array.prototype.forEach.call(body.querySelectorAll("[data-inbox]"), function (el) {
            function open() {
                var it = inbox[+el.getAttribute("data-inbox")];
                if (!it) { return; }
                if (it.kind === "announcement") {
                    // open the announcement again (picture, text and the Open button)
                    if (window.__appUpdates && window.__appUpdates.showAnnouncement) {
                        window.__appUpdates.showAnnouncement(it);
                    }
                    return;
                }
                navigate("find", false);
                setTimeout(function () { searchFor(it.title); }, 60);
            }
            el.addEventListener("click", open);
            el.addEventListener("keydown", function (e) { if (e.key === "Enter") { open(); } });
        });
        var find = $("ajFind");
        if (find) { find.addEventListener("click", function () { navigate("find", false); }); }
    }

    // =====================================================
    // NAVIGATION (tabs + panel, with Android back button)
    // =====================================================
    function applyView(tab, jobs) {
        var wasOpen = jobsOpen;
        curTab = tab;
        jobsOpen = !!jobs;
        root.setAttribute("data-app-tab", tab);
        root.classList.toggle("app-jobs-open", jobsOpen);

        if (tabsEl) {
            Array.prototype.forEach.call(tabsEl.children, function (b) {
                var on = b.getAttribute("data-tab") === tab;
                b.classList.toggle("on", on);
                if (on) { b.setAttribute("aria-current", "page"); } else { b.removeAttribute("aria-current"); }
            });
        }

        if (jobsOpen && jobsBtn) { jobsBtn.classList.remove("has-new"); }
        if (jobsOpen) {
            // highlight what arrived since the last visit, then mark it all as seen
            if (!wasOpen) { inboxMarkAt = inboxSeen || 1; }
            if (inboxUnread) { markInboxSeen(); inboxUnread = 0; }
            loadInbox();
        } else {
            inboxMarkAt = 0;
        }
        updateRing();
        renderJobs();
        if (tab === "settings") { refreshSettings(); }
    }

    function navigate(tab, jobs) {
        if (tab === curTab && !!jobs === jobsOpen) {
            window.scrollTo(0, 0);
            return;
        }
        try { history_push({ appTab: tab, jobs: !!jobs }); } catch (e) { /* ignore */ }
        applyView(tab, jobs);
        window.scrollTo(0, 0);
    }

    function history_push(state) {
        window.history.pushState(state, "");
    }

    window.addEventListener("popstate", function (e) {
        var s = e.state;
        applyView((s && s.appTab) || "find", !!(s && s.jobs));
    });

    // =====================================================
    // SETTINGS TAB
    // =====================================================
    function setTheme(theme) {
        root.setAttribute("data-theme", theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) { meta.setAttribute("content", theme === "light" ? "#f4f6fc" : "#07080d"); }
        try { localStorage.setItem("sinsubz-theme", theme); } catch (e) { /* ignore */ }
    }

    function buildSettings() {
        settingsEl = make("section");
        settingsEl.id = "appSettings";
        settingsEl.innerHTML =
            '<h2>Settings</h2>' +

            '<div class="ap-sec">Appearance</div>' +
            '<div class="ap-card">' +
            '<button type="button" class="ap-item" id="setDark" role="switch">' +
            '<span class="ap-ic"><i class="fa-solid fa-moon"></i></span>' +
            '<span class="ap-main"><span class="ap-title">Dark mode</span>' +
            '<span class="ap-meta" style="display:block">Easier on the eyes at night</span></span>' +
            '<span class="ap-switch" id="setDarkSw"></span></button></div>' +

            (isDesktop
            ? '<div class="ap-sec">Notifications</div>' +
              '<div class="ap-card">' +
              '<button type="button" class="ap-item" id="setNotif" role="switch">' +
              '<span class="ap-ic"><i class="fa-solid fa-bell"></i></span>' +
              '<span class="ap-main"><span class="ap-title">Release alerts</span>' +
              '<span class="ap-meta" style="display:block">Pop-up when a new movie, series or Sinhala subtitle is out</span></span>' +
              '<span class="ap-switch" id="setNotifSw"></span></button>' +
              '<div class="ap-item" id="setStorage">' +
              '<span class="ap-ic"><i class="fa-solid fa-folder-open"></i></span>' +
              '<span class="ap-main"><span class="ap-title">Saved subtitles</span>' +
              '<span class="ap-meta" style="display:block">Downloads\\SinSubz</span></span></div>' +
              '</div>'
            : '') +

            (isDesktop ? '' : '<div class="ap-sec">Permissions</div>' +
            '<div class="ap-card">' +
            '<button type="button" class="ap-item" id="setNotif" role="switch">' +
            '<span class="ap-ic"><i class="fa-solid fa-bell"></i></span>' +
            '<span class="ap-main"><span class="ap-title">Notifications</span>' +
            '<span class="ap-meta" style="display:block" id="setNotifMeta">Translation progress, finished and new releases</span></span>' +
            '<span class="ap-switch" id="setNotifSw"></span></button>' +

            '<button type="button" class="ap-item" id="setStorage">' +
            '<span class="ap-ic"><i class="fa-solid fa-folder-open"></i></span>' +
            '<span class="ap-main"><span class="ap-title">Storage access</span>' +
            '<span class="ap-meta" style="display:block" id="setStorageMeta">Subtitles are saved to Download/SinSubz</span></span>' +
            '<span class="ap-state" id="setStorageState"></span></button>' +

            '<button type="button" class="ap-item" id="setBattery" hidden>' +
            '<span class="ap-ic"><i class="fa-solid fa-battery-half"></i></span>' +
            '<span class="ap-main"><span class="ap-title">Background translation</span>' +
            '<span class="ap-meta" style="display:block">Keep translating when the screen is off</span></span>' +
            '<span class="ap-state" id="setBatteryState"></span></button>' +
            '</div>') +

            '<div class="ap-sec">About</div>' +
            '<div class="ap-card">' +
            '<a class="ap-item" href="about.html"><span class="ap-ic"><i class="fa-solid fa-circle-info"></i></span><span class="ap-main"><span class="ap-title">About SinSubz</span></span></a>' +
            '<a class="ap-item" href="privacy.html"><span class="ap-ic"><i class="fa-solid fa-shield-halved"></i></span><span class="ap-main"><span class="ap-title">Privacy Policy</span></span></a>' +
            '<a class="ap-item" href="terms.html"><span class="ap-ic"><i class="fa-solid fa-file-contract"></i></span><span class="ap-main"><span class="ap-title">Terms of Service</span></span></a>' +
            '<a class="ap-item" href="contact.html"><span class="ap-ic"><i class="fa-solid fa-envelope"></i></span><span class="ap-main"><span class="ap-title">Contact</span></span></a>' +
            '</div>' +
            '<div class="ap-version">SinSubz · version ' + esc(VERSION) + '</div>';

        var main = document.querySelector("main.app") || document.body;
        main.appendChild(settingsEl);

        $("setDark").addEventListener("click", function () {
            setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
            refreshSettings();
        });

        if (isDesktop) {
            $("setNotif").addEventListener("click", function () {
                var off = alertsOff();
                try { localStorage.setItem("sinsubz_alerts_off", off ? "" : "1"); } catch (e) { /* ignore */ }
                refreshSettings();
            });
            return;
        }
        $("setNotif").addEventListener("click", onNotifTap);
        $("setStorage").addEventListener("click", onStorageTap);
        $("setBattery").addEventListener("click", function () {
            var D = plug("Downloads");
            if (D && D.openBatterySettings) {
                D.openBatterySettings().catch(function () { openAppSettings(); });
            } else {
                openAppSettings();
            }
        });
    }

    function openAppSettings(msg) {
        var D = plug("Downloads");
        if (D && D.openAppSettings) {
            D.openAppSettings().catch(function () {
                toast("Open Android Settings → Apps → SinSubz");
            });
            if (msg) { toast(msg); }
        } else {
            toast("Open Android Settings → Apps → SinSubz");
        }
    }

    function setSwitch(btnId, swId, on) {
        var sw = $(swId), b = $(btnId);
        if (sw) { sw.classList.toggle("on", !!on); }
        if (b) { b.setAttribute("aria-checked", on ? "true" : "false"); }
    }

    function notifStatus() {
        var LN = plug("LocalNotifications");
        if (!LN || !LN.checkPermissions) { return Promise.resolve("unknown"); }
        return LN.checkPermissions()
            .then(function (r) { return (r && r.display) || "unknown"; })
            .catch(function () { return "unknown"; });
    }

    function onNotifTap() {
        notifStatus().then(function (s) {
            var LN = plug("LocalNotifications");
            if (s === "granted") {
                openAppSettings("Turn notifications off in the app settings");
            } else if (s === "denied") {
                openAppSettings("Allow notifications in the app settings");
            } else if (LN && LN.requestPermissions) {
                LN.requestPermissions().then(refreshSettings).catch(refreshSettings);
            } else {
                openAppSettings();
            }
        });
    }

    function onStorageTap() {
        var D = plug("Downloads");
        if (D && D.requestStorage) {
            D.requestStorage().then(function (r) {
                if (r && r.state === "not-needed") {
                    toast("No permission needed. Files save to Download/SinSubz");
                } else if (r && r.state !== "granted") {
                    openAppSettings("Allow storage in the app settings");
                }
                refreshSettings();
            }).catch(function () { openAppSettings(); });
        } else {
            toast("Files save to Download/SinSubz");
        }
    }

    function alertsOff() {
        try { return localStorage.getItem("sinsubz_alerts_off") === "1"; } catch (e) { return false; }
    }

    function refreshSettings() {
        if (!settingsEl) { return; }

        setSwitch("setDark", "setDarkSw", root.getAttribute("data-theme") !== "light");
        if (isDesktop) {
            setSwitch("setNotif", "setNotifSw", !alertsOff());
            return;
        }

        notifStatus().then(function (s) {
            setSwitch("setNotif", "setNotifSw", s === "granted");
            var m = $("setNotifMeta");
            if (m) {
                m.textContent = s === "granted" ? "Translation progress, finished and new releases"
                    : s === "denied" ? "Blocked. Tap to open settings"
                    : "Off. Tap to allow";
            }
        });

        var D = plug("Downloads");
        var st = $("setStorageState");
        if (D && D.getStorageStatus) {
            D.getStorageStatus().then(function (r) {
                var state = r && r.state;
                if (state === "granted" || state === "not-needed") {
                    st.textContent = "Allowed";
                    st.className = "ap-state";
                } else {
                    st.textContent = "Allow";
                    st.className = "ap-state warn";
                }
                var m = $("setStorageMeta");
                if (m) { m.textContent = "Subtitles are saved to " + ((r && r.folder) || "Download/SinSubz"); }
            }).catch(function () { st.textContent = ""; });
        } else if (st) {
            st.textContent = "Ready";
            st.className = "ap-state";
        }

        var batt = $("setBattery");
        if (D && D.isBatteryUnrestricted && batt) {
            batt.hidden = false;
            D.isBatteryUnrestricted().then(function (r) {
                var bs = $("setBatteryState");
                var free = !!(r && r.unrestricted);
                bs.textContent = free ? "Unrestricted" : "Optimised";
                bs.className = "ap-state" + (free ? "" : " warn");
            }).catch(function () { /* ignore */ });
        }
    }

    // =====================================================
    // NEW RELEASES (Find tab)
    // =====================================================
    function searchFor(title) {
        var input = $("searchInput"), btn = $("searchBtn");
        if (!input || !btn) { return; }
        input.value = title;
        btn.click();
        var card = document.querySelector(".search-card");
        if (card) { card.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }

    // Opens that exact title's subtitle results (same as pressing Select on a Trending card).
    // Falls back to a name search only when TMDB had no IMDb id for the title.
    function openRelease(it) {
        if (it && it.imdbID && typeof window.selectSearchResult === "function") {
            var input = $("searchInput");
            if (input) { input.value = ""; }
            window.selectSearchResult({
                imdbID: it.imdbID,
                title: it.title,
                year: it.year,
                poster: it.poster,
                type: it.type === "series" ? "series" : "movie"
            });
            return;
        }
        searchFor(it && it.title);
    }

    function buildReleases() {
        var chips = document.querySelector(".category-chips");
        if (!chips) { return; }

        var sec = make("section");
        sec.id = "appReleases";
        sec.innerHTML = '<div class="ar-head">New releases</div><div class="ar-rail" id="arRail"></div>';
        var rail = sec.querySelector("#arRail");

        for (var i = 0; i < 4; i++) {
            rail.appendChild(make("div", "ar-card ar-skel",
                '<div class="ar-poster"></div><div class="ar-name">&nbsp;</div>'));
        }

        chips.insertAdjacentElement("afterend", sec);

        function sync() {
            var active = document.querySelector(".category-chip.active");
            var trending = !active || active.getAttribute("data-category") === "trending";
            var cr = $("categoryResults");
            var visible = trending && (!cr || cr.style.display !== "none");
            if (sec.hidden === visible) { sec.hidden = !visible; }
        }

        var card = document.querySelector(".search-card");
        if (card && window.MutationObserver) {
            new MutationObserver(sync).observe(card, {
                subtree: true, childList: true,
                attributes: true, attributeFilter: ["style", "class"]
            });
        }
        sync();

        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, 25000);

        fetch("/api/new-releases", ctrl ? { signal: ctrl.signal } : undefined)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                clearTimeout(timer);
                var items = (data && data.items) || [];
                if (!items.length) { sec.remove(); return; }
                rail.innerHTML = "";
                items.forEach(function (it) {
                    var b = make("button", "ar-card");
                    b.type = "button";
                    b.innerHTML =
                        '<div class="ar-poster">' +
                        (it.poster ? '<img loading="lazy" alt="" src="' + esc(it.poster) + '">' : "") +
                        (it.sinhala && it.sinhala.found ? '<span class="ar-tag">Sinhala</span>' : "") +
                        '</div><div class="ar-name">' + esc(it.title) + '</div>' +
                        '<div class="ar-sub">' + (it.type === "series" ? "TV" : "Movie") +
                        (it.year ? " · " + esc(it.year) : "") + '</div>';
                    b.addEventListener("click", function () { openRelease(it); });
                    rail.appendChild(b);
                });
            })
            .catch(function () {
                clearTimeout(timer);
                sec.remove();
            });
    }

    // =====================================================
    // INIT
    // =====================================================
    function init() {
        // header: progress pill (left) + notification bell (right)
        var actions = document.querySelector(".header-actions");
        function toggleJobs() {
            if (jobsOpen) { window.history.back(); } else { navigate(curTab, true); }
        }
        jobsBtn = make("button", "", '<i class="fa-solid fa-bell aj-icon"></i><span class="aj-badge"></span>');
        jobsBtn.id = "appJobsBtn";
        jobsBtn.type = "button";
        jobsBtn.setAttribute("aria-label", "Notifications");
        jobsBtn.addEventListener("click", toggleJobs);

        pillBtn = make("button", "", '<span class="aj-pbar"><i></i></span><span class="aj-ptxt"></span>');
        pillBtn.id = "appJobsPill";
        pillBtn.type = "button";
        pillBtn.setAttribute("aria-label", "Translations");
        pillBtn.addEventListener("click", toggleJobs);

        if (actions) {
            actions.insertBefore(jobsBtn, actions.firstChild);
            actions.insertBefore(pillBtn, jobsBtn);
        }

        // bottom tab bar
        tabsEl = make("nav");
        tabsEl.id = "appTabs";
        tabsEl.setAttribute("aria-label", "Main");
        TABS.forEach(function (t) {
            var b = make("button", "", '<i class="fa-solid ' + t.icon + '"></i><span>' + t.label + '</span>');
            b.type = "button";
            b.setAttribute("data-tab", t.id);
            b.addEventListener("click", function () { navigate(t.id, false); });
            tabsEl.appendChild(b);
        });
        if (isDesktop) {
            var brand = make("div", "", '<img src="logo.png" alt=""><div><b>Sin<i>Subz</i></b><small>SUBTITLE TRANSLATOR</small></div>');
            brand.id = "deskBrand";
            tabsEl.insertBefore(brand, tabsEl.firstChild);

            var nb = make("button", "", '<i class="fa-solid fa-bell"></i><span>Notifications</span><em class="dk-badge"></em>');
            nb.type = "button";
            nb.id = "deskNotifTab";
            nb.addEventListener("click", toggleJobs);
            tabsEl.insertBefore(nb, tabsEl.querySelector('button[data-tab="settings"]'));

            var jc = make("div", "", '<small>TRANSLATING</small><p></p><div class="dk-bar"><i></i></div><small class="dk-pct"></small>');
            jc.id = "deskJob";
            jc.addEventListener("click", function () { if (!jobsOpen) { navigate(curTab, true); } });
            tabsEl.appendChild(jc);

            var ver = make("div", "", "v" + esc(VERSION) + " · Windows");
            ver.id = "deskVer";
            tabsEl.appendChild(ver);
        }
        document.body.appendChild(tabsEl);

        // translations panel
        jobsEl = make("div", "",
            '<div class="aj-top"><h2>Notifications</h2>' +
            '<button type="button" class="aj-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="aj-body"></div>');
        jobsEl.id = "appJobs";
        jobsEl.setAttribute("role", "dialog");
        jobsEl.setAttribute("aria-label", "Notifications");
        jobsEl.querySelector(".aj-close").addEventListener("click", function () { window.history.back(); });
        document.body.appendChild(jobsEl);

        buildSettings();
        buildReleases();
        watchSelectedTitle();

        // hide the tab bar while the keyboard is open
        document.addEventListener("focusin", function (e) {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { root.classList.add("app-kb"); }
        });
        document.addEventListener("focusout", function () {
            setTimeout(function () {
                var a = document.activeElement;
                if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { root.classList.remove("app-kb"); }
            }, 150);
        });

        // coming back from Android settings: refresh permission states
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) { refreshSettings(); loadInbox(); }
        });

        // new-release alerts (bell): load now, then keep fresh while the app is open
        loadInbox();
        setInterval(function () { if (!document.hidden) { loadInbox(); } }, 30000);

        try { window.history.replaceState({ appTab: "find", jobs: false }, ""); } catch (e) { /* ignore */ }
        applyView("find", false);
        updateRing();
    }

    // runs after script.js's own DOMContentLoaded handler, so the
    // New releases row lands between the category chips and the grid
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
