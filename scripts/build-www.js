/* Builds www/ (the folder Capacitor packages into the Android app)
   from the website files in the repo root.

   Usage: node scripts/build-www.js        (npm run build:www)
*/
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "www");

const files = [
    "index.html", "about.html", "contact.html", "privacy.html", "terms.html",
    "style.css", "script.js", "ui.js", "sync.js", "app-shim.js",
    "logo.png", "hero-banner.png",
    "favicon.svg", "favicon.ico", "apple-touch-icon.png"
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of files) {
    const src = path.join(root, f);
    if (!fs.existsSync(src)) {
        throw new Error("Missing file for app build: " + f);
    }
    fs.copyFileSync(src, path.join(out, f));
}

// load the app shim before the site's own scripts
const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const marker = '<script src="script.js"></script>';
if (!html.includes(marker)) {
    throw new Error("index.html: could not find " + marker);
}
html = html.replace(marker, '<script src="app-shim.js"></script>\n    ' + marker);
fs.writeFileSync(indexPath, html);

console.log("www/ built:", fs.readdirSync(out).length, "files");
