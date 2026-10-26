/* SinSubz inbox: shows the messages from the Contact page. Needs the ADMIN_KEY set in Vercel. */
(function () {
    "use strict";

    var login = document.getElementById("login");
    var keyEl = document.getElementById("key");
    var err = document.getElementById("err");
    var list = document.getElementById("list");
    var sub = document.getElementById("sub");
    var KEY = "";

    try { KEY = sessionStorage.getItem("sinsubz-inbox-key") || ""; } catch (e) { /* ignore */ }

    function api(method, qs) {
        return fetch("/api/contact" + (qs || ""), { method: method, headers: { "x-admin-key": KEY }, cache: "no-store" })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = text; }      // textContent only: a message can never run code
        return n;
    }

    function render(messages) {
        list.textContent = "";
        sub.textContent = messages.length + (messages.length === 1 ? " message" : " messages");

        if (!messages.length) { list.appendChild(el("p", "empty", "No messages yet.")); return; }

        messages.forEach(function (m) {
            var card = el("div", "msg");
            var top = el("div", "top");
            var who = el("span");
            who.appendChild(el("span", "who", m.name || "Anonymous"));
            if (m.email) {
                who.appendChild(document.createTextNode(" · "));
                var a = el("a", "", m.email);
                a.href = "mailto:" + m.email;
                a.style.color = "inherit";
                who.appendChild(a);
            }
            top.appendChild(who);
            var when = "";
            try { when = new Date(m.t).toLocaleString(); } catch (e) { when = String(m.t || ""); }
            top.appendChild(el("span", "", when));
            card.appendChild(top);
            card.appendChild(el("div", "body", m.message || ""));

            var del = el("button", "ghost", "Delete");
            del.type = "button";
            del.addEventListener("click", function () {
                if (!confirm("Delete this message?")) { return; }
                api("DELETE", "?id=" + encodeURIComponent(m.id)).then(function (r) {
                    if (r.ok) { card.remove(); } else { err.textContent = (r.d && r.d.error) || "Could not delete."; }
                });
            });
            card.appendChild(del);
            list.appendChild(card);
        });
    }

    function load() {
        err.textContent = "";
        api("GET").then(function (r) {
            if (r.ok) {
                login.hidden = true;
                try { sessionStorage.setItem("sinsubz-inbox-key", KEY); } catch (e) { /* ignore */ }
                render(r.d.messages || []);
            } else {
                login.hidden = false;
                try { sessionStorage.removeItem("sinsubz-inbox-key"); } catch (e) { /* ignore */ }
                err.textContent = r.status === 401 ? "Wrong key." : ((r.d && r.d.error) || "Could not load.");
            }
        }).catch(function () { err.textContent = "No connection."; });
    }

    login.addEventListener("submit", function (e) {
        e.preventDefault();
        KEY = keyEl.value.trim();
        if (KEY) { load(); }
    });

    if (KEY) { load(); }
})();
