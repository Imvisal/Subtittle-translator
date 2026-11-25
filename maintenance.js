/* SinSubz maintenance mode (website only). Admin turns it on in the Maintenance tab;
   while it is on, visitors see a full-screen notice instead of the site. */
(function () {
    "use strict";
    fetch("/api/stats?maint=1", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d || !d.on) { return; }
            var o = document.createElement("div");
            o.id = "maintOverlay";
            o.setAttribute("role", "alert");
            o.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#0b0d1a;color:#eceaff;font-family:system-ui,sans-serif";
            o.innerHTML = '<div style="max-width:460px"><div style="font-size:52px">&#128736;</div>' +
                '<h1 style="margin:12px 0 10px;font-size:26px">Under maintenance</h1>' +
                '<p id="maintMsg" style="margin:0;opacity:.85;line-height:1.5"></p></div>';
            o.querySelector("#maintMsg").textContent = d.msg || "SinSubz is being updated. Please come back in a little while.";
            document.body.appendChild(o);
            document.documentElement.style.overflow = "hidden";
        })
        .catch(function () { /* site works normally if the check fails */ });
})();
