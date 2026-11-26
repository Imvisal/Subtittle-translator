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

async function send(m, s, e, info, head) {
    const tv = m.type === "tv";
    const url = SITE + (tv ? "/tv/" : "/film/") + (m.slug || m.id);
    info = info || {};
    const rating = info.imdb ? "IMDb " + info.imdb + "/10" : (info.rating ? "TMDB " + info.rating + "/10" : "");
    const facts = [
        rating ? "⭐ " + esc(rating) + (info.rated ? " · " + esc(info.rated) : "") : "",
        (info.countries || []).length ? "🌍 " + esc(info.countries.join(", ")) : "",
        (info.genres || []).length ? "🎭 " + esc(info.genres.join(", ")) : "",
        info.runtime ? "⏱ " + info.runtime + " min" : ""
    ].filter(Boolean);
    const caption = head ? head + "\n\n⬇️ " + url : ("🎬 <b>" + esc(m.t) + (m.y ? " (" + esc(m.y) + ")" : "") + "</b>\n" +
        (tv ? "📺 TV series\n" : "🎥 Movie\n") +
        (facts.length ? facts.join("\n") + "\n" : "") +
        "\n✅ Sinhala subtitle ready" + (tv && s ? " — Season " + s + (e ? ", Episode " + e : "") : "") +
        "\n\n⬇️ " + url);
    const ids = String(process.env.TG_CHAT_ID || "").split(",").map(x => x.trim()).filter(Boolean);   // group and channel: TG_CHAT_ID=-100123...,@my_channel
    const row = [{ text: "Download Sinhala subtitle", url }];
    if (/^tt\d+$/.test(m.id) && m.id !== "tt0000000") { row.push({ text: "IMDb", url: "https://www.imdb.com/title/" + m.id + "/" }); }
    const markup = { inline_keyboard: [row] };
    const one = async id => {
        const common = { chat_id: id, parse_mode: "HTML" };
        if (/^https:\/\/image\.tmdb\.org\//.test(m.p || "")) {
            const r = await call("sendPhoto", Object.assign({}, common, { photo: m.p, caption, reply_markup: markup }));
            if (r.ok) { return r; }
        }
        return call("sendMessage", Object.assign({}, common, { text: caption, reply_markup: markup, disable_web_page_preview: false }));
    };
    const all = await Promise.all(ids.map(one));
    return all.find(r => r.ok) || all[0] || { ok: false, desc: "no chat id" };      // ok when at least one chat got it
}

async function postNew(m, s, e) {
    try {
        if (!ready() || !hasRedis() || !m || !m.id || !m.t) { return; }
        const key = "tg:p:" + m.id + ":" + (m.type === "tv" ? (Number(s) || 0) : 0);
        const [ok] = await redis([["SET", key, "1", "EX", String(60 * 86400), "NX"]]);
        if (ok !== "OK") { return; }
        let info = null;
        try { info = await Promise.race([require("./_ready.js").tmdbInfo(m), new Promise(r => setTimeout(() => r(null), 6000))]); } catch (err) { /* post without the extra facts */ }
        const r = await send(m, s, e, info);
        if (!r.ok) { await redis([["DEL", key]]); }           // not posted: allow a later try
    } catch (err) { /* never breaks the caller */ }
}

// One summary post per (title, key) ever: used for "season complete" and "whole series complete".
async function announce(tag, m, s, head) {
    const key = "tg:" + tag;
    const [ok] = await redis([["SET", key, "1", "EX", String(365 * 86400), "NX"]]);
    if (ok !== "OK") { return; }
    const r = await send(m, s, 0, null, head);
    if (!r.ok) { await redis([["DEL", key]]); }
}

// Called after an episode is saved: when every episode of its TV season is ready, post a season summary;
// when every season is ready, also post a whole-series summary. Season episode counts come from TMDB.
async function postSeasonDone(m, s) {
    try {
        if (!ready() || !hasRedis() || !m || m.type !== "tv" || !m.id || !(Number(s) > 0) || !m.t) { return; }
        const sn0 = Number(s);
        const { tmdbRaw } = require("./_ready.js");
        const found = await tmdbRaw("/find/" + m.id + "?external_source=imdb_id");
        const pick = (found.tv_results || [])[0];
        if (!pick) { return; }
        const d = await tmdbRaw("/tv/" + pick.id);
        const seasons = (d.seasons || []).filter(x => x.season_number >= 1 && x.episode_count > 0);
        const have = {};
        Object.values(m.eps || {}).forEach(x => { if (x && x.s) { have[x.s] = (have[x.s] || 0) + 1; } });
        const done = n => { const sn = seasons.find(x => x.season_number === n); return !!sn && (have[n] || 0) >= sn.episode_count; };
        if (!done(sn0)) { return; }
        const season = seasons.find(x => x.season_number === sn0);
        const title = "<b>" + esc(m.t) + "</b>" + (m.y ? " (" + esc(m.y) + ")" : "");
        const sm = season.poster_path ? Object.assign({}, m, { p: "https://image.tmdb.org/t/p/w500" + season.poster_path }) : m;   // that season's own poster
        await announce("sd:" + m.id + ":" + sn0, sm, sn0,
            "✅ " + title + "\n📺 Season " + sn0 + " complete — all " + season.episode_count + " episodes have Sinhala subtitles");
        if (seasons.every(x => done(x.season_number))) {
            const total = seasons.reduce((a, x) => a + x.episode_count, 0);
            await announce("sc:" + m.id, m, 0,
                "🎉 " + title + "\n📺 Full series complete — " + seasons.length + " seasons, " + total + " episodes with Sinhala subtitles");
        }
    } catch (err) { /* never breaks the caller */ }
}

async function test(req, res) {
    if (!require("./_admin.js").isAdmin(req)) { return res.status(401).json({ error: "Admin key needed" }); }
    if (!ready()) { return res.status(200).json({ ok: false, error: "Set TG_BOT_TOKEN and TG_CHAT_ID in Vercel (then redeploy)." }); }
    const r = await send({ id: "tt0000000", t: "SinSubz test post", y: String(new Date().getFullYear()), type: "movie", slug: "", p: "" }, 0, 0);
    return res.status(200).json({ ok: r.ok, error: r.ok ? "" : (r.desc || "Telegram refused it") });
}

module.exports = { postNew, postSeasonDone, test, ready };
