"use strict";

/* SinSubz — download page behaviour (website only).
   - theme toggle
   - fills in the latest version from /version.json
   - scrolls to / highlights the platform card (#android or #windows) */
(function () {

    var root = document.documentElement;

    // ---------- theme toggle ----------
    var toggle = document.getElementById("themeToggle");
    if (toggle) {
        toggle.addEventListener("click", function () {
            var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
            root.setAttribute("data-theme", next);
            try { localStorage.setItem("sinsubz-theme", next); } catch (e) { /* ignore */ }
        });
    }

    // ---------- header background once the page scrolls (ui.js does this on the main page) ----------
    var header = document.getElementById("topHeader");
    function onScroll() {
        if (header) { header.classList.toggle("scrolled", (window.scrollY || 0) > 20); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // ---------- version + download links from version.json ----------
    fetch("version.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) {
            if (!v) { return; }
            if (v.version) {
                var el = document.getElementById("dlVersion");
                var meta = document.getElementById("dlMeta");
                if (el && meta) { el.textContent = v.version; meta.hidden = false; }
            }
            var a = document.getElementById("dlAndroid");
            if (a && v.android && v.android.url) { a.href = v.android.url; }
            var w = document.getElementById("dlWindows");
            if (w && v.windows && v.windows.url) {
                w.href = v.windows.url;
                var p = document.getElementById("dlPortable");
                if (p && v.windows.url.indexOf("SinSubz-Setup.exe") !== -1) { p.href = v.windows.url.replace("SinSubz-Setup.exe", "SinSubz-Portable.exe"); }
            }
        })
        .catch(function () { /* the built-in links still work */ });

    // ---------- download counts, Android and Windows shown separately (from /api/downloads) ----------
    function fmt(n) {
        try { return Number(n).toLocaleString("en-US"); } catch (e) { return String(n); }
    }
    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) { el.textContent = text; }
    }

    fetch("/api/downloads")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            if (!d || !d.enabled) { return; }

            var android = Number(d.android) || 0;
            var winTotal = Number(d.windowsTotal) || 0;
            var installer = Number(d.windows) || 0;
            var portable = Number(d.portable) || 0;

            // hero: two boxes side by side
            setText("dlCountAndroidHero", fmt(android));
            setText("dlCountWindowsHero", fmt(winTotal));
            var hero = document.getElementById("dlCounts");
            if (hero) { hero.hidden = false; }

            // android card
            var ca = document.getElementById("dlCountAndroid");
            if (ca) {
                var cab = ca.querySelector("b");
                if (cab) { cab.textContent = fmt(android); }
                ca.hidden = false;
            }

            // windows card (installer + portable, with the split)
            var cw = document.getElementById("dlCountWindows");
            if (cw) {
                var cwb = cw.querySelector("b");
                if (cwb) { cwb.textContent = fmt(winTotal); }
                setText("dlCountWindowsSplit", "(installer " + fmt(installer) + " \u00b7 portable " + fmt(portable) + ")");
                cw.hidden = false;
            }
        })
        .catch(function () { /* counts are optional - the page works without them */ });

    // ---------- scroll to the platform card the visitor came for ----------
    function focusCard() {
        var id = (location.hash || "").replace("#", "");
        var card = id && document.querySelector('.dl-card[id="' + id + '"]');
        if (!card) { return; }
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.classList.remove("dl-flash");
        void card.offsetWidth;
        card.classList.add("dl-flash");
    }

    window.addEventListener("hashchange", focusCard);
    window.addEventListener("load", function () { setTimeout(focusCard, 150); });

})();
