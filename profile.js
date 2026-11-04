/* SinSubz profile page: nickname, picture, today's usage and the saved Sinhala subtitles ("My translations").
   Everything is written with textContent / DOM nodes. Saved subtitles can be downloaded again by Premium members. */
(function () {
    "use strict";
    var box = document.getElementById("pfBox");
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = text; } return n; }
    function token() { return window.__sinsubzIdToken ? window.__sinsubzIdToken().catch(function () { return ""; }) : Promise.resolve(""); }
    function api(url, opt) {
        return token().then(function (tk) {
            opt = opt || {};
            opt.headers = Object.assign({ "Content-Type": "application/json" }, tk ? { Authorization: "Bearer " + tk } : {}, opt.headers || {});
            opt.cache = "no-store";
            return fetch(url, opt);
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || "Failed"); e.code = d.code; e.status = r.status; throw e; } return d; }); });
    }

    // square crop -> 160 px JPEG under ~40 KB
    function shrinkAvatar(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                var side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
                var c = document.createElement("canvas"); c.width = c.height = 160;
                c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, 160, 160);
                URL.revokeObjectURL(url);
                var q = 0.85, out = c.toDataURL("image/jpeg", q);
                while (out.length > 40000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
                out.length > 44000 ? reject(new Error("Picture is too big")) : resolve(out);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read that picture")); };
            img.src = url;
        });
    }

    function modal(title, text, buttons) {
        var wrap = el("div", "pf-modal"), card = el("div");
        var crown = el("div", "pm-crown"); crown.style.cssText = "width:56px;height:56px;border-radius:18px;margin:0 auto";
        crown.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="#3a2600" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>';   // fixed markup
        card.appendChild(crown); card.appendChild(el("h3", "", title)); card.appendChild(el("p", "", text));
        buttons.forEach(function (b) { card.appendChild(b); });
        wrap.appendChild(card);
        wrap.addEventListener("click", function (e) { if (e.target === wrap) { wrap.remove(); } });
        document.body.appendChild(wrap);
        return wrap;
    }
    function premiumAsk() {
        var go = el("a", "pm-btn", "Get Premium"); go.href = "premium.html";
        var no = el("button", "pm-copy", "Not now"); no.type = "button"; no.style.cssText = "display:block;margin:10px auto 0;border:0;opacity:.7";
        var w = modal("Downloads are for Premium", "Your Sinhala subtitles are saved here. Premium members can download them again any time, on any device.", [go, no]);
        no.addEventListener("click", function () { w.remove(); });
    }

    function saveFile(name, text) {
        var blob = new Blob(["﻿", text], { type: "application/x-subrip;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }

    function when(t) { try { return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }

    function render(me, list) {
        box.textContent = "";
        if (!me.signedIn) {
            var c = el("div", "pf-card"); c.style.textAlign = "center";
            c.appendChild(el("p", "", "Sign in with Google to see your profile and your saved subtitles."));
            var b = el("button", "pm-btn g", "Sign in with Google"); b.type = "button";
            b.addEventListener("click", function () { b.disabled = true; (window.__sinsubzSignIn ? window.__sinsubzSignIn() : Promise.resolve()).catch(function () { /* cancelled */ }).then(load); });
            c.appendChild(b); box.appendChild(c); return;
        }
        var user = window.__sinsubzUser ? window.__sinsubzUser() : null;
        var name = me.nick || (user && user.displayName) || "";

        // ---- identity card
        var card = el("div", "pf-card"), top = el("div", "pf-top");
        var av = el("label", "pf-av"), file = el("input"); file.type = "file"; file.accept = "image/*";
        function paintAvatar(pic) {
            av.textContent = "";
            if (pic) { var im = el("img"); im.src = pic; im.alt = ""; av.appendChild(im); }
            else if (user && user.photoURL) { var g = el("img"); g.src = user.photoURL; g.alt = ""; g.referrerPolicy = "no-referrer"; av.appendChild(g); }
            else { av.appendChild(document.createTextNode((name || "?").charAt(0).toUpperCase())); }
            av.appendChild(el("span", "cam", "Change")); av.appendChild(file);
        }
        paintAvatar(me.pic);
        var who = el("div", "pf-who");
        who.appendChild(el("small", "", (user && user.email) || ""));
        var row = el("div", "pf-name"), nick = el("input", "pm-input"); nick.maxLength = 24; nick.value = name; nick.placeholder = "Your name";
        var save = el("button", "pf-save", "Save"); save.type = "button";
        row.appendChild(nick); row.appendChild(save); who.appendChild(row);
        var hint = el("p", "pf-hint", "This name and picture show on your comments.");
        who.appendChild(hint);
        top.appendChild(av); top.appendChild(who); card.appendChild(top);
        if (me.premium) { var bd = el("span", "pf-badge", "👑 Premium"); who.insertBefore(bd, who.firstChild); bd.style.marginLeft = "0"; bd.style.marginBottom = "6px"; }

        function say(t, cls) { hint.textContent = t; hint.className = "pf-hint" + (cls ? " " + cls : ""); }
        save.addEventListener("click", function () {
            save.disabled = true; say("Saving…");
            api("/api/stats?profile=1", { method: "POST", body: JSON.stringify({ nick: nick.value.trim() }) })
                .then(function () { say("Saved ✓", "ok"); }).catch(function (e) { say(e.message, "err"); }).then(function () { save.disabled = false; });
        });
        file.addEventListener("change", function () {
            if (!file.files[0]) { return; }
            say("Uploading…");
            shrinkAvatar(file.files[0]).then(function (pic) {
                return api("/api/stats?profile=1", { method: "POST", body: JSON.stringify({ pic: pic }) }).then(function () { paintAvatar(pic); say("Picture saved ✓", "ok"); });
            }).catch(function (e) { say(e.message, "err"); });
        });

        // ---- usage today
        var use = el("div", "pf-use" + (me.premium ? " pro" : ""));
        use.appendChild(el("div", "r", me.premium ? "Premium until " + when(me.until) : "Free plan")).style.fontWeight = "800";
        use.firstChild.style.marginBottom = "6px";
        [["Films today", me.usedMovies, me.movies], ["Episodes today", me.usedEpisodes, me.episodes]].forEach(function (x) {
            var r = el("div", "r"); r.appendChild(el("span", "", x[0])); r.appendChild(el("span", "", x[1] + " / " + x[2])); use.appendChild(r);
            var bar = el("div", "b"), i = el("i"); i.style.width = Math.min(100, x[2] ? Math.round(100 * x[1] / x[2]) : 0) + "%"; bar.appendChild(i); use.appendChild(bar);
        });
        if (!me.premium) { var up = el("a", "", "👑 Go Premium"); up.href = "premium.html"; use.appendChild(up); }
        card.appendChild(use);
        box.appendChild(card);

        // ---- my translations
        var h = el("div", "pf-h"); h.appendChild(el("h2", "", "My translations"));
        h.appendChild(el("small", "", list.items.length ? list.items.length + " saved · kept " + list.keepDays + " days" : ""));
        box.appendChild(h);
        if (!list.items.length) {
            var em = el("div", "pf-empty"); em.appendChild(document.createTextNode("Nothing here yet. Translate a film or episode and it will appear here. "));
            var a0 = el("a", "", "Translate now"); a0.href = "index.html#search"; em.appendChild(a0); box.appendChild(em); return;
        }
        var grid = el("div", "pf-grid");
        list.items.forEach(function (it) {
            var item = el("div", "pf-item"), poster = el("div", "pf-poster");
            if (it.poster) { var im = el("img"); im.src = it.poster; im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer"; poster.appendChild(im); } else { poster.appendChild(document.createTextNode("🎬")); }
            poster.appendChild(el("span", "pf-type", it.type === "tv" ? "TV" : "Film"));
            var del = el("button", "pf-del", "✕"); del.type = "button"; del.title = "Remove";
            del.addEventListener("click", function () {
                if (!window.confirm("Remove “" + it.title + "” from your saved subtitles?")) { return; }
                api("/api/stats?mytr=del&id=" + it.id, { method: "POST", body: "{}" }).then(load).catch(function (e) { window.alert(e.message); });
            });
            poster.appendChild(del);
            var cap = el("div", "pf-cap"); cap.appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : ""))); cap.appendChild(el("small", "", when(it.t)));
            poster.appendChild(cap);
            var dl = el("button", "pf-dl" + (list.premium ? "" : " free"), list.premium ? "⬇ Download" : "🔒 Download"); dl.type = "button";
            dl.addEventListener("click", function () {
                if (!list.premium) { premiumAsk(); return; }
                dl.disabled = true;
                api("/api/stats?mytr=get&id=" + it.id).then(function (d) { saveFile(d.filename, d.srt); })
                    .catch(function (e) { if (e.code === "PREMIUM_ONLY") { premiumAsk(); } else { window.alert(e.message); } })
                    .then(function () { dl.disabled = false; });
            });
            item.appendChild(poster); item.appendChild(dl); grid.appendChild(item);
        });
        box.appendChild(grid);
    }

    function load() {
        Promise.all([api("/api/stats?me=1"), api("/api/stats?mytr=list").catch(function () { return { items: [], keepDays: 60 }; })])
            .then(function (r) { render(r[0], r[1]); })
            .catch(function () { box.textContent = ""; box.appendChild(el("p", "", "Could not load. Try again.")); });
    }

    (function wait(n) {
        if (window.__sinsubzAuthReady) { window.__sinsubzAuthReady().then(load); } else if (n > 40) { load(); } else { setTimeout(function () { wait(n + 1); }, 100); }
    })(0);
})();
