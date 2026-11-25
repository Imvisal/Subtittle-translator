/* SinSubz maintenance (website only). The admin sets it in the Maintenance tab (api/stats.js ?maint=1):
     mode "full"      -> a full-screen "Under maintenance" notice instead of the site
     mode "translate" -> only translating is paused: a banner on top, the translate button is greyed out, the rest works
     soon > 0         -> a heads-up banner ("starts at ...") before it begins */
(function () {
    "use strict";
    function banner(text, bad) {
        var b = document.createElement("div");
        b.id = "maintBar";
        b.setAttribute("role", "status");
        b.style.cssText = "position:sticky;top:0;z-index:2147483000;padding:10px 44px 10px 16px;text-align:center;font:600 14px/1.4 system-ui,sans-serif;color:" + (bad ? "#fff" : "#1a1400") + ";background:" + (bad ? "#c2410c" : "#f5c518");
        var t = document.createElement("span"); t.textContent = text; b.appendChild(t);
        var x = document.createElement("button");
        x.type = "button"; x.setAttribute("aria-label", "Close"); x.textContent = "\u00d7";
        x.style.cssText = "position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer";
        x.addEventListener("click", function () { b.remove(); });
        b.appendChild(x);
        document.body.insertBefore(b, document.body.firstChild);
    }
    function clock(ms) { try { return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

    fetch("/api/stats?maint=1", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d) { return; }
            var mode = d.mode || (d.on ? "full" : "off");
            if (mode === "full") {
                var o = document.createElement("div");
                o.id = "maintOverlay";
                o.setAttribute("role", "alert");
                o.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#0b0d1a;color:#eceaff;font-family:system-ui,sans-serif";
                o.innerHTML = '<div style="max-width:460px"><div style="font-size:52px">&#128736;</div>' +
                    '<h1 style="margin:12px 0 10px;font-size:26px">Under maintenance</h1>' +
                    '<p id="maintMsg" style="margin:0;opacity:.85;line-height:1.5"></p>' +
                    '<p id="maintEnd" style="margin:12px 0 0;opacity:.6;font-size:14px"></p></div>';
                o.querySelector("#maintMsg").textContent = d.msg || "SinSubz is being updated. Please come back in a little while.";
                if (d.until) { o.querySelector("#maintEnd").textContent = "Expected back around " + clock(d.until) + "."; }
                document.body.appendChild(o);
                document.documentElement.style.overflow = "hidden";
                return;
            }
            if (mode === "translate") {
                window.__sinsubzTranslatePaused = d.msg || true;
                var st = document.createElement("style");
                st.textContent = "#translateBtn,#translateButton{opacity:.45;pointer-events:none;filter:grayscale(.6)}";
                document.head.appendChild(st);
                banner((d.msg || "Translation is paused for a short maintenance. You can still search, browse and download ready Sinhala subtitles.") + (d.until ? " Back around " + clock(d.until) + "." : ""), true);
                return;
            }
            if (d.soon) {
                banner("Heads up: " + (d.soonMode === "full" ? "the website goes into maintenance" : "translating will be paused for maintenance") + " at " + clock(d.soon) + ". Please finish what you are translating before then.", false);
            }
        })
        .catch(function () { /* site works normally if the check fails */ });
})();
