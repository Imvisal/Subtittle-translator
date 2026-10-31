/* SinSubz — browser side of the translation library (server side: api/_library.js).

   A finished Sinhala translation is saved together with the English file it came from. When
   somebody picks ANOTHER release of the same film / episode (BluRay, WEB-DL ...), script.js looks the
   saved copy up here and lines it up with retime.js instead of paying for a new AI translation.

   Works in the browser (window.SinSubzLibrary) and in Node (require, used by the tests). */
(function (root, factory) {
    if (typeof module === "object" && module.exports) { module.exports = factory(); }
    else { root.SinSubzLibrary = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var API = "/api/translate";
    var LOOKUP_TIMEOUT_MS = 12000;

    // control characters are never valid subtitle text (the server refuses the whole copy otherwise)
    var CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

    // ---- key of a film / episode (+ translation style) ---------------------------------
    function titleKey(item, season, episode, style) {
        var id = String((item && item.imdbID) || "").toLowerCase();
        if (!/^tt\d{5,10}$/.test(id)) { return ""; }

        var key = id;
        if (item && item.type === "series") {
            var s = Number(season), e = Number(episode);
            if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 0 || s > 999 || e > 9999) { return ""; }
            key += ":s" + s + "e" + e;
        }

        var st = String(style || "natural").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "natural";
        return key + ":" + st;
    }

    // ---- hash of the English text (same words = same hash, whatever the timing / tags / case) ----
    function hash53(str, seed) {
        var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (var i = 0; i < str.length; i++) {
            var ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return ("00000000" + (h1 >>> 0).toString(16)).slice(-8) + ("00000000" + (h2 >>> 0).toString(16)).slice(-8);
    }

    function hashCues(cues) {
        var text = (cues || [])
            .map(function (c) {
                return String((c && c.text) || "").toLowerCase().replace(/<[^>]*>/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
            })
            .filter(Boolean)
            .join("\n");
        return hash53(text, 0);
    }

    // ---- "00:01:02,500 --> 00:01:04,000" -> { s, e } in ms ---------------------------------
    function cueTimes(timestamp) {
        var m = String(timestamp || "").match(/(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/);
        if (!m) { return { s: 0, e: 0 }; }
        function ms(h, mi, se, f) { return ((+h) * 3600 + (+mi) * 60 + (+se)) * 1000 + (+String(f).padEnd(3, "0")); }
        return { s: ms(m[1], m[2], m[3], m[4]), e: ms(m[5], m[6], m[7], m[8]) };
    }

    function startKey(timestamp) {
        return String(timestamp || "").split("-->")[0].trim();
    }

    // ---- pairs to save: English line + the Sinhala line that came back for the same start time ----
    function buildPairs(english, translated) {
        var si = new Map();
        (translated || []).forEach(function (c) {
            var k = startKey(c && c.timestamp);
            if (k && !si.has(k)) { si.set(k, String((c && c.text) || "")); }
        });

        var pairs = [];
        (english || []).forEach(function (c) {
            var text = si.get(startKey(c && c.timestamp));
            if (!text) { return; }

            var en = String(c.text || "").replace(CONTROL, " ").trim();
            var sinhala = text.replace(CONTROL, " ").trim();
            if (!en || !sinhala || sinhala.length > 900) { return; }

            var t = cueTimes(c.timestamp);
            pairs.push({ s: t.s, e: t.e, en: en.slice(0, 600), si: sinhala });
        });
        return pairs;
    }

    // ---- network -----------------------------------------------------------------------
    // saved copies of this film / episode (the exact English file first). [] when none / library off.
    function lookup(key, hash) {
        var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, LOOKUP_TIMEOUT_MS) : null;

        return fetch(API + "?lib=get&k=" + encodeURIComponent(key) + "&h=" + encodeURIComponent(hash), {
            cache: "no-store",
            signal: ctl ? ctl.signal : undefined
        })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { return d && d.enabled && Array.isArray(d.entries) ? d.entries : []; })
            .catch(function () { return []; })
            .then(function (entries) { if (timer) { clearTimeout(timer) } return entries; });
    }

    // fire and forget: only a (nearly) complete translation is worth keeping
    function save(key, hash, pairs, englishCount) {
        if (!key || !hash || !Array.isArray(pairs) || pairs.length < 20) { return Promise.resolve(false); }
        if (englishCount && pairs.length < englishCount * 0.9) { return Promise.resolve(false); }

        return fetch(API + "?lib=save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ k: key, h: hash, pairs: pairs }),
            keepalive: pairs.length < 300
        })
            .then(function (r) { return r.ok || r.status === 204; })
            .catch(function () { return false; });
    }

    return {
        titleKey: titleKey,
        hashCues: hashCues,
        cueTimes: cueTimes,
        startKey: startKey,
        buildPairs: buildPairs,
        lookup: lookup,
        save: save
    };
});
