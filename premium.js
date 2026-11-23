/* SinSubz Premium page: shows the plan + bank details, takes the slip photo and the reference, shows the status.
   Everything is written with textContent. The photo is shrunk in the browser to a small JPEG before it is sent. */
(function () {
    "use strict";
    var box = document.getElementById("plBox");
    function el(tag, text, css) { var n = document.createElement(tag); if (text != null) { n.textContent = text; } if (css) { n.style.cssText = css; } return n; }
    function token() { return window.__sinsubzIdToken ? window.__sinsubzIdToken().catch(function () { return ""; }) : Promise.resolve(""); }
    function api(method, body) {
        return token().then(function (tk) {
            var h = { "Content-Type": "application/json" };
            if (tk) { h.Authorization = "Bearer " + tk; }
            return fetch("/api/stats?plan=1", { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { throw new Error(d.error || "Failed"); } return d; }); });
    }
    function btn(text, primary) {
        var b = el("button", text, "padding:12px 20px;border:0;border-radius:12px;font:inherit;font-weight:700;cursor:pointer;" +
            (primary ? "background:#8f86ff;color:#fff" : "background:transparent;color:inherit;border:1px solid rgba(128,128,160,.5)"));
        b.type = "button"; return b;
    }

    // shrink a photo to max 1100 px, JPEG, about 150-300 KB
    function shrink(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                var s = Math.min(1, 1100 / Math.max(img.width, img.height));
                var c = document.createElement("canvas");
                c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
                c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                var q = 0.75, out = c.toDataURL("image/jpeg", q);
                while (out.length > 450000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
                out.length > 600000 ? reject(new Error("Photo is too big")) : resolve(out);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read that photo")); };
            img.src = url;
        });
    }

    function cls(tag, c, text) { var n = el(tag, text); n.className = c; return n; }
    function card(title) { var c = cls("section", "pm-card"); if (title) { c.appendChild(el("h2", title)); } return c; }

    function render(d) {
        box.textContent = "";
        if (!d.enabled && !d.until) {
            var c0 = card(); c0.appendChild(el("p", "Premium is not open yet. Please check again soon.")); box.appendChild(c0);
            return;
        }

        if (d.price) {
            var pr = cls("div", "pm-price");
            pr.appendChild(el("b", d.price));
            pr.appendChild(el("small", "for " + d.days + " days of Premium"));
            box.appendChild(pr);
        }

        if (d.until) {
            box.appendChild(cls("div", "pm-active", "✅ Your Premium is active until " + new Date(d.until).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })));
        }

        // Free vs Premium
        var cmp = card("What you get");
        var tb = el("table"); tb.className = "pm-table";
        var hr = el("tr"); ["", "Free", "Premium"].forEach(function (t, i) { var th = el("th", t); if (i === 2) { th.className = "pro"; } hr.appendChild(th); });
        var th0 = el("thead"); th0.appendChild(hr); tb.appendChild(th0);
        var tbody = el("tbody");
        [["Films per day", String(d.freeMovies), String(d.movies)], ["TV episodes per day", String(d.freeEpisodes), String(d.episodes)],
         ["Ads in the app", "Yes", "None"], ["Priority when the AI is busy", "–", "✓"], ["Priority support", "–", "✓"], ["Premium badge on comments", "–", "✓"]].forEach(function (r) {
            var tr = el("tr");
            r.forEach(function (t, i) { var td = el("td", t); if (i === 2) { td.className = "pro"; if (t === "✓" || t === "None") { td.classList.add("pm-yes"); } } if (i === 1 && t === "–") { td.className = "pm-no"; } tr.appendChild(td); });
            tbody.appendChild(tr);
        });
        tb.appendChild(tbody); cmp.appendChild(tb); box.appendChild(cmp);

        if (d.paypal) { box.appendChild(paypalCard(d)); }
        if (!d.bankOn) { return; }

        // how to pay
        var how = card("How to pay");
        var ol = cls("ol", "pm-steps");
        ["Send the amount by bank transfer to the account below.", "Take a photo or screenshot of the slip.", "Sign in with Google, add the slip and the transfer reference, and send.", "We check the payment and switch Premium on, usually within a day."].forEach(function (t) { ol.appendChild(el("li", t)); });
        how.appendChild(ol);

        var bank = cls("div", "pm-bank");
        [["Account name", d.holder], ["Bank", d.bankName], ["Branch", d.branch], ["Account number", d.account]].forEach(function (x) {
            if (!x[1]) { return; }
            var row = cls("div", "pm-row");
            var txt = el("div");
            txt.appendChild(el("small", x[0]));
            txt.appendChild(el("strong", x[1]));
            var cp = cls("button", "pm-copy", "Copy"); cp.type = "button";
            cp.addEventListener("click", function () {
                var done = function () { cp.textContent = "Copied ✓"; cp.classList.add("ok"); setTimeout(function () { cp.textContent = "Copy"; cp.classList.remove("ok"); }, 1500); };
                if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(x[1]).then(done).catch(function () { cp.textContent = "Hold to copy"; }); }
                else { var ta = document.createElement("textarea"); ta.value = x[1]; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ } ta.remove(); }
            });
            row.appendChild(txt); row.appendChild(cp);
            bank.appendChild(row);
        });
        if (d.bank) { bank.appendChild(cls("div", "pm-note", d.bank)); }
        how.appendChild(bank);
        box.appendChild(how);

        // send the slip
        var send = card("Send your slip");
        if (!d.signedIn) {
            send.appendChild(el("p", "Sign in so we know which account to upgrade.", "color:inherit;opacity:.8;margin:0"));
            var b = cls("button", "pm-btn g", "Sign in"); b.type = "button";
            b.addEventListener("click", function () {
                b.disabled = true;
                (window.__sinsubzSignIn ? window.__sinsubzSignIn() : Promise.resolve()).catch(function () { /* ignore */ }).then(load);
            });
            send.appendChild(b);
            box.appendChild(send);
            box.appendChild(tgLink());
            return;
        }
        if (d.request && d.request.status === "pending") {
            box.appendChild(cls("div", "pm-pending", "⏳ Your request (" + d.request.ref + ") is waiting for approval. We usually check within a day."));
            box.appendChild(tgLink());
            return;
        }
        if (d.request && d.request.status === "rejected") {
            send.appendChild(cls("div", "pm-bad", "Your last request was not approved. Check the slip and send it again."));
        }

        send.appendChild(cls("label", "pm-label", "Transfer reference or the name on the transfer"));
        var ref = cls("input", "pm-input"); ref.maxLength = 80; ref.placeholder = "e.g. Kasun Perera / ref 12345";
        send.appendChild(ref);
        send.appendChild(cls("label", "pm-label", "Photo of the slip"));
        var drop = cls("label", "pm-drop");
        var hint = el("span", "📷  Tap to choose the slip photo");
        var file = el("input"); file.type = "file"; file.accept = "image/*";
        drop.appendChild(hint); drop.appendChild(file);
        file.addEventListener("change", function () {
            var f = file.files[0]; if (!f) { return; }
            var u = URL.createObjectURL(f), im = new Image();
            im.onload = function () { URL.revokeObjectURL(u); };
            im.src = u; im.alt = "Slip preview";
            drop.textContent = ""; drop.appendChild(im); drop.appendChild(el("span", f.name)); drop.appendChild(file);
        });
        send.appendChild(drop);
        var msg = cls("p", "pm-msg");
        var go = cls("button", "pm-btn", "Send for approval"); go.type = "button";
        go.addEventListener("click", function () {
            msg.textContent = "";
            if (ref.value.trim().length < 3) { msg.textContent = "Write the transfer reference or the name."; return; }
            if (!file.files[0]) { msg.textContent = "Choose the photo of the slip."; return; }
            go.disabled = true; go.textContent = "Sending…";
            shrink(file.files[0]).then(function (slip) { return api("POST", { ref: ref.value.trim(), slip: slip }); })
                .then(function () { load(); })
                .catch(function (e) { msg.textContent = e.message; go.disabled = false; go.textContent = "Send for approval"; });
        });
        send.appendChild(go); send.appendChild(msg);
        box.appendChild(send);
        box.appendChild(tgLink());
    }

    // PayPal: the buyer leaves for PayPal, pays (PayPal account or card), and comes back to /premium.html?pp=return&token=<order>
    function paypalCard(d) {
        var c = cls("section", "pm-card pm-pay");
        var head = cls("div", "pm-pay-head");
        head.appendChild(cls("h2", "", "Pay online"));
        head.appendChild(cls("span", "pm-pay-badge", "⚡ Instant"));
        c.appendChild(head);

        var price = cls("div", "pm-pay-price");
        price.appendChild(cls("b", "", "$" + d.usd));
        price.appendChild(cls("small", "", "for " + d.days + " days of Premium"));
        c.appendChild(price);

        var ul = cls("ul", "pm-pay-list");
        ["Premium switches on the moment you pay", "Visa, Mastercard or your PayPal balance", "No slip to send, nothing to wait for"].forEach(function (t) {
            var li = cls("li", "", t); ul.appendChild(li);
        });
        c.appendChild(ul);

        var msg = cls("p", "pm-msg");
        if (!d.signedIn) {
            var s1 = cls("button", "pm-btn g", "Sign in to pay"); s1.type = "button";
            s1.addEventListener("click", function () { s1.disabled = true; (window.__sinsubzSignIn ? window.__sinsubzSignIn() : Promise.resolve()).catch(function () { /* ignore */ }).then(load); });
            c.appendChild(s1);
        } else {
            var label = "🔒  Pay $" + d.usd + " securely";
            var go = cls("button", "pm-btn pm-pay-go", label); go.type = "button";
            go.addEventListener("click", function () {
                msg.textContent = ""; go.disabled = true; go.textContent = "Opening PayPal…";
                api("POST", { paypal: "create" }).then(function (r) { window.location.href = r.url; })
                    .catch(function (e) { msg.textContent = e.message; go.disabled = false; go.textContent = label; });
            });
            c.appendChild(go); c.appendChild(msg);
        }
        var chips = cls("div", "pm-pay-chips");
        ["VISA", "Mastercard", "PayPal"].forEach(function (t) { chips.appendChild(cls("span", "pm-chip", t)); });
        c.appendChild(chips);
        c.appendChild(cls("small", "pm-pay-note", "You pay on PayPal's own secure page. We never see your card details."));
        return c;
    }

    function tgLink() {
        var a = cls("a", "pm-tg", "Need help? Message us on Telegram");
        a.href = "https://t.me/sinsubz"; a.target = "_blank"; a.rel = "noopener";
        return a;
    }

    var note = "";
    function load() {
        api("GET").then(function (d) {
            render(d);
            if (note) { var n = cls("div", note.indexOf("✅") === 0 ? "pm-active" : "pm-bad", note); box.insertBefore(n, box.firstChild); }
        }).catch(function () { box.textContent = ""; box.appendChild(el("p", "Could not load. Try again.")); });
    }

    // coming back from PayPal: take the payment, then show the result above the page
    function afterPayPal(done) {
        var q = new URLSearchParams(location.search), mode = q.get("pp"), order = q.get("token");
        if (!mode) { done(); return; }
        try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
        if (mode === "cancel") { note = "The PayPal payment was cancelled. You were not charged."; done(); return; }
        if (!order) { done(); return; }
        box.textContent = "Finishing your payment…";
        api("POST", { paypal: "capture", orderId: order }).then(function () { note = "✅ Payment received. Your Premium is active. Thank you!"; })
            .catch(function (e) { note = e.message; }).then(done);
    }

    // the Google sign-in state is restored by web-account.js; give it a moment, then load
    (function wait(n) {
        if (window.__sinsubzAuthReady) { window.__sinsubzAuthReady().then(function () { afterPayPal(load); }); } else if (n > 40) { afterPayPal(load); } else { setTimeout(function () { wait(n + 1); }, 100); }
    })(0);
})();
