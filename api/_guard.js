/* Protection for the public search / download endpoints (they use the owner's SubDL, OMDb, TMDB and Google Search quotas).
   guard(req, res, { kind, perMin, perHour, perDay, cache })  -> true when it already answered (429), so the caller returns.
   - per-IP limits in Redis (shared by every server). The owner's runner (admin key) is never limited.
   - cache: seconds the CDN may keep a successful answer (the same search by many people costs one call). Errors are never cached. */
"use strict";
const { overLimit } = require("./_google");
const adm = require("./_admin");

function ipOf(req) {
    return String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "x";
}

async function guard(req, res, o) {
    if (adm.isAdmin(req)) { return false; }
    const ip = ipOf(req);
    if ((o.perMin && await overLimit(o.kind + "m", ip, o.perMin, 60)) || (o.perHour && await overLimit(o.kind + "h", ip, o.perHour, 3600)) || (o.perDay && await overLimit(o.kind + "d", ip, o.perDay, 86400))) {
        res.setHeader("Cache-Control", "no-store");
        res.status(429).json({ error: "Too many requests. Please wait a while and try again." });
        return true;
    }
    if (o.cache) {
        res.setHeader("Cache-Control", "public, s-maxage=" + o.cache + ", stale-while-revalidate=" + o.cache * 6);
        const st = res.status.bind(res);
        res.status = function (c) {
            if (c !== 200) { res.setHeader("Cache-Control", "no-store"); }
            const r = st(c), js = r.json.bind(r);
            // an empty answer ("no subtitles yet") is never cached, so the auto runner's retries and new uploads show up at once
            r.json = function (b) { if (b && (b.error || b.total === 0 || (Array.isArray(b.results) && !b.results.length))) { res.setHeader("Cache-Control", "no-store"); } return js(b); };
            return r;
        };
    }
    return false;
}

module.exports = { guard, ipOf };
