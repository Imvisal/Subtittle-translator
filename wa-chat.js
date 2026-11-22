/* SinSubz home page (website only): floating WhatsApp button.
   The round WhatsApp logo is always there (bottom right). After 2 s a small "Hi, how can I help you?" bubble pops out,
   stays until the icon goes (10 s after the page opens); the icon itself disappears after 10 s and the back-to-top button takes its place (once per browser session for the bubble). Tapping the logo or the bubble opens a WhatsApp chat. */
(function () {
    "use strict";
    var NUM = "94774789096", TEXT = "Hi SinSubz", KEY = "sinsubz_wa_bubble";
    var url = "https://wa.me/" + NUM + "?text=" + encodeURIComponent(TEXT);
    var st = document.createElement("style");
    st.textContent =
        ".swa-fab{position:fixed;right:16px;bottom:16px;z-index:9000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:inherit}" +
        ".swa-btn{width:56px;height:56px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.35);border:0;cursor:pointer;text-decoration:none;transition:transform .15s}" +
        ".swa-btn:hover{transform:scale(1.07)}.swa-btn svg{width:32px;height:32px;fill:#fff}" +
        ".swa-bub{position:relative;max-width:230px;background:#fff;color:#1b1f2a;border-radius:14px 14px 4px 14px;padding:11px 30px 11px 14px;font-size:14px;line-height:1.35;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;opacity:0;transform:translateY(8px) scale(.96);transition:opacity .35s,transform .35s;pointer-events:none}" +
        ".swa-bub.on{opacity:1;transform:none;pointer-events:auto}" +
        ".swa-bub b{display:block;font-size:13px;color:#128c7e;margin-bottom:2px}" +
        ".swa-x{position:absolute;top:4px;right:6px;border:0;background:none;color:#7a8091;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px}" +
        ".swa-fab.out{opacity:0;transform:translateY(10px);pointer-events:none}.swa-fab{transition:opacity .4s,transform .4s}body.swa-on .to-top{bottom:88px!important}" +
        "@media (prefers-reduced-motion:reduce){.swa-bub,.swa-btn{transition:none}}";
    document.head.appendChild(st);

    var box = document.createElement("div"); box.className = "swa-fab";
    var bub = document.createElement("div"); bub.className = "swa-bub"; bub.setAttribute("role", "status");
    var who = document.createElement("b"); who.textContent = "SinSubz";
    var msg = document.createElement("span"); msg.textContent = "Hi 👋 How can I help you?";
    var x = document.createElement("button"); x.type = "button"; x.className = "swa-x"; x.setAttribute("aria-label", "Close"); x.textContent = "×";
    bub.appendChild(who); bub.appendChild(msg); bub.appendChild(x);
    var a = document.createElement("a"); a.className = "swa-btn"; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.setAttribute("aria-label", "Chat with SinSubz on WhatsApp");
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
    box.appendChild(bub); box.appendChild(a); document.body.appendChild(box);
    document.body.classList.add("swa-on");          // the back-to-top button sits above the WhatsApp icon while it is there
    /* after 10 s the WhatsApp icon goes away for good (this visit); the back-to-top button takes its place when the page is scrolled */
    setTimeout(function () {
        box.classList.add("out");
        setTimeout(function () { if (box.parentNode) { box.parentNode.removeChild(box); } document.body.classList.remove("swa-on"); }, 450);
    }, 10000);

    bub.addEventListener("click", function (ev) { if (ev.target === x) { return; } window.open(url, "_blank", "noopener"); });
    var hideT = 0;
    function hide() { bub.classList.remove("on"); clearTimeout(hideT); }
    x.addEventListener("click", function (ev) { ev.stopPropagation(); hide(); });

    var seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch (e) { /* ignore */ }
    if (!seen) {
        setTimeout(function () {
            bub.classList.add("on");
            try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
            hideT = setTimeout(hide, 7000);
        }, 2000);
    }
})();
