/* SinSubz: clean-up passes that run on the translated cues (browser and Node).

   The translation model sometimes gives us cues that are technically valid but bad to watch:
   - a cue whose end time is before (or at) its start time, so a player never shows it;
   - a sentence that appears twice (the model leaked a "context" line, or repeated half a
     sentence that was split over two cues);
   - a two-speaker cue ("- Hi. / - Hello.") that lost its dashes;
   - a character name spelled two slightly different ways.

   Every function here is pure (no DOM, no network) and cleanup() never throws: if anything
   looks odd it returns the cues it was given. */
(function (root, factory) {
    if (typeof module === "object" && module.exports) { module.exports = factory(); }
    else { root.SinSubzCleanup = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var TARGET_CPS = 17;       // reading speed used elsewhere (polishReadability)
    var GAP = 0.08;            // quiet time kept between two cues, seconds

    var TS = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/;

    function parseTs(ts) {
        var m = TS.exec(String(ts || ""));
        if (!m) { return null; }
        var t = function (h, mi, s, ms) { return (+h) * 3600 + (+mi) * 60 + (+s) + (+String(ms).padEnd(3, "0")) / 1000; };
        return { start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]) };
    }

    function fmtTs(a, b) {
        var one = function (sec) {
            var ms = Math.max(0, Math.round(sec * 1000));
            var p = function (n, w) { return String(n).padStart(w, "0"); };
            return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor((ms % 3600000) / 60000), 2) + ":" +
                p(Math.floor((ms % 60000) / 1000), 2) + "," + p(ms % 1000, 3);
        };
        return one(a) + " --> " + one(b);
    }

    function plain(t) { return String(t || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

    // words of any script (letters, marks and the joiner Sinhala needs), tags removed
    function words(t) {
        return (String(t || "").replace(/<[^>]+>/g, " ").match(/[\p{L}\p{M}\p{N}\u200D]+/gu) || []);
    }

    // share of the smaller word set that is also in the bigger one (0..1)
    function containment(a, b) {
        var sa = new Set(a), sb = new Set(b);
        var small = sa.size <= sb.size ? sa : sb, big = small === sa ? sb : sa;
        if (!small.size) { return 0; }
        var hit = 0;
        small.forEach(function (w) { if (big.has(w)) { hit++; } });
        return hit / small.size;
    }

    // ------------------------------------------------------------------
    // 1. two-speaker cues keep their dashes
    // ------------------------------------------------------------------
    var DASH = /^(?:<[^>]+>)*\s*[-\u2013\u2014]\s*/;

    function restoreSpeakerDashes(originalText, translatedText) {
        var lines = function (s) { return String(s || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); };
        var ol = lines(originalText), tl = lines(translatedText);

        if (ol.filter(function (l) { return DASH.test(l); }).length < 2) { return translatedText; }
        if (tl.filter(function (l) { return DASH.test(l); }).length >= 2) { return translatedText; }

        var strip = function (l) { return l.replace(/^\s*[-\u2013\u2014]\s*/, ""); };

        if (tl.length === ol.length && tl.length >= 2) {
            return tl.map(function (l) { return "- " + strip(l); }).join("\n");
        }

        // one translated line for two speakers: split it where a sentence ends, nearest the middle
        if (tl.length === 1 && ol.length === 2) {
            var s = strip(tl[0]), mid = s.length / 2, best = -1, re = /[.?!\u2026]+["')\u201D]*\s+/g, m;
            while ((m = re.exec(s))) {
                var cut = m.index + m[0].length;
                if (cut >= 3 && s.length - cut >= 3 && (best === -1 || Math.abs(cut - mid) < Math.abs(best - mid))) { best = cut; }
            }
            if (best !== -1) {
                return "- " + s.slice(0, best).trim() + "\n- " + s.slice(best).trim();
            }
        }
        return translatedText;
    }

    // ------------------------------------------------------------------
    // 2. every cue must be on screen for a positive time
    // ------------------------------------------------------------------
    function joinText(a, b) {
        var n = String(a).split("\n").length + String(b).split("\n").length;
        return n <= 2 ? a + "\n" + b : a + " " + b;
    }

    function repairCueTiming(subs) {
        var work = subs.map(function (s) { return Object.assign({}, s); });
        var out = [];

        for (var i = 0; i < work.length; i++) {
            var cur = work[i], t = parseTs(cur.timestamp);

            if (!t || t.end - t.start > 0.001) { out.push(cur); continue; }

            var nextCue = work[i + 1], next = nextCue ? parseTs(nextCue.timestamp) : null;

            // starts together with the next cue: show both as one cue
            if (next && next.start - t.start < 0.5) {
                nextCue.text = joinText(cur.text, nextCue.text);
                nextCue.timestamp = fmtTs(Math.min(t.start, next.start), Math.max(next.end, next.start + 0.5));
                continue;
            }

            // otherwise give it a short time of its own, never into the next cue
            var want = Math.min(4, Math.max(1, plain(cur.text).length / TARGET_CPS));
            var end = Math.min(t.start + want, next ? next.start - GAP : Infinity);
            if (end < t.start + 0.3) { end = t.start + 0.5; }
            cur.timestamp = fmtTs(t.start, end);
            out.push(cur);
        }
        return out;
    }

    // ------------------------------------------------------------------
    // 3. the same sentence twice in a row
    // ------------------------------------------------------------------
    // A pair counts as a leak only when the SINHALA texts are near-identical but the ENGLISH
    // cues they came from are different (so a real echo like "Alive." / "Alive?" is kept).
    // opts.chunkSize: cues are translated in chunks; a leaked context line is the earlier cue
    // of a pair that straddles a chunk border.
    function dedupeNearDuplicates(subs, origTexts, opts) {
        var chunk = (opts && opts.chunkSize) || 0;
        var drop = new Set();

        for (var i = 0; i < subs.length; i++) {
            for (var d = 1; d <= 2; d++) {
                var j = i + d;
                if (j >= subs.length || drop.has(i) || drop.has(j)) { continue; }

                var wa = words(subs[i].text), wb = words(subs[j].text);
                if (Math.min(wa.length, wb.length) < 4) { continue; }
                if (containment(wa, wb) < 0.75) { continue; }

                var ea = words(origTexts[i]).map(function (w) { return w.toLowerCase(); });
                var eb = words(origTexts[j]).map(function (w) { return w.toLowerCase(); });
                if (ea.length && eb.length && containment(ea, eb) >= 0.5) { continue; }   // the English repeats too: real echo

                var crosses = chunk > 0 && Math.floor(i / chunk) !== Math.floor(j / chunk);
                if (crosses) { drop.add(i); }
                else if (d === 1) { drop.add(wa.length < wb.length ? i : j); }   // half-sentence repeated by the next cue
                // two apart inside one chunk: could be a real echo, leave it
            }
        }

        if (!drop.size) { return subs; }

        var out = [];
        for (var k = 0; k < subs.length; k++) {
            if (!drop.has(k)) { out.push(subs[k]); continue; }

            // a repeated half-sentence that follows straight on from its full version:
            // let the kept cue stay on screen for that time too
            var prev = out[out.length - 1];
            if (prev && !drop.has(k - 1) && containment(words(prev.text), words(subs[k].text)) >= 0.75) {
                var tp = parseTs(prev.timestamp), td = parseTs(subs[k].timestamp);
                if (tp && td && td.start >= tp.end && td.start - tp.end < 0.5) {
                    out[out.length - 1] = Object.assign({}, prev, { timestamp: fmtTs(tp.start, Math.max(tp.end, td.end)) });
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------
    // 4. one spelling per character name
    // ------------------------------------------------------------------
    // Sinhala vowel signs (ා ැ ෑ ි ී ු ූ ෘ ෙ ේ ෛ ො ෝ ෞ ෟ ෲ ෳ) are dropped to compare spellings.
    // The "al" sign (්) and the letters are kept, so only vowel-length / vowel-sign spelling
    // differences count as the same name.
    var SIGNS = /[\u0DCF-\u0DDF\u0DF2\u0DF3]/g;
    function skeleton(w) { return w.replace(SIGNS, ""); }

    var NOT_NAMES = new Set(["God", "Mrs", "Mr", "Miss", "Ms", "Hello", "Hey", "Hi", "Okay", "Yeah", "Yes", "Well",
        "Sorry", "Thanks", "Thank", "Please", "Sir", "Madam", "Dad", "Daddy", "Mom", "Mommy", "Mum", "Mummy",
        "Doctor", "Officer", "Lord", "Jesus", "Christmas", "American", "English", "British"]);

    function buildNameGlossary(origTexts, transTexts) {
        var cap = {}, low = {}, i, toks;

        for (i = 0; i < origTexts.length; i++) {
            toks = String(origTexts[i] || "").replace(/<[^>]+>/g, " ").match(/[A-Za-z]+/g) || [];
            toks.forEach(function (w) {
                if (w.length < 3) { return; }
                if (/^[A-Z][a-z]+$/.test(w)) { cap[w] = (cap[w] || 0) + 1; }
                else if (/^[a-z]+$/.test(w)) { low[w] = (low[w] || 0) + 1; }
            });
        }

        var names = Object.keys(cap).filter(function (w) {
            return cap[w] >= 4 && !low[w.toLowerCase()] && !NOT_NAMES.has(w);
        });
        if (!names.length) { return {}; }

        var cueWords = transTexts.map(function (t) { return new Set(words(t)); });
        var overall = {};
        cueWords.forEach(function (set) { set.forEach(function (w) { overall[w] = (overall[w] || 0) + 1; }); });

        var glossary = {};
        names.forEach(function (name) {
            var re = new RegExp("\\b" + name + "\\b"), inName = {}, cues = 0;
            for (var k = 0; k < origTexts.length; k++) {
                if (!re.test(String(origTexts[k] || ""))) { continue; }
                cues++;
                cueWords[k].forEach(function (w) { inName[w] = (inName[w] || 0) + 1; });
            }
            var best = null;
            Object.keys(inName).forEach(function (w) {
                if (!/[\u0D80-\u0DFF]/.test(w) || Array.from(w).length < 5) { return; }
                if (inName[w] < 3 || inName[w] / overall[w] < 0.6) { return; }
                if (!best || inName[w] > inName[best] || (inName[w] === inName[best] && w.length < best.length)) { best = w; }
            });
            if (best) { glossary[name] = best; }
        });
        return glossary;
    }

    function unifyNameSpellings(subs, glossary) {
        var bases = Object.keys(glossary || {}).map(function (n) { return glossary[n]; });
        if (!bases.length) { return { subs: subs, changes: [] }; }

        var count = {};
        subs.forEach(function (s) { words(s.text).forEach(function (w) { count[w] = (count[w] || 0) + 1; }); });

        var map = {}, changes = [];
        bases.forEach(function (base) {
            var sk = skeleton(base);
            Object.keys(count).forEach(function (w) {
                // same length: only a vowel sign was swapped (a missing sign is usually a different word)
                if (w !== base && Array.from(w).length === Array.from(base).length &&
                    skeleton(w) === sk && count[w] * 4 <= count[base]) {
                    map[w] = base;
                    changes.push([w, base, count[w]]);
                }
            });
        });
        if (!changes.length) { return { subs: subs, changes: [] }; }

        var out = subs.map(function (s) {
            var text = s.text.replace(/[\p{L}\p{M}\u200D]+/gu, function (w) { return map[w] || w; });
            return text === s.text ? s : Object.assign({}, s, { text: text });
        });
        return { subs: out, changes: changes };
    }

    // ------------------------------------------------------------------
    // all passes, in order. subs and origTexts are parallel arrays (same cue at the same index).
    // ------------------------------------------------------------------
    function cleanup(subs, origTexts, opts) {
        try {
            if (!Array.isArray(subs) || !Array.isArray(origTexts) || subs.length !== origTexts.length || !subs.length) {
                return subs;
            }
            var glossary = buildNameGlossary(origTexts, subs.map(function (s) { return s.text; }));
            var current = unifyNameSpellings(subs, glossary).subs;
            current = dedupeNearDuplicates(current, origTexts, opts);
            current = repairCueTiming(current);
            return current;
        } catch (e) {
            if (typeof console !== "undefined") { console.warn("Cue clean-up skipped:", e); }
            return subs;
        }
    }

    return {
        cleanup: cleanup,
        restoreSpeakerDashes: restoreSpeakerDashes,
        repairCueTiming: repairCueTiming,
        dedupeNearDuplicates: dedupeNearDuplicates,
        buildNameGlossary: buildNameGlossary,
        unifyNameSpellings: unifyNameSpellings,
        parseTs: parseTs
    };
});
