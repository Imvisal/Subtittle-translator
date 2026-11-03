// node scripts/test-quality.js [path-to-srt]   checks the negation + readability fixes
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const C = require("../subtitle-cleanup.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// ---- negation ----
const mk = t => t.map((x, i) => ({ number: i + 1, timestamp: "00:00:0" + (i % 9) + ",000 --> 00:00:0" + (i % 9) + ",900", text: x }));
let subs = mk(Array(8).fill("එයා එන්නේ නැහැ.").concat(["මට බෑ.", "ඒක නෑ", "මට හිතෙන්නේ නෑනේ", "ඔයා ඉන්නවා නේද"]));
let r = C.unifyNegation(subs);
ok(r.changed === 2 && r.subs[8].text === "මට බැහැ." && r.subs[9].text === "ඒක නැහැ", "spoken -> formal");
ok(r.subs[10].text === "මට හිතෙන්නේ නෑනේ", "නෑනේ untouched");
subs = mk(Array(8).fill("මට බෑ.").concat(["එයා නැහැ", "මම ඉන්නවා"]));
r = C.unifyNegation(subs);
ok(r.changed === 1 && r.subs[8].text === "එයා නෑ", "formal -> spoken when spoken dominates");
subs = mk(["නැහැ", "නැහැ", "නැහැ", "නැහැ", "නෑ", "නෑ", "නෑ", "නෑ", "නෑ"]);
ok(C.unifyNegation(subs.slice(0, 8)).changed === 0, "exact tie left alone");
ok(C.unifyNegation(subs).changed === 4, "majority wins (5 spoken vs 4 formal)");
ok(C.unifyNegation(mk(["නැහැ", "නෑ"])).changed === 0, "too few to decide");
ok(C.unifyNegation(mk(Array(8).fill("<i>නැහැ</i>").concat(["නෑ"]))).subs[8].text === "නැහැ", "inside italic tags");


// ---- line layout ----
{
  const T = x => C.tidyLines([{ timestamp: "00:00:01,000 --> 00:00:03,000", text: x }]).subs[0].text;
  ok(T("ඔයා කොහෙද\nයන්නේ?") === "ඔයා කොහෙද යන්නේ?", "short two lines are joined");
  ok(T("-ඩාන්ටේ!\n-ඩාන්ටේ!") === "- ඩාන්ටේ!\n- ඩාන්ටේ!", "dash gets a space, dialog stays two lines");
  ok(T("<i>-ඔයා එනවද?</i>") === "<i>- ඔයා එනවද?</i>", "dash inside italic");
  const long = "අ".repeat(30) + "\n" + "ආ".repeat(30);
  ok(T(long) === long, "long two lines are kept");
  ok(T("<i>එක</i>\n<i>දෙක</i>") === "<i>එක දෙක</i>", "italic pair merged");
}

// ---- readability (run the real function out of script.js) ----
const src = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const a = src.indexOf("function polishReadability(subs)");
const b = src.indexOf("// VALIDATE TRANSLATED CHUNK", a);
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b).replace(/\/\/ =+\s*$/, ""), ctx);
const polish = ctx.polishReadability;

const t = s => { const m = s.match(/(\d+):(\d\d):(\d\d),(\d+) --> (\d+):(\d\d):(\d\d),(\d+)/); return [(+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + m[4] / 1000, (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + m[8] / 1000]; };
const fast = [
    { number: 1, timestamp: "00:00:01,000 --> 00:00:01,500", text: "කෙටි." },
    { number: 2, timestamp: "00:00:02,100 --> 00:00:03,000", text: "ඉතාම දිගු සිංහල වාක්‍යයක් මෙතන තියෙනවා" },
    { number: 3, timestamp: "00:00:03,050 --> 00:00:05,000", text: "ඊළඟ එක." }
];
const p = polish(fast);
ok(t(p[1].timestamp)[0] < 2.1 && t(p[1].timestamp)[0] >= t(p[0].timestamp)[1] + 0.07, "fast cue starts earlier but after previous end");
for (let i = 0; i < p.length - 1; i++) ok(t(p[i].timestamp)[1] <= t(p[i + 1].timestamp)[0] + 1e-6, "no overlap " + i);

console.log(pass + " passed, " + fail + " failed");

// ---- optional: a real file ----
const f = process.argv[2];
if (f) {
    const txt = fs.readFileSync(f, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    const cues = txt.trim().split(/\n\n+/).map(bk => { const l = bk.split("\n"); return { number: +l[0], timestamp: l[1], text: l.slice(2).join("\n") }; });
    const cps = c => { const [s, e] = t(c.timestamp); return c.text.replace(/<[^>]+>/g, "").replace(/\s/g, "").length / Math.max(e - s, .1); };
    const stat = list => ({ over22: list.filter(c => cps(c) > 22).length, over25: list.filter(c => cps(c) > 25).length });
    const neg = list => { const j = list.map(c => c.text).join("\n"); const n = re => (j.match(new RegExp("(?<![\\p{L}\\p{M}\\u200D])(?:" + re + ")(?![\\p{L}\\p{M}\\u200D])", "gu")) || []).length; return { formal: n("නැහැ|බැහැ"), spoken: n("නෑ|බෑ") }; };
    const after = polish(C.unifyNegation(cues).subs);
    let overlaps = 0; for (let i = 0; i < after.length - 1; i++) if (t(after[i].timestamp)[1] > t(after[i + 1].timestamp)[0] + 1e-6) overlaps++;
    console.log("file:", cues.length, "cues");
    console.log("before: cps", JSON.stringify(stat(cues)), "negation", JSON.stringify(neg(cues)));
    console.log("after : cps", JSON.stringify(stat(after)), "negation", JSON.stringify(neg(after)), "overlaps", overlaps);
}
process.exit(fail ? 1 : 0);
