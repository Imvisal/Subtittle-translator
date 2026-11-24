/* Tests for retime.js with synthetic "releases" (no real subtitles are used).
   Run:  node scripts/test-retime.js
   Each scenario builds a fake English subtitle A (with a Sinhala line tagged S<n> for every cue),
   then a fake second release B (offset, other frame rate, cut scenes, merged / split lines, other
   wording ...) and checks that every B cue gets the Sinhala line of the right A cue. */
"use strict";

const R = require("../retime.js");

// ---------- tiny seeded random ----------
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const COMMON = "the you i to a it is that what do not we he she they this for on with my your are was have just know so no yes going come get can will one about there here now right want need think see".split(" ");
function makeVocab(rand) {
    const syl = ["ba", "ko", "ra", "mi", "ten", "lo", "sha", "dru", "vin", "pa", "ze", "qui", "mor", "tal", "hen", "wex", "lar", "nio", "fa", "gri"];
    const words = [];
    for (let i = 0; i < 700; i++) {
        let w = "";
        const k = 1 + Math.floor(rand() * 3);
        for (let q = 0; q < k; q++) { w += syl[Math.floor(rand() * syl.length)]; }
        words.push(w);
    }
    return words;
}
const SHORT = ["Yeah.", "What?", "Okay.", "No.", "Hey.", "Right.", "Come on.", "Sure.", "Thank you.", "Oh my God.", "Hello.", "Please."];

function makeSubtitle(seed, count) {
    const rand = rng(seed);
    const vocab = makeVocab(rng(7));            // same vocabulary for every show (hard case)
    const pick = () => (rand() < 0.45 ? COMMON[Math.floor(rand() * COMMON.length)] : vocab[Math.floor(Math.pow(rand(), 1.6) * vocab.length)]);
    const cues = [];
    let t = 4000;
    for (let i = 0; i < count; i++) {
        let text;
        if (rand() < 0.18) {
            text = SHORT[Math.floor(rand() * SHORT.length)];
        } else {
            const n = 3 + Math.floor(rand() * 9);
            const w = [];
            for (let k = 0; k < n; k++) { w.push(pick()); }
            text = w.join(" ");
            text = text[0].toUpperCase() + text.slice(1) + (rand() < 0.2 ? "?" : ".");
            if (n > 7 && rand() < 0.5) {            // two-line cue
                const parts = text.split(" ");
                const mid = Math.floor(parts.length / 2);
                text = parts.slice(0, mid).join(" ") + "\n" + parts.slice(mid).join(" ");
            }
        }
        const dur = Math.max(1000, Math.min(5000, text.length * 65));
        cues.push({ s: t, e: t + dur, en: text });
        t += dur + (rand() < 0.04 ? 20000 + rand() * 40000 : 200 + rand() * 3000);
    }
    return cues;
}

const pairsOf = cues => cues.map((c, i) => ({
    s: c.s, e: c.e, en: c.en,
    si: "S" + i + " " + c.en.replace(/\s+/g, " ").split(" ").reverse().join(" ")
}));

// each B cue: { s, e, text, truth: [A indices] , part?: 0|1 }
const copyCue = (c, i, f) => ({ s: f(c.s), e: f(c.e), text: c.en, truth: [i] });

function variantOffset(A, ms) { return A.map((c, i) => copyCue(c, i, t => t + ms)); }
function variantFps(A) { return A.map((c, i) => copyCue(c, i, t => Math.round(t * 25 / 23.976) + 1200)); }

function variantCut(A, rand) {
    // no intro (first 90 s), a 60 s section removed in the middle, a "previously on" recap added
    const midStart = A[Math.floor(A.length / 2)].s;
    const out = [];
    A.forEach((c, i) => {
        if (c.s < 90000) { return; }
        if (c.s >= midStart && c.s < midStart + 60000) { return; }
        const shift = c.s >= midStart + 60000 ? 150000 : 90000;
        out.push({ s: c.s - shift + 30000, e: c.e - shift + 30000, text: c.en, truth: [i] });
    });
    const recap = makeSubtitle(991, 18).map((c, k) => ({ s: 2000 + k * 1500, e: 3200 + k * 1500, text: c.en, truth: [] }));
    return recap.concat(out);
}

function variantMergeSplit(A, rand) {
    const out = [];
    for (let i = 0; i < A.length; i++) {
        const c = A[i], r = rand();
        if (r < 0.10 && i + 1 < A.length) {
            const d = A[i + 1];
            out.push({ s: c.s, e: d.e, text: c.en + "\n" + d.en, truth: [i, i + 1] });
            i++;
        } else if (r < 0.20 && c.en.replace(/\s+/g, " ").split(" ").length >= 6) {
            const words = c.en.replace(/\s+/g, " ").split(" ");
            const k = Math.floor(words.length / 2);
            const mid = Math.round((c.s + c.e) / 2);
            out.push({ s: c.s, e: mid - 50, text: words.slice(0, k).join(" "), truth: [i], part: 0 });
            out.push({ s: mid + 50, e: c.e, text: words.slice(k).join(" "), truth: [i], part: 1 });
        } else {
            out.push({ s: c.s, e: c.e, text: c.en, truth: [i] });
        }
    }
    return out;
}

function variantWording(A, rand, share, strength) {
    return A.map((c, i) => {
        let text = c.en;
        const words = text.replace(/\n/g, " ").split(" ");
        if (rand() < share) {
            for (let k = 0; k < words.length; k++) { if (rand() < strength) { words[k] = "zz" + k; } }
        }
        text = words.join(" ");
        const r = rand();
        if (r < 0.10) { text = "<i>" + text + "</i>"; }
        else if (r < 0.16) { text = "JOHN: " + text; }
        else if (r < 0.22) { text = text.toUpperCase(); }
        else if (r < 0.26) { text = "- " + text; }
        return { s: c.s + 300, e: c.e + 300, text: text, truth: c.truth || [i], part: c.part };
    });
}

function variantSdhNoise(A, rand) {
    const out = [];
    A.forEach((c, i) => {
        out.push({ s: c.s, e: c.e, text: c.en, truth: [i] });
        if (rand() < 0.05) { out.push({ s: c.e + 50, e: c.e + 900, text: "[MUSIC PLAYING]", truth: [] }); }
    });
    return out;
}

// ---------- run + check ----------
function check(name, pairs, B, expectOk, minAcc) {
    const t0 = Date.now();
    const res = R.retime(pairs, B.map(b => ({ s: b.s, e: b.e, text: b.text })));
    const ms = Date.now() - t0;

    let right = 0, total = 0, wrong = [];
    res.items.forEach(it => {
        const b = B[it.index];
        if (!b.truth.length) { return; }
        total++;
        let good;
        if (it.si === null) { good = false; }
        else if (b.part === 1) { good = it.si.length > 0 && it.si.indexOf("S" + b.truth[0] + " ") !== 0; }
        else if (b.truth.length === 2) { good = it.si.indexOf("S" + b.truth[0] + " ") !== -1 && it.si.indexOf("S" + b.truth[1] + " ") !== -1; }
        else { good = it.si.indexOf("S" + b.truth[0] + " ") === 0; }
        if (good) { right++; } else if (wrong.length < 3) { wrong.push({ at: it.index, text: b.text.slice(0, 40), got: it.si && it.si.slice(0, 18), want: b.truth }); }
    });

    const acc = total ? right / total : 1;
    const pass = res.ok === expectOk && (!expectOk || acc >= minAcc);
    console.log(
        (pass ? "PASS " : "FAIL ") + name.padEnd(34) +
        " ok=" + String(res.ok).padEnd(5) + " score=" + res.score.toFixed(3) + " sim=" + res.meanSim.toFixed(3) +
        " correct=" + (acc * 100).toFixed(1) + "% missing=" + res.missing.length + "/" + res.items.length + " " + ms + "ms" +
        (res.ok ? "" : "  (" + res.reason + ")")
    );
    if (!pass && wrong.length) { console.log("     examples:", JSON.stringify(wrong)); }
    return pass;
}

let allPass = true;
for (const seed of [1, 2, 3]) {
    console.log("--- show " + seed + " (" + (seed === 3 ? 1500 : 900) + " cues)");
    const A = makeSubtitle(seed * 100, seed === 3 ? 1500 : 900);
    const pairs = pairsOf(A);
    const rand = rng(seed * 31);
    const tests = [
        ["same file",                      variantOffset(A, 0), true, 0.999],
        ["offset +2.5 s",                  variantOffset(A, 2500), true, 0.999],
        ["offset -4 s",                    variantOffset(A, -4000), true, 0.999],
        ["frame rate 23.976 -> 25",        variantFps(A), true, 0.995],
        ["intro cut + recap + mid cut",    variantCut(A, rand), true, 0.99],
        ["lines merged / split",           variantMergeSplit(A, rng(5)), true, 0.97],
        ["other wording (light)",          variantWording(A, rng(6), 0.08, 0.2), true, 0.98],
        ["sound cues [MUSIC] added",       variantSdhNoise(A, rng(8)), true, 0.995],
        ["everything together",            variantWording(variantMergeSplit(A, rng(9)).map((b, k) => ({ s: Math.round(b.s * 25 / 23.976) + 1200, e: Math.round(b.e * 25 / 23.976) + 1200, en: b.text, truth: b.truth, part: b.part })), rng(10), 0.06, 0.2), true, 0.0],
        ["heavily reworded (35% lines)",   variantWording(A, rng(11), 0.35, 0.45), false, 0],
        ["different episode (new text)",   makeSubtitle(seed * 100 + 55, 900).map(c => ({ s: c.s, e: c.e, text: c.en, truth: [] })), false, 0],
    ];
    for (const [name, B, expectOk, minAcc] of tests) {
        if (name === "everything together") {
            // truth indices were kept through the wording step: rebuild minimal truth for accuracy
            const ok = check(name, pairs, B.map((b, k) => ({ s: b.s, e: b.e, text: b.text, truth: b.truth || [] })), expectOk, 0.9);
            allPass = allPass && ok;
        } else {
            allPass = check(name, pairs, B, expectOk, minAcc) && allPass;
        }
    }
}

// tiny inputs must be refused, not crash
const tiny = R.retime([], []);
console.log((tiny.ok === false ? "PASS " : "FAIL ") + "empty input is refused (" + tiny.reason + ")");
allPass = allPass && tiny.ok === false;

console.log(allPass ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
process.exit(allPass ? 0 : 1);
