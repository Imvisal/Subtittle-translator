/* Builds desktop/app/ from the website files in the repo root,
   and adds desktop-shim.js (desktop build only; the website never loads it).

   Usage: node build-app.js */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "app");

const files = [
    "index.html", "about.html", "contact.html", "privacy.html", "terms.html",
    "style.css", "script.js", "ui.js", "sync.js", "app-update.js", "app-ui.js", "app-ui.css",
    "logo.png", "logo-128.png", "hero-banner.png", "hero-banner.webp",
    "favicon.svg", "favicon.ico", "apple-touch-icon.png"
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of files) {
    const src = path.join(root, f);
    if (!fs.existsSync(src)) throw new Error("Missing file for desktop build: " + f);
    fs.copyFileSync(src, path.join(out, f));
}

// version comes from the root package.json (scripts/bump-version.js)
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const deskPkgPath = path.join(__dirname, "package.json");
const deskPkg = JSON.parse(fs.readFileSync(deskPkgPath, "utf8"));
if (deskPkg.version !== rootPkg.version) {
    deskPkg.version = rootPkg.version;
    fs.writeFileSync(deskPkgPath, JSON.stringify(deskPkg, null, 2) + "\n");
}

fs.copyFileSync(path.join(__dirname, "desktop-ui.css"), path.join(out, "desktop-ui.css"));
fs.copyFileSync(path.join(__dirname, "desktop-player.js"), path.join(out, "desktop-player.js"));
fs.writeFileSync(
    path.join(out, "app-ui.js"),
    fs.readFileSync(path.join(out, "app-ui.js"), "utf8").replace("__APP_VERSION__", rootPkg.version)
);

fs.copyFileSync(path.join(__dirname, "release-alerts.js"), path.join(out, "release-alerts.js"));

fs.writeFileSync(
    path.join(out, "desktop-shim.js"),
    fs.readFileSync(path.join(__dirname, "desktop-shim.js"), "utf8").replace("__APP_VERSION__", rootPkg.version)
);

// installer / window icon
fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.copyFileSync(path.join(root, "logo.png"), path.join(__dirname, "build", "icon.png"));

// load the shim before the site's own scripts
const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
// website-only bits (download page link, popup) must not end up in the app
html = html.replace(/[ \t]*<!--WEBONLY-->[\s\S]*?<!--\/WEBONLY-->[ \t]*\r?\n?/g, "");
const marker = '<script src="script.js"></script>';
if (!html.includes(marker)) throw new Error("index.html: could not find " + marker);
html = html.replace(
    marker,
    '<script src="app-update.js"></script>\n    <script src="desktop-shim.js"></script>\n    <script src="release-alerts.js"></script>\n    ' + marker
);

// sidebar layout + Notifications tab (app-ui.js runs in desktop mode when desktopApi exists)
const syncMarker = '<script src="sync.js"></script>';
if (!html.includes(syncMarker)) throw new Error("index.html: could not find " + syncMarker);
html = html.replace(
    syncMarker,
    syncMarker + '\n    <script src="app-ui.js"></script>\n    <script src="desktop-player.js"></script>'
);
html = html.replace(
    "</head>",
    '    <link rel="stylesheet" href="app-ui.css">\n' +
    '    <link rel="stylesheet" href="desktop-ui.css">\n' +
    '    <script>document.documentElement.classList.add("app-mode","desk-mode");</script>\n</head>'
);
fs.writeFileSync(indexPath, html);

console.log("desktop/app built:", fs.readdirSync(out).length, "files");
