/* SinSubz sign-in dialog (website): Google, Facebook, or Email + password (email must be verified).
   window.sinsubzLogin(firebaseAuthModule, auth) -> Promise that resolves with the user once signed in,
   or rejects with { code: "auth/cancelled-popup-request" } when the visitor closes the dialog (callers already ignore that code). */
(function () {
    "use strict";
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = text; } return n; }
    var cssDone = false;
    function css() {
        if (cssDone) { return; } cssDone = true;
        var s = document.createElement("style");
        s.textContent =
            ".lg-back{position:fixed;inset:0;z-index:99997;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,6,12,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}" +
            ".lg-box{width:100%;max-width:380px;max-height:92vh;overflow:auto;border-radius:18px;background:#11131d;border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.6);padding:22px 20px;color:#eef0fa;font-family:inherit;position:relative}" +
            ".lg-box h2{margin:0 0 4px;font-size:1.2rem}.lg-sub{margin:0 0 14px;color:#a9aec6;font-size:.9rem}" +
            ".lg-x{position:absolute;top:10px;right:12px;border:0;background:none;color:#8b90a8;font-size:22px;cursor:pointer;line-height:1}" +
            ".lg-prov{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px;margin-bottom:9px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#1a1d2b;color:#eef0fa;font:600 15px inherit;cursor:pointer}" +
            ".lg-prov:hover{background:#222638}.lg-fb{background:#1877f2;border-color:#1877f2;color:#fff}.lg-fb:hover{background:#2a82f5}" +
            ".lg-or{display:flex;align-items:center;gap:10px;margin:12px 0;color:#7e839b;font-size:.8rem}.lg-or:before,.lg-or:after{content:\"\";flex:1;height:1px;background:rgba(255,255,255,.12)}" +
            ".lg-tabs{display:flex;gap:6px;margin-bottom:10px}.lg-tabs button{flex:1;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#c9ccdd;font:600 13px inherit;cursor:pointer}" +
            ".lg-tabs button.on{background:#8381f7;border-color:#8381f7;color:#0b0c16}" +
            ".lg-in{display:block;width:100%;box-sizing:border-box;margin-bottom:9px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#0b0d16;color:#eef0fa;font:inherit}" +
            ".lg-go{width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(180deg,#9a98ff,#8381f7);color:#0b0c16;font:700 15px inherit;cursor:pointer}.lg-go:disabled{opacity:.6}" +
            ".lg-msg{min-height:18px;margin:8px 0 0;font-size:.85rem;color:#ff9aa8}.lg-msg.ok{color:#7ee2a8}" +
            ".lg-link{background:none;border:0;color:#9a9db3;font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline;padding:6px 0}";
        document.head.appendChild(s);
    }
    function nice(e) {
        var c = String((e && e.code) || "");
        if (/invalid-email/.test(c)) { return "That email address is not valid."; }
        if (/weak-password/.test(c)) { return "Password is too weak (use at least 6 characters)."; }
        if (/email-already-in-use/.test(c)) { return "This email is already registered. Use Sign in (or Google if you used Google before)."; }
        if (/user-not-found|wrong-password|invalid-credential|invalid-login/.test(c)) { return "Wrong email or password."; }
        if (/too-many-requests/.test(c)) { return "Too many tries. Please wait a few minutes."; }
        if (/account-exists-with-different-credential/.test(c)) { return "This email already has an account with another sign-in method. Use that one (for example Google)."; }
        if (/operation-not-allowed/.test(c)) { return "This sign-in method is not turned on yet."; }
        if (/unauthorized-domain/.test(c)) { return "This site is not allowed for sign-in yet."; }
        if (/network/.test(c)) { return "No connection. Please try again."; }
        return "Sign-in failed. Please try again.";
    }

    window.sinsubzLogin = function (M, auth) {
        css();
        return new Promise(function (resolve, reject) {
            var back = el("div", "lg-back"), box = el("div", "lg-box");
            box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
            var x = el("button", "lg-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close");
            var mode = "in", busy = false;
            box.appendChild(x); box.appendChild(el("h2", "", "Sign in to SinSubz")); box.appendChild(el("p", "lg-sub", "Choose how you want to sign in."));
            function prov(label, cls, make) {
                var b = el("button", "lg-prov " + (cls || ""), label); b.type = "button";
                b.addEventListener("click", function () {
                    if (busy) { return; } busy = true; msg.textContent = ""; msg.className = "lg-msg";
                    M.signInWithPopup(auth, make()).then(function (r) { done(r.user); }).catch(function (e) {
                        busy = false;
                        var c = String(e && e.code || "");
                        if (/popup-closed|cancelled-popup/.test(c)) { return; }
                        msg.textContent = nice(e);
                    });
                });
                return b;
            }
            var msg = el("p", "lg-msg");
            box.appendChild(prov("Continue with Google", "", function () { return new M.GoogleAuthProvider(); }));
            if (M.FacebookAuthProvider) { box.appendChild(prov("Continue with Facebook", "lg-fb", function () { return new M.FacebookAuthProvider(); })); }
            box.appendChild(el("div", "lg-or", "or use email"));
            var tabs = el("div", "lg-tabs"), tIn = el("button", "on", "Sign in"), tUp = el("button", "", "Create account");
            tIn.type = tUp.type = "button"; tabs.appendChild(tIn); tabs.appendChild(tUp); box.appendChild(tabs);
            var nameI = el("input", "lg-in"); nameI.placeholder = "Your name"; nameI.autocomplete = "name"; nameI.hidden = true; nameI.maxLength = 60;
            var mail = el("input", "lg-in"); mail.type = "email"; mail.placeholder = "Email"; mail.autocomplete = "email";
            var pass = el("input", "lg-in"); pass.type = "password"; pass.placeholder = "Password"; pass.autocomplete = "current-password";
            var go = el("button", "lg-go", "Sign in"); go.type = "button";
            var forgot = el("button", "lg-link", "Forgot password?"); forgot.type = "button";
            box.appendChild(nameI); box.appendChild(mail); box.appendChild(pass); box.appendChild(go); box.appendChild(forgot); box.appendChild(msg);
            function setMode(m) {
                mode = m; tIn.className = m === "in" ? "on" : ""; tUp.className = m === "up" ? "on" : "";
                nameI.hidden = m !== "up"; go.textContent = m === "up" ? "Create account" : "Sign in"; forgot.hidden = m === "up";
                pass.autocomplete = m === "up" ? "new-password" : "current-password"; msg.textContent = ""; msg.className = "lg-msg";
            }
            tIn.addEventListener("click", function () { setMode("in"); }); tUp.addEventListener("click", function () { setMode("up"); });
            function say(t, ok) { msg.textContent = t; msg.className = "lg-msg" + (ok ? " ok" : ""); }

            go.addEventListener("click", function () {
                var em = mail.value.trim(), pw = pass.value;
                if (!em || !pw) { say("Enter your email and password."); return; }
                if (busy) { return; } busy = true; go.disabled = true; say("");
                var p;
                if (mode === "up") {
                    p = M.createUserWithEmailAndPassword(auth, em, pw).then(function (cr) {
                        var u = cr.user, nm = nameI.value.trim();
                        return Promise.resolve(nm ? M.updateProfile(u, { displayName: nm }) : null).then(function () { return M.sendEmailVerification(u); })
                            .then(function () { return M.signOut(auth); })
                            .then(function () { setMode("in"); say("Account created. We sent a verification link to " + em + ". Open it, then sign in here.", true); });
                    });
                } else {
                    p = M.signInWithEmailAndPassword(auth, em, pw).then(function (cr) {
                        var u = cr.user;
                        if (!u.emailVerified) {
                            return M.sendEmailVerification(u).catch(function () { /* too soon to resend */ }).then(function () { return M.signOut(auth); })
                                .then(function () { say("Please verify your email first. We sent you a link (check Spam too), then sign in again."); });
                        }
                        done(u);
                    });
                }
                p.catch(function (e) { say(nice(e)); }).then(function () { busy = false; go.disabled = false; });
            });
            forgot.addEventListener("click", function () {
                var em = mail.value.trim();
                if (!em) { say("Type your email above first."); return; }
                M.sendPasswordResetEmail(auth, em).then(function () { say("If that email has an account, a reset link is on its way.", true); }).catch(function (e) { say(nice(e)); });
            });
            [mail, pass, nameI].forEach(function (i) { i.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { go.click(); } }); });

            function close() { if (back.parentNode) { back.parentNode.removeChild(back); } document.removeEventListener("keydown", esc); }
            function esc(ev) { if (ev.key === "Escape") { cancel(); } }
            function cancel() { close(); reject({ code: "auth/cancelled-popup-request" }); }
            function done(u) { close(); resolve(u); }
            x.addEventListener("click", cancel);
            back.addEventListener("click", function (ev) { if (ev.target === back) { cancel(); } });
            document.addEventListener("keydown", esc);
            back.appendChild(box); document.body.appendChild(back);
        });
    };
})();
