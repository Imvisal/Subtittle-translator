/* SinSubz: Contact page message form (website only).
   The visitor signs in with Google (Firebase Auth, same project as the rest of the site); the server
   reads the name and email from the Google account, so nothing is typed except the message. */
(function () {
    "use strict";

    var form = document.getElementById("contactForm");
    if (!form) { return; }

    var CFG = {
        apiKey: "AIzaSyBtVA4AdmAlkwVsBnZ3rqm7vjSGEA2NAO0",
        authDomain: "sinsubz-2071.firebaseapp.com",
        projectId: "sinsubz-2071",
        appId: "1:501489259006:android:80419ea8bf00dbf35030af"
    };
    var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";

    var gate = document.getElementById("cfGate");
    var gateNote = document.getElementById("cfGateNote");
    var signInBtn = document.getElementById("cfSignIn");
    var who = document.getElementById("cfWho");
    var btn = document.getElementById("cfBtn");
    var status = document.getElementById("cfStatus");
    var count = document.getElementById("cfCount");
    var msg = form.elements.message;

    var fb = null, loading = null, current = null;

    function say(text, kind) {
        status.textContent = text;
        status.className = "cf-status" + (kind ? " " + kind : "");
    }

    function loadSdk() {
        if (loading) { return loading; }
        loading = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js")]).then(function (m) {
            var auth = m[1].getAuth(m[0].initializeApp(CFG));
            fb = { auth: auth, signInWithPopup: m[1].signInWithPopup, Provider: m[1].GoogleAuthProvider, signOut: m[1].signOut };
            m[1].onAuthStateChanged(auth, function (u) { current = u; paint(); });
        }).catch(function () {
            loading = null;
            gateNote.textContent = "Could not load Google sign-in. Check your connection and try again.";
        });
        return loading;
    }

    function paint() {
        var on = !!current;
        gate.hidden = on;
        form.hidden = !on;
        if (!on) { return; }
        who.textContent = "";
        var line = document.createElement("span");
        line.textContent = "Sending as ";
        var b = document.createElement("strong");
        b.textContent = (current.displayName || "Google user") + (current.email ? " (" + current.email + ")" : "");
        var out = document.createElement("button");
        out.type = "button";
        out.className = "cf-link";
        out.textContent = "Not you? Sign out";
        out.addEventListener("click", function () { if (fb) { fb.signOut(fb.auth); } });
        who.appendChild(line); who.appendChild(b); who.appendChild(out);
    }

    signInBtn.addEventListener("click", function () {
        gateNote.textContent = "";
        signInBtn.disabled = true;
        loadSdk().then(function () {
            if (!fb) { return; }
            return fb.signInWithPopup(fb.auth, new fb.Provider()).catch(function (e) {
                var code = (e && e.code) || "";
                if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { return; }
                gateNote.textContent = code === "auth/unauthorized-domain"
                    ? "This website address is not allowed for Google sign-in yet."
                    : "Sign-in failed. Please try again.";
            });
        }).then(function () { signInBtn.disabled = false; });
    });

    // already signed in on another page of the site: pick the session up straight away
    try { if (localStorage.getItem("sinsubz-web-signed-in")) { loadSdk(); } } catch (e) { /* ignore */ }

    msg.addEventListener("input", function () { count.textContent = msg.value.length + " / 2000"; });

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        var text = msg.value.trim();
        if (!current) { paint(); return; }
        if (text.length < 5) { say("Please write a little more.", "bad"); msg.focus(); return; }

        btn.disabled = true;
        say("Sending...", "");

        current.getIdToken().then(function (token) {
            return fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify({ message: text, website: form.elements.website.value })
            });
        })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                if (x.ok) {
                    form.elements.message.value = "";
                    count.textContent = "0 / 2000";
                    say("Thank you! Your message was sent.", "ok");
                } else {
                    say((x.d && x.d.error) || "Could not send. Please try again.", "bad");
                }
            })
            .catch(function () { say("No connection. Please try again.", "bad"); })
            .then(function () { btn.disabled = false; });
    });
})();
