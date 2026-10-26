/* SinSubz: Contact page message form (website only). Sends to /api/contact. */
(function () {
    "use strict";

    var form = document.getElementById("contactForm");
    if (!form) { return; }

    var btn = document.getElementById("cfBtn");
    var status = document.getElementById("cfStatus");
    var count = document.getElementById("cfCount");
    var msg = form.elements.message;

    function say(text, kind) {
        status.textContent = text;
        status.className = "cf-status" + (kind ? " " + kind : "");
    }

    msg.addEventListener("input", function () { count.textContent = msg.value.length + " / 2000"; });

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        var text = msg.value.trim();
        if (text.length < 5) { say("Please write a little more.", "bad"); msg.focus(); return; }

        btn.disabled = true;
        say("Sending...", "");

        fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: form.elements.name.value,
                email: form.elements.email.value,
                message: text,
                website: form.elements.website.value
            })
        })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                if (x.ok) {
                    form.reset();
                    count.textContent = "0 / 2000";
                    say("Thank you! Your message was sent.", "ok");
                } else {
                    say((x.d && x.d.error) || "Could not send. Please try again.", "bad");
                }
            })
            .catch(function () { say("No connection. Please try again.", "bad"); })
            .then(function () { btn.disabled = false; });
    });
})();
