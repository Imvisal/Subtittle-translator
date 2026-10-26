/* SinSubz — public comments (website only).
   - Section at the bottom of the home page: newest 4 comments, "See more" up to 100, sort Newest / Oldest.
   - Writing and replying need Google sign-in (Firebase Auth); the name comes from the Google account.
   - The owner gets a green tick + "Owner" tag (decided by the server, not by this file).
   - After a translation finishes, a small popup asks for a comment (window.SinSubzComments.afterTranslate). */
(function () {
    "use strict";

    var root = document.getElementById("commentsRoot");
    if (!root) { return; }

    var CFG = {
        apiKey: "AIzaSyBtVA4AdmAlkwVsBnZ3rqm7vjSGEA2NAO0",
        authDomain: "sinsubz-2071.firebaseapp.com",
        projectId: "sinsubz-2071",
        appId: "1:501489259006:android:80419ea8bf00dbf35030af"
    };
    var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
    var FIRST = 4, MORE = 10;

    var fb = null, loading = null, current = null;
    var sort = "new", loaded = 0, total = 0, started = false;
    var els = {};
    var onAuth = [];

    function ls(k, v) {
        try { if (v === undefined) { return localStorage.getItem(k); } localStorage.setItem(k, v); } catch (e) { /* ignore */ }
        return null;
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = text; }          // textContent only: a comment can never run code
        return n;
    }

    // ------------------------------------------------------------ Google sign-in
    function loadSdk() {
        if (loading) { return loading; }
        loading = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js")]).then(function (m) {
            var auth = m[1].getAuth(m[0].initializeApp(CFG));
            fb = { auth: auth, signInWithPopup: m[1].signInWithPopup, Provider: m[1].GoogleAuthProvider };
            m[1].onAuthStateChanged(auth, function (u) {
                var changed = (!!u) !== (!!current) || (u && current && u.uid !== current.uid);
                current = u;
                onAuth.forEach(function (f) { f(); });
                if (changed && started) { reload(); }       // "mine" / delete buttons depend on who is signed in
            });
        }).catch(function () { loading = null; });
        return loading;
    }

    function signIn(noteEl) {
        if (noteEl) { noteEl.textContent = ""; }
        return loadSdk().then(function () {
            if (!fb) { if (noteEl) { noteEl.textContent = "Could not load Google sign-in. Please try again."; } return; }
            return fb.signInWithPopup(fb.auth, new fb.Provider()).catch(function (e) {
                var code = (e && e.code) || "";
                if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { return; }
                if (noteEl) { noteEl.textContent = "Sign-in failed. Please try again."; }
            });
        });
    }

    function token() { return current ? current.getIdToken() : Promise.resolve(""); }

    function api(method, qs, body) {
        return token().then(function (tok) {
            var h = { "Content-Type": "application/json" };
            if (tok) { h.Authorization = "Bearer " + tok; }
            return fetch("/api/comments" + (qs || ""), { method: method, headers: h, body: body ? JSON.stringify(body) : undefined });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
        });
    }

    // ------------------------------------------------------------ small pieces
    var COLORS = ["#7fb4ff", "#8f86ff", "#c58bff", "#36e0c8", "#ffb86b", "#ff8aa8", "#7bd88f"];
    function avatar(name) {
        var n = (name || "?").trim();
        var h = 0;
        for (var i = 0; i < n.length; i++) { h = (h * 31 + n.charCodeAt(i)) >>> 0; }
        var a = el("span", "cm-av", n.charAt(0).toUpperCase());
        a.style.background = COLORS[h % COLORS.length];
        return a;
    }

    function ago(iso) {
        var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
        if (!isFinite(s)) { return ""; }
        if (s < 60) { return "just now"; }
        if (s < 3600) { return Math.floor(s / 60) + " min ago"; }
        if (s < 86400) { return Math.floor(s / 3600) + " h ago"; }
        if (s < 86400 * 30) { return Math.floor(s / 86400) + " d ago"; }
        try { return new Date(iso).toLocaleDateString(); } catch (e) { return ""; }
    }

    var TICK =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2fbf71"/>' +
        '<path d="M7 12.5l3.3 3.3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function nameLine(c) {
        var line = el("span", "cm-name");
        if (c.owner) {
            var t = el("span", "cm-tick");
            t.innerHTML = TICK;                       // fixed markup, no user data
            t.title = "Verified owner";
            line.appendChild(t);
        }
        line.appendChild(el("b", "", c.name || "Google user"));
        if (c.owner) { line.appendChild(el("span", "cm-owner", "Owner")); }
        return line;
    }

    // ------------------------------------------------------------ composer (used by the section and the popup)
    function composer(opts) {
        var box = el("div", "cm-compose");
        var note = el("p", "cm-note");

        function paint() {
            box.textContent = "";
            if (!current) {
                var g = el("button", "cm-google", "Sign in with Google to " + (opts.reply ? "reply" : "comment"));
                g.type = "button";
                g.addEventListener("click", function () { g.disabled = true; signIn(note).then(function () { g.disabled = false; }); });
                box.appendChild(g);
                box.appendChild(note);
                return;
            }
            var ta = el("textarea");
            ta.rows = opts.reply ? 2 : 3;
            ta.maxLength = 600;
            ta.placeholder = opts.placeholder || "Write a comment...";
            var row = el("div", "cm-row");
            var as = el("span", "cm-as", "as " + (current.displayName || "Google user"));
            var btn = el("button", "cm-post", opts.reply ? "Reply" : "Post");
            btn.type = "button";
            row.appendChild(as);
            row.appendChild(btn);
            box.appendChild(ta);
            box.appendChild(row);
            box.appendChild(note);
            if (opts.autofocus) { setTimeout(function () { ta.focus(); }, 30); }

            btn.addEventListener("click", function () {
                var text = ta.value.trim();
                if (text.length < 2) { note.textContent = "Please write a little more."; return; }
                btn.disabled = true;
                note.textContent = "";
                var body = { text: text, website: "" };
                if (opts.parent) { body.parent = opts.parent; }
                if (opts.film) { body.film = opts.film; }
                api("POST", "", body).then(function (r) {
                    if (r.ok) { ta.value = ""; if (opts.done) { opts.done(r.d.comment); } }
                    else { note.textContent = (r.d && r.d.error) || "Could not post. Please try again."; }
                }).catch(function () { note.textContent = "No connection. Please try again."; })
                    .then(function () { btn.disabled = false; });
            });
        }

        onAuth.push(function () { if (document.body.contains(box)) { paint(); } });
        paint();
        return box;
    }

    // ------------------------------------------------------------ one comment
    function item(c, parent) {
        var li = el("li", "cm-item" + (c.owner ? " is-owner" : "") + (parent ? " is-reply" : ""));
        li.appendChild(avatar(c.name));
        var main = el("div", "cm-main");

        var head = el("div", "cm-head");
        head.appendChild(nameLine(c));
        head.appendChild(el("span", "cm-time", ago(c.t)));
        main.appendChild(head);

        if (c.film) { main.appendChild(el("div", "cm-film", "about " + c.film)); }
        main.appendChild(el("p", "cm-text", c.text));

        var actions = el("div", "cm-actions");
        var replyBox = el("div", "cm-replybox");
        replyBox.hidden = true;

        if (!parent) {
            var rb = el("button", "cm-link", "Reply");
            rb.type = "button";
            rb.addEventListener("click", function () {
                replyBox.hidden = !replyBox.hidden;
                if (!replyBox.hidden && !replyBox.firstChild) {
                    replyBox.appendChild(composer({
                        reply: true, parent: c.id, autofocus: true, placeholder: "Write a reply...",
                        done: function () { reload(); }
                    }));
                }
            });
            actions.appendChild(rb);
        }

        if (c.can) {
            var db = el("button", "cm-link cm-del", "Delete");
            db.type = "button";
            db.addEventListener("click", function () {
                if (!confirm("Delete this " + (parent ? "reply" : "comment") + "?")) { return; }
                api("DELETE", "?id=" + encodeURIComponent(c.id) + (parent ? "&parent=" + encodeURIComponent(parent) : "")).then(function (r) {
                    if (r.ok) { reload(); }
                });
            });
            actions.appendChild(db);
        }
        main.appendChild(actions);
        main.appendChild(replyBox);

        if (!parent && c.replies && c.replies.length) {
            var ul = el("ul", "cm-replies");
            c.replies.forEach(function (r) { ul.appendChild(item(r, c.id)); });
            main.appendChild(ul);
        }

        li.appendChild(main);
        return li;
    }

    // ------------------------------------------------------------ section
    function build() {
        root.textContent = "";
        var head = el("div", "cm-top");
        var h = el("h2", "", "Comments");
        els.count = el("span", "cm-total", "");
        h.appendChild(els.count);
        head.appendChild(h);

        var sel = el("select", "cm-sort");
        sel.setAttribute("aria-label", "Sort comments");
        [["new", "Newest"], ["old", "Oldest"]].forEach(function (o) {
            var op = el("option", "", o[1]);
            op.value = o[0];
            sel.appendChild(op);
        });
        sel.addEventListener("change", function () { sort = sel.value; reload(); });
        head.appendChild(sel);
        root.appendChild(head);

        root.appendChild(el("p", "cm-hint", "Tell us what you think about SinSubz. Sign in with Google to write a comment or reply."));

        els.compose = el("div", "cm-composewrap");
        els.compose.appendChild(composer({ done: function () { reload(); } }));
        root.appendChild(els.compose);

        els.list = el("ul", "cm-list");
        root.appendChild(els.list);
        els.more = el("button", "cm-more", "See more comments");
        els.more.type = "button";
        els.more.hidden = true;
        els.more.addEventListener("click", function () { fetchPage(MORE, true); });
        root.appendChild(els.more);
        els.empty = el("p", "cm-empty", "No comments yet. Be the first!");
        els.empty.hidden = true;
        root.appendChild(els.empty);
    }

    function fetchPage(limit, append) {
        els.more.disabled = true;
        return api("GET", "?sort=" + sort + "&offset=" + (append ? loaded : 0) + "&limit=" + limit).then(function (r) {
            els.more.disabled = false;
            if (!r.ok || r.d.enabled === false) { if (!append) { root.hidden = true; } return; }
            root.hidden = false;
            if (!append) { els.list.textContent = ""; loaded = 0; }
            total = r.d.total || 0;
            (r.d.comments || []).forEach(function (c) { els.list.appendChild(item(c, null)); });
            loaded += (r.d.comments || []).length;
            els.count.textContent = total ? " (" + total + ")" : "";
            els.more.hidden = loaded >= total;
            els.empty.hidden = total > 0;
        }).catch(function () { els.more.disabled = false; });
    }

    function reload() { return fetchPage(Math.max(FIRST, Math.min(loaded || FIRST, 30)), false); }

    function start() {
        if (started) { return; }
        started = true;
        build();
        fetchPage(FIRST, false);
        if (ls("sinsubz-web-signed-in")) { loadSdk(); }
    }

    if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (e) { if (e.some(function (x) { return x.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "600px 0px" });
        io.observe(document.getElementById("comments") || root);   // root itself is hidden until there is data
    } else { start(); }

    // ------------------------------------------------------------ popup after a translation
    function afterTranslate(label) {
        try {
            var last = Number(ls("sinsubz-cm-popup") || 0);
            if (Date.now() - last < 3 * 86400000) { return; }       // at most once every 3 days
            if (document.getElementById("cmPopup")) { return; }
            setTimeout(function () { openPopup(String(label || "").trim().slice(0, 80)); }, 1800);
        } catch (e) { /* never break the translation */ }
    }

    function openPopup(film) {
        var wrap = el("div", "cm-pop");
        wrap.id = "cmPopup";
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-modal", "true");
        var card = el("div", "cm-popcard");

        function close() { ls("sinsubz-cm-popup", String(Date.now())); wrap.remove(); }

        var x = el("button", "cm-x", "×");
        x.type = "button";
        x.setAttribute("aria-label", "Close");
        x.addEventListener("click", close);
        card.appendChild(x);
        card.appendChild(el("h3", "", "Your Sinhala subtitles are ready 🎉"));
        card.appendChild(el("p", "cm-hint", "Enjoying SinSubz? Leave a comment, it helps others find us."));
        if (film) { card.appendChild(el("div", "cm-film", "about " + film)); }

        var body = el("div");
        card.appendChild(body);

        body.appendChild(composer({
            film: film, autofocus: false, placeholder: "What did you think?",
            done: function () {
                body.textContent = "";
                body.appendChild(el("p", "cm-thanks", "Thank you! Your comment is up."));
                var see = el("button", "cm-more", "See comments");
                see.type = "button";
                see.addEventListener("click", function () { close(); start(); root.scrollIntoView({ behavior: "smooth", block: "start" }); });
                body.appendChild(see);
                start(); reload();
            }
        }));

        var later = el("button", "cm-link", "Maybe later");
        later.type = "button";
        later.addEventListener("click", close);
        card.appendChild(later);

        wrap.appendChild(card);
        wrap.addEventListener("click", function (e) { if (e.target === wrap) { close(); } });
        document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { document.removeEventListener("keydown", esc); close(); } });
        document.body.appendChild(wrap);
        loadSdk();
    }

    window.SinSubzComments = { afterTranslate: afterTranslate };
})();
