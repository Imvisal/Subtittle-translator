/* SinSubz: re-use a saved Sinhala translation for ANOTHER release of the same film / episode.

   A saved translation is a list of pairs { s, e, en, si } (start ms, end ms, English text, Sinhala
   text). A different release (BluRay vs WEB-DL ...) has its own English subtitle with different
   timing and sometimes different line breaks. This file lines the two English subtitles up by
   TEXT (not by time, which differs) and puts the saved Sinhala text onto the new subtitle's own
   cues. The new file keeps its own timing exactly, so nothing has to be "shifted".

   Pure functions only (no DOM, no network, no AI). Works in the browser (window.SinSubzRetime) and in
   Node (require).

   retime(pairs, bCues) ->
     {
       ok,          // true when score >= MIN_SCORE and the matched lines are close enough to the saved ones
       score,       // 0..1  share of the new subtitle (weighted by words) that got a saved Sinhala line
       meanSim,     // 0..1  how alike the matched English lines are (1 = identical)
       items,       // one entry per usable cue of the new subtitle:
                    //   { index, s, e, text, si }   si === null -> not matched, needs AI
       missing,     // positions in `items` with si === null
       reason       // short text when ok is false
     }
*/
(function (root, factory) {
    if (typeof module === "object" && module.exports) { module.exports = factory(); }
    else { root.SinSubzRetime = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    // ---- tuning -------------------------------------------------------------------------
    var MIN_SCORE = 0.95;        // at least this share of the new subtitle must get a saved Sinhala line
    var MIN_MEAN_SIM = 0.80;     // ... and the matched English lines must be this alike on average
    var MIN_CUE_SIM = 0.60;      // one line pair: below this it is not the same sentence
    var MIN_GROUP_SIM = 0.65;    // a merged / split line needs a little more proof
    var MIN_PART_IN = 0.60;      // each half of a merged / split line must really be part of the other side
    var GROUP_PENALTY = 0.98;    // prefer a plain 1:1 match when it is equally good
    var WINDOW_MS = 25000;       // when the time map is known, a line only looks this far around
    var OUTLIER_MS = 6000;       // a match this far from its neighbours' time offset is dropped
    var MIN_ANCHORS = 6;         // fewer exact-text anchors than this -> no time map, text only
    var MAX_CELLS = 9e6;         // memory guard for the alignment table
    var MIN_CUES = 20;           // a tiny subtitle is not worth trusting

    // ads / credits of subtitle sites: never translated, never counted
    var JUNK = /(www\.|\.com\b|\.org\b|\.net\b|\.lk\b|subtitles?\s+by|sync(?:ed|hronized)?\s*(?:&|and)?\s*corrected|opensubtitles|subdl|addic7ed|tvsubtitles|sub-?way|podnapisi|downloaded\s+from|please\s+rate\s+this\s+subtitle)/i;

    // ---- text -> tokens -----------------------------------------------------------------
    function tokenize(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/<[^>]*>/g, " ")
            .replace(/[‘’ʼ`]/g, "'")
            .replace(/[♪♫♩]/g, " ")
            .replace(/'/g, "")
            .replace(/[^a-z0-9À-ɏ\s]+/g, " ")
            .split(/\s+/)
            .filter(Boolean);
    }

    var vocab = new Map();
    function tokenId(word) {
        var id = vocab.get(word);
        if (id === undefined) { id = vocab.size + 1; vocab.set(word, id); }
        return id;
    }

    function prepare(text) {
        var words = tokenize(text);
        var ids = words.map(tokenId);
        return {
            key: words.length >= 3 ? words.join(" ") : "",
            n: words.length,
            sorted: ids.slice().sort(function (a, b) { return a - b; })
        };
    }

    function mergeSorted(a, b) {
        var out = new Array(a.length + b.length), i = 0, j = 0, k = 0;
        while (i < a.length && j < b.length) { out[k++] = a[i] <= b[j] ? a[i++] : b[j++]; }
        while (i < a.length) { out[k++] = a[i++]; }
        while (j < b.length) { out[k++] = b[j++]; }
        return out;
    }

    // number of words two sorted token lists share (repeated words count as often as they repeat)
    function common(a, b) {
        var la = a.length, lb = b.length;
        var i = 0, j = 0, n = 0;
        while (i < la && j < lb) {
            var x = a[i], y = b[j];
            if (x === y) { n++; i++; j++; }
            else if (x < y) { i++; }
            else { j++; }
        }
        return n;
    }

    // Dice coefficient on two sorted token lists
    function dice(a, b) {
        var la = a.length, lb = b.length;
        if (!la || !lb) { return 0; }
        return (2 * common(a, b)) / (la + lb);
    }

    // how much of `part` is found in `whole` (1 = every word of the part is there)
    function contained(part, whole) {
        if (!part.length) { return 0; }
        return common(part, whole) / part.length;
    }

    // ---- time map from exact-text anchors ------------------------------------------------
    // Lines that appear exactly once in BOTH subtitles are safe anchors. They give a rough
    // "old time -> new time" curve (offset, frame-rate change, cut scenes) that only keeps the
    // search window small. The final timing always comes from the new subtitle itself.
    function buildTimeMap(A, B) {
        var countA = new Map(), countB = new Map();
        A.forEach(function (c) { if (c.p.key) { countA.set(c.p.key, (countA.get(c.p.key) || 0) + 1); } });
        B.forEach(function (c) { if (c.p.key) { countB.set(c.p.key, (countB.get(c.p.key) || 0) + 1); } });

        var posB = new Map();
        B.forEach(function (c) { if (c.p.key && countB.get(c.p.key) === 1) { posB.set(c.p.key, c.s); } });

        var anchors = [];
        A.forEach(function (c) {
            if (c.p.key && countA.get(c.p.key) === 1 && posB.has(c.p.key)) {
                anchors.push([c.s, posB.get(c.p.key)]);
            }
        });
        anchors.sort(function (x, y) { return x[0] - y[0]; });

        // keep the longest run that is increasing in the new time too
        var n = anchors.length;
        if (n < MIN_ANCHORS) { return null; }
        var len = new Array(n).fill(1), prev = new Array(n).fill(-1), best = 0;
        for (var i = 0; i < n; i++) {
            for (var j = 0; j < i; j++) {
                if (anchors[j][1] < anchors[i][1] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
            }
            if (len[i] > len[best]) { best = i; }
        }
        var run = [];
        for (var k = best; k !== -1; k = prev[k]) { run.push(anchors[k]); }
        run.reverse();

        // drop anchors whose offset disagrees with the neighbours (a wrong repeat of a line)
        var kept = run.filter(function (a, idx) {
            var lo = Math.max(0, idx - 5), hi = Math.min(run.length - 1, idx + 5);
            var offs = [];
            for (var q = lo; q <= hi; q++) { offs.push(run[q][1] - run[q][0]); }
            offs.sort(function (x, y) { return x - y; });
            var med = offs[Math.floor(offs.length / 2)];
            return Math.abs((a[1] - a[0]) - med) <= 8000;
        });
        if (kept.length < MIN_ANCHORS) { return null; }

        var xs = kept.map(function (a) { return a[0]; });
        var ys = kept.map(function (a) { return a[1]; });
        var last = xs.length - 1;

        return function (x) {
            if (x <= xs[0]) { return x + (ys[0] - xs[0]); }
            if (x >= xs[last]) { return x + (ys[last] - xs[last]); }
            var lo = 0, hi = last;
            while (hi - lo > 1) {
                var mid = (lo + hi) >> 1;
                if (xs[mid] <= x) { lo = mid; } else { hi = mid; }
            }
            var t = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
            return ys[lo] + t * (ys[hi] - ys[lo]);
        };
    }

    // first index with arr[i] >= v
    function lowerBound(arr, v) {
        var lo = 0, hi = arr.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) { lo = mid + 1; } else { hi = mid; } }
        return lo;
    }

    // ---- the main function ---------------------------------------------------------------
    function retime(pairs, bCues, opts) {

        var minScore = (opts && typeof opts.minScore === "number") ? opts.minScore : MIN_SCORE;

        function fail(reason) {
            return { ok: false, score: 0, meanSim: 0, items: [], missing: [], reason: reason };
        }

        // saved side: only pairs that really have a Sinhala line
        var A = [];
        (pairs || []).forEach(function (p) {
            if (p && typeof p.si === "string" && p.si.trim() && typeof p.en === "string") {
                A.push({ s: +p.s || 0, e: +p.e || 0, si: p.si, p: prepare(p.en) });
            }
        });

        // new side: skip site ads / credits
        var B = [];
        (bCues || []).forEach(function (c, index) {
            if (!c || typeof c.text !== "string") { return; }
            if (JUNK.test(c.text)) { return; }
            var p = prepare(c.text);
            B.push({ index: index, s: +c.s || 0, e: +c.e || 0, text: c.text, p: p, w: Math.max(1, p.n) });
        });

        var n = A.length, m = B.length;
        if (n < MIN_CUES || m < MIN_CUES) { return fail("too few lines"); }

        var map = buildTimeMap(A, B);
        var W = m + 1;
        if ((n + 1) * W > MAX_CELLS) { return fail("subtitle too long to compare"); }

        // the part of B each A line is allowed to look at
        var bStarts = B.map(function (c) { return c.s; });
        var jLo = new Int32Array(n), jHi = new Int32Array(n);
        for (var i0 = 0; i0 < n; i0++) {
            if (map) {
                var centre = map(A[i0].s);
                jLo[i0] = lowerBound(bStarts, centre - WINDOW_MS);
                jHi[i0] = lowerBound(bStarts, centre + WINDOW_MS + 1) - 1;
            } else {
                jLo[i0] = 0;
                jHi[i0] = m - 1;
            }
        }

        // pre-merged neighbours for the 2:1 and 1:2 cases
        var mergedA = new Array(n), mergedB = new Array(m);
        for (var a0 = 1; a0 < n; a0++) { mergedA[a0] = mergeSorted(A[a0 - 1].p.sorted, A[a0].p.sorted); }
        for (var b0 = 1; b0 < m; b0++) { mergedB[b0] = mergeSorted(B[b0 - 1].p.sorted, B[b0].p.sorted); }

        // dp[i][j] = best total gain using the first i saved lines and the first j new lines
        var dp = new Float32Array((n + 1) * W);
        var bk = new Uint8Array((n + 1) * W);     // 1 skip A, 2 skip B, 3 1:1, 4 2A:1B, 5 1A:2B

        for (var i = 1; i <= n; i++) {

            var ai = i - 1;
            var lo = jLo[ai], hi = jHi[ai];
            var rowUp = (i - 1) * W, row = i * W;

            for (var j = 1; j <= m; j++) {

                var best = dp[rowUp + j], code = 1;
                var left = dp[row + j - 1];
                if (left > best) { best = left; code = 2; }

                var bj = j - 1;

                if (bj >= lo && bj <= hi) {

                    // 1 : 1
                    var s11 = dice(A[ai].p.sorted, B[bj].p.sorted);
                    if (s11 >= MIN_CUE_SIM) {
                        var c3 = dp[rowUp + j - 1] + s11 * B[bj].w;
                        if (c3 > best + 1e-9) { best = c3; code = 3; }
                    }

                    // 2 saved lines -> 1 new line
                    if (i >= 2) {
                        var s21 = dice(mergedA[ai], B[bj].p.sorted);
                        if (s21 >= MIN_GROUP_SIM &&
                            contained(A[ai - 1].p.sorted, B[bj].p.sorted) >= MIN_PART_IN &&
                            contained(A[ai].p.sorted, B[bj].p.sorted) >= MIN_PART_IN) {
                            var c4 = dp[(i - 2) * W + j - 1] + GROUP_PENALTY * s21 * B[bj].w;
                            if (c4 > best + 1e-9) { best = c4; code = 4; }
                        }
                    }

                    // 1 saved line -> 2 new lines
                    if (j >= 2 && bj - 1 >= lo) {
                        var s12 = dice(A[ai].p.sorted, mergedB[bj]);
                        // a stray "[MUSIC]" next to a normal line must not look like a split of it
                        if (s12 >= MIN_GROUP_SIM &&
                            contained(B[bj - 1].p.sorted, A[ai].p.sorted) >= MIN_PART_IN &&
                            contained(B[bj].p.sorted, A[ai].p.sorted) >= MIN_PART_IN) {
                            var c5 = dp[rowUp + j - 2] + GROUP_PENALTY * s12 * (B[bj - 1].w + B[bj].w);
                            if (c5 > best + 1e-9) { best = c5; code = 5; }
                        }
                    }
                }

                dp[row + j] = best;
                bk[row + j] = code;
            }
        }

        // walk back
        var groups = [];
        var ci = n, cj = m;
        while (ci > 0 && cj > 0) {
            var cd = bk[ci * W + cj];
            if (cd === 1) { ci--; }
            else if (cd === 2) { cj--; }
            else if (cd === 3) { groups.push({ a: [ci - 1], b: [cj - 1] }); ci--; cj--; }
            else if (cd === 4) { groups.push({ a: [ci - 2, ci - 1], b: [cj - 1] }); ci -= 2; cj--; }
            else { groups.push({ a: [ci - 1], b: [cj - 2, cj - 1] }); ci--; cj -= 2; }
        }
        groups.reverse();

        // time sanity: a match whose time offset is far from BOTH neighbours' offsets is a wrong repeat
        var offsets = groups.map(function (g) { return B[g.b[0]].s - A[g.a[0]].s; });
        function median(list) {
            var s = list.slice().sort(function (x, y) { return x - y; });
            return s[Math.floor(s.length / 2)];
        }
        groups = groups.filter(function (g, idx) {
            var before = offsets.slice(Math.max(0, idx - 5), idx);
            var after = offsets.slice(idx + 1, idx + 6);
            if (!before.length && !after.length) { return true; }
            var d = offsets[idx];
            var okBefore = before.length ? Math.abs(d - median(before)) <= OUTLIER_MS : false;
            var okAfter = after.length ? Math.abs(d - median(after)) <= OUTLIER_MS : false;
            return okBefore || okAfter;
        });

        // put the saved Sinhala onto the new cues
        var si = new Array(m).fill(null);
        var sim = new Array(m).fill(0);

        function words(t) { return String(t).replace(/\s+/g, " ").trim().split(" ").filter(Boolean); }

        groups.forEach(function (g) {

            if (g.a.length === 1 && g.b.length === 1) {
                si[g.b[0]] = A[g.a[0]].si;
                sim[g.b[0]] = dice(A[g.a[0]].p.sorted, B[g.b[0]].p.sorted);

            } else if (g.a.length === 2) {
                var joiner = B[g.b[0]].text.indexOf("\n") !== -1 ? "\n" : " ";
                si[g.b[0]] = A[g.a[0]].si.trim() + joiner + A[g.a[1]].si.trim();
                sim[g.b[0]] = dice(mergedA[g.a[1]], B[g.b[0]].p.sorted);

            } else {
                var parts = words(A[g.a[0]].si);
                if (parts.length < 2) { return; }          // cannot split one word: leave both for the AI
                var w1 = B[g.b[0]].w, w2 = B[g.b[1]].w;
                var k = Math.min(parts.length - 1, Math.max(1, Math.round(parts.length * w1 / (w1 + w2))));
                si[g.b[0]] = parts.slice(0, k).join(" ");
                si[g.b[1]] = parts.slice(k).join(" ");
                var shared = dice(A[g.a[0]].p.sorted, mergedB[g.b[1]]);
                sim[g.b[0]] = shared;
                sim[g.b[1]] = shared;
            }
        });

        var items = [], missing = [];
        var totalW = 0, gotW = 0, simW = 0;

        for (var q = 0; q < m; q++) {
            var c = B[q];
            totalW += c.w;
            if (si[q] !== null) { gotW += c.w; simW += c.w * sim[q]; }
            else { missing.push(items.length); }
            items.push({ index: c.index, s: c.s, e: c.e, text: c.text, si: si[q] });
        }

        var score = totalW ? gotW / totalW : 0;
        var meanSim = gotW ? simW / gotW : 0;

        var ok = score >= minScore && meanSim >= MIN_MEAN_SIM;
        var reason = ok ? "" : (score < minScore ? "only " + Math.round(score * 100) + "% of the lines matched" : "matched lines are too different");

        return { ok: ok, score: score, meanSim: meanSim, items: items, missing: missing, reason: reason };
    }

    return {
        retime: retime,
        tokenize: tokenize,
        MIN_SCORE: MIN_SCORE,
        MIN_MEAN_SIM: MIN_MEAN_SIM
    };
});
