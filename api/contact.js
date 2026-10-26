/* SinSubz — private messages from the Contact page.

   POST /api/contact   { name?, email?, message, website? }   (website = hidden spam trap)
   GET  /api/contact   header "x-admin-key: <ADMIN_KEY>"       -> { messages: [...] }  (newest first)
   DELETE /api/contact?id=<id>   header "x-admin-key"          -> removes one message

   Messages are kept in the same Upstash Redis database as the usage counters (list "contact:msgs",
   newest 300). Reading / deleting needs the ADMIN_KEY environment variable (set it in Vercel ->
   Settings -> Environment Variables, then redeploy). Nobody else can read the messages. */
"use strict";

const crypto = require("crypto");

function findEnv(re) {
    const key = Object.keys(process.env).find(k => re.test(k) && process.env[k]);
    return key ? process.env[key] : "";
}
const URL_BASE = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?URL$/);
const TOKEN = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?TOKEN$/);

const MAX_KEEP = 300;
const MAX_PER_HOUR = 5;

async function redis(commands) {
    const res = await fetch(URL_BASE.replace(/\/$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error("redis " + res.status);
    const data = await res.json();
    return data.map(x => (x && x.error ? null : x && x.result));
}

function clientIp(req) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest(); }

function isAdmin(req) {
    const want = process.env.ADMIN_KEY;
    const got = String(req.headers["x-admin-key"] || "");
    if (!want || !got) return false;
    return crypto.timingSafeEqual(sha(want), sha(got));
}

function clean(v, max) {
    return String(v == null ? "" : v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim()
        .slice(0, max);
}

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (!URL_BASE || !TOKEN) {
        return res.status(503).json({ error: "Messages are not available right now. Please use the email address instead." });
    }

    try {
        // ---------------- admin: read / delete ----------------
        if (req.method === "GET" || req.method === "DELETE") {
            if (!process.env.ADMIN_KEY) return res.status(503).json({ error: "ADMIN_KEY is not set" });
            if (!isAdmin(req)) return res.status(401).json({ error: "Wrong key" });

            const list = (await redis([["LRANGE", "contact:msgs", 0, MAX_KEEP - 1]]))[0] || [];

            if (req.method === "GET") {
                const messages = list.map(raw => { try { return JSON.parse(raw); } catch (e) { return null; } }).filter(Boolean);
                return res.status(200).json({ messages });
            }

            const id = clean(req.query && req.query.id, 40);
            const raw = list.find(r => { try { return JSON.parse(r).id === id; } catch (e) { return false; } });
            if (!raw) return res.status(404).json({ error: "Not found" });
            await redis([["LREM", "contact:msgs", 1, raw]]);
            return res.status(200).json({ ok: true });
        }

        // ---------------- visitors: send a message ----------------
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        const body = req.body && typeof req.body === "object" ? req.body : {};

        // hidden field: real people leave it empty, bots fill it. Pretend it worked.
        if (clean(body.website, 10)) return res.status(200).json({ ok: true });

        const message = clean(body.message, 2000);
        const name = clean(body.name, 60);
        const email = clean(body.email, 120);

        if (message.length < 5) return res.status(400).json({ error: "Please write a little more." });
        if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
            return res.status(400).json({ error: "That email address does not look right." });
        }
        if ((message.match(/https?:\/\//gi) || []).length > 2) {
            return res.status(400).json({ error: "Please remove some of the links." });
        }

        // at most 5 messages per hour per person (the address itself is not stored, only a daily hash)
        const day = new Date().toISOString().slice(0, 10);
        const rk = "contact:rl:" + sha(clientIp(req) + day).toString("hex").slice(0, 24);
        const [count] = await redis([["INCR", rk], ["EXPIRE", rk, 3600]]);
        if (Number(count) > MAX_PER_HOUR) {
            return res.status(429).json({ error: "Too many messages. Please try again later." });
        }

        const item = {
            id: crypto.randomBytes(8).toString("hex"),
            t: new Date().toISOString(),
            name, email, message
        };

        await redis([
            ["LPUSH", "contact:msgs", JSON.stringify(item)],
            ["LTRIM", "contact:msgs", 0, MAX_KEEP - 1]
        ]);

        return res.status(200).json({ ok: true });

    } catch (e) {
        return res.status(500).json({ error: "Something went wrong. Please try again, or use the email address." });
    }
};
