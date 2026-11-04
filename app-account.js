/* =========================================================
   SinSubz — Android app account (Google sign-in + cloud sync)
   Only loaded in the app build (scripts/build-www.js).

   Signs in with Google through @capacitor-firebase/authentication
   and syncs three things to Firestore, one document per user
   (users/<uid>):
     - translation history   (localStorage "sinsubz-app-jobs")
     - translate settings    (the language picker)
     - app settings          (theme, release-alert switch)

   Firestore is called over its REST API with the user's Firebase
   ID token, so no bundler / Firebase JS SDK is needed. Access is
   protected by the Firestore security rules (see FIREBASE-SETUP.md).
========================================================= */
(function () {
    "use strict";

    var cap = window.Capacitor || {};
    if (!(typeof cap.getPlatform === "function" && cap.getPlatform() === "android")) { return; }

    // Filled in by scripts/build-www.js from android/app/google-services.json
    var PROJECT_ID = "__FIREBASE_PROJECT_ID__";

    var KEYS = {
        history: "sinsubz-app-jobs",
        language: "sinsubz-translate-language",
        theme: "sinsubz-theme",
        alertsOff: "sinsubz_alerts_off",
        stamp: "sinsubz-sync-stamp"      // updatedAt of the last state we pushed/pulled
    };
    var MAX_HISTORY = 12;

    var user = null;                     // { uid, displayName, email }
    var applying = false;                // true while writing remote data into localStorage
    var pushTimer = null;
    var rawSetItem = Storage.prototype.setItem;

    function auth() { return (cap.Plugins || {}).FirebaseAuthentication || null; }
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
        });
    }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { rawSetItem.call(localStorage, k, v); } catch (e) { /* ignore */ } }
    function toast(msg) {
        var t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = "position:fixed;left:50%;bottom:110px;transform:translateX(-50%);" +
            "background:#222;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;" +
            "z-index:99999;max-width:80%;text-align:center";
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 2600);
    }

    // ---------------------------------------------------------
    // local state  <->  plain object
    // ---------------------------------------------------------
    function readHistory() {
        try {
            var a = JSON.parse(lsGet(KEYS.history) || "[]");
            return Array.isArray(a) ? a : [];
        } catch (e) { return []; }
    }

    function localState() {
        var langEl = $("language");
        return {
            history: readHistory(),
            translate: { language: lsGet(KEYS.language) || (langEl ? langEl.value : "si") },
            app: {
                theme: lsGet(KEYS.theme) || document.documentElement.getAttribute("data-theme") || "dark",
                alertsOff: lsGet(KEYS.alertsOff) === "1"
            }
        };
    }

    function mergeHistory(a, b) {
        var seen = {}, out = [];
        (a || []).concat(b || []).forEach(function (j) {
            if (!j || typeof j !== "object") { return; }
            var id = String(j.t || 0) + "|" + String(j.title || "");
            if (!seen[id]) { seen[id] = 1; out.push(j); }
        });
        out.sort(function (x, y) { return (y.t || 0) - (x.t || 0); });
        return out.slice(0, MAX_HISTORY);
    }

    // returns true if anything on screen needs a refresh
    function applyRemote(remote) {
        var changed = false;
        applying = true;
        try {
            var merged = JSON.stringify(mergeHistory(remote.history, readHistory()));
            if (merged !== JSON.stringify(readHistory())) { lsSet(KEYS.history, merged); changed = true; }

            var lang = remote.translate && remote.translate.language;
            if (lang && lang !== lsGet(KEYS.language)) { lsSet(KEYS.language, lang); changed = true; }

            if (remote.app) {
                if (remote.app.theme && remote.app.theme !== lsGet(KEYS.theme)) {
                    lsSet(KEYS.theme, remote.app.theme); changed = true;
                }
                var off = remote.app.alertsOff ? "1" : "";
                if (off !== (lsGet(KEYS.alertsOff) || "")) { lsSet(KEYS.alertsOff, off); changed = true; }
            }
        } finally { applying = false; }
        return changed;
    }

    // ---------------------------------------------------------
    // Firestore REST
    // ---------------------------------------------------------
    function docUrl(uid, mask) {
        var u = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID +
            "/databases/(default)/documents/users/" + encodeURIComponent(uid);
        return mask ? u + "?" + mask : u;
    }

    function token() {
        var a = auth();
        if (!a) { return Promise.reject(new Error("no plugin")); }
        return a.getIdToken({ forceRefresh: false }).then(function (r) { return r.token; });
    }

    function pull() {
        return token().then(function (tk) {
            return fetch(docUrl(user.uid), { headers: { Authorization: "Bearer " + tk } });
        }).then(function (res) {
            if (res.status === 404) { return null; }
            if (!res.ok) { throw new Error("pull " + res.status); }
            return res.json();
        }).then(function (doc) {
            if (!doc || !doc.fields) { return null; }
            var f = doc.fields;
            function j(k) { try { return JSON.parse((f[k] && f[k].stringValue) || "null"); } catch (e) { return null; } }
            return {
                history: j("history") || [],
                translate: j("translate") || {},
                app: j("app") || {},
                updatedAt: Number((f.updatedAt && f.updatedAt.integerValue) || 0)
            };
        });
    }

    function push() {
        if (!user) { return Promise.resolve(); }
        var s = localState();
        var now = Date.now();
        var body = {
            fields: {
                history: { stringValue: JSON.stringify(s.history) },
                translate: { stringValue: JSON.stringify(s.translate) },
                app: { stringValue: JSON.stringify(s.app) },
                updatedAt: { integerValue: String(now) }
            }
        };
        return token().then(function (tk) {
            return fetch(docUrl(user.uid), {
                method: "PATCH",
                headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        }).then(function (res) {
            if (!res.ok) { throw new Error("push " + res.status); }
            lsSet(KEYS.stamp, String(now));
        });
    }

    function schedulePush() {
        if (!user || applying) { return; }
        clearTimeout(pushTimer);
        pushTimer = setTimeout(function () { push().catch(function () { /* retry on next change */ }); }, 3000);
    }

    // anything that touches a synced key (app-ui.js writes through setItem) triggers a push
    Storage.prototype.setItem = function (k) {
        var r = rawSetItem.apply(this, arguments);
        if (this === window.localStorage && (k === KEYS.history || k === KEYS.theme ||
            k === KEYS.alertsOff || k === KEYS.language)) { schedulePush(); }
        return r;
    };

    // restore the saved language, and remember changes to it
    function bindLanguage() {
        var el = $("language");
        if (!el) { return; }
        var saved = lsGet(KEYS.language);
        if (saved) {
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].value === saved) { el.value = saved; break; }
            }
        }
        el.addEventListener("change", function () { lsSet(KEYS.language, el.value); schedulePush(); });
    }

    // ---------------------------------------------------------
    // sign in / out
    // ---------------------------------------------------------
    // Plan (premium or free), asked from the server after sign-in. Premium: no ads + a badge.
    var plan = { premium: false, until: 0, movies: 0, episodes: 0 };
    window.__sinsubzUser = function () { return user; };
    window.__sinsubzIsPremium = function () { return !!plan.premium; };

    function loadPlan() {
        if (!user) { return; }
        token().then(function (tk) {
            return fetch("/api/stats?me=1", { headers: { Authorization: "Bearer " + tk } });
        }).then(function (r) { return r.json(); }).then(function (d) {
            plan = { premium: !!(d && d.premium), until: Number(d && d.until) || 0, movies: Number(d && d.movies) || 0, episodes: Number(d && d.episodes) || 0, um: Number(d && d.usedMovies) || 0, ue: Number(d && d.usedEpisodes) || 0 };
            try { localStorage.setItem("sinsubz-premium", plan.premium ? String(plan.until) : ""); } catch (e) { /* ignore */ }
            renderCard();
            try { document.dispatchEvent(new CustomEvent("sinsubz-plan", { detail: plan })); } catch (e) { /* ignore */ }
        }).catch(function () { /* offline: keep what we know */ });
    }

    function setUser(u) {
        var was = user && user.uid;
        user = u ? { uid: u.uid, displayName: u.displayName || "", email: u.email || "" } : null;
        if (user) { hideGate(); if (was !== user.uid) { loadPlan(); } } else {
            plan = { premium: false, until: 0, movies: 0, episodes: 0 };
            try { localStorage.setItem("sinsubz-premium", ""); } catch (e) { /* ignore */ }
            showGate();
        }
        renderCard();
    }

    function sync() {
        if (!user) { return Promise.resolve(); }
        return pull().then(function (remote) {
            if (!remote) { return push(); }                       // first sign-in: upload this device's data
            var changed = applyRemote(remote);
            var stamp = Number(lsGet(KEYS.stamp) || 0);
            var p = (remote.updatedAt > stamp) ? Promise.resolve() : push();
            lsSet(KEYS.stamp, String(remote.updatedAt || Date.now()));
            return p.then(function () {
                if (changed) { toast("Synced from your account"); setTimeout(function () { location.reload(); }, 700); }
            });
        });
    }

    function signIn() {
        var a = auth();
        if (!a) { toast("Sign-in is not available in this build"); return; }
        if (PROJECT_ID.indexOf("__") === 0) { toast("Firebase is not configured yet"); return; }
        a.signInWithGoogle().then(function (r) {
            setUser(r && r.user);
            return sync();
        }).catch(function (e) {
            var m = String((e && e.message) || e || "");
            if (!/cancel/i.test(m)) { toast("Sign-in failed"); }
        });
    }

    // used by script.js: translating needs a Google account
    window.__sinsubzIdToken = function () { return token().catch(function () { return ""; }); };
    window.__sinsubzSignIn = function () {
        var pl = auth();
        if (!pl) { return Promise.resolve(); }
        return pl.signInWithGoogle().then(function (r) { setUser(r && r.user); sync(); }).catch(function () { /* cancelled */ });
    };

    function signOut() {
        var a = auth();
        var p = user ? push().catch(function () { /* best effort */ }) : Promise.resolve();
        p.then(function () { return a && a.signOut(); }).then(function () {
            setUser(null);
            toast("Signed out");
        });
    }

    // ---------------------------------------------------------
    // Account card at the top of the Settings tab
    // ---------------------------------------------------------
    function renderCard() {
        var host = $("appSettings");
        if (!host) { return; }
        var card = $("accCard");
        if (!card) {
            var h2 = host.querySelector("h2");
            card = document.createElement("div");
            card.id = "accCard";
            if (h2 && h2.nextSibling) { host.insertBefore(card, h2.nextSibling); } else { host.appendChild(card); }
        }
        if (user) {
            card.innerHTML =
                '<div class="ap-sec">Account</div><div class="ap-card">' +
                '<div class="ap-item"><span class="ap-ic"><i class="fa-solid fa-circle-user"></i></span>' +
                '<span class="ap-main"><span class="ap-title">' + esc(user.displayName || "Signed in") + (plan.premium ? ' <span style="background:linear-gradient(135deg,#f7c948,#f59e0b);color:#2a1d00;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;vertical-align:middle">PREMIUM</span>' : '') + '</span>' +
                '<span class="ap-meta" style="display:block">' + esc(user.email) + '</span>' +
                '<span class="ap-meta" style="display:block">' + (plan.premium
                    ? 'Premium until ' + new Date(plan.until).toISOString().slice(0, 10) + (plan.movies ? ' · no ads' : '')
                    : (plan.movies ? 'Free plan' : '')) + '</span>' +
                (plan.movies ? '<span class="ap-meta" style="display:block">Today: films ' + plan.um + ' / ' + plan.movies + ' · episodes ' + plan.ue + ' / ' + plan.episodes + '</span>' : '') + '</span></div>' +
                (plan.premium ? '' : '<button type="button" class="ap-item" id="accPrem"><span class="ap-ic"><i class="fa-solid fa-crown" style="color:#f5b316"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Go Premium</span>' +
                '<span class="ap-meta" style="display:block">More films per day, no ads</span></span></button>') +
                '<a class="ap-item" href="https://sinsubs.site/profile.html" target="_blank" rel="noopener"><span class="ap-ic"><i class="fa-solid fa-user"></i></span>' +
                '<span class="ap-main"><span class="ap-title">My profile &amp; downloads</span>' +
                '<span class="ap-meta" style="display:block">Name, picture and your saved subtitles</span></span></a>' +
                '<button type="button" class="ap-item" id="accSync"><span class="ap-ic"><i class="fa-solid fa-rotate"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Sync now</span>' +
                '<span class="ap-meta" style="display:block">History &amp; settings are saved to your account</span></span></button>' +
                '<button type="button" class="ap-item" id="accOut"><span class="ap-ic"><i class="fa-solid fa-right-from-bracket"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Sign out</span></span></button></div>';
            $("accOut").addEventListener("click", signOut);
            if ($("accPrem")) { $("accPrem").addEventListener("click", function () { if (window.__sinsubzPremiumInfo) { window.__sinsubzPremiumInfo("settings"); } }); }
            $("accSync").addEventListener("click", function () {
                push().then(function () { toast("Saved"); }).catch(function () { toast("Sync failed"); });
            });
        } else {
            card.innerHTML =
                '<div class="ap-sec">Account</div><div class="ap-card acc-signin">' +
                '<p class="acc-note">Save your translation history and settings, and use them on any phone.</p>' +
                '<button type="button" class="acc-gbtn" id="accIn">' +
                '<svg class="acc-glogo" viewBox="0 0 48 48" aria-hidden="true">' +
                '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
                '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
                '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
                '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
                '</svg><span>Sign in with Google</span></button></div>';
            $("accIn").addEventListener("click", signIn);
        }
    }

    // ---------------------------------------------------------
    // Sign-in screen shown when the app opens and nobody is signed in
    // ---------------------------------------------------------
    var gateSkipped = false;

    function hideGate() {
        var g = $("loginGate");
        if (g && g.parentNode) { g.parentNode.removeChild(g); }
    }

    function showGate() {
        if (user || gateSkipped || $("loginGate")) { return; }
        var g = document.createElement("div");
        g.id = "loginGate";
        g.style.cssText = "position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;overflow:auto;" +
            "background:#0b0d1f;color:#fff;font-family:system-ui,sans-serif";
        var gl = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
        g.innerHTML =
            '<div style="position:relative;flex:0 0 46%;min-height:240px;overflow:hidden">' +
            '<img src="hero-banner.webp" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' +
            '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,13,31,.1) 0%,rgba(11,13,31,.55) 60%,#0b0d1f 100%)"></div>' +
            '<div style="position:absolute;left:0;right:0;bottom:12px;text-align:center">' +
            '<img src="logo.png" alt="" width="64" height="64" style="border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.5)">' +
            '<div style="font-size:26px;font-weight:800;margin-top:6px">SinSubz</div></div></div>' +
            '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 26px 22px;text-align:center">' +
            '<div style="font-size:15px;opacity:.85;max-width:320px;line-height:1.5">AI English to Sinhala subtitles for movies and TV series. Sign in with Google to start translating.</div>' +
            '<button id="gateIn" type="button" style="margin-top:6px;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:320px;padding:14px 22px;border:0;border-radius:14px;background:#fff;color:#1f1f1f;font-size:16px;font-weight:700">' + gl +
            '<span>Sign in with Google</span></button>' +
            '<div style="font-size:12px;opacity:.6;max-width:300px;line-height:1.5">By signing in you agree to our ' +
            '<a href="https://sinsubs.site/terms.html" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">Terms of Service</a> and ' +
            '<a href="https://sinsubs.site/privacy.html" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline">Privacy Policy</a>.</div>' +
            '<button id="gateSkip" type="button" style="background:none;border:0;color:#fff;opacity:.6;font-size:14px;text-decoration:underline">Not now</button></div>';
        document.body.appendChild(g);
        $("gateIn").addEventListener("click", function () { signIn(); });
        $("gateSkip").addEventListener("click", function () { gateSkipped = true; hideGate(); });
    }

    function start() {
        bindLanguage();
        // the Settings tab is built by app-ui.js; wait for it, then add the card
        var tries = 0;
        var iv = setInterval(function () {
            tries++;
            if ($("appSettings") || tries > 40) {
                clearInterval(iv);
                renderCard();
                var a = auth();
                if (a && a.getCurrentUser) {
                    a.getCurrentUser().then(function (r) {
                        if (r && r.user) { setUser(r.user); sync().catch(function () { /* offline */ }); } else { showGate(); }
                    }).catch(function () { showGate(); });
                } else { showGate(); }
            }
        }, 250);
    }

    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
