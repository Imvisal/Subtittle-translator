/* SinSubz -> Telegram channel: posts a title's poster + link when its Sinhala subtitle becomes ready.
   Needs two Vercel env vars:  TG_BOT_TOKEN (from @BotFather)  and  TG_CHAT_ID (the channel, e.g. @mychannel or -100123..., the bot must be an admin there).
   Without them nothing happens. One post per title (movie) or per title + season (TV). Never throws.
   Admin test:  POST /api/stats?tg=test  (x-admin-key)  -> sends a test post. */
"use strict";

const { hasRedis, redis } = require("./_google");
const SITE = "https://sinsubs.site";
const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const ready = () => !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID);

async function call(method, body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
        const r = await fetch("https://api.telegram.org/bot" + process.env.TG_BOT_TOKEN + "/" + method, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal
        });
        const j = await r.json().catch(() => ({}));
        return { ok: !!j.ok, desc: j.description || "" };
    } catch (e) { return { ok: false, desc: String(e && e.message || e) }; }
    finally { clearTimeout(t); }
}

async function send(m, s, e) {
    const tv = m.type === "tv";
    const url = SITE + (tv ? "/tv/" : "/film/") + (m.slug || m.id);
    const caption = "🎬 <b>" + esc(m.t) + (m.y ? " (" + esc(m.y) + ")" : "") + "</b>\n" +
        "✅ Sinhala subtitle ready" + (tv && s ? " — Season " + s + (e ? ", Episode " + e : "") : "") +
        "\n\n⬇️ " + url;
    const common = { chat_id: process.env.TG_CHAT_ID, parse_mode: "HTML" };
    const markup = { inline_keyboard: [[{ text: "Download Sinhala subtitle", url }]] };
    if (/^https:\/\/image\.tmdb\.org\//.test(m.p || "")) {
        const r = await call("sendPhoto", Object.assign({}, common, { photo: m.p, caption, reply_markup: markup }));
        if (r.ok) { return r; }
    }
    return call("sendMessage", Object.assign({}, common, { text: caption, reply_markup: markup, disable_web_page_preview: false }));
}

async function postNew(m, s, e) {
    try {
        if (!ready() || !hasRedis() || !m || !m.id || !m.t) { return; }
        const key = "tg:p:" + m.id + ":" + (m.type === "tv" ? (Number(s) || 0) : 0);
        const [ok] = await redis([["SET", key, "1", "EX", String(60 * 86400), "NX"]]);
        if (ok !== "OK") { return; }
        const r = await send(m, s, e);
        if (!r.ok) { await redis([["DEL", key]]); }           // not posted: allow a later try
    } catch (err) { /* never breaks the caller */ }
}

async function test(req, res) {
    if (!require("./_admin.js").isAdmin(req)) { return res.status(401).json({ error: "Admin key needed" }); }
    if (!ready()) { return res.status(200).json({ ok: false, error: "Set TG_BOT_TOKEN and TG_CHAT_ID in Vercel (then redeploy)." }); }
    const r = await send({ id: "tt0000000", t: "SinSubz test post", y: String(new Date().getFullYear()), type: "movie", slug: "", p: "" }, 0, 0);
    return res.status(200).json({ ok: r.ok, error: r.ok ? "" : (r.desc || "Telegram refused it") });
}

module.exports = { postNew, test, ready };
