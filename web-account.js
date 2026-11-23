/* =========================================================
   SinSubz website — Google sign-in (Firebase Auth, popup)
   Website only (wrapped in WEBONLY in index.html); the Android / Windows
   apps have their own sign-in (app-account.js).

   - Firebase JS SDK is loaded from Google's CDN only when needed
     (right after the page is idle if the visitor was signed in before,
     otherwise on the first click), so page speed is not affected.
   - Synced to Firestore users/<uid> (same document the Android app uses):
     theme and translation language. History stays untouched.
========================================================= */
(function () {
    "use strict";

    var CFG = {
        apiKey: "AIzaSyBtVA4AdmAlkwVsBnZ3rqm7vjSGEA2NAO0",
        authDomain: "sinsubz-2071.firebaseapp.com",
        projectId: "sinsubz-2071",
        appId: "1:501489259006:android:80419ea8bf00dbf35030af"
    };
    var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
    var K = { flag: "sinsubz-web-signed-in", theme: "sinsubz-theme", lang: "sinsubz-translate-language", stamp: "sinsubz-sync-stamp" };

    var host = document.getElementById("webAcct");
    if (!host) { return; }

    // resolves once we know whether the visitor is signed in (pages like profile.html wait for it)
    var readyDone = null;
    var readyP = new Promise(function (r) { readyDone = r; });
    window.__sinsubzAuthReady = function () { return readyP; };
    if (lsGetEarly() !== "1") { readyDone(); }
    setTimeout(function () { readyDone(); }, 6000);                       // never wait forever
    function lsGetEarly() { try { return localStorage.getItem("sinsubz-web-signed-in"); } catch (e) { return null; } }

    var fb = null;          // { auth, signInWithPopup, GoogleAuthProvider, signOut }
    var user = null;
    var pushTimer = null;
    var applying = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
        });
    }
    function toast(msg) {
        var t = document.createElement("div");
        t.className = "wa-toast";
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 2800);
    }

    var G_LOGO = '<svg class="wa-g" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';   // generic person icon (sign-in is not only Google any more)

    // ---------------------------------------------------------
    // UI
    // ---------------------------------------------------------
    // Premium members do not see the header "Premium" link or the plans section (CSS class on <html>)
    window.__sinsubzMarkPremium = function (on, until) {
        document.documentElement.classList.toggle("is-premium", !!on);
        try { if (on) { localStorage.setItem("sinsubz-web-premium", String(until || Date.now() + 86400e3)); } else { localStorage.removeItem("sinsubz-web-premium"); } } catch (e) { /* ignore */ }
    };

    var prof = { nick: "", pic: "", premium: false };       // nickname + picture chosen on the profile page
    function loadProfileBits() {
        if (!user || !window.__sinsubzIdToken) { return; }
        window.__sinsubzIdToken().then(function (tk) {
            return fetch("/api/stats?me=1", { headers: { Authorization: "Bearer " + tk }, cache: "no-store" });
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.signedIn) { return; }
            if ((d.nick || "") !== prof.nick || (d.pic || "") !== prof.pic || !!d.premium !== prof.premium) { prof = { nick: d.nick || "", pic: d.pic || "", premium: !!d.premium }; render(); }
            window.__sinsubzMarkPremium(!!d.premium, d.until);       // gold header badge, hides the "get Premium" section
        }).catch(function () { /* ignore */ });
    }

    function render() {
        if (!user) {
            host.innerHTML =
                '<button type="button" class="wa-btn" id="waIn" aria-label="Sign in">' +
                G_LOGO + '<span class="wa-txt">Sign in</span></button>';
            document.getElementById("waIn").addEventListener("click", signIn);
            return;
        }
        var shownName = prof.nick || user.displayName || "Signed in";
        var initial = esc((prof.nick || user.displayName || user.email || "?").trim().charAt(0).toUpperCase());
        var pic = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(prof.pic || "") ? prof.pic : user.photoURL;
        var photo = pic
            ? '<img src="' + esc(pic) + '" alt="" referrerpolicy="no-referrer">'
            : '<span>' + initial + '</span>';
        host.innerHTML =
            '<button type="button" class="wa-avatar" id="waAv" aria-haspopup="true" aria-expanded="false" ' +
            'aria-label="Account menu">' + photo + '</button>' +
            '<div class="wa-menu" id="waMenu" hidden>' +
            '<div class="wa-who"><strong>' + esc(shownName) + (prof.premium ? ' <span class="wa-prem">&#128081; Premium</span>' : '') + '</strong>' +
            '<small>' + esc(user.email) + '</small></div>' +
            '<div class="wa-plan" id="waPlan" hidden></div>' +
            '<button type="button" class="wa-out" id="waNotif"><i class="fa-solid fa-bell"></i> Notifications <span class="wa-ncount" id="waNcount" hidden></span></button>' +
            '<a class="wa-out" href="profile.html" style="text-decoration:none"><i class="fa-solid fa-user"></i> My profile &amp; downloads</a>' +
            (prof.premium ? '' : '<button type="button" class="wa-out" id="waPrem"><i class="fa-solid fa-crown" style="color:#f5b316"></i> Go Premium</button>') +
            '<button type="button" class="wa-out" id="waOut"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>' +
            '</div>';
        var menu = document.getElementById("waMenu");
        var av = document.getElementById("waAv");
        av.style.position = "relative";
        var bd = document.createElement("span");
        bd.id = "waBadge"; bd.className = "wa-nbadge"; bd.hidden = true;
        av.appendChild(bd);
        applyUnread();
        document.getElementById("waNotif").addEventListener("click", function () { menu.hidden = true; openNotifications(); });
        av.addEventListener("click", function (e) {
            e.stopPropagation();
            var open = menu.hidden;
            menu.hidden = !open;
            if (open) { loadPlan(); }
            av.setAttribute("aria-expanded", open ? "true" : "false");
        });
        document.getElementById("waOut").addEventListener("click", signOutNow);
        var wp = document.getElementById("waPrem");
        if (wp) {
            wp.addEventListener("click", function () {
                menu.hidden = true;
                if (window.__sinsubzPremiumInfo) { window.__sinsubzPremiumInfo("settings"); }
            });
        }
    }

    // ---------------------------------------------------------
    // Notifications: replies from SinSubz, Premium updates, newly released films. Red number on the profile picture.
    // ---------------------------------------------------------
    var notifUnread = 0;
    var notifTimer = 0;
    var NSTYLE = false;

    function applyUnread() {
        var b = document.getElementById("waBadge");
        var c = document.getElementById("waNcount");
        var txt = notifUnread > 9 ? "9+" : String(notifUnread);
        if (b) { b.textContent = txt; b.hidden = !notifUnread; }
        if (c) { c.textContent = txt; c.hidden = !notifUnread; }
        var av = document.getElementById("waAv");
        if (av) { av.setAttribute("aria-label", notifUnread ? "Account menu, " + notifUnread + " new notifications" : "Account menu"); }
    }

    function notifStyles() {
        if (NSTYLE) { return; }
        NSTYLE = true;
        var st = document.createElement("style");
        st.textContent =
            ".wa-nbadge{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;padding:0 3px;border-radius:99px;background:#ef3b4a;color:#fff;font:800 9px/14px system-ui,sans-serif;text-align:center;border:2px solid var(--bg,#0b0d1a);box-sizing:content-box}" +
            ".wa-ncount{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:#ef3b4a;color:#fff;font:800 11px/20px system-ui,sans-serif;text-align:center}" +
            ".wa-out:has(.wa-ncount){display:flex;align-items:center;gap:8px}" +
            ".nt-back{position:fixed;inset:0;z-index:99990;background:rgba(5,6,18,.65);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:70px 14px 20px}" +
            ".nt-card{width:100%;max-width:440px;max-height:calc(100vh - 100px);overflow:auto;background:#17192f;color:#eceaff;border:1px solid #3a3f6b;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
            ".nt-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #2c3050;position:sticky;top:0;background:#17192f;z-index:1}" +
            ".nt-head b{font-size:16px}.nt-head button{background:none;border:0;color:#9a98b8;font:inherit;font-weight:600;font-size:13px;cursor:pointer;padding:4px 8px}" +
            ".nt-sec{padding:12px 16px 4px;font:700 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#9a98b8}" +
            ".nt-item{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #23264a;padding:12px 16px;color:inherit;font:inherit;cursor:default}" +
            ".nt-item.fresh{background:rgba(143,134,255,.12)}.nt-item.click{cursor:pointer}.nt-item.click:hover{background:rgba(143,134,255,.08)}" +
            ".nt-t{font-weight:700;font-size:14.5px}.nt-b{font-size:14px;line-height:1.5;margin-top:3px;white-space:pre-wrap;word-break:break-word;opacity:.92}" +
            ".nt-q{font-size:12.5px;color:#9a98b8;margin-top:6px;border-left:2px solid #3a3f6b;padding-left:8px}.nt-m{font-size:12px;color:#9a98b8;margin-top:4px}" +
            ".nt-empty{padding:26px 16px;text-align:center;color:#9a98b8;font-size:14px}";
        document.head.appendChild(st);
    }

    function ago(t) {
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) { return "just now"; }
        if (m < 60) { return m + " min ago"; }
        if (m < 1440) { return Math.round(m / 60) + " h ago"; }
        return Math.round(m / 1440) + " d ago";
    }

    function fetchNotif(method, body) {
        if (!window.__sinsubzIdToken) { return Promise.resolve(null); }
        return window.__sinsubzIdToken().then(function (tk) {
            if (!tk) { return null; }
            return fetch("/api/stats?notif=1", {
                method: method || "GET",
                headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
                cache: "no-store"
            }).then(function (r) { return r.json(); });
        }).catch(function () { return null; });
    }

    function refreshUnread() {
        if (!user || document.hidden) { return; }
        fetchNotif("GET").then(function (d) {
            if (d && d.signedIn) { notifUnread = d.unread || 0; applyUnread(); }
        });
    }

    function startNotifPolling() {
        if (notifTimer) { return; }
        notifTimer = setInterval(refreshUnread, 3 * 60 * 1000);
        document.addEventListener("visibilitychange", function () { if (!document.hidden) { refreshUnread(); } });
    }

    function openNotifications() {
        if (document.getElementById("ntBack")) { return; }
        notifStyles();
        var back = document.createElement("div");
        back.className = "nt-back"; back.id = "ntBack";
        var card = document.createElement("div");
        card.className = "nt-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Notifications");
        back.appendChild(card);
        document.body.appendChild(back);
        function close() { if (back.parentNode) { back.parentNode.removeChild(back); } }
        back.addEventListener("click", function (e) { if (e.target === back) { close(); } });
        document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } });

        function head(hasPersonal) {
            var h = document.createElement("div"); h.className = "nt-head";
            var t = document.createElement("b"); t.textContent = "Notifications"; h.appendChild(t);
            var r = document.createElement("div");
            if (hasPersonal) {
                var cl = document.createElement("button"); cl.type = "button"; cl.textContent = "Clear";
                cl.addEventListener("click", function () { fetchNotif("POST", { action: "clear" }).then(function () { notifUnread = 0; applyUnread(); close(); }); });
                r.appendChild(cl);
            }
            var x = document.createElement("button"); x.type = "button"; x.textContent = "\u2715"; x.setAttribute("aria-label", "Close");
            x.addEventListener("click", close); r.appendChild(x);
            h.appendChild(r);
            return h;
        }
        function item(title, body, meta, fresh, quote) {
            var d = document.createElement("div"); d.className = "nt-item" + (fresh ? " fresh" : "");
            var a = document.createElement("div"); a.className = "nt-t"; a.textContent = title; d.appendChild(a);
            if (body) { var b = document.createElement("div"); b.className = "nt-b"; b.textContent = body; d.appendChild(b); }
            if (quote) { var q = document.createElement("div"); q.className = "nt-q"; q.textContent = "Your message: " + quote; d.appendChild(q); }
            if (meta) { var m = document.createElement("div"); m.className = "nt-m"; m.textContent = meta; d.appendChild(m); }
            return d;
        }
        function sec(label) { var d = document.createElement("div"); d.className = "nt-sec"; d.textContent = label; return d; }

        card.appendChild(head(false));
        var loading = document.createElement("div"); loading.className = "nt-empty"; loading.textContent = "Loading\u2026";
        card.appendChild(loading);

        var pNotif = fetchNotif("GET");
        var pRel = fetch("/api/new-releases").then(function (r) { return r.json(); }).catch(function () { return null; });
        Promise.all([pNotif, pRel]).then(function (res) {
            var n = res[0] || { items: [], seen: 0 }, rel = res[1];
            card.textContent = "";
            var mine = n.items || [];
            card.appendChild(head(mine.length > 0));
            if (mine.length) {
                card.appendChild(sec("For you"));
                mine.forEach(function (it) {
                    card.appendChild(item(it.title || "SinSubz", it.body, ago(it.t), it.t > (n.seen || 0), it.quote));
                });
            }
            var films = ((rel && rel.items) || []).slice(0, 6);
            if (films.length) {
                card.appendChild(sec("New releases"));
                films.forEach(function (f) {
                    var d = item((f.type === "series" ? "New series: " : "New movie: ") + f.title + (f.year ? " (" + f.year + ")" : ""),
                        "", f.sinhala && f.sinhala.found ? "Sinhala subtitle available" : "Find or translate subtitles", false);
                    d.classList.add("click"); d.tabIndex = 0; d.setAttribute("role", "button");
                    function go() {
                        close();
                        var inp = document.getElementById("searchInput"), btn = document.getElementById("searchBtn");
                        if (inp && btn) { inp.value = f.title; btn.click(); inp.scrollIntoView({ behavior: "smooth", block: "center" }); }
                        else { location.href = "/?q=" + encodeURIComponent(f.title); }
                    }
                    d.addEventListener("click", go);
                    d.addEventListener("keydown", function (e) { if (e.key === "Enter") { go(); } });
                    card.appendChild(d);
                });
            }
            if (!mine.length && !films.length) {
                var em = document.createElement("div"); em.className = "nt-empty"; em.textContent = "Nothing here yet."; card.appendChild(em);
            }
            // everything shown now counts as read
            if (notifUnread) { fetchNotif("POST", { action: "seen" }); notifUnread = 0; applyUnread(); }
        });
    }

    // today's usage + plan, shown inside the account menu
    function loadPlan() {
        var box = document.getElementById("waPlan");
        if (!box || !window.__sinsubzIdToken) { return; }
        window.__sinsubzIdToken().then(function (tk) {
            return fetch("/api/stats?me=1", { headers: { Authorization: "Bearer " + tk }, cache: "no-store" });
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.signedIn) { return; }
            box.textContent = "";
            box.className = "wa-plan" + (d.premium ? " pro" : "");
            var t = document.createElement("b");
            t.textContent = d.premium ? "Premium until " + new Date(d.until).toISOString().slice(0, 10) : "Free plan";
            box.appendChild(t);
            [["Films today", d.usedMovies, d.movies], ["Episodes today", d.usedEpisodes, d.episodes]].forEach(function (x) {
                var row = document.createElement("div"); row.className = "wa-row";
                var a = document.createElement("span"); a.textContent = x[0];
                var b = document.createElement("span"); b.textContent = x[1] + " / " + x[2];
                row.appendChild(a); row.appendChild(b); box.appendChild(row);
                var bar = document.createElement("div"); bar.className = "wa-bar";
                var i = document.createElement("i"); i.style.width = Math.min(100, x[2] ? Math.round(100 * x[1] / x[2]) : 0) + "%";
                bar.appendChild(i); box.appendChild(bar);
            });
            box.hidden = false;
        }).catch(function () { /* ignore */ });
    }

    // REST OF FILE CONTINUES - SEE NEXT
})();
