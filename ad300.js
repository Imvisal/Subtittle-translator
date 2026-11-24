/* SinSubz - Adsterra 300x250 banner. Website only. Shown on the film / TV pages and the Ready list.
 * The ad lives in /ad-box.html inside a sandboxed iframe (no access to the SinSubz sign-in or storage).
 * Never on the home/tool page, login, admin, premium or the AdSense guide pages. */
(function () {
    "use strict";
    if (/^(capacitor|file|app):/.test(location.protocol) || !document.body) { return; }
    var tp = document.querySelector(".tp-wrap");
    var home = document.getElementById("homeAd");          // the home page: ONE native ad above the footer (never near the search / buttons)
    var host = tp || document.querySelector("main.legal-container") || home;
    if (!host || document.querySelector(".ad300")) { return; }
    var slots = [];
    /* an ad frame says "none" when its network gave nothing: remove the empty box (and its "Advertisement" label) */
    window.addEventListener("message", function (ev) {
        if (!ev.data || ev.data.sinsubzAd !== "none") { return; }
        for (var i = 0; i < slots.length; i++) { if (slots[i].frame.contentWindow === ev.source) { slots[i].box.style.display = "none"; } }
    });
    function slot(src, w, h) {
        var d = document.createElement("div");
        d.className = "ad300";
        d.setAttribute("aria-label", "Advertisement");
        d.style.cssText = "width:" + w + "px;max-width:100%;margin:22px auto;text-align:center;";
        var small = document.createElement("div");
        small.textContent = "Advertisement";
        small.style.cssText = "font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px;";
        var f = document.createElement("iframe");
        f.src = src;
        f.width = String(w); f.height = String(h); f.loading = "lazy"; f.title = "Advertisement";
        f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
        f.referrerPolicy = "no-referrer-when-downgrade";
        f.style.cssText = "border:0;width:" + w + "px;height:" + h + "px;max-width:100%;display:block;margin:0 auto;background:transparent;";
        d.appendChild(small); d.appendChild(f);
        slots.push({ box: d, frame: f });
        return d;
    }
    /* The 300x250 banner unit gets no ads (blank box), the native unit does: both places use the native ad (its frame grows to the height the ad reports) */
    function nativeSlot() {
        var n = slot("/ad-box-native.html", 560, 300);
        n.style.width = "100%"; n.style.maxWidth = "560px";
        var f = n.querySelector("iframe"); f.style.width = "100%"; f.style.maxWidth = "560px"; f.removeAttribute("width");
        return n;
    }
    window.addEventListener("message", function (ev) {
        if (!ev.data || ev.data.sinsubzAd !== "native") { return; }
        for (var i = 0; i < slots.length; i++) {
            var f = slots[i].frame;
            if (f.contentWindow !== ev.source || !/native/.test(f.getAttribute("src") || "")) { continue; }
            var h = Math.max(60, Math.min(900, Number(ev.data.h) || 0));
            if (h) { f.style.height = h + "px"; f.height = String(h); }
        }
    });
    var d = nativeSlot();
    if (home && host === home) {
        home.appendChild(d);
        /* tool results: one native ad under the Download button, added only AFTER a result exists (a gap keeps it away from the button) */
        var after = function (watch, attr, ready, anchor) {
            var el = document.getElementById(watch), made = false;
            if (!el || !anchor) { return; }
            function check() {
                if (made || !ready(el)) { return; }
                made = true;
                var a = nativeSlot(); a.style.marginTop = "44px";
                anchor.parentNode.insertBefore(a, anchor.nextSibling);
            }
            new MutationObserver(check).observe(el, { attributes: true, attributeFilter: [attr] });
            check();
        };
        var dlb = document.getElementById("downloadBtn"), syd = document.getElementById("syncDownload");
        after("downloadBtn", "disabled", function (el) { return !el.disabled; }, dlb);
        after("syncResult", "hidden", function (el) { return !el.hidden; }, syd);
        return;
    }
    /* phones: a slim 320x50 banner under the top block of the page as well */
    if (tp && window.innerWidth < 740) {
        var cast = tp.querySelector(".tp-cast") || tp.querySelector("#tpEps");
        if (cast) { tp.insertBefore(slot("/ad-box-320.html", 320, 50), cast); }
    }
    var nat = nativeSlot();
    if (tp) {
        tp.insertBefore(nat, tp.querySelector(".tp-foot") || null);
    } else { host.appendChild(nat); }
    if (tp) {
        var seo = tp.querySelector(".tp-seo") || tp.querySelector(".tp-foot");
        tp.insertBefore(d, seo || null);
    } else {
        host.appendChild(d);
    }
})();
