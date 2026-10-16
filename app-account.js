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
    function setUser(u) {
        user = u ? { uid: u.uid, displayName: u.displayName || "", email: u.email || "" } : null;
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
                '<span class="ap-main"><span class="ap-title">' + esc(user.displayName || "Signed in") + '</span>' +
                '<span class="ap-meta" style="display:block">' + esc(user.email) + '</span></span></div>' +
                '<button type="button" class="ap-item" id="accSync"><span class="ap-ic"><i class="fa-solid fa-rotate"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Sync now</span>' +
                '<span class="ap-meta" style="display:block">History &amp; settings are saved to your account</span></span></button>' +
                '<button type="button" class="ap-item" id="accOut"><span class="ap-ic"><i class="fa-solid fa-right-from-bracket"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Sign out</span></span></button></div>';
            $("accOut").addEventListener("click", signOut);
            $("accSync").addEventListener("click", function () {
                push().then(function () { toast("Saved"); }).catch(function () { toast("Sync failed"); });
            });
        } else {
            card.innerHTML =
                '<div class="ap-sec">Account</div><div class="ap-card">' +
                '<button type="button" class="ap-item" id="accIn"><span class="ap-ic"><i class="fa-brands fa-google"></i></span>' +
                '<span class="ap-main"><span class="ap-title">Sign in with Google</span>' +
                '<span class="ap-meta" style="display:block">Save your translation history and settings</span></span></button></div>';
            $("accIn").addEventListener("click", signIn);
        }
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
                        if (r && r.user) { setUser(r.user); sync().catch(function () { /* offline */ }); }
                    }).catch(function () { /* not signed in */ });
                }
            }
        }, 250);
    }

    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
