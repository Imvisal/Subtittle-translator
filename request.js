/* SinSubz: Request a title page (website only). Google sign-in, TMDB-backed search (/api/search), send to /api/stats?req=add. */
(function () {
    "use strict";
    var CFG = { apiKey: "AIzaSyBtVA4AdmAlkwVsBnZ3rqm7vjSGEA2NAO0", authDomain: "sinsubz-2071.firebaseapp.com", projectId: "sinsubz-2071", appId: "1:501489259006:android:80419ea8bf00dbf35030af" };
    var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
    var $ = function (id) { return document.getElementById(id); };
    var gate = $("rqGate"), note = $("rqGateNote"), signIn = $("rqSignIn"), box = $("rqBox"), who = $("rqWho"),
        qi = $("rqQ"), go = $("rqGo"), status = $("rqStatus"), out = $("rqResults");
    var fb = null, loading = null, current = null;

    function say(t, k) { status.textContent = t; status.className = "cf-status" + (k ? " " + k : ""); }
    function loadSdk() {
        if (loading) { return loading; }
        loading = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js")]).then(function (m) {
            var auth = m[1].getAuth(m[0].initializeApp(CFG));
            fb = { auth: auth, signInWithPopup: m[1].signInWithPopup, Provider: m[1].GoogleAuthProvider, signOut: m[1].signOut };
            m[1].onAuthStateChanged(auth, function (u) { current = u; paint(); });
        }).catch(function () { loading = null; note.textContent = "Could not load Google sign-in. Check your connection and try again."; });
        return loading;
    }
    function paint() {
        gate.hidden = !!current; box.hidden = !current;
        if (!current) { return; }
        who.textContent = "Signed in as " + (current.displayName || current.email || "Google user") + " · ";
        var b = document.createElement("button"); b.type = "button"; b.className = "cf-link"; b.textContent = "Sign out";
        b.addEventListener("click", function () { if (fb) { fb.signOut(fb.auth); } });
        who.appendChild(b);
    }
    signIn.addEventListener("click", function () {
        note.textContent = ""; signIn.disabled = true;
        loadSdk().then(function () {
            if (!fb) { return; }
            return fb.signInWithPopup(fb.auth, new fb.Provider()).catch(function (e) {
                var c = (e && e.code) || "";
                if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") { return; }
                note.textContent = "Sign-in failed. Please try again.";
            });
        }).then(function () { signIn.disabled = false; });
    });
    try { if (localStorage.getItem("sinsubz-web-signed-in")) { loadSdk(); } } catch (e) { /* ignore */ }

    function row(it) {
        var d = document.createElement("div"); d.className = "rq-item";
        var im;
        if (/^https:\/\//.test(it.poster || "")) { im = document.createElement("img"); im.src = it.poster; im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer"; }
        else { im = document.createElement("i"); }
        var t = document.createElement("div"); t.className = "rq-t";
        var b = document.createElement("b"); b.textContent = it.title || "";
        var s = document.createElement("span"); s.textContent = (it.type === "series" ? "TV series" : "Film") + (it.year ? " · " + it.year : "");
        t.appendChild(b); t.appendChild(s);
        var btn = document.createElement("button"); btn.type = "button"; btn.className = "cf-btn"; btn.textContent = "Request";
        btn.addEventListener("click", function () {
            btn.disabled = true; btn.textContent = "Sending...";
            current.getIdToken().then(function (tk) {
                return fetch("/api/stats?req=add", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
                    body: JSON.stringify({ imdb: it.imdbID, title: it.title, year: it.year, poster: it.poster, type: it.type === "series" ? "tv" : "movie" }) });
            }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
                .then(function (x) {
                    var st = x.ok && x.d.status;
                    if (st === "ready" || st === "queued") {
                        btn.textContent = st === "ready" ? "Already translated" : "Already in the queue"; 
                        if (st === "ready") { var a = document.createElement("a"); a.className = "cf-btn"; a.href = (it.type === "series" ? "/tv/" : "/film/") + it.imdbID; a.textContent = "Open"; d.appendChild(a); }
                    } else if (st) { btn.textContent = st === "again" ? "Already requested" : "Request sent ✓"; }
                    else { btn.disabled = false; btn.textContent = "Request"; say((x.d && x.d.error) || "Could not send. Try again.", "bad"); }
                }).catch(function () { btn.disabled = false; btn.textContent = "Request"; say("No connection. Please try again.", "bad"); });
        });
        var wl = document.createElement("a"); wl.className = "rq-wal"; wl.target = "_blank"; wl.rel = "noopener noreferrer"; wl.textContent = "WhatsApp";
        wl.href = "https://wa.me/94774789096?text=" + encodeURIComponent("Hi SinSubz, please add a Sinhala subtitle for: " + (it.title || "") + (it.year ? " (" + it.year + ")" : "") + " https://www.imdb.com/title/" + it.imdbID + "/");
        d.appendChild(im); d.appendChild(t); d.appendChild(btn); d.appendChild(wl);
        return d;
    }
    function search() {
        var v = qi.value.trim();
        if (v.length < 2) { return; }
        go.disabled = true; say("Searching...", ""); out.textContent = "";
        fetch("/api/search?query=" + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (d) {
            var items = (d && (d.Search || d.results || d.items)) || [];
            if (!items.length) { say("Nothing found. Check the spelling.", "bad"); return; }
            say("", "");
            items.filter(function (x) { return x.imdbID && (x.type === "movie" || x.type === "series"); }).forEach(function (x) { out.appendChild(row(x)); });
        }).catch(function () { say("Could not search. Try again.", "bad"); }).then(function () { go.disabled = false; });
    }
    var waGen = $("rqWa");
    if (waGen) { qi.addEventListener("input", function () { waGen.href = "https://wa.me/94774789096?text=" + encodeURIComponent("Hi SinSubz, please add a Sinhala subtitle for: " + qi.value.trim()); }); }
    go.addEventListener("click", search);
    qi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); search(); } });
})();
