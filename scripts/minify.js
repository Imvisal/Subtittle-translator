// Runs on Vercel only (VERCEL=1): shrinks the site's own .js and .css files in place before they are served.
// The GitHub source stays readable, and the Android / Windows builds (scripts/build-www.js) never run this.
// Safe by design: top-level names are kept (the page scripts call each other by name), a file that fails
// to minify stays as it was, and any problem here never fails the deploy.
const fs = require("fs");
const path = require("path");

if (!process.env.VERCEL) { console.log("minify: not on Vercel, nothing to do."); process.exit(0); }

let esbuild;
try { esbuild = require("esbuild"); } catch (e) { console.log("minify: esbuild missing, skipping (site is served as is)."); process.exit(0); }

const root = path.join(__dirname, "..");
const files = fs.readdirSync(root).filter(f => /\.(js|css)$/.test(f) && !/\.min\.(js|css)$/.test(f) && !/^(sw|firebase-messaging-sw)\.js$/.test(f));
let before = 0, after = 0, ok = 0, skipped = [];
for (const f of files) {
    const p = path.join(root, f);
    try {
        const src = fs.readFileSync(p, "utf8");
        const out = esbuild.transformSync(src, { loader: f.endsWith(".css") ? "css" : "js", minify: true, legalComments: "none", target: "es2019", charset: "utf8" }).code;
        if (!out || out.length < 20) { throw new Error("empty output"); }
        fs.writeFileSync(p, out);
        before += src.length; after += out.length; ok++;
    } catch (e) { skipped.push(f + " (" + String(e.message).split("\n")[0] + ")"); }
}
console.log("minify: " + ok + " files, " + Math.round(before / 1024) + " KB -> " + Math.round(after / 1024) + " KB" + (skipped.length ? "; left as is: " + skipped.join(", ") : ""));
