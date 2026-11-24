/* SinSubz: Redis backup (admin only). Served through /api/stats (?backup=...), so it is not a function of its own.
   GET  ?backup=keys&cursor=0         -> { cursor, keys: [...] }   one SCAN page, only the keys worth saving
   POST ?backup=dump    { keys: [...] }  (max 40) -> { items: [ { k, t, v, ttl } ] }    t = string|hash|set|zset|list
   POST ?backup=restore { items: [...] } (max 40) -> { restored }   (DEL + write each key back)
   Skipped on purpose (rebuild by themselves): rate limits, logs, caches (rdy:tmdb, rdy:pk, rdy:rt, tg:p). */
"use strict";

const { hasRedis, redis } = require("./_google");

const KEEP = /^(rdy:(idx|srt:|pend|dl)|lib:|tr:|aq:(list|meta|stop)|an:cur|rq:|u:|prem:(cfg|req|slip)|stats:|cm:(ids|c:|r:|t:)|push:subs|n:u:|sq:z|sd:|omdb:limit|admin:inbox)/;
const SKIP = /^(u:rl:|u:dau:|prem:rl:|cm:rl:|lim:|log:ev|act:)/;
const q = req => { try { return Object.fromEntries(new URL(req.url, "http://x").searchParams); } catch (e) { return {}; } };
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const body = async req => (req.body && typeof req.body === "object") ? req.body : (parse(typeof req.body === "string" ? req.body : "") || {});
const okKey = k => typeof k === "string" && k.length > 0 && k.length < 300 && KEEP.test(k) && !SKIP.test(k);

module.exports = async function (req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!require("./_admin.js").isAdmin(req)) { return res.status(401).json({ error: "Admin key needed" }); }
    if (!hasRedis()) { return res.status(503).json({ error: "Database not connected" }); }
    const act = q(req).backup;

    if (act === "keys" && req.method === "GET") {
        const cur = String(q(req).cursor || "0").replace(/\D/g, "") || "0";
        const [r] = await redis([["SCAN", cur, "COUNT", "500"]]);
        const keys = (r && r[1] || []).filter(okKey);
        return res.status(200).json({ cursor: String(r && r[0] || "0"), keys });
    }

    if (act === "dump" && req.method === "POST") {
        const keys = ((await body(req)).keys || []).filter(okKey).slice(0, 40);
        if (!keys.length) { return res.status(200).json({ items: [] }); }
        const types = await redis(keys.map(k => ["TYPE", k]));
        const cmds = [];
        keys.forEach((k, i) => {
            const t = types[i];
            cmds.push(t === "string" ? ["GET", k] : t === "hash" ? ["HGETALL", k] : t === "set" ? ["SMEMBERS", k] : t === "zset" ? ["ZRANGE", k, "0", "-1", "WITHSCORES"] : t === "list" ? ["LRANGE", k, "0", "-1"] : ["TYPE", k]);
            cmds.push(["PTTL", k]);
        });
        const out = await redis(cmds);
        const items = [];
        keys.forEach((k, i) => {
            const t = types[i];
            if (!["string", "hash", "set", "zset", "list"].includes(t) || out[i * 2] == null) { return; }
            const ttl = Number(out[i * 2 + 1]);
            items.push({ k, t, v: out[i * 2], ttl: ttl > 0 ? ttl : 0 });
        });
        return res.status(200).json({ items });
    }

    if (act === "restore" && req.method === "POST") {
        const items = ((await body(req)).items || []).slice(0, 40).filter(it => it && okKey(it.k) && it.v != null);
        let n = 0;
        for (const it of items) {
            const cmds = [["DEL", it.k]];
            if (it.t === "string") { cmds.push(["SET", it.k, String(it.v)]); }
            else if (it.t === "hash" && Array.isArray(it.v) && it.v.length) { cmds.push(["HSET", it.k, ...it.v.map(String)]); }
            else if (it.t === "set" && Array.isArray(it.v) && it.v.length) { cmds.push(["SADD", it.k, ...it.v.map(String)]); }
            else if (it.t === "zset" && Array.isArray(it.v) && it.v.length) {
                const a = []; for (let i = 0; i + 1 < it.v.length; i += 2) { a.push(String(it.v[i + 1]), String(it.v[i])); }
                cmds.push(["ZADD", it.k, ...a]);
            } else if (it.t === "list" && Array.isArray(it.v) && it.v.length) { cmds.push(["RPUSH", it.k, ...it.v.map(String)]); }
            else { continue; }
            if (it.ttl > 0) { cmds.push(["PEXPIRE", it.k, String(Math.floor(it.ttl))]); }
            await redis(cmds); n++;
        }
        return res.status(200).json({ restored: n });
    }
    return res.status(404).json({ error: "Not found" });
};
