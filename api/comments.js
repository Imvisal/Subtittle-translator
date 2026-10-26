/* SinSubz — public comments (website only).

   GET    /api/comments?sort=new|old&offset=0&limit=4   -> { total, comments:[{ id,t,name,text,owner,film,mine,replies:[...] }] }
   POST   /api/comments   { text, parent?, film?, website? }   header Authorization: Bearer <Firebase ID token>
   DELETE /api/comments?id=<id>[&parent=<id>]                  author or owner only

   Posting needs Google sign-in; the displayed name comes from the Google account (checked on the
   server). The email is never stored with a comment or shown. The owner (OWNER_EMAIL, default the
   site owner's Gmail, email verified by Google) gets owner:true, shown as a green tick + "Owner".
   Redis: list cm:ids (newest 100), cm:c:<id> JSON, cm:r:<id> list of replies (oldest first, max 40). */
"use strict";

const { hasRedis, redis, verifyGoogleUser, clean, sha, crypto } = require("./_google");

const MAX_COMMENTS = 100;
const MAX_REPLIES = 40;
const MAX_PER_HOUR = 10;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|lk|xyz|info|ru|top|site|co|me|ly|tk|cc)\b)/i;

const parse = raw => { try { return JSON.parse(raw); } catch (e) { return null; } };

// who = the verified signed-in visitor (or null). can = may this visitor delete it (own comment, or the owner)
function publicView(c, who) {
    const mine = !!who && c.uid === who.uid;
    return {
        id: c.id, t: c.t, name: c.name, text: c.text,
        owner: !!c.owner, film: c.film || "",
        mine, can: mine || !!(who && who.owner)
    };
}

module.exports = async function handler(req, res) {

    if (!hasRedis()) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({ enabled: false, total: 0, comments: [] });
    }

    try {
        // ------------------------------------------------ read
        if (req.method === "GET") {
            const q = req.query || {};
            const sort = q.sort === "old" ? "old" : "new";
            const offset = Math.max(0, Math.min(MAX_COMMENTS, parseInt(q.offset, 10) || 0));
            const limit = Math.max(1, Math.min(20, parseInt(q.limit, 10) || 4));

            let who = null;
            if (req.headers.authorization) {
                who = await verifyGoogleUser(req).catch(() => null);
                res.setHeader("Cache-Control", "no-store");
            } else {
                res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=120");
            }

            const total = Number((await redis([["LLEN", "cm:ids"]]))[0]) || 0;
            if (!total || offset >= total) return res.status(200).json({ enabled: true, total, comments: [] });

            let from, to;
            if (sort === "new") { from = offset; to = offset + limit - 1; }
            else { from = Math.max(0, total - offset - limit); to = total - offset - 1; }

            let ids = (await redis([["LRANGE", "cm:ids", from, to]]))[0] || [];
            if (sort === "old") ids = ids.reverse();
            if (!ids.length) return res.status(200).json({ enabled: true, total, comments: [] });

            const rows = await redis([
                ["MGET", ...ids.map(id => "cm:c:" + id)],
                ...ids.map(id => ["LRANGE", "cm:r:" + id, 0, MAX_REPLIES - 1])
            ]);

            const comments = [];
            ids.forEach((id, i) => {
                const c = parse((rows[0] || [])[i]);
                if (!c) return;
                const view = publicView(c, who);
                view.replies = (rows[i + 1] || []).map(parse).filter(Boolean).map(r => publicView(r, who));
                comments.push(view);
            });

            return res.status(200).json({ enabled: true, total, comments });
        }

        // ------------------------------------------------ write / delete (signed in)
        const who = await verifyGoogleUser(req).catch(() => null);
        if (!who) return res.status(401).json({ error: "Please sign in with Google first." });
        res.setHeader("Cache-Control", "no-store");

        if (req.method === "POST") {
            const body = req.body && typeof req.body === "object" ? req.body : {};

            // hidden field: real people leave it empty, bots fill it. Pretend it worked.
            if (clean(body.website, 10)) return res.status(200).json({ ok: true });

            const text = clean(body.text, 600);
            if (text.length < 2) return res.status(400).json({ error: "Please write a little more." });
            if (!who.owner && LINK.test(text)) return res.status(400).json({ error: "Links are not allowed in comments." });

            const parent = clean(body.parent, 40);
            const film = clean(body.film, 80);

            const uidKey = sha(who.uid).toString("hex").slice(0, 24);
            const [count] = await redis([["INCR", "cm:rl:" + uidKey], ["EXPIRE", "cm:rl:" + uidKey, 3600]]);
            if (Number(count) > MAX_PER_HOUR) return res.status(429).json({ error: "Too many comments. Please try again later." });

            // the exact same text twice in a row is almost always a double click or a bot
            const hash = sha(text).toString("hex").slice(0, 16);
            const last = (await redis([["GET", "cm:last:" + uidKey]]))[0];
            if (last === hash) return res.status(200).json({ ok: true });
            await redis([["SET", "cm:last:" + uidKey, hash, "EX", 600]]);

            const item = {
                id: crypto.randomBytes(7).toString("hex"),
                t: new Date().toISOString(),
                uid: who.uid,
                name: clean(who.name, 60) || "Google user",
                text,
                owner: who.owner,
                film: parent ? "" : film
            };

            if (parent) {
                const p = (await redis([["GET", "cm:c:" + parent]]))[0];
                if (!p) return res.status(404).json({ error: "That comment no longer exists." });
                const n = Number((await redis([["LLEN", "cm:r:" + parent]]))[0]) || 0;
                if (n >= MAX_REPLIES) return res.status(400).json({ error: "This conversation is full." });
                await redis([["RPUSH", "cm:r:" + parent, JSON.stringify(item)]]);
                return res.status(200).json({ ok: true, comment: publicView(item, who) });
            }

            await redis([
                ["SET", "cm:c:" + item.id, JSON.stringify(item)],
                ["LPUSH", "cm:ids", item.id]
            ]);

            // keep the newest 100 only; drop the rest with their replies
            const old = (await redis([["LRANGE", "cm:ids", MAX_COMMENTS, MAX_COMMENTS + 20]]))[0] || [];
            if (old.length) {
                await redis([
                    ["LTRIM", "cm:ids", 0, MAX_COMMENTS - 1],
                    ...old.map(id => ["DEL", "cm:c:" + id, "cm:r:" + id])
                ]);
            }

            return res.status(200).json({ ok: true, comment: publicView(item, who) });
        }

        if (req.method === "DELETE") {
            const q = req.query || {};
            const id = clean(q.id, 40);
            const parent = clean(q.parent, 40);
            if (!id) return res.status(400).json({ error: "Missing id" });

            if (parent) {
                const list = (await redis([["LRANGE", "cm:r:" + parent, 0, MAX_REPLIES - 1]]))[0] || [];
                const raw = list.find(r => { const o = parse(r); return o && o.id === id; });
                const o = raw && parse(raw);
                if (!o) return res.status(404).json({ error: "Not found" });
                if (!who.owner && o.uid !== who.uid) return res.status(403).json({ error: "Not allowed" });
                await redis([["LREM", "cm:r:" + parent, 1, raw]]);
                return res.status(200).json({ ok: true });
            }

            const c = parse((await redis([["GET", "cm:c:" + id]]))[0]);
            if (!c) return res.status(404).json({ error: "Not found" });
            if (!who.owner && c.uid !== who.uid) return res.status(403).json({ error: "Not allowed" });
            await redis([["DEL", "cm:c:" + id, "cm:r:" + id], ["LREM", "cm:ids", 1, id]]);
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: "Method not allowed" });

    } catch (e) {
        return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
};
