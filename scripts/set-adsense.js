#!/usr/bin/env node
// Usage: node scripts/set-adsense.js ca-pub-1234567890123456
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const id = process.argv[2] || "";
const m = /^ca-pub-(\d{10,20})$/.exec(id);
if (!m) { console.error("Give the publisher ID, e.g. ca-pub-1234567890123456"); process.exit(1); }
const pub = "pub-" + m[1];
fs.writeFileSync(path.join(root, "ads.txt"), `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
const js = path.join(root, "adsense.js");
fs.writeFileSync(js, fs.readFileSync(js, "utf8").replace(/var PUB_ID = "[^"]*";/, `var PUB_ID = "${id}";`));
const tag = `<meta name="google-adsense-account" content="${id}">`;
const pages = fs.readdirSync(root).filter(f => f.endsWith(".html") && !/^(admin|inbox|google)/.test(f));
let n = 0;
for (const f of pages) {
  let s = fs.readFileSync(path.join(root, f), "utf8");
  if (!/<html[^>]*lang="en"/.test(s)) continue;   // English pages only (index included for site verification)
  s = s.replace(/<meta name="google-adsense-account"[^>]*>\n?\s*/, "");
  s = s.replace(/(<meta charset="UTF-8">)/i, `$1\n    ${tag}`);
  fs.writeFileSync(path.join(root, f), s); n++;
}
console.log(`ads.txt written, adsense.js set, meta tag added to ${n} English pages.`);
