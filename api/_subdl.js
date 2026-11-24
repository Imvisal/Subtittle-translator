/* SubDL keys + how many downloads each key made today (the free plan allows 50 downloads a day per key, resets 05:30 Sri Lanka = 00:00 UTC).
   Keys: SUBDL_API_KEY, SUBDL_API_KEY_2 ... SUBDL_API_KEY_30. The first SUBDL_USER_KEYS (default 2) are for visitors, the rest for the auto runner.
   Redis: sd:use:<UTC day> (hash key number -> downloads)   sd:spent (hash key number -> time of the last "429 limit")
   SubDL does not tell us the real number, so this counts the downloads this site made. */
"use strict";
const { hasRedis, redis } = require("./_google");

const LIMIT = () => Number(process.env.SUBDL_DAILY_LIMIT) || 50;
const day = () => new Date().toISOString().slice(0, 10);

function keys() {
    const out = [];
    [process.env.SUBDL_API_KEY].concat(Array.from({ length: 29 }, (_, i) => process.env["SUBDL_API_KEY_" + (i + 2)])).forEach(k => { k = (k || "").trim(); if (k && !out.includes(k)) { out.push(k); } });
    return out;
}
const nUser = () => Math.max(1, parseInt(process.env.SUBDL_USER_KEYS, 10) || 2);

async function count(n) { try { if (hasRedis()) { await redis([["HINCRBY", "sd:use:" + day(), String(n), 1], ["EXPIRE", "sd:use:" + day(), 3 * 86400]]); } } catch (e) { /* counting never breaks a download */ } }
async function markSpent(n) { try { if (hasRedis()) { await redis([["HSET", "sd:spent", String(n), String(Date.now())]]); } } catch (e) { /* ignore */ } }

// key numbers (1-based) that said "limit reached" less than 30 minutes ago
async function spentNow() {
    const out = new Set();
    try {
        if (!hasRedis()) { return out; }
        const [flat] = await redis([["HGETALL", "sd:spent"]]);
        for (let i = 0; flat && i + 1 < flat.length; i += 2) { if (Date.now() - Number(flat[i + 1]) < 30 * 60 * 1000) { out.add(Number(flat[i])); } }
    } catch (e) { /* ignore */ }
    return out;
}

async function usage() {
    const ks = keys(), nu = nUser();
    let use = {}, sp = {};
    if (hasRedis()) {
        const [a, b] = await redis([["HGETALL", "sd:use:" + day()], ["HGETALL", "sd:spent"]]);
        for (let i = 0; a && i + 1 < a.length; i += 2) { use[a[i]] = Number(a[i + 1]) || 0; }
        for (let i = 0; b && i + 1 < b.length; i += 2) { sp[b[i]] = Number(b[i + 1]) || 0; }
    }
    const reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
    return {
        limit: LIMIT(), resetAt: reset.getTime(),
        keys: ks.map((k, i) => {
            const n = i + 1, used = use[n] || 0, s = sp[n] || 0;
            const today = s && new Date(s).toISOString().slice(0, 10) === day();
            return { n, role: n <= nu ? "visitors" : "auto runner", used, left: Math.max(0, Math.round(100 - used * 100 / LIMIT())), limited: !!today && Date.now() - s < 6 * 3600 * 1000 };
        })
    };
}

module.exports = { keys, nUser, count, markSpent, spentNow, usage };
