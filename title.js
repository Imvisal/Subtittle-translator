/* SinSubz title page (/tv/<slug>, /film/<slug>): poster, story, season tabs, episode list, download.
   Data is embedded in the page by api/_ready.js (#tp-data). Download asks which video version the person has:
   "download now" (the ready file) or "match my video" (home page, pick the release, the saved Sinhala lines are synced to it). */
(function () {
    "use strict";
    var root = document.getElementById("tp");
    var seed = document.getElementById("tp-data");
    if (!root || !seed) { return; }
    var D;
    try { D = JSON.parse(seed.textContent); } catch (e) { return; }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return String(n).padStart(2, "0"); }
    function airText(a) { if (!a) { return ""; } var d = new Date(a + "T00:00:00"); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    var isTv = D.type === "tv";
    var seasonKeys = Object.keys(D.seasons || {}).map(Number).sort(function (a, b) { return a - b; });
    var cur = seasonKeys.length ? seasonKeys[0] : 0;
    try { var saved = Number(sessionStorage.getItem("tp-season-" + D.id)); if (saved && seasonKeys.indexOf(saved) >= 0) { cur = saved; } } catch (e) { /* ignore */ }

    function fileUrl(s, e) { return "/api/stats?ready=get&id=" + encodeURIComponent(D.id) + "&s=" + (s || 0) + "&e=" + (e || 0); }
    function matchUrl(s, e) {
        var q = "match=" + encodeURIComponent(D.id) + "&t=" + encodeURIComponent(D.title) + "&y=" + encodeURIComponent(D.year || "") + (D.poster ? "&p=" + encodeURIComponent(D.poster) : "");
        if (isTv) { q += "&s=" + s + "&e=" + e; }
        return "/?" + q;
    }

    function uploadUrl(s, e) { return matchUrl(s, e).replace("/?match=", "/?upload=") + "#upload"; }

    function readyCount() { var n = 0; seasonKeys.forEach(function (k) { D.seasons[k].forEach(function (e) { if (e.ready) { n++; } }); }); return n; }

    function runtimeText(m) { m = Number(m) || 0; if (!m) { return ""; } return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60 ? m % 60 + "m" : "") : m + " min"; }
    function initials(n) { return String(n || "").split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); }
    function rest() { return Number(D.rating) ? '<span class="tp-score tp-tmdb"><b>TMDB</b> \u2605 ' + esc(D.rating) + '</span>' : ""; }

    // the top block: backdrop picture behind, poster + facts + the buttons in front. Trailer plays in place of it.
    function hero() {
        var scores = "";
        if (D.imdb) { scores += '<span class="tp-score tp-imdb" title="IMDb rating"><b>IMDb</b> \u2605 ' + esc(D.imdb) + '<small>/10' + (D.votes ? " \u00B7 " + esc(D.votes) : "") + '</small></span>'; }
        if (D.rt) { scores += '<span class="tp-score tp-rt" title="Rotten Tomatoes">\uD83C\uDF45 ' + esc(D.rt) + '</span>'; }
        if (D.mc) { scores += '<span class="tp-score tp-mc" title="Metascore"><b>Metascore</b> ' + esc(D.mc) + '</span>'; }
        if (!D.imdb) { scores += rest(); }
        var facts = [];
        if (D.year) { facts.push(esc(D.year)); }
        if (runtimeText(D.runtime)) { facts.push(runtimeText(D.runtime) + (isTv ? " / episode" : "")); }
        if (D.rated) { facts.push('<span class="tp-rated">' + esc(D.rated) + '</span>'); }
        var n = readyCount();
        var actions = "";
        if (D.trailer && /^[\w-]{6,20}$/.test(D.trailer)) { actions += '<button type="button" class="tp-cta tp-cta-tr" data-act="trailer">\u25B6 Watch trailer</button>'; }
        return '<section class="tp-hero" id="tpHero">' +
            '<div class="tp-bd">' + (D.backdrop ? '<img src="' + esc(D.backdrop) + '" alt="" referrerpolicy="no-referrer">' : "") + '</div>' +
            '<div class="tp-stage" id="tpStage" hidden></div>' +
            '<button type="button" class="tp-tclose" hidden>\u2715 Close trailer</button>' +
            '<div class="tp-in">' +
            '<div class="tp-poster">' + (D.poster ? '<img src="' + esc(D.poster) + '" alt="' + esc(D.title) + ' poster" referrerpolicy="no-referrer">' : "<i>\uD83C\uDFAC</i>") + '</div>' +
            '<div class="tp-info"><span class="tp-kind">' + (isTv ? "TV series" : "Film") + '</span>' +
            '<h1>' + esc(D.title) + ' <span class="tp-h1s">Sinhala Subtitle | සිංහල උපසිරැසි</span></h1>' +
            (facts.length ? '<div class="tp-meta">' + facts.join('<i class="tp-dot"></i>') + '</div>' : "") +
            (scores ? '<div class="tp-scores">' + scores + '</div>' : "") +
            (D.genres && D.genres.length ? '<div class="tp-chips">' + D.genres.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + '</div>' : "") +
            (D.tagline ? '<p class="tp-tag">\u201C' + esc(D.tagline) + '\u201D</p>' : "") +
            (D.overview ? '<p class="tp-over">' + esc(D.overview) + '</p>' : "") +
            (D.si ? '<p class="tp-si" lang="si">' + esc(D.si) + '</p>' : "") +
            (D.by && D.by.length ? '<p class="tp-by"><span>' + (isTv ? "Created by" : "Directed by") + '</span> ' + D.by.map(esc).join(", ") + '</p>' : "") +
            '<div class="tp-badges"><div class="tp-badge">' + (isTv ? n + " Sinhala subtitle" + (n === 1 ? "" : "s") + " ready" : "Sinhala subtitle ready") + '</div>' + heroDl() + '</div>' +
            '<div class="tp-actions">' + actions + '</div>' +
            '</div></div></section>';
    }

    function castCard() {
        if (!D.cast || !D.cast.length) { return ""; }
        return '<section class="tp-card tp-cast"><h2>Cast</h2><div class="tp-cast-row">' + D.cast.map(function (c) {
            return '<div class="tp-cm"><span class="tp-ph">' + (c.p ? '<img src="' + esc(c.p) + '" alt="' + esc(c.n) + '" loading="lazy" referrerpolicy="no-referrer">' : "<b>" + esc(initials(c.n)) + "</b>") + '</span>' +
                '<strong>' + esc(c.n) + '</strong>' + (c.c ? '<small>' + esc(c.c) + '</small>' : "") + '</div>';
        }).join("") + '</div></section>';
    }

    function watchCard() {
        var w = D.wp;
        if (!w) { return ""; }
        function row(label, arr) {
            if (!arr || !arr.length) { return ""; }
            return '<div class="tp-wr"><span>' + label + '</span><div>' + arr.map(function (n) { return '<a class="tp-wp" href="' + esc(w.link || "#") + '" target="_blank" rel="noopener nofollow">' + esc(n) + '</a>'; }).join("") + '</div></div>';
        }
        return '<section class="tp-card tp-watch"><h2>Where to watch</h2>' +
            '<p class="tp-wn">' + (w.cc === "LK" ? "Available in Sri Lanka" : "Not listed for Sri Lanka. Available in the US") + '. Watch it legally, then add the Sinhala subtitle from above.</p>' +
            row("Stream", w.stream) + row("Free", w.free) + row("Rent", w.rent) + row("Buy", w.buy) +
            '<p class="tp-wc">Streaming data by JustWatch</p></section>';
    }

    function episodes() {
        if (!isTv) {
            var f0 = (D.seasons[0] && D.seasons[0][0]) || {};
            return '<section class="tp-card tp-dcard" id="tpEps"><h2>Sinhala subtitle</h2>' +
                '<button type="button" class="tp-bigdl tp-dl" data-s="0" data-e="0"><span class="tp-di">\u2B07</span><b>Download Sinhala subtitle</b></button>' +
                '<p class="tp-meta">' + (f0.n ? f0.n + ' lines \u00B7 ' : '') + 'free .srt \u00B7 you pick your video version next</p>' +
                '</section>';
        }
        var tabs = seasonKeys.length > 1 ? '<div class="tp-tabs tp-stabs" role="tablist">' + seasonKeys.map(function (k, i) {
            var n = (D.seasons[k] || []).length, img = (D.sp && D.sp[k]) || D.backdrop || D.poster || "";
            return '<button type="button" role="tab" class="tp-tab tp-stab' + (k === cur ? " on" : "") + '" data-season="' + k + '">' +
                (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="object-position:center 25%">' : "") +
                '<span><b>Season ' + k + '</b><small>' + n + ' episode' + (n === 1 ? "" : "s") + '</small></span></button>';
        }).join("") + '</div>' : "";
        var list = (D.seasons[cur] || []).map(function (e) {
            var left = '<span class="tp-en">E' + pad(e.e) + '</span><span class="tp-nm"><b>' + (e.name ? esc(e.name) : "Episode " + e.e) + '</b>' + (airText(e.air) ? "<small>" + airText(e.air) + "</small>" : "") + (e.ready ? '<small class="tp-ecnt" data-ec="' + cur + 'x' + e.e + '">' + ecText(epCount(cur, e.e)) + '</small>' : '') + '</span>';
            var right = e.ready ? '<button type="button" class="tp-dl" data-s="' + cur + '" data-e="' + e.e + '">' + DLI + '</button>' : '<span class="tp-soon">Coming soon<a class="tp-up" href="' + uploadUrl(cur, e.e) + '">Have the English .srt? Translate it</a></span>';
            return '<li class="tp-ep' + (e.ready ? " is-ready" : "") + '">' + left + right + '</li>';
        }).join("");
        var nReady = (D.seasons[cur] || []).filter(function (e) { return e.ready; }).length;
        var all = nReady > 1 ? '<button type="button" class="tp-season' + (isPrem ? "" : " is-locked") + '" id="tpSeasonDl">' + DLI + 'Download whole season ' + cur + ' <small>' + nReady + ' episodes, one .zip</small>' + (isPrem ? "" : '<span class="tp-prem"><svg class="tp-lk" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Premium</span>') + '</button>' : "";
        return '<section class="tp-card" id="tpEps"><h2>Episodes</h2>' + tabs + all + '<ul class="tp-eps">' + list + '</ul></section>';
    }

    function startTrailer() {
        var hero = document.getElementById("tpHero"), stage = document.getElementById("tpStage");
        if (!hero || !stage || !D.trailer) { return; }
        stage.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(D.trailer) +
            '?autoplay=1&rel=0&modestbranding=1" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
        stage.hidden = false;
        hero.classList.add("is-playing");
        hero.querySelector(".tp-tclose").hidden = false;
        if (hero.scrollIntoView) { hero.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    function stopTrailer() {
        var hero = document.getElementById("tpHero"), stage = document.getElementById("tpStage");
        if (!hero || !stage) { return; }
        stage.innerHTML = ""; stage.hidden = true;
        hero.classList.remove("is-playing");
        hero.querySelector(".tp-tclose").hidden = true;
    }

    var DLI = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>';
    // download counts from /api/stats?ready=count: whole show (n) and per episode (eps["<season>x<episode>"])
    var DLC = { n: 0, eps: {} };
    function ecText(n) { return n > 0 ? n.toLocaleString("en-US") + (n === 1 ? " download" : " downloads") : ""; }
    function epCount(s, e) { return Number(DLC.eps[s + "x" + e]) || 0; }
    function heroDl() {
        return '<div class="tp-hdl" id="tpHeroDl"' + (DLC.n < 1 ? ' hidden' : '') + '>' + DLI + '<b>' + DLC.n.toLocaleString("en-US") + '</b> downloads</div>';
    }
    function dcountHtml() {
        return '<p class="tp-dcount" id="tpDlCount"' + (DLC.n < 1 ? ' hidden' : '') + '><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg><b>' + DLC.n.toLocaleString("en-US") + '</b> downloads</p>';
    }
    function paintCounts() {
        var t = document.getElementById("tpDlCount");
        if (t) { t.outerHTML = dcountHtml(); }
        var h = document.getElementById("tpHeroDl");
        if (h) { h.outerHTML = heroDl(); }
        document.querySelectorAll("[data-ec]").forEach(function (el) { el.textContent = ecText(Number(DLC.eps[el.getAttribute("data-ec")]) || 0); });
    }
    function render() { root.innerHTML = hero() + castCard() + episodes() + watchCard(); }
    render();
    // the page HTML can be a few minutes old (cached) and the Sinhala intro is made on demand: ask once for it and show it when it arrives
    (function lateIntro() {
        if (D.si || !D.overview || !D.slug) { return; }
        fetch("/api/stats?ready=title&slug=" + encodeURIComponent(D.slug) + "&_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            if (!j || !j.si || document.querySelector(".tp-si")) { return; }
            D.si = j.si;
            var over = document.querySelector(".tp-over");
            if (!over) { return; }
            var p = document.createElement("p"); p.className = "tp-si"; p.lang = "si"; p.textContent = j.si;
            over.insertAdjacentElement("afterend", p);
        }).catch(function () { /* stays without */ });
    })();
    (function dlCount() {
        fetch("/api/stats?ready=count&id=" + encodeURIComponent(D.id)).then(function (r) { return r.json(); }).then(function (j) {
            DLC = { n: Number(j && j.n) || 0, eps: (j && j.eps) || {} };
            paintCounts();
        }).catch(function () { /* stays hidden */ });
    })();

    root.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest('[data-act="trailer"]')) { startTrailer(); return; }
        if (ev.target.closest && ev.target.closest(".tp-tclose")) { stopTrailer(); return; }
        var t = ev.target.closest && ev.target.closest(".tp-tab");
        if (t) { cur = Number(t.getAttribute("data-season")); try { sessionStorage.setItem("tp-season-" + D.id, String(cur)); } catch (e) { /* ignore */ } render(); return; }
        var sd = ev.target.closest && ev.target.closest("#tpSeasonDl");
        if (sd) { seasonGate(sd); return; }
        var b = ev.target.closest && ev.target.closest(".tp-dl");
        if (b) { ask(Number(b.getAttribute("data-s")), Number(b.getAttribute("data-e"))); }
    });

    var DL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>Download';
    function find(s, e) { var l = D.seasons[s] || []; for (var i = 0; i < l.length; i++) { if (l[i].e === e) { return l[i]; } } return null; }

    // ---- downloads need a Google sign-in: ask for it (once), then fetch the file with the token and save it ----
    function tokenNow() { return Promise.resolve(window.__sinsubzIdToken ? window.__sinsubzIdToken() : "").catch(function () { return ""; }); }
    function authToken() {
        return tokenNow().then(function (tk) {
            if (tk) { return tk; }
            return Promise.resolve(window.__sinsubzSignIn ? window.__sinsubzSignIn() : null).catch(function () { /* closed */ }).then(tokenNow);
        });
    }
    function getFile(s, e) {
        return authToken().then(function (tk) {
            if (!tk) { throw new Error("login"); }
            return fetch(fileUrl(s, e), { headers: { Authorization: "Bearer " + tk } });
        }).then(function (r) {
            if (r.status === 401) { throw new Error("login"); }
            if (!r.ok) { throw new Error("x"); }
            var m = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "");
            return r.blob().then(function (b) { return { blob: b, name: m ? m[1] : "Sinhala.SinSubz.srt" }; });
        });
    }
    function saveFile(f) {
        var url = URL.createObjectURL(f.blob), a = document.createElement("a");
        a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    // ---- whole season as one .zip (built here in the browser: a plain "stored" zip, no library) ----
    var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; } return t; })();
    function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) { c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); } return (c ^ 0xFFFFFFFF) >>> 0; }
    function makeZip(files) {
        var enc = new TextEncoder(), parts = [], central = [], off = 0;
        function w16(a, v) { a.push(v & 255, (v >> 8) & 255); }
        function w32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
        files.forEach(function (f) {
            var nm = enc.encode(f.name), crc = crc32(f.data), h = [];
            w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, 0); w16(h, 0x21); w32(h, crc); w32(h, f.data.length); w32(h, f.data.length); w16(h, nm.length); w16(h, 0);
            parts.push(new Uint8Array(h), nm, f.data);
            var c = [];
            w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, 0); w16(c, 0x21); w32(c, crc); w32(c, f.data.length); w32(c, f.data.length); w16(c, nm.length); w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, off);
            central.push(new Uint8Array(c), nm);
            off += h.length + nm.length + f.data.length;
        });
        var csize = 0; central.forEach(function (x) { csize += x.length; });
        var end = []; w32(end, 0x06054b50); w16(end, 0); w16(end, 0); w16(end, files.length); w16(end, files.length); w32(end, csize); w32(end, off); w16(end, 0);
        return new Blob(parts.concat(central, [new Uint8Array(end)]), { type: "application/zip" });
    }
    // "Download whole season" is a Premium feature: free members see a lock and a short note (single episodes stay free)
    var isPrem = false;
    function checkPremium(then) {
        tokenNow().then(function (tk) {
            if (!tk) { return null; }
            return fetch("/api/stats?me=1", { headers: { Authorization: "Bearer " + tk }, cache: "no-store" }).then(function (r) { return r.json(); });
        }).then(function (d) {
            var p = !!(d && d.signedIn && d.premium);
            if (p !== isPrem) { isPrem = p; try { render(); } catch (e) { /* ignore */ } }
        }).catch(function () { /* ignore */ }).then(function () { if (then) { then(isPrem); } });
    }
    function seasonGate(btn) {
        if (isPrem) { seasonZip(btn); return; }
        tokenNow().then(function (tk) {
            if (!tk) { return Promise.resolve(window.__sinsubzSignIn ? window.__sinsubzSignIn() : null).catch(function () { /* closed */ }); }
        }).then(function () {
            checkPremium(function (ok) {
                if (ok) { var b = document.getElementById("tpSeasonDl"); if (b) { seasonZip(b); } return; }
                var ov = document.createElement("div");
                ov.className = "tp-ov";
                ov.innerHTML = '<div class="tp-modal" role="dialog" aria-modal="true" aria-label="Premium needed">' +
                    '<button type="button" class="tp-x" aria-label="Close">\u2715</button>' +
                    '<div class="tp-mt">Premium needed</div>' +
                    '<p class="tp-mp" style="margin:10px 0 14px">Downloading a whole season as one .zip is a <b>Premium</b> feature. You can still download every episode one by one for free.<br><span lang="si">මුළු season එකම එකවර download කරන්න Premium ඕන. episode එක එක නම් නොමිලේ download කරන්න පුළුවන්.</span></p>' +
                    '<a class="tp-opt tp-opt-a" href="/premium.html" style="justify-content:center"><span class="tp-ot"><b>See Premium plans</b></span></a></div>';
                function close() { ov.remove(); }
                ov.addEventListener("click", function (e) { if (e.target === ov || (e.target.closest && e.target.closest(".tp-x"))) { close(); } });
                document.body.appendChild(ov);
            });
        });
    }
    checkPremium();
    // the account scripts can finish signing in after the page loaded: look again a little later
    setTimeout(checkPremium, 1500); setTimeout(checkPremium, 4500);

    function seasonZip(btn) {
        var eps = (D.seasons[cur] || []).filter(function (e) { return e.ready; });
        if (!eps.length || btn.disabled) { return; }
        var old = btn.innerHTML, enc = new TextEncoder(), got = [], i = 0, season = cur, ad = Promise.resolve();
        btn.disabled = true; btn.textContent = "Sign in to download…";
        function next() {
            if (i >= eps.length) {
                if (!got.length) { btn.disabled = false; btn.innerHTML = old; alert("Could not download the episodes. Please try again."); return; }
                btn.textContent = "Almost ready\u2026";
                ad.then(function () {      // the sponsored popup (sponsor-popup.js) runs while the files are prepared; the zip is saved when it ends
                    var url = URL.createObjectURL(makeZip(got)), a = document.createElement("a");
                    a.href = url; a.download = D.title.replace(/[\\/:*?"<>|]+/g, "").trim() + " Season " + season + " Sinhala SinSubz.zip";
                    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                    btn.disabled = false; btn.innerHTML = old;
                });
                return;
            }
            var e = eps[i++];
            btn.textContent = "Preparing " + i + " / " + eps.length + "\u2026";
            getFile(season, e.e).then(function (f) { return f.blob.arrayBuffer(); }).then(function (buf) {
                got.push({ name: D.title.replace(/[\\/:*?"<>|]+/g, "").trim() + ".S" + pad(season) + "E" + pad(e.e) + ".Sinhala.SinSubz.srt", data: new Uint8Array(buf) });
            }).catch(function () { /* skip this one */ }).then(next);
        }
        authToken().then(function (tk) {
            if (!tk) { btn.disabled = false; btn.innerHTML = old; alert("Please sign in to download."); return; }
            if (window.__sinsubzSponsor) { ad = window.__sinsubzSponsor(); }
            next();
        });
    }

    function ask(s, e) {
        var ep = isTv ? find(s, e) : (D.seasons[0] && D.seasons[0][0]) || null;
        var label = isTv ? D.title + " · S" + pad(s) + "E" + pad(e) + (ep && ep.name ? " · " + ep.name : "") : D.title;
        var rel = ep && ep.r ? ep.r : "";
        var ov = document.createElement("div");
        ov.className = "tp-ov";
        var si = isTv ? s : 0, ei = isTv ? e : 0;
        ov.innerHTML = '<div class="tp-modal" role="dialog" aria-modal="true" aria-label="Download Sinhala subtitle">' +
            '<button type="button" class="tp-x" aria-label="Close">\u2715</button>' +
            '<div class="tp-mt">Download Sinhala subtitle</div><div class="tp-ms">' + esc(label) + '</div>' +
            '<div class="tp-sec">Original subtitle</div>' +
            '<a class="tp-opt tp-opt-a" href="' + fileUrl(si, ei) + '" download><span class="tp-ot"><b>' + (rel ? esc(rel) : "Ready subtitle") + ' <i class="tp-tag-si">Sinhala</i></b><span>Works with most versions. Ready now.</span></span><span class="tp-obtn">'+DL+'</span></a>' +
            '<div class="tp-sec">Other Sinhala subtitle video versions <small>synced to your file</small></div>' +
            '<div class="tp-rels" id="tpRels"><p class="tp-mp">Loading versions\u2026</p></div>' +
            '<div class="tp-adbox" id="tpAdBox" hidden><div class="tp-adlbl">Advertisement</div></div>' +
            '</div>';
        /* one native ad at the very bottom of the popup, well away from the Download buttons (sandboxed frame; it hides itself when there is no ad) */
        (function popupAd() {
            if (/^(capacitor|file|app):/.test(location.protocol)) { return; }
            var bx = ov.querySelector("#tpAdBox"), fr = document.createElement("iframe");
            fr.src = "/ad-box-native.html"; fr.title = "Advertisement"; fr.loading = "lazy";
            fr.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
            fr.referrerPolicy = "no-referrer-when-downgrade";
            fr.style.cssText = "border:0;width:100%;max-width:420px;height:200px;display:block;margin:0 auto;background:transparent;";
            bx.appendChild(fr); bx.hidden = false;
            function onMsg(ev) {
                if (ev.source !== fr.contentWindow || !ev.data) { return; }
                if (ev.data.sinsubzAd === "none") { bx.hidden = true; }
                else if (ev.data.sinsubzAd === "native") { var h = Math.max(60, Math.min(260, Number(ev.data.h) || 0)); if (h) { fr.style.height = h + "px"; } }
            }
            window.addEventListener("message", onMsg);
            var obs = new MutationObserver(function () { if (!document.body.contains(ov)) { window.removeEventListener("message", onMsg); obs.disconnect(); } });
            obs.observe(document.body, { childList: true });
        })();
        (function loadRels() {
            var box = null;
            var q = "/api/subtitles?imdb_id=" + encodeURIComponent(D.id) + (isTv ? "&type=episode&season=" + s + "&episode=" + e : "&type=movie");
            fetch(q).then(function (r) { return r.json(); }).then(function (j) {
                box = ov.querySelector("#tpRels"); if (!box) { return; }
                var seen = {}, out = [];
                (j.results || []).forEach(function (x) {
                    var r = String(x.release || x.fileName || ""); if (!r || seen[r]) { return; }
                    var lab = r.replace(/\.(srt|zip)$/i, "");
                    if (rel && lab.toLowerCase() === rel.toLowerCase()) { return; }
                    seen[r] = 1; out.push({ r: r, lab: lab });
                });
                if (!out.length) { box.innerHTML = '<p class="tp-mp">No other versions found. Use the original above.</p>'; return; }
                box.innerHTML = out.slice(0, 12).map(function (o) {
                    return '<a class="tp-opt tp-opt-r" href="' + matchUrl(s, e) + '&rel=' + encodeURIComponent(o.r) + '"><span class="tp-ot"><b>' + esc(o.lab) + ' <i class="tp-tag-si">Sinhala</i></b></span><span class="tp-obtn">'+DL+'</span></a>';
                }).join("");
            }).catch(function () { box = ov.querySelector("#tpRels"); if (box) { box.innerHTML = '<p class="tp-mp">Could not load other versions. Use the original above.</p>'; } });
        })();
        function close() { if (ov.parentNode) { ov.parentNode.removeChild(ov); } document.removeEventListener("keydown", onKey); }
        function onKey(k) { if (k.key === "Escape") { close(); } }
        ov.addEventListener("click", function (c) { if (c.target === ov || (c.target.closest && c.target.closest(".tp-x"))) { close(); } });
        var oa = ov.querySelector(".tp-opt-a"), busy = false;
        oa.addEventListener("click", function (c) {
            c.preventDefault();
            if (busy) { return; }
            busy = true;
            var lbl = oa.querySelector(".tp-obtn"), old = lbl.innerHTML;
            lbl.textContent = "Please wait…";
            getFile(si, ei).then(function (f) {
                saveFile(f); close();
                try { if (window.SinSubzComments) { window.SinSubzComments.afterTranslate(D.title); } } catch (x) { /* ignore */ }
            }).catch(function (x) {
                busy = false; lbl.innerHTML = old;
                var m = ov.querySelector(".tp-lerr");
                if (!m) { m = document.createElement("p"); m.className = "tp-mp tp-lerr"; oa.insertAdjacentElement("afterend", m); }
                m.textContent = x && x.message === "login" ? "Sign in to download. Tap the button to try again." : "Could not download. Please try again.";
            });
        });
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
    }
})();
