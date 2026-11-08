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

            if (m.reply) {
                var rb = el("div", "replied");
                var rw = "";
                try { rw = new Date(m.reply.t).toLocaleString(); } catch (e) { rw = ""; }
                rb.appendChild(el("div", "rl", "\u2713 You replied" + (rw ? " \u00B7 " + rw : "")));
                rb.appendChild(el("div", "", m.reply.text || ""));
                card.appendChild(rb);
            }
            var replyBox = null;
            if (m.canReply) {
                replyBox = el("div", "replybox");
                var ta = el("textarea");
                ta.rows = 3; ta.maxLength = 1500;
                ta.placeholder = m.reply ? "Send another reply\u2026" : "Write a reply. It shows up as a notification on their account.";
                var send = el("button", "", "Send reply");
                send.type = "button";
                var st = el("span", "rst", "");
                send.addEventListener("click", function () {
                    var text = ta.value.trim();
                    if (text.length < 2) { st.textContent = "Write a reply first."; return; }
                    send.disabled = true; st.textContent = "Sending\u2026";
                    fetch("/api/stats?admin=1", {
                        method: "POST",
                        headers: { "x-admin-key": KEY, "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "reply", id: m.id, text: text })
                    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
                      .then(function (r) {
                          send.disabled = false;
                          if (r.ok) { st.textContent = "Sent \u2713"; ta.value = ""; load(); } else { st.textContent = (r.d && r.d.error) || "Could not send."; }
                      }).catch(function () { send.disabled = false; st.textContent = "No connection."; });
                });
                replyBox.appendChild(ta);
                var rr = el("div", "rrow"); rr.appendChild(send); rr.appendChild(st);
                replyBox.appendChild(rr);
                card.appendChild(replyBox);
            } else {
                card.appendChild(el("div", "noreply", "Older message: no account attached, so it cannot be answered here. Use the email address."));
            }

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
                // tell the admin panel everything up to now has been read (unread counter)
                fetch("/api/stats?admin=1", {
                    method: "POST",
                    headers: { "x-admin-key": KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "inboxSeen" })
                }).catch(function () { /* ignore */ });
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
