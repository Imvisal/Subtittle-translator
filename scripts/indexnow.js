// Tells Bing (and other IndexNow search engines: Yandex, Seznam, Naver) that the pages in sitemap.xml are new or changed.
// Run after deploying new pages:   node scripts/indexnow.js
// The key file (<key>.txt in the site root) proves that we own the site.
const fs = require("fs");
const path = require("path");

const HOST = "sinsubs.site";
const KEY = "c66b0b9a77f62ef66c6659d5eaf1d90c";

const sitemap = fs.readFileSync(path.join(__dirname, "..", "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

(async () => {
    const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: "https://" + HOST + "/" + KEY + ".txt", urlList: urls })
    });
    console.log("IndexNow:", res.status, res.statusText, "-", urls.length, "URLs sent");
    if (res.status !== 200 && res.status !== 202) { process.exitCode = 1; }
})().catch(e => { console.error("Could not reach IndexNow:", e.message); process.exitCode = 1; });
