/* Shared helpers for the comment API (the leading underscore keeps Vercel from making it a route). */
"use strict";

const crypto = require("crypto");

function findEnv(re) {
    const key = Object.keys(process.env).find(k => re.test(k) && process.env[k]);
    return key ? process.env[key] : "";
}
const URL_BASE = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?URL$/);
const TOKEN = findEnv(/(?:^|_)(?:KV|UPSTASH_REDIS)_REST_(?:API_)?TOKEN$/);

// public web API key of the Firebase project (the same one the website already ships to browsers)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyBtVA4AdmAlkwVsBnZ3rqm7vjSGEA2NAO0";
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || "visaludyogi2002@gmail.com").trim().toLowerCase();

function hasRedis() { return !!(URL_BASE && TOKEN); }

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

// Asks Google whether the ID token is real, unexpired and from our Firebase project.
async function verifyGoogleUser(req) {
    const auth = String((req.headers && req.headers.authorization) || "");
    if (!/^Bearer\s+/i.test(auth)) return null;
    const idToken = auth.replace(/^Bearer\s+/i, "").trim();
    if (!idToken || idToken.length > 4000) return null;

    const r = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_API_KEY),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
            signal: AbortSignal.timeout(7000)
        }
    );
    if (!r.ok) return null;
    const u = ((await r.json()).users || [])[0];
    if (!u || !u.localId) return null;

    const email = String(u.email || "").toLowerCase();
    return {
        uid: u.localId,
        name: u.displayName || "",
        email,
        owner: !!email && email === OWNER_EMAIL && u.emailVerified === true
    };
}

function clean(v, max) {
    return String(v == null ? "" : v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest(); }

module.exports = { hasRedis, redis, verifyGoogleUser, clean, sha, crypto };
