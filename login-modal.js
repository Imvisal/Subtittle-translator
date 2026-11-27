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
            ".lg-prov{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:12px;margin-bottom:10px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#1a1d2b;color:#eef0fa;font:600 15px inherit;cursor:pointer;transition:background .15s,transform .1s}.lg-prov:active{transform:scale(.98)}" +
            ".lg-ic{width:22px;height:22px;display:inline-flex}.lg-ic svg{width:22px;height:22px}" +
            ".lg-g{background:#fff;border-color:#fff;color:#1f1f1f}.lg-g:hover{background:#f1f3f8}.lg-fb{background:#1877f2;border-color:#1877f2;color:#fff}.lg-fb:hover{background:#2a82f5}" +
            ".lg-or{display:flex;align-items:center;gap:10px;margin:12px 0;color:#7e839b;font-size:.8rem}.lg-or:before,.lg-or:after{content:\"\";flex:1;height:1px;background:rgba(255,255,255,.12)}" +
            ".lg-tabs{display:flex;gap:6px;margin-bottom:10px}.lg-tabs button{flex:1;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#c9ccdd;font:600 13px inherit;cursor:pointer}" +
            ".lg-tabs button.on{background:#8381f7;border-color:#8381f7;color:#0b0c16}" +
            ".lg-in{display:block;width:100%;box-sizing:border-box;margin-bottom:9px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#0b0d16;color:#eef0fa;font:inherit}" +
            ".lg-keep{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:.9rem;color:#c9ccdd;cursor:pointer;user-select:none}.lg-keep input{width:17px;height:17px;accent-color:#8381f7;margin:0}" +
            ".lg-pw{position:relative}.lg-pw .lg-in{padding-right:44px}.lg-eye{position:absolute;right:4px;top:0;height:calc(100% - 9px);width:42px;border:0;background:none;color:#9a9db3;cursor:pointer;display:flex;align-items:center;justify-content:center}.lg-eye:hover{color:#eef0fa}" +
            ".lg-in[hidden]{display:none}.lg-go{width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(180deg,#9a98ff,#8381f7);color:#0b0c16;font:700 15px inherit;cursor:pointer}.lg-go:disabled{opacity:.6}" +
            ".lg-msg{min-height:18px;margin:8px 0 0;font-size:.85rem;color:#ff9aa8}.lg-msg.ok{color:#7ee2a8}" +
            ".lg-link{background:none;border:0;color:#9a9db3;font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline;padding:6px 0}";
        document.head.appendChild(s);
    }
    var ICON_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>', ICON_F = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>';
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
            function prov(label, cls, icon, make) {
                var b = el("button", "lg-prov " + (cls || "")); b.type = "button";
                var ic = el("span", "lg-ic"); ic.innerHTML = icon; b.appendChild(ic); b.appendChild(el("span", "", label));
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
            // "Stay signed in": on = stays signed in on this device (default); off = signed out when the browser is closed
            var keep = el("label", "lg-keep"), cb = el("input"); cb.type = "checkbox"; cb.checked = true;
            keep.appendChild(cb); keep.appendChild(el("span", "", "Stay signed in"));
            cb.addEventListener("change", function () {
                try { M.setPersistence(auth, cb.checked ? M.browserLocalPersistence : M.browserSessionPersistence).catch(function () { /* keep the default */ }); } catch (e) { /* older SDK */ }
            });
            box.appendChild(keep);
            box.appendChild(prov("Continue with Google", "lg-g", ICON_G, function () { return new M.GoogleAuthProvider(); }));
            if (M.FacebookAuthProvider) { box.appendChild(prov("Continue with Facebook", "lg-fb", ICON_F, function () { return new M.FacebookAuthProvider(); })); }
            box.appendChild(el("div", "lg-or", "or use email"));
            var tabs = el("div", "lg-tabs"), tIn = el("button", "on", "Sign in"), tUp = el("button", "", "Create account");
            tIn.type = tUp.type = "button"; tabs.appendChild(tIn); tabs.appendChild(tUp); box.appendChild(tabs);
            var nameI = el("input", "lg-in"); nameI.placeholder = "Username"; nameI.autocomplete = "username"; nameI.hidden = true; nameI.maxLength = 60;
            var mail = el("input", "lg-in"); mail.type = "email"; mail.placeholder = "Email"; mail.autocomplete = "email";
            var pass = el("input", "lg-in"); pass.type = "password"; pass.placeholder = "Password"; pass.autocomplete = "current-password";
            var go = el("button", "lg-go", "Sign in"); go.type = "button";
            var forgot = el("button", "lg-link", "Forgot password?"); forgot.type = "button";
            var pw = el("div", "lg-pw"), eye = el("button", "lg-eye"); eye.type = "button"; eye.setAttribute("aria-label", "Show password");
            var EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            var EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            eye.innerHTML = EYE;
            eye.addEventListener("click", function () {
                var show = pass.type === "password"; pass.type = show ? "text" : "password";
                eye.innerHTML = show ? EYE_OFF : EYE; eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); pass.focus();
            });
            pw.appendChild(pass); pw.appendChild(eye);
            box.appendChild(nameI); box.appendChild(mail); box.appendChild(pw); box.appendChild(go); box.appendChild(msg); box.appendChild(forgot);
            function setMode(m) {
                mode = m; tIn.className = m === "in" ? "on" : ""; tUp.className = m === "up" ? "on" : "";
                nameI.hidden = m !== "up"; go.textContent = m === "up" ? "Create account" : "Sign in"; forgot.hidden = m === "up";
                pass.autocomplete = m === "up" ? "new-password" : "current-password"; msg.textContent = ""; msg.className = "lg-msg";
            }
            tIn.addEventListener("click", function () { setMode("in"); }); tUp.addEventListener("click", function () { setMode("up"); });
            function say(t, ok) { msg.textContent = t; msg.className = "lg-msg" + (ok ? " ok" : ""); try { msg.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }

            go.addEventListener("click", function () {
                var em = mail.value.trim(), pw = pass.value;
                if (!em || !pw) { say("Enter your email and password."); return; }
                if (mode === "up" && !/^[A-Za-z0-9._-]{3,30}$/.test(nameI.value.trim())) { say("Choose a username: 3 to 30 letters, numbers, dot, dash or underscore."); return; }
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
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say("That email address is not valid."); return; }
                forgot.disabled = true; say("Sending\u2026", true);
                M.sendPasswordResetEmail(auth, em).then(function () { say("If that email has an account, a reset link is on its way. Check Spam / Promotions too. (If you signed up with Google, there is no password: use the Google button.)", true); })
                    .catch(function (e) { var c = String((e && e.code) || ""); say(/user-not-found/.test(c) ? "No account with that email." : (/invalid-email|too-many|network/.test(c) ? nice(e) : "Could not send the email (" + (c || "error") + "). Please try again.")); })
                    .then(function () { forgot.disabled = false; });
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
