/* SinSubz website: the one-time popup for the announcement you send from Admin -> Announcement (tick "Website popup").
   Shown once per visitor (browser) per announcement ID, and only until the "Expires" day ends, so "today only" = set Expires to today.
   Website only (index.html marks it WEBONLY, so the apps do not load it). */
(function () {
    "use strict";
    var FLAG = "sinsubz_web_ann_seen";
    function get() { try { return localStorage.getItem(FLAG) || ""; } catch (e) { return ""; } }
    function set(v) { try { localStorage.setItem(FLAG, v); } catch (e) { /* ignore */ } }
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text) { n.textContent = text; } return n; }
    function https(u) { u = String(u || "").trim(); return /^https:\/\/\S+$/i.test(u) ? u : (u.charAt(0) === "/" && u.charAt(1) !== "/" ? u : ""); }

    fetch("/announcement.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (a) {
        if (!a || a.enabled !== true || !a.id || (!a.title && !a.body)) { return; }
        if (!a.platforms || a.platforms.indexOf("web") === -1) { return; }
        if (a.expires) {
            var end = Date.parse(String(a.expires).slice(0, 10));
            if (!isNaN(end) && Date.now() > end + 24 * 60 * 60 * 1000) { return; }
        }
        if (get() === String(a.id)) { return; }

        var st = document.createElement("style");
        st.textContent =
            ".sp-back{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,6,12,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}" +
            ".sp-card{width:100%;max-width:400px;border-radius:22px;padding:26px 24px 22px;color:#f2f3fa;background:linear-gradient(160deg,#171a2b,#0d0f1a);border:1px solid rgba(150,150,255,.28);box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:inherit;}" +
            ".sp-img{display:block;width:100%;max-height:190px;object-fit:cover;border-radius:14px;margin:0 0 14px;}" +
            ".sp-card h3{margin:0 0 8px;font-size:21px;line-height:1.25;font-weight:800;}" +
            ".sp-card p{margin:0;font-size:14.5px;line-height:1.55;color:#b6b9cf;white-space:pre-line;}" +
            ".sp-actions{display:flex;gap:10px;margin-top:20px;}" +
            ".sp-actions button{flex:1;border:0;border-radius:14px;padding:13px 14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;}" +
            ".sp-later{background:rgba(255,255,255,.08);color:#d7d9ea;}" +
            ".sp-open{background:linear-gradient(135deg,#7c7cff,#b58cff);color:#0b0c16;}";
        document.head.appendChild(st);

        var back = el("div", "sp-back"), card = el("div", "sp-card");
        card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true");
        var img = https(a.image);
        if (img) { var im = el("img", "sp-img"); im.alt = ""; im.addEventListener("error", function () { if (im.parentNode) { im.parentNode.removeChild(im); } }); im.src = img; card.appendChild(im); }
        card.appendChild(el("h3", "", String(a.title || "SinSubz")));
        if (a.body) { card.appendChild(el("p", "", String(a.body))); }
        var actions = el("div", "sp-actions"), url = https(a.url);
        var later = el("button", "sp-later", url ? String(a.laterLabel || "Not now") : "OK"); later.type = "button";
        actions.appendChild(later);
        function close() { set(String(a.id)); if (back.parentNode) { back.parentNode.removeChild(back); } }
        later.addEventListener("click", close);
        if (url) {
            var open = el("button", "sp-open", String(a.openLabel || "Open")); open.type = "button";
            open.addEventListener("click", function () { close(); window.location.href = url; });
            actions.appendChild(open);
        }
        card.appendChild(actions); back.appendChild(card);
        back.addEventListener("click", function (e) { if (e.target === back) { close(); } });
        document.body.appendChild(back);
        set(String(a.id));      // counted as seen as soon as it is shown: once per visitor, even if they just reload
    }).catch(function () { /* no popup */ });
})();
