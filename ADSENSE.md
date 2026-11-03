# Google AdSense – SinSubz

## What is ready
- `adsense.js` – loads Google's ad script only if a publisher ID is set, the page is `lang="en"` and `<body data-ads="on">`. Only the English guide pages have that flag; the tool page, Sinhala page, admin, inbox and the apps never load ads.
- 5 English guide pages (about 1,000–2,200 words each), About, Contact, Privacy (ads disclosures + Google cookie/opt-out/EEA text), Terms and a new Copyright & Takedown page, all linked from the footers.
- `ads.txt` placeholder, `sitemap.xml` updated, CSP in `vercel.json` allows Google ad domains.

## Steps for you
1. Sign up at adsense.google.com with site `sinsubs.site`, copy your publisher ID (`ca-pub-…`).
2. Run `node scripts/set-adsense.js ca-pub-XXXXXXXXXXXXXXXX`, commit and push. This writes `ads.txt`, the verification meta tag on English pages, and the ID into `adsense.js`.
3. In AdSense click **Verify**, then request review. Approval can take days to weeks.
4. After approval: Privacy & messaging → create the EEA/UK/CH consent message (Funding Choices) and publish it. Then enable Auto ads for the guide pages (or add ad units).

## Honest risks
- Sinhala is not a supported AdSense language. Ads are allowed only on English-primary pages; do not add ad code to `sinhala-upasirasi.html` or the Sinhala tool UI.
- A subtitle tool with no publisher content on its main screen can be rejected ("screens without publisher content"). That's why only guide pages carry ads. Keep adding original English articles.
- Sites that help people get subtitles for copyrighted films can be refused or later suspended. Handle takedown mails quickly.
- Contact page needs Google sign-in; the copyright page lists a plain email.
- AdSense covers the website only. Ads in the Android app would need AdMob.
