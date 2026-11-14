/* SinSubz — "Suggest it for the Ready list" (website only).
   After a visitor translates an uploaded .srt file, a small window lets them pick the film / series it belongs to
   and send it to the owner. Nothing is public until the owner approves it in the admin panel.
   Needs Google sign-in (the same account the rest of the site uses). Called from script.js: window.__sinsubzSuggest(srt, filename, label) */
(function () {
    "use strict";

    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = text; } return n; }

    function guess(label) {
        var t = String(label || "").replace(/\.srt$/i, "").replace(/[._]+/g, " ");
        var m = /\bs(\d{1,2})\s?e(\d{1,3})\b/i.exec(t);
        var name = t.replace(/\bs\d{1,2}\s?e\d{1,3}\b.*$/i, "").replace(/\b(19|20)\d{2}\b.*$/, "").replace(/\b(720p|1080p|2160p|4k|web|bluray|brrip|hdrip|x264|x265)\b.*$/i, "").replace(/\s+/g, " ").trim();
        return { q: name, s: m ? m[1] : "", e: m ? m[2] : "" };
    }

    window.__sinsubzSuggest = function (srt, filename, label) {
        try {
            if (!srt || document.getElementById("sgWrap")) { return; }
            if (localStorage.getItem("sinsubz-suggest-off") === "1") { return; }
        } catch (e) { /* ignore */ }
        var g = guess(label || filename);
        var picked = null;

        var wrap = el("div", "cm-pop"); wrap.id = "sgWrap";
        wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
        var card = el("div", "cm-popcard");
        function close() { wrap.remove(); }
        var x = el("button", "cm-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", close);
        card.appendChild(x);
        card.appendChild(el("h3", "", "Share it on SinSubz?"));
        card.appendChild(el("p", "cm-hint", "Pick the film or series this subtitle is for and we will check it. If it is good it gets its own page, so others can download it too."));
        var body = el("div"); card.appendChild(body);

        function note(t, bad) { var n = body.querySelector(".sg-note"); if (!n) { n = el("p", "cm-hint sg-note"); body.appendChild(n); } n.textContent = t; n.style.color = bad ? "#ff8a8a" : ""; }

        function signInView() {
            body.textContent = "";
            var b = el("button", "cm-more", "Sign in with Google"); b.type = "button";
            b.addEventListener("click", function () { b.disabled = true; (window.__sinsubzSignIn ? window.__sinsubzSignIn() : Promise.resolve()).catch(function () { /* cancelled */ }).then(function () { start(); }); });
            body.appendChild(b);
        }

        function pickView(token) {
            body.textContent = "";
            var row = el("div", "row"); row.style.cssText = "display:flex;gap:8px";
            var inp = el("input"); inp.type = "search"; inp.placeholder = "Film or series name"; inp.value = g.q; inp.style.cssText = "flex:1;min-width:0;padding:11px 12px;border-radius:12px;border:1px solid var(--line-strong,#333);background:var(--surface-2,#161833);color:inherit;font:inherit";
            var go = el("button", "cm-more", "Search"); go.type = "button";
            row.appendChild(inp); row.appendChild(go); body.appendChild(row);
            var list = el("div"); list.style.cssText = "margin-top:10px;max-height:38vh;overflow:auto"; body.appendChild(list);

            function search() {
                var q = inp.value.trim(); if (q.length < 2) { return; }
                list.textContent = "Searching...";
                fetch("/api/search?query=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
                    list.textContent = "";
                    var rs = (d && d.results) || [];
                    if (!rs.length) { list.textContent = "Nothing found. Try another name."; return; }
                    rs.slice(0, 8).forEach(function (it) {
                        var b = el("button", "cm-link", it.title + (it.year ? " (" + it.year + ")" : "") + (it.type === "series" ? "  · TV series" : "  · Film"));
                        b.type = "button"; b.style.cssText = "display:block;width:100%;text-align:left;padding:10px 4px;border-top:1px solid var(--line,#2a2d4a)";
                        b.addEventListener("click", function () { picked = it; confirmView(token); });
                        list.appendChild(b);
                    });
                }).catch(function () { list.textContent = "Could not search. Please try again."; });
            }
            go.addEventListener("click", search);
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); search(); } });
            if (g.q) { search(); }
        }

        function confirmView(token) {
            body.textContent = "";
            var tv = picked.type === "series";
            body.appendChild(el("div", "cm-film", picked.title + (picked.year ? " (" + picked.year + ")" : "")));
            var se, ep;
            if (tv) {
                var r = el("div"); r.style.cssText = "display:flex;gap:8px;margin:10px 0";
                se = el("input"); se.type = "number"; se.min = "1"; se.placeholder = "Season"; se.value = g.s ? String(Number(g.s)) : "";
                ep = el("input"); ep.type = "number"; ep.min = "1"; ep.placeholder = "Episode"; ep.value = g.e ? String(Number(g.e)) : "";
                [se, ep].forEach(function (i) { i.style.cssText = "flex:1;min-width:0;padding:11px 12px;border-radius:12px;border:1px solid var(--line-strong,#333);background:var(--surface-2,#161833);color:inherit;font:inherit"; r.appendChild(i); });
                body.appendChild(r);
            }
            var send = el("button", "cm-more", "Send for approval"); send.type = "button"; send.style.marginTop = "10px";
            var back = el("button", "cm-link", "Pick another"); back.type = "button"; back.addEventListener("click", function () { picked = null; pickView(token); });
            body.appendChild(send); body.appendChild(back);
            send.addEventListener("click", function () {
                send.disabled = true; note("Sending...");
                Promise.resolve(window.__sinsubzIdToken ? window.__sinsubzIdToken() : "").then(function (tk) {
                    if (!tk) { throw new Error("Please sign in again."); }
                    return fetch("/api/stats?ready=submit", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk },
                        body: JSON.stringify({ imdb: picked.imdbID, title: picked.title, year: picked.year, poster: picked.poster, type: tv ? "tv" : "movie", season: se ? se.value : "", episode: ep ? ep.value : "", srt: srt, filename: filename }) });
                }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (r) {
                    if (!r.ok) { throw new Error((r.d && r.d.error) || "Could not send it."); }
                    body.textContent = ""; body.appendChild(el("p", "cm-thanks", "Thank you! We will check it soon."));
                    var done = el("button", "cm-more", "Close"); done.type = "button"; done.addEventListener("click", close); body.appendChild(done);
                }).catch(function (e) { send.disabled = false; note(e.message, true); });
            });
        }

        function start() {
            Promise.resolve(window.__sinsubzIdToken ? window.__sinsubzIdToken() : "").then(function (tk) { if (tk) { pickView(tk); } else { signInView(); } }).catch(signInView);
        }

        var later = el("button", "cm-link", "No thanks"); later.type = "button"; later.addEventListener("click", close);
        card.appendChild(later);
        wrap.appendChild(card);
        wrap.addEventListener("click", function (e) { if (e.target === wrap) { close(); } });
        document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { document.removeEventListener("keydown", esc); close(); } });
        document.body.appendChild(wrap);
        start();
    };
})();
