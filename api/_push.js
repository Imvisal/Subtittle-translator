/* Web Push (browser notifications), no npm package: RFC 8291 (aes128gcm) + VAPID (RFC 8292) with node:crypto.
   Routed through api/stats.js:  ?push=
     GET  ?push=key                       -> { key }  (VAPID public key for the browser; empty when push is not set up)
     POST ?push=sub     { sub }           -> a browser subscribes   (PushSubscription JSON)
     POST ?push=unsub   { endpoint }      -> a browser unsubscribes
     GET  ?push=count   x-admin-key       -> { n }
     POST ?push=send    x-admin-key       -> { title, body, url }  sends to everybody
   Redis: push:subs (hash sha(endpoint) -> {e,k,a,t}), push:last (flag, at most one automatic "new subtitles" push per 6 hours)
   Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (base64url), VAPID_SUBJECT (mailto:...)  - made once with `node scripts/make-vapid.js` */
"use strict";
const crypto = require("crypto");
const { hasRedis, redis, sha, overLimit } = require("./_google");
const { isAdmin } = require("./_admin");

const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const vapidReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function vapidHeader(endpoint) {
    const pub = unb64u(process.env.VAPID_PUBLIC_KEY), d = process.env.VAPID_PRIVATE_KEY;
    const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: d }, format: "jwk" });
    const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
    const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:sinsubz.support@gmail.com" }));
    const sig = crypto.sign("sha256", Buffer.from(head + "." + claims), { key: key, dsaEncoding: "ieee-p1363" });
    return "vapid t=" + head + "." + claims + "." + b64u(sig) + ", k=" + b64u(pub);
}

// RFC 8291 aes128gcm body for one subscription
function encrypt(sub, payload) {
    const ua = unb64u(sub.k), auth = unb64u(sub.a);
    const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
    const asPub = ecdh.getPublicKey();
    const secret = ecdh.computeSecret(ua);
    const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub]), 32));
    const salt = crypto.randomBytes(16);
    const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
    const data = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, data]);
}

async function sendOne(sub, payload) {
    try {
        const r = await fetch(sub.e, {
            method: "POST",
            headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal", Authorization: vapidHeader(sub.e) },
            body: encrypt(sub, payload),
            signal: AbortSignal.timeout(6000)
        });
        if (r.status === 404 || r.status === 410) { return "gone"; }
        return r.status >= 200 && r.status < 300 ? "ok" : "fail";
    } catch (e) { return "fail"; }
}

// sends to every subscriber (batches of 20); removes the dead subscriptions
async function broadcast(msg, maxMs) {
    if (!hasRedis() || !vapidReady()) { return { sent: 0, removed: 0, failed: 0, off: true }; }
    const [flat] = await redis([["HGETALL", "push:subs"]]);
    const subs = [];
    for (let i = 0; flat && i + 1 < flat.length; i += 2) { try { const s = JSON.parse(flat[i + 1]); if (s && s.e && s.k && s.a) { subs.push({ h: flat[i], s: s }); } } catch (e) { /* skip */ } }
    const payload = JSON.stringify({ t: String(msg.title || "SinSubz").slice(0, 80), b: String(msg.body || "").slice(0, 160), u: /^\/[\w\-./?=&%#]*$/.test(msg.url || "") ? msg.url : "/" });
    const out = { sent: 0, removed: 0, failed: 0 }, dead = [], until = Date.now() + (maxMs || 8000);
    for (let i = 0; i < subs.length && Date.now() < until; i += 20) {
        const r = await Promise.all(subs.slice(i, i + 20).map(x => sendOne(x.s, payload)));
        r.forEach((x, j) => { if (x === "ok") { out.sent++; } else if (x === "gone") { out.removed++; dead.push(subs[i + j].h); } else { out.failed++; } });
    }
    if (dead.length) { await redis(dead.map(h => ["HDEL", "push:subs", h])); }
    return out;
}

// at most one automatic push per 6 hours (called when a NEW title reaches the Ready list)
async function notifyNewTitle(m) {
    try {
        if (!hasRedis() || !vapidReady()) { return; }
        const [ok] = await redis([["SET", "push:last", "1", "EX", "21600", "NX"]]);
        if (ok !== "OK") { return; }
        const slug = m.slug || m.id;
        await broadcast({ title: "New Sinhala subtitle ready", body: (m.t || "") + (m.y ? " (" + m.y + ")" : "") + " - download it now", url: (m.type === "tv" ? "/tv/" : "/film/") + slug }, 6000);
    } catch (e) { /* never breaks the caller */ }
}

async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const act = (String(req.url || "").match(/[?&]push=([a-z]+)/) || [])[1] || "";
    try {
        if (act === "key") {
            res.setHeader("Cache-Control", "public, s-maxage=3600");
            return res.status(200).json({ key: vapidReady() ? process.env.VAPID_PUBLIC_KEY : "" });
        }
        if (act === "count") {
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            const [n] = hasRedis() ? await redis([["HLEN", "push:subs"]]) : [0];
            return res.status(200).json({ n: Number(n) || 0, ready: vapidReady() });
        }
        if (act === "send" && req.method === "POST") {
            if (!isAdmin(req)) { return res.status(401).json({ error: "Unauthorized" }); }
            if (!vapidReady()) { return res.status(503).json({ error: "VAPID keys are not set (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" }); }
            const b = req.body && typeof req.body === "object" ? req.body : {};
            if (!String(b.title || "").trim()) { return res.status(400).json({ error: "Title is required" }); }
            return res.status(200).json(Object.assign({ ok: true }, await broadcast(b, 8500)));
        }
        if ((act === "sub" || act === "unsub") && req.method === "POST") {
            if (!hasRedis()) { return res.status(503).json({ error: "Not available" }); }
            const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
            if (await overLimit("pushsub", ip, 30, 3600)) { return res.status(429).json({ error: "Too many requests" }); }
            const b = req.body && typeof req.body === "object" ? req.body : {};
            if (act === "unsub") {
                if (typeof b.endpoint === "string" && b.endpoint.length < 600) { await redis([["HDEL", "push:subs", sha(b.endpoint)]]); }
                return res.status(200).json({ ok: true });
            }
            const s = b.sub || {};
            const k = s.keys || {};
            if (typeof s.endpoint !== "string" || !/^https:\/\/[^\s]{10,500}$/.test(s.endpoint) || typeof k.p256dh !== "string" || typeof k.auth !== "string" ||
                k.p256dh.length > 120 || k.auth.length > 40 || unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length < 8) {
                return res.status(400).json({ error: "Bad subscription" });
            }
            const [n] = await redis([["HLEN", "push:subs"]]);
            if (Number(n) > 100000) { return res.status(503).json({ error: "Full" }); }
            await redis([["HSET", "push:subs", sha(s.endpoint), JSON.stringify({ e: s.endpoint, k: k.p256dh, a: k.auth, t: Date.now() })]]);
            return res.status(200).json({ ok: true });
        }
        return res.status(405).json({ error: "Method not allowed" });
    } catch (e) {
        return res.status(500).json({ error: "Server error" });
    }
}

module.exports = handler;
module.exports.broadcast = broadcast;
module.exports.notifyNewTitle = notifyNewTitle;
module.exports._test = { encrypt, vapidHeader, b64u, unb64u };
