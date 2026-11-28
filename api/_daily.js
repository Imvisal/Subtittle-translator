/* Daily summary of the site, sent to the OWNER's private Telegram chat by the bot.

   WHEN:  every day by the existing Vercel cron (api/_runner-cron.js, the scheduled call): the full summary of YESTERDAY
          (Sri Lanka day), once. Admin -> Announcement -> "Send summary now" sends today's numbers so far.
   WHERE: TG_ADMIN_CHAT (Vercel env, your own Telegram user id)  OR  the chat saved by "Link my Telegram" (admin panel):
          press the button, then send  /link <code>  to the bot in a private chat (needs the bot webhook ON).
   WHAT:  downloads, translations, sync, new / active users (e-mail sign-ups), Gemini health, mails sent, films + episodes
          added by the auto runner, maintenance, comments, messages, premium, requests.
   NOT:   clicks on ads. Ad networks keep those in their own dashboards; the site cannot see inside their frames.

   Counters kept here (Redis hash sum:d:<day>, 40 days):  bump("field"). */
"use strict";

const g = require("./_google");

const slDay = off => new Date(Date.now() + 5.5 * 3600e3 - (off || 0) * 86400e3).toISOString().slice(0, 10);
const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const pairs = flat => { const o = {}; if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) { o[flat[i]] = flat[i + 1]; } } return o; };
const quick = (p) => Promise.race([p, new Promise(r => setTimeout(r, 1500))]);

// one more event today (never throws, never waits long)
async function bump(field, n) {
    try {
        const d = slDay(0);
        await quick(g.redis([["HINCRBY", "sum:d:" + d, String(field).slice(0, 24), n || 1], ["EXPIRE", "sum:d:" + d, 40 * 86400]]));
    } catch (e) { /* a counter must never break a request */ }
}
async function bumpMail(subject) {
    try {
        const d = slDay(0);
        await quick(g.redis([["HINCRBY", "sum:d:" + d, "mail", 1], ["LPUSH", "sum:mail:" + d, String(subject || "").slice(0, 110)], ["LTRIM", "sum:mail:" + d, 0, 19], ["EXPIRE", "sum:mail:" + d, 40 * 86400], ["EXPIRE", "sum:d:" + d, 40 * 86400]]));
    } catch (e) { /* ignore */ }
}
// the auto runner (or admin) stored a Sinhala subtitle
async function bumpAuto(imdb, type, isNew) {
    if (!isNew) { return; }
    try {
        const d = slDay(0);
        await quick(g.redis([["HINCRBY", "sum:d:" + d, type === "tv" ? "autoEp" : "autoFilm", 1], ["SADD", "sum:auto" + (type === "tv" ? "tv" : "film") + ":" + d, imdb],
            ["EXPIRE", "sum:auto" + (type === "tv" ? "tv" : "film") + ":" + d, 40 * 86400], ["EXPIRE", "sum:d:" + d, 40 * 86400]]));
    } catch (e) { /* ignore */ }
}

async function collect(day) {
    const A = require("./_admin.js");
    const from = Date.parse(day + "T00:00:00+05:30"), to = from + 86400e3;
    const r = await g.redis([
        ["GET", "rdy:dlday:" + day],            // 0 downloads
        ["HGETALL", "stats:d:" + day],          // 1 translated / synced / lib hits
        ["SCARD", "u:dau:" + day],              // 2 active users
        ["HGETALL", "h:d:" + day],              // 3 Gemini results
        ["HGETALL", "sum:d:" + day],            // 4 our counters
        ["LRANGE", "sum:mail:" + day, 0, 19],   // 5 mails sent
        ["SCARD", "sum:autofilm:" + day],       // 6 films added by the runner
        ["SCARD", "sum:autotv:" + day],         // 7 series that got new episodes
        ["HGETALL", "u:info"],                  // 8 users
        ["LRANGE", "rdy:dllog", 0, 199],        // 9 recent downloads
        ["GET", "maint:cur"],                   // 10 maintenance now
        ["HGETALL", "q:" + A.pacificDay()]      // 11 Gemini keys today (Pacific day)
    ]);
    const stats = pairs(r[1]), h = pairs(r[3]), c = pairs(r[4]), q = pairs(r[11]);
    let total = 0, fresh = 0, email = 0, google = 0, other = 0;
    const info = pairs(r[8]);
    Object.keys(info).forEach(k => {
        const u = parse(info[k]); if (!u) { return; }
        total++;
        if (u.f >= from && u.f < to) {
            fresh++;
            if (u.pv === "email") { email++; } else if (u.pv === "google" || !u.pv) { google++; } else { other++; }
        }
    });
    const dl = {};
    (r[9] || []).map(parse).filter(x => x && x.t >= from && x.t < to).forEach(x => { dl[x.n] = (dl[x.n] || 0) + 1; });
    const topDl = Object.entries(dl).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const exhausted = Object.keys(q).filter(k => /:x$/.test(k) && Number(q[k]) > 0).length;
    const maint = parse(r[10]);
    return {
        day, partial: day === slDay(0),
        downloads: Number(r[0]) || 0, topDl,
        translated: Number(stats.translated) || 0, synced: Number(stats.synced) || 0, libHit: Number(stats.libhit) || 0, libMiss: Number(stats.libmiss) || 0,
        active: Number(r[2]) || 0, total, fresh, email, google, other,
        gem: { ok: Number(h.ok) || 0, quota: Number(h.quota) || 0, busy: Number(h.busy) || 0, json: Number(h.json) || 0, other: Number(h.other) || 0, exhausted },
        mails: Number(c.mail) || 0, mailList: (r[5] || []).slice(0, 5),
        autoFilms: Number(c.autoFilm) || 0, autoEps: Number(c.autoEp) || 0, autoFilmTitles: Number(r[6]) || 0, autoSeries: Number(r[7]) || 0,
        maintAuto: Number(c.maintAuto) || 0, maintNow: maint && maint.mode && maint.mode !== "off" ? maint.mode : "",
        comments: Number(c.comment) || 0, messages: Number(c.message) || 0, premium: Number(c.premium) || 0, requests: Number(c.request) || 0
    };
}

function format(d) {
    const L = [];
    L.push("📊 <b>SinSubz " + (d.partial ? "– today so far" : "daily summary") + "</b> · " + d.day);
    L.push("");
    L.push("⬇️ <b>Downloads:</b> " + d.downloads + (d.topDl.length ? "\n" + d.topDl.map(x => "   • " + esc(x[0]) + " ×" + x[1]).join("\n") : ""));
    L.push("🌐 <b>Translations:</b> " + d.translated + "  ·  🔁 Sync: " + d.synced + (d.libHit + d.libMiss ? "  ·  ♻️ reused lines: " + Math.round(100 * d.libHit / Math.max(1, d.libHit + d.libMiss)) + "%" : ""));
    L.push("");
    L.push("👥 <b>Users:</b> " + d.active + " active · <b>" + d.fresh + " new</b> (✉️ e-mail " + d.email + ", Google " + d.google + (d.other ? ", other " + d.other : "") + ") · " + d.total + " in total");
    L.push("");
    L.push("🤖 <b>Auto runner added:</b> " + d.autoFilms + " film" + (d.autoFilms === 1 ? "" : "s") + ", " + d.autoEps + " episode" + (d.autoEps === 1 ? "" : "s") + (d.autoSeries ? " (" + d.autoSeries + " series)" : ""));
    L.push("");
    const gk = d.gem;
    L.push("🔑 <b>Gemini:</b> " + gk.ok + " ok · " + gk.quota + " quota (429) · " + gk.busy + " busy · " + gk.json + " bad-json · " + gk.other + " other");
    if (d.partial) { L.push("   keys out of quota now: " + gk.exhausted); }
    L.push("✉️ <b>Mails sent to you:</b> " + d.mails + (d.mailList.length ? "\n" + d.mailList.map(s => "   • " + esc(s)).join("\n") : ""));
    L.push("🛠 <b>Auto maintenance (translation paused):</b> " + d.maintAuto + (d.maintNow ? "  ⚠️ ON now: " + esc(d.maintNow) : ""));
    L.push("");
    L.push("💬 Comments " + d.comments + " · ✉️ Messages " + d.messages + " · 👑 Premium " + d.premium + " · 🎯 Requests " + d.requests);
    return L.join("\n");
}

async function ownerChat() {
    if (process.env.TG_ADMIN_CHAT) { return String(process.env.TG_ADMIN_CHAT).trim(); }
    try { const [v] = await g.redis([["GET", "tg:admin"]]); return v ? String(v) : ""; } catch (e) { return ""; }
}
async function tgSend(chat, text) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
    try {
        const r = await fetch("https://api.telegram.org/bot" + process.env.TG_BOT_TOKEN + "/sendMessage", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }), signal: ctl.signal
        });
        return await r.json().catch(() => ({ ok: false }));
    } catch (e) { return { ok: false, description: String(e && e.message || e) }; }
    finally { clearTimeout(t); }
}

// the scheduled call: yesterday's full summary, once per day
async function sendIfDue() {
    if (!process.env.TG_BOT_TOKEN) { return false; }
    const chat = await ownerChat();
    if (!chat) { return false; }
    const day = slDay(1);
    const [first] = await g.redis([["SET", "sum:sent:" + day, "1", "NX", "EX", 3 * 86400]]);
    if (first !== "OK") { return false; }
    const r = await tgSend(chat, format(await collect(day)));
    if (!r.ok) { await g.redis([["DEL", "sum:sent:" + day]]); }         // try again at the next scheduled call
    return !!r.ok;
}

// admin buttons.  POST ?cron=runner&act=summary  -> send today's numbers now.   POST ?cron=runner&act=link -> one-time code
async function adminAct(req, res, act) {
    res.setHeader("Cache-Control", "no-store");
    if (!process.env.TG_BOT_TOKEN) { return res.status(200).json({ ok: false, error: "TG_BOT_TOKEN is not set in Vercel." }); }
    if (act === "link") {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await g.redis([["SET", "tg:claim", code, "EX", 600]]);
        let bot = "";
        try { const me = await (await fetch("https://api.telegram.org/bot" + process.env.TG_BOT_TOKEN + "/getMe")).json(); bot = me && me.result ? me.result.username : ""; } catch (e) { /* ignore */ }
        return res.status(200).json({ ok: true, code, bot, linked: !!(await ownerChat()) });
    }
    const chat = await ownerChat();
    if (!chat) { return res.status(200).json({ ok: false, error: "No private chat yet. Press \"Link my Telegram\" first (or set TG_ADMIN_CHAT in Vercel)." }); }
    const r = await tgSend(chat, format(await collect(slDay(0))));
    return res.status(200).json({ ok: !!r.ok, error: r.ok ? "" : (r.description || "Telegram refused it (send /start to the bot first)") });
}

module.exports = { bump, bumpMail, bumpAuto, sendIfDue, adminAct, collect, format };
