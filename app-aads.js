/* SinSubz Android/Windows app - A-Ads banner (crypto ad network). App build only (scripts/build-www.js adds it).
   One 728x90 banner at the bottom of the home screen, scaled to the screen width. Hidden for Premium users. */
(function () {
    "use strict";
    var UNIT_ID = "2461670", W = 728, H = 90;
    function premium() {
        try {
            if (window.__sinsubzIsPremium && window.__sinsubzIsPremium()) { return true; }
            return Number(localStorage.getItem("sinsubz-premium") || 0) > Date.now();
        } catch (e) { return false; }
    }
    var wrap = null;
    function fit() {
        if (!wrap) { return; }
        var k = Math.min(1, (wrap.parentNode.clientWidth || W) / W);
        var f = wrap.querySelector("iframe");
        f.style.transform = k < 1 ? "scale(" + k + ")" : "none";
        wrap.style.width = Math.round(W * k) + "px";
        wrap.style.height = Math.round(H * k) + "px";
    }
    function build() {
        if (wrap || premium()) { return; }
        var foot = document.querySelector("main footer") || document.querySelector("footer");
        if (!foot || !foot.parentNode) { return; }
        var holder = document.createElement("div");
        holder.id = "appAads";
        holder.style.cssText = "width:100%;margin:18px auto;text-align:center";
        holder.innerHTML = '<div style="font:11px/1.2 sans-serif;opacity:.55;margin-bottom:4px">Advertisement</div>';
        wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;overflow:hidden;margin:0 auto";
        var f = document.createElement("iframe");
        f.setAttribute("data-aa", UNIT_ID);
        f.src = "https://ad.a-ads.com/" + UNIT_ID + "/?size=" + W + "x" + H;
        f.loading = "lazy";
        f.style.cssText = "border:0;padding:0;width:" + W + "px;height:" + H + "px;overflow:hidden;display:block;transform-origin:0 0;background:transparent";
        wrap.appendChild(f); holder.appendChild(wrap);
        foot.parentNode.insertBefore(holder, foot);
        fit();
    }
    function drop() { var h = document.getElementById("appAads"); if (h) { h.remove(); } wrap = null; }
    window.addEventListener("resize", fit);
    document.addEventListener("sinsubz-plan", function () { if (premium()) { drop(); } else { build(); } });
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", build); } else { build(); }
})();
