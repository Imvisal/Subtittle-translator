/* Sets the app version in package.json and version.json.

   Usage: node scripts/bump-version.js 1.0.1 "What's new in this version"

   Then: commit, push, and create the tag the script prints.
   The tag triggers the GitHub Actions that build the APK / Windows installer
   and publish them to GitHub Releases. Apps that are already installed see
   the new version in version.json and show the update notification + popup. */
const fs = require("fs");
const path = require("path");

const version = process.argv[2];
const notes = process.argv[3] || "";

if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
    console.error('Usage: node scripts/bump-version.js 1.0.1 "release notes"');
    process.exit(1);
}

const root = path.join(__dirname, "..");

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const verPath = path.join(root, "version.json");
const ver = JSON.parse(fs.readFileSync(verPath, "utf8"));
ver.version = version;
ver.notes = notes;
fs.writeFileSync(verPath, JSON.stringify(ver, null, 2) + "\n");

console.log("Version set to " + version);
console.log("Next:");
console.log("  git add -A && git commit -m \"v" + version + "\"");
console.log("  git tag v" + version + " && git push && git push --tags");
