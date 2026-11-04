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

    function render(d) {
        box.textContent = "";
        if (!d.enabled && !d.until) {
            box.appendChild(el("p", "Premium is not open yet. Please check again soon."));
            return;
        }
        var perks = el("ul");
        [d.movies + " films and " + d.episodes + " TV episodes every day (free: " + d.freeMovies + " films and " + d.freeEpisodes + " episodes)",
         "No ads in the Android app", "Premium badge in the app", d.days + " days per payment"].forEach(function (t) { perks.appendChild(el("li", t)); });
        box.appendChild(perks);
        if (d.price) { box.appendChild(el("p", "Price: " + d.price, "font-size:20px;font-weight:800")); }

        if (d.until) {
            box.appendChild(el("p", "✅ Your Premium is active until " + new Date(d.until).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) + ".", "font-weight:700"));
        }
        if (!d.enabled) { return; }

        box.appendChild(el("h2", "How to pay"));
        var ol = el("ol");
        ["Send the amount by bank transfer to the account below.", "Take a photo or screenshot of the slip.", "Sign in with Google here, add the slip and the transfer reference, and send.", "We check the payment and switch Premium on, usually within a day."].forEach(function (t) { ol.appendChild(el("li", t)); });
        box.appendChild(ol);
        box.appendChild(el("pre", d.bank, "white-space:pre-wrap;padding:14px;border-radius:12px;background:rgba(128,128,160,.15);font:inherit"));

        if (!d.signedIn) {
            var b = btn("Sign in with Google", true);
            b.addEventListener("click", function () {
                b.disabled = true;
                (window.__sinsubzSignIn ? window.__sinsubzSignIn() : Promise.resolve()).catch(function () { /* ignore */ }).then(load);
            });
            box.appendChild(b);
            return;
        }
        if (d.request && d.request.status === "pending") {
            box.appendChild(el("p", "⏳ Your request (" + d.request.ref + ") is waiting for approval.", "font-weight:700"));
            return;
        }
        if (d.request && d.request.status === "rejected") {
            box.appendChild(el("p", "Your last request was not approved. Check the slip and send it again.", "color:#ff8a8a"));
        }

        var form = el("div");
        form.appendChild(el("label", "Transfer reference or the name on the transfer", "display:block;margin:12px 0 4px"));
        var ref = el("input"); ref.maxLength = 80; ref.style.cssText = "width:100%;padding:11px;border-radius:10px;border:1px solid rgba(128,128,160,.5);background:transparent;color:inherit;font:inherit";
        form.appendChild(ref);
        form.appendChild(el("label", "Photo of the slip", "display:block;margin:12px 0 4px"));
        var file = el("input"); file.type = "file"; file.accept = "image/*";
        form.appendChild(file);
        var msg = el("p", "", "min-height:22px;color:#ff8a8a");
        var send = btn("Send for approval", true);
        send.style.marginTop = "12px";
        send.addEventListener("click", function () {
            msg.style.color = "#ff8a8a"; msg.textContent = "";
            if (ref.value.trim().length < 3) { msg.textContent = "Write the transfer reference or the name."; return; }
            if (!file.files[0]) { msg.textContent = "Choose the photo of the slip."; return; }
            send.disabled = true; send.textContent = "Sending…";
            shrink(file.files[0]).then(function (slip) { return api("POST", { ref: ref.value.trim(), slip: slip }); })
                .then(function () { load(); })
                .catch(function (e) { msg.textContent = e.message; send.disabled = false; send.textContent = "Send for approval"; });
        });
        form.appendChild(send); form.appendChild(msg);
        box.appendChild(form);
    }

    function load() {
        api("GET").then(render).catch(function () { box.textContent = ""; box.appendChild(el("p", "Could not load. Try again.")); });
    }

    // the Google sign-in state is restored by web-account.js; give it a moment, then load
    var tries = 0;
    (function wait() {
        tries++;
        if (window.__sinsubzIdToken && (tries > 3)) { load(); } else if (tries > 20) { load(); } else { setTimeout(wait, 250); }
    })();
})();
