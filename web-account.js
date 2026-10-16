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

    var G_LOGO =
        '<svg class="wa-g" viewBox="0 0 48 48" aria-hidden="true">' +
        '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
        '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
        '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
        '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
        '</svg>';

    // ---------------------------------------------------------
    // UI
    // ---------------------------------------------------------
    function render() {
        if (!user) {
            host.innerHTML =
                '<button type="button" class="wa-btn" id="waIn" aria-label="Sign in with Google">' +
                G_LOGO + '<span class="wa-txt">Sign in</span></button>';
            document.getElementById("waIn").addEventListener("click", signIn);
            return;
        }
        var initial = esc((user.displayName || user.email || "?").trim().charAt(0).toUpperCase());
        var photo = user.photoURL
            ? '<img src="' + esc(user.photoURL) + '" alt="" referrerpolicy="no-referrer">'
            : '<span>' + initial + '</span>';
        host.innerHTML =
            '<button type="button" class="wa-avatar" id="waAv" aria-haspopup="true" aria-expanded="false" ' +
            'aria-label="Account menu">' + photo + '</button>' +
            '<div class="wa-menu" id="waMenu" hidden>' +
            '<div class="wa-who"><strong>' + esc(user.displayName || "Signed in") + '</strong>' +
            '<small>' + esc(user.email) + '</small></div>' +
            '<button type="button" class="wa-out" id="waOut"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>' +
            '</div>';
        var menu = document.getElementById("waMenu");
        var av = document.getElementById("waAv");
        av.addEventListener("click", function (e) {
            e.stopPropagation();
            var open = menu.hidden;
            menu.hidden = !open;
            av.setAttribute("aria-expanded", open ? "true" : "false");
        });
        document.getElementById("waOut").addEventListener("click", signOutNow);
    }

    document.addEventListener("click", function (e) {
        var menu = document.getElementById("waMenu");
        if (menu && !menu.hidden && !host.contains(e.target)) { menu.hidden = true; }
    });

    // ---------------------------------------------------------
    // Firebase SDK (lazy)
    // ---------------------------------------------------------
    var loading = null;
    function loadSdk() {
        if (loading) { return loading; }
        loading = Promise.all([
            import(SDK + "firebase-app.js"),
            import(SDK + "firebase-auth.js")
        ]).then(function (m) {
            var app = m[0].initializeApp(CFG);
            var auth = m[1].getAuth(app);
            fb = {
                auth: auth,
                signInWithPopup: m[1].signInWithPopup,
                GoogleAuthProvider: m[1].GoogleAuthProvider,
                signOut: m[1].signOut
            };
            m[1].onAuthStateChanged(auth, function (u) {
                var first = !user && !!u;
                user = u ? { uid: u.uid, displayName: u.displayName || "", email: u.email || "", photoURL: u.photoURL || "" } : null;
                if (user) { lsSet(K.flag, "1"); } else { lsDel(K.flag); }
                render();
                if (first) { sync().catch(function () { /* offline */ }); }
            });
        }).catch(function (e) {
            loading = null;
            throw e;
        });
        return loading;
    }

    function signIn() {
        var btn = document.getElementById("waIn");
        if (btn) { btn.disabled = true; }
        loadSdk().then(function () {
            return fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
        }).then(function () {
            toast("Signed in");
        }).catch(function (e) {
            var code = String((e && e.code) || "");
            if (!/cancelled|closed/i.test(code)) {
                toast(/unauthorized-domain/.test(code) ? "This site is not allowed for sign-in yet" : "Sign-in failed");
            }
        }).then(function () {
            var b = document.getElementById("waIn");
            if (b) { b.disabled = false; }
        });
    }

    function signOutNow() {
        if (!fb) { return; }
        fb.signOut(fb.auth).then(function () { toast("Signed out"); });
    }

    // ---------------------------------------------------------
    // Firestore (REST + the user's ID token)
    // ---------------------------------------------------------
    function docUrl(uid, extra) {
        return "https://firestore.googleapis.com/v1/projects/" + CFG.projectId +
            "/databases/(default)/documents/users/" + encodeURIComponent(uid) + (extra || "");
    }
    function token() { return fb.auth.currentUser.getIdToken(); }

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
                translate: j("translate") || {},
                app: j("app") || {},
                updatedAt: Number((f.updatedAt && f.updatedAt.integerValue) || 0)
            };
        });
    }

    function currentTheme() { return document.documentElement.getAttribute("data-theme") || "dark"; }
    function currentLang() {
        var el = document.getElementById("language");
        return lsGet(K.lang) || (el ? el.value : "si");
    }

    function push(remote) {
        var now = Date.now();
        var app = Object.assign({}, (remote && remote.app) || {}, { theme: currentTheme() });
        var translate = Object.assign({}, (remote && remote.translate) || {}, { language: currentLang() });
        var fields = {
            translate: { stringValue: JSON.stringify(translate) },
            app: { stringValue: JSON.stringify(app) },
            updatedAt: { integerValue: String(now) }
        };
        var url;
        if (remote) {
            // existing document: only touch our three fields (history stays as it is)
            url = docUrl(user.uid, "?updateMask.fieldPaths=translate&updateMask.fieldPaths=app&updateMask.fieldPaths=updatedAt");
        } else {
            // first time: the security rules want all four fields
            fields.history = { stringValue: "[]" };
            url = docUrl(user.uid);
        }
        return token().then(function (tk) {
            return fetch(url, {
                method: "PATCH",
                headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
                body: JSON.stringify({ fields: fields })
            });
        }).then(function (res) {
            if (!res.ok) { throw new Error("push " + res.status); }
            lsSet(K.stamp, String(now));
        });
    }

    function sync() {
        return pull().then(function (remote) {
            if (!remote) { return push(null); }                         // first sign-in
            var stamp = Number(lsGet(K.stamp) || 0);
            if (remote.updatedAt > stamp) {
                applyRemote(remote);
                lsSet(K.stamp, String(remote.updatedAt));
                return null;
            }
            return push(remote);
        });
    }

    function applyRemote(remote) {
        applying = true;
        try {
            var theme = remote.app && remote.app.theme;
            if (theme && theme !== currentTheme()) {
                var tg = document.getElementById("themeToggle");
                if (tg) { tg.click(); }                                  // reuses the site's own theme code
            }
            var lang = remote.translate && remote.translate.language;
            var el = document.getElementById("language");
            if (lang && el) {
                for (var i = 0; i < el.options.length; i++) {
                    if (el.options[i].value === lang) { el.value = lang; lsSet(K.lang, lang); break; }
                }
            }
        } finally { applying = false; }
    }

    function schedulePush() {
        if (!user || applying) { return; }
        clearTimeout(pushTimer);
        pushTimer = setTimeout(function () {
            pull().then(function (remote) { return push(remote); }).catch(function () { /* next change retries */ });
        }, 2500);
    }

    var tg = document.getElementById("themeToggle");
    if (tg) { tg.addEventListener("click", schedulePush); }
    var langEl = document.getElementById("language");
    if (langEl) {
        var savedLang = lsGet(K.lang);
        if (savedLang && lsGet(K.flag) === "1") {
            for (var i = 0; i < langEl.options.length; i++) {
                if (langEl.options[i].value === savedLang) { langEl.value = savedLang; break; }
            }
        }
        langEl.addEventListener("change", function () { lsSet(K.lang, langEl.value); schedulePush(); });
    }

    // ---------------------------------------------------------
    // start
    // ---------------------------------------------------------
    render();
    if (lsGet(K.flag) === "1") {
        var go = function () { loadSdk().catch(function () { /* offline */ }); };
        if ("requestIdleCallback" in window) { requestIdleCallback(go, { timeout: 4000 }); } else { setTimeout(go, 2000); }
    }
})();
