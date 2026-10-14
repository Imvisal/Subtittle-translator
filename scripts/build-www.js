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
    "style.css", "script.js", "ui.js", "sync.js", "app-update.js", "app-shim.js",
    "app-ui.js", "app-ui.css",
    "logo.png", "logo-128.png", "hero-banner.png", "hero-banner.webp",
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
// website-only bits (download page link, popup) must not end up in the app
html = html.replace(/[ \t]*<!--WEBONLY-->[\s\S]*?<!--\/WEBONLY-->[ \t]*\r?\n?/g, "");
const marker = '<script src="script.js"></script>';
if (!html.includes(marker)) {
    throw new Error("index.html: could not find " + marker);
}
html = html.replace(
    marker,
    '<script src="app-update.js"></script>\n    <script src="app-shim.js"></script>\n    ' + marker
);


// app-only UI: bottom tabs, translation progress panel, settings tab
// (the website never loads these files)
const syncMarker = '<script src="sync.js"></script>';
if (!html.includes(syncMarker)) {
    throw new Error("index.html: could not find " + syncMarker);
}
html = html.replace(syncMarker, syncMarker + '\n    <script src="app-ui.js"></script>');
html = html.replace(
    "</head>",
    '    <link rel="stylesheet" href="app-ui.css">\n' +
    '    <script>document.documentElement.classList.add("app-mode");</script>\n</head>'
);

// full-screen layout: let the page draw behind the status / navigation bars
// (app build only, the website keeps its normal viewport)
const viewportRe = /(<meta\s+name="viewport"\s+content=")([^"]*)(")/;
if (!viewportRe.test(html)) {
    throw new Error("index.html: could not find the viewport meta tag");
}
html = html.replace(viewportRe, (m, a, b, c) =>
    /viewport-fit/.test(b) ? m : a + b + ", viewport-fit=cover" + c
);
fs.writeFileSync(indexPath, html);

// keep the fixed header and the page content clear of the system bars
const edgeCss = `

/* ===== Android app: full-screen layout (added by scripts/build-www.js) ===== */
:root {
    --sat: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--native-sat, 0px));
    --sab: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px), var(--native-sab, 0px));
}
html { scroll-padding-top: calc(84px + var(--sat)); }
body { padding-top: var(--sat); padding-bottom: var(--sab); }
.top-header { padding-top: var(--sat); height: calc(var(--header-h) + var(--sat)); }
.top-header.scrolled { height: calc(62px + var(--sat)); }
.scroll-progress { top: var(--sat); }
.to-top { bottom: calc(20px + var(--sab)); }
`;
fs.appendFileSync(path.join(out, "style.css"), edgeCss);

// tell the app which version it was built as (used by the update check)
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const shimPath = path.join(out, "app-shim.js");
fs.writeFileSync(
    shimPath,
    fs.readFileSync(shimPath, "utf8").replace("__APP_VERSION__", pkg.version)
);

const uiPath = path.join(out, "app-ui.js");
fs.writeFileSync(
    uiPath,
    fs.readFileSync(uiPath, "utf8").replace("__APP_VERSION__", pkg.version)
);

console.log("www/ built:", fs.readdirSync(out).length, "files");
