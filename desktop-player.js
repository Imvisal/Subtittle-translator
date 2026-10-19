/* SinSubz — Windows app: "Merge" tab.
   Pick a movie / episode and a subtitle (the one you just translated or synced,
   or any .srt), preview it, then MERGE the subtitle into the video and save a new
   video file that shows the subtitle in any player (ffmpeg, see export-video.js).
   - subtitle delay and size can be changed while playing
   - "Save next to video" writes Movie.si.srt beside the video file so VLC,
     MPC-HC, PotPlayer etc. load it automatically
   Desktop build only (desktop/build-app.js). */
(function () {
    "use strict";

    if (!window.desktopApi || !window.desktopApi.pickVideo) { return; }

    var $ = function (id) { return document.getElementById(id); };
    var cues = [];
    var subText = "";
    var subName = "";
    var lastSaved = null;           // { text, filename } of the last SRT saved from translate / sync
    var delay = 0;                  // seconds, > 0 = subtitles appear later
    var size = 30;                  // px at 100% stage width of 1280
    var haveVideo = false;
    var raf = 0;
    var shown = "";
    var stageW = 0;
    var making = false;
    var lastOut = "";

    // remember the last SRT the user saved from Upload / Find / Sync
    var origSave = window.__appSaveTextFile;
    window.__appSaveTextFile = function (text, filename) {
        if (/\.srt$/i.test(String(filename || ""))) {
            lastSaved = { text: String(text), filename: String(filename) };
            refreshLast();
        }
        if (typeof origSave === "function") { return origSave.apply(this, arguments); }
    };

    // ---------- SRT ----------
    function toSec(h, m, s, ms) {
        return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
    }

    function parseSrt(text) {
        var out = [];
        var blocks = String(text || "").replace(/^﻿/, "").replace(/\r/g, "").split(/\n{2,}/);
        var re = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/;
        blocks.forEach(function (b) {
            var lines = b.split("\n");
            for (var i = 0; i < lines.length; i++) {
                var m = re.exec(lines[i]);
                if (m) {
                    var rawBody = lines.slice(i + 1).join("\n").trim();
                    var body = rawBody
                        .replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
                    if (body) {
                        out.push({
                            r: rawBody,
                            a: toSec(m[1], m[2], m[3], (m[4] + "00").slice(0, 3)),
                            b: toSec(m[5], m[6], m[7], (m[8] + "00").slice(0, 3)),
                            t: body
                        });
                    }
                    break;
                }
            }
        });
        out.sort(function (x, y) { return x.a - y.a; });
        return out;
    }

    function cueAt(t) {
        var lo = 0, hi = cues.length - 1, idx = -1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (cues[mid].a <= t) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        // overlapping cues are rare; look back a few for one that still covers t
        for (var i = idx; i >= 0 && i > idx - 4; i--) {
            if (cues[i].b >= t) { return cues[i]; }
        }
        return null;
    }

    // ---------- UI ----------
    function build() {
        var main = document.querySelector("main.app") || document.body;
        var sec = document.createElement("section");
        sec.id = "deskPlayer";
        sec.innerHTML =
            '<h2>Merge subtitle into video</h2>' +
            '<p class="dp-lead">Choose the movie and a subtitle, check it in the preview, then save a new video that already has the subtitle in it. You never have to add the subtitle again.</p>' +

            '<div class="dp-row">' +
            '<div class="ap-card dp-pick"><div class="dp-k">1 · Video</div>' +
            '<div class="dp-v" id="dpVideoName">No video chosen</div>' +
            '<button type="button" class="dp-btn" id="dpVideoBtn">Choose video…</button></div>' +

            '<div class="ap-card dp-pick"><div class="dp-k">2 · Subtitle</div>' +
            '<div class="dp-v" id="dpSubName">No subtitle yet</div>' +
            '<div class="dp-btns"><button type="button" class="dp-btn" id="dpSubBtn">Choose .srt…</button>' +
            '<button type="button" class="dp-btn alt" id="dpLastBtn" hidden></button></div></div>' +
            '</div>' +

            '<div id="dpStage">' +
            '<video id="dpVideo" controls preload="metadata"></video>' +
            '<div id="dpCue"></div>' +
            '<div id="dpEmpty"><i class="fa-solid fa-circle-play"></i><span>Your movie will play here</span></div>' +
            '</div>' +

            '<div class="dp-bar">' +
            '<div class="dp-grp"><span>Subtitle delay</span>' +
            '<button type="button" class="dp-sm" id="dpDm" title="Earlier (0.5 s)">−</button>' +
            '<b id="dpDv">0.0 s</b>' +
            '<button type="button" class="dp-sm" id="dpDp" title="Later (0.5 s)">+</button></div>' +
            '<div class="dp-grp"><span>Size</span>' +
            '<button type="button" class="dp-sm" id="dpSm">A−</button>' +
            '<button type="button" class="dp-sm" id="dpSp">A+</button></div>' +
            '<div class="dp-grp dp-right">' +
            '<button type="button" class="dp-btn alt" id="dpSave" disabled>Save next to video</button>' +
            '<button type="button" class="dp-btn alt" id="dpFull">Full screen</button></div>' +
            '</div>' +
            '<div class="ap-card dp-export">' +
            '<div class="dp-k">3 · Make the new video</div>' +
            '<label class="dp-opt"><input type="radio" name="dpMode" value="burn" checked>' +
            '<span><b>Burn into the picture</b><em>Shows in every player, TV and phone. Takes longer (the video is re-encoded).</em></span></label>' +
            '<label class="dp-opt"><input type="radio" name="dpMode" value="soft">' +
            '<span><b>Subtitle track (fast)</b><em>Done in a minute. Works in VLC, MPC-HC, PotPlayer and most phones; some TVs ignore it.</em></span></label>' +
            '<div class="dp-opt-sub" id="dpBuiltin" hidden>' +
            '<div class="dp-k">This video already has its own subtitle</div>' +
            '<div class="dp-v" id="dpBuiltinList"></div>' +
            '<label class="dp-opt"><input type="radio" name="dpOld" value="remove" checked>' +
            '<span><b>Remove it, keep only my Sinhala subtitle</b><em>The new video has just the subtitle you chose above.</em></span></label>' +
            '<label class="dp-opt"><input type="radio" name="dpOld" value="keep">' +
            '<span><b>Keep it and add my Sinhala subtitle as an extra track</b><em>Only with “Subtitle track”. The new file is an .mkv. Choose the track in your player.</em></span></label>' +
            '</div>' +
            '<div class="dp-btns"><button type="button" class="dp-btn" id="dpMake" disabled>Save video with subtitle…</button>' +
            '<button type="button" class="dp-btn alt" id="dpCancel" hidden>Cancel</button>' +
            '<button type="button" class="dp-btn alt" id="dpShow" hidden>Show in folder</button></div>' +
            '<div class="dp-prog" id="dpProg" hidden><div class="dp-prog-bar"><i id="dpProgFill"></i></div><span id="dpProgTxt"></span></div>' +
            '</div>' +
            '<div id="dpMsg" role="status"></div>';
        main.appendChild(sec);

        $("dpVideoBtn").addEventListener("click", pickVideo);
        $("dpEmpty").addEventListener("click", pickVideo);
        $("dpSubBtn").addEventListener("click", pickSub);
        $("dpLastBtn").addEventListener("click", function () {
            if (lastSaved) { setSub(lastSaved.text, lastSaved.filename); }
        });
        $("dpDm").addEventListener("click", function () { setDelay(delay - 0.5); });
        $("dpDp").addEventListener("click", function () { setDelay(delay + 0.5); });
        $("dpSm").addEventListener("click", function () { setSize(size - 2); });
        $("dpSp").addEventListener("click", function () { setSize(size + 2); });
        $("dpSave").addEventListener("click", saveNext);
        $("dpFull").addEventListener("click", fullscreen);
        $("dpMake").addEventListener("click", makeVideo);
        $("dpCancel").addEventListener("click", function () { window.desktopApi.cancelExport(); });
        $("dpShow").addEventListener("click", function () { if (lastOut) { window.desktopApi.showInFolder(lastOut); } });
        window.desktopApi.onExportProgress(showProgress);

        var v = $("dpVideo");
        v.addEventListener("play", loop);
        v.addEventListener("seeked", draw);
        v.addEventListener("timeupdate", draw);
        v.addEventListener("error", function () {
            msg("This video can't be played inside the app (its video or audio format is not supported). " +
                "Use “Save next to video”, then open the movie in VLC or MPC-HC: the subtitle loads automatically.", true);
        });
        v.addEventListener("loadedmetadata", function () { msg(""); });

        document.addEventListener("keydown", function (e) {
            if (document.documentElement.getAttribute("data-app-tab") !== "play") { return; }
            if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target || {}).tagName)) { return; }
            if (!haveVideo) { return; }
            if (e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
            else if (e.key === "ArrowRight") { v.currentTime += e.shiftKey ? 30 : 10; }
            else if (e.key === "ArrowLeft") { v.currentTime -= e.shiftKey ? 30 : 10; }
            else if (e.key === "f" || e.key === "F") { fullscreen(); }
            else if (e.key === "[") { setDelay(delay - 0.1); }
            else if (e.key === "]") { setDelay(delay + 0.1); }
        });

        document.addEventListener("fullscreenchange", fitSize);
        window.addEventListener("resize", fitSize);
        fitSize();
    }

    function msg(text, bad) {
        var m = $("dpMsg");
        m.textContent = text || "";
        m.className = bad ? "bad" : "";
    }

    function refreshLast() {
        var b = $("dpLastBtn");
        if (!b) { return; }
        if (lastSaved && lastSaved.text !== subText) {
            b.hidden = false;
            b.textContent = "Use my latest: " + shortName(lastSaved.filename);
        } else {
            b.hidden = true;
        }
    }

    function shortName(n) {
        n = String(n).replace(/\.srt$/i, "");
        return n.length > 34 ? n.slice(0, 31) + "…" : n;
    }

    function refreshButtons() {
        $("dpSave").disabled = !(haveVideo && cues.length);
        $("dpMake").disabled = !(haveVideo && cues.length) || making;
    }

    function setSub(text, name) {
        var parsed = parseSrt(text);
        if (!parsed.length) {
            msg("That file has no subtitle lines I can read.", true);
            return;
        }
        cues = parsed;
        subText = text;
        subName = name;
        $("dpSubName").textContent = name + " · " + parsed.length + " lines";
        shown = "";
        msg("");
        refreshLast();
        refreshButtons();
        draw();
    }

    function pickSub() {
        window.desktopApi.pickSubtitle().then(function (r) {
            if (r) { setSub(r.text, r.name); }
        }).catch(function (e) { msg(String((e && e.message) || e), true); });
    }

    function pickVideo() {
        window.desktopApi.pickVideo().then(function (r) {
            if (!r) { return; }
            var v = $("dpVideo");
            haveVideo = true;
            showBuiltin(r.subs || []);
            $("dpVideoName").textContent = r.name;
            $("dpStage").classList.add("has");
            msg("");
            v.src = r.url;
            v.load();
            v.play().catch(function () { /* user presses play */ });
            refreshButtons();
            // newest subtitle from Find / Upload / Sync goes on automatically
            if (!cues.length && lastSaved) { setSub(lastSaved.text, lastSaved.filename); }
        }).catch(function (e) { msg(String((e && e.message) || e), true); });
    }

    // the video's own (built-in) subtitle tracks: tell the person and let them choose
    function showBuiltin(subs) {
        var box = $("dpBuiltin");
        box.hidden = !subs.length;
        if (!subs.length) { return; }
        $("dpBuiltinList").textContent = subs.map(function (t) {
            return (t.title || t.lang || "Subtitle") + (t.codec ? " (" + t.codec + ")" : "");
        }).join(" · ");
        document.querySelector('input[name="dpOld"][value="remove"]').checked = true;
    }

    function setDelay(d) {
        delay = Math.round(d * 10) / 10;
        $("dpDv").textContent = (delay > 0 ? "+" : "") + delay.toFixed(1) + " s";
        shown = "";
        draw();
    }

    function setSize(px) {
        size = Math.max(16, Math.min(60, px));
        fitSize();
    }

    // font size follows the width of the picture (the same look in a window and in full screen)
    function fitSize() {
        var st = $("dpStage"), cue = $("dpCue");
        if (!st || !cue || !st.clientWidth) { return; }   // 0 while the tab is hidden
        stageW = st.clientWidth;
        cue.style.fontSize = Math.round(stageW * size / 1280) + "px";
    }

    function draw() {
        var cue = $("dpCue");
        if (!cue || !cues.length) { return; }
        var v = $("dpVideo");
        if ($("dpStage").clientWidth !== stageW) { fitSize(); }
        var c = cueAt(v.currentTime - delay);
        var t = c ? c.t : "";
        if (t !== shown) {
            shown = t;
            cue.textContent = t;
            cue.style.display = t ? "block" : "none";
        }
    }

    function loop() {
        cancelAnimationFrame(raf);
        var v = $("dpVideo");
        (function tick() {
            draw();
            if (!v.paused && !v.ended) { raf = requestAnimationFrame(tick); }
        })();
    }

    function fullscreen() {
        var st = $("dpStage");
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (st && st.requestFullscreen) { st.requestFullscreen(); }
    }

    // the delay is baked into the saved file, so other players show it in time too
    function shiftedSrt() {
        if (!delay) { return subText; }
        function fmt(sec) {
            sec = Math.max(0, sec);
            var ms = Math.round(sec * 1000);
            var h = Math.floor(ms / 3600000); ms -= h * 3600000;
            var m = Math.floor(ms / 60000); ms -= m * 60000;
            var s = Math.floor(ms / 1000); ms -= s * 1000;
            function z(n, w) { n = String(n); while (n.length < w) { n = "0" + n; } return n; }
            return z(h, 2) + ":" + z(m, 2) + ":" + z(s, 2) + "," + z(ms, 3);
        }
        return cues.map(function (c, i) {
            return (i + 1) + "\n" + fmt(c.a + delay) + " --> " + fmt(c.b + delay) + "\n" + (c.r || c.t) + "\n";
        }).join("\n");
    }

    function saveNext() {
        window.desktopApi.saveSubNextToVideo(shiftedSrt()).then(function (r) {
            msg("Saved: " + r.path + " . Open the movie in any player and the subtitle loads by itself.");
        }).catch(function (e) { msg(String((e && e.message) || e), true); });
    }

    function fmtEta(sec) {
        if (sec == null || !isFinite(sec)) { return ""; }
        var m = Math.floor(sec / 60), s = sec % 60;
        return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min left" : m ? m + " min " + s + " s left" : s + " s left";
    }

    function showProgress(p) {
        if (!making) { return; }
        $("dpProgFill").style.width = p.percent + "%";
        var t = p.percent + "%";
        if (p.speed) { t += " · " + p.speed.toFixed(1) + "x"; }
        var e = fmtEta(p.etaSec);
        $("dpProgTxt").textContent = t + (e ? " · " + e : "");
    }

    function setMaking(on) {
        making = on;
        $("dpProg").hidden = !on;
        $("dpCancel").hidden = !on;
        if (on) { $("dpShow").hidden = true; $("dpProgFill").style.width = "0%"; $("dpProgTxt").textContent = "Starting…"; }
        refreshButtons();
    }

    function makeVideo() {
        if (making || !haveVideo || !cues.length) { return; }
        var mode = (document.querySelector('input[name="dpMode"]:checked') || {}).value || "burn";
        setMaking(true);
        msg(mode === "burn" ? "Making the video. Keep SinSubz open; you can use other apps meanwhile." : "Adding the subtitle track…");
        window.desktopApi.exportVideo({ srtText: shiftedSrt(), mode: mode, size: size,
            keepOriginal: (document.querySelector('input[name="dpOld"]:checked') || {}).value === "keep" }).then(function (r) {
            setMaking(false);
            if (!r || r.cancelled) { msg("Cancelled. Nothing was saved."); return; }
            lastOut = r.path;
            $("dpShow").hidden = false;
            msg("Done! Saved: " + r.path + " . Play it in any player and the subtitle is already there.");
        }).catch(function (e) {
            setMaking(false);
            msg(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ""), true);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", build);
    } else {
        build();
    }
})();
