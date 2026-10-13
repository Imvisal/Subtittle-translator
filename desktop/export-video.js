/* SinSubz — Merge tab: put a subtitle into a video file with ffmpeg.

   Two modes
   - "burn": the subtitle is drawn onto the picture (re-encodes the video).
             Shows in EVERY player / TV / phone, Sinhala letters are shaped correctly.
             Slow (a full movie can take a while).
   - "soft": the subtitle is added as a subtitle track (video + audio are copied, so it is
             very fast). VLC, MPC-HC, PotPlayer, most phones show it; some TVs ignore it.

   Used by main.js. Has no Electron dependency so it can be tested on its own. */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function parseClock(s) {
    const m = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(s || "");
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

// Sinhala-capable fonts that ship with Windows (copied next to the subtitle so libass finds them)
function sinhalaFonts() {
    const dirs = [];
    if (process.env.WINDIR) dirs.push(path.join(process.env.WINDIR, "Fonts"));
    dirs.push("/usr/share/fonts", "/usr/share/fonts/truetype/noto", "/usr/share/fonts/truetype/lklug");
    const names = ["Nirmala.ttf", "NirmalaB.ttf", "Nirmala.ttc", "iskpota.ttf", "NotoSansSinhala-Regular.ttf", "NotoSansSinhala-Bold.ttf"];
    const found = [];
    dirs.forEach((d) => names.forEach((n) => {
        const p = path.join(d, n);
        if (fs.existsSync(p)) found.push(p);
    }));
    return found;
}

function plainError(log) {
    const text = String(log || "");
    if (/No such filter: 'subtitles'|Filter not found/i.test(text)) {
        return "This ffmpeg build cannot burn subtitles onto the picture. Use the fast “Subtitle track” mode instead.";
    }
    if (/Permission denied/i.test(text)) return "Can't write the output file there. Choose another folder.";
    if (/No space left/i.test(text)) return "The disk is full.";
    if (/Invalid data found|moov atom not found/i.test(text)) return "That video file looks damaged or incomplete.";
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    return "ffmpeg failed: " + (lines[lines.length - 1] || "unknown error");
}

/* opts: { ffmpegPath, video, srtText, mode: "burn"|"soft", size (px @1280 wide, same as the preview),
           out, onProgress({percent, etaSec, speed}) }
   returns { promise, cancel() } */
function runExport(opts) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "sinsubz-"));
    let child = null;
    let cancelled = false;

    const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* ignore */ } };

    const promise = new Promise((resolve, reject) => {
        try {
            fs.writeFileSync(path.join(work, "sub.srt"), "\uFEFF" + opts.srtText, "utf8");

            const outExt = path.extname(opts.out).toLowerCase();
            const args = ["-hide_banner", "-y", "-nostdin", "-progress", "pipe:1", "-nostats"];

            if (opts.mode === "soft") {
                args.push("-i", opts.video, "-sub_charenc", "UTF-8", "-i", path.join(work, "sub.srt"),
                    "-map", "0:v", "-map", "0:a?", "-map", "1:0",
                    "-c", "copy",
                    "-c:s", outExt === ".mkv" ? "srt" : "mov_text",
                    "-metadata:s:s:0", "language=sin", "-metadata:s:s:0", "title=Sinhala",
                    "-disposition:s:0", "default");
                if (outExt === ".mp4" || outExt === ".m4v" || outExt === ".mov") args.push("-movflags", "+faststart");
            } else {
                sinhalaFonts().forEach((f) => {
                    try { fs.copyFileSync(f, path.join(work, path.basename(f))); } catch (e) { /* ignore */ }
                });
                // The preview size is "px at a 1280 wide picture" ~ size/720 of the picture height.
                // libass scales SRT text on a 288 high canvas.
                const fs288 = Math.max(6, Math.round((opts.size || 30) * 0.4));
                const style = "FontName=Nirmala UI,Bold=1,FontSize=" + fs288 +
                    ",PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=0.6,Alignment=2,MarginV=26";
                const vf = "subtitles=sub.srt:fontsdir=.:charenc=UTF-8:force_style='" + style + "'";
                args.push("-i", opts.video,
                    "-map", "0:v:0", "-map", "0:a?",
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k",
                    "-sn", "-movflags", "+faststart");
            }
            args.push(opts.out);

            child = spawn(opts.ffmpegPath, args, { cwd: work, windowsHide: true });

            let duration = 0;
            let log = "";
            const started = Date.now();
            let buf = "";

            child.stderr.on("data", (d) => {
                log += d.toString();
                if (log.length > 20000) log = log.slice(-10000);
                if (!duration) {
                    const m = /Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(log);
                    if (m) duration = parseClock(m[1]);
                }
            });

            child.stdout.on("data", (d) => {
                buf += d.toString();
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
                    if (m && duration && opts.onProgress) {
                        const done = Math.min(duration, (+m[1]) / 1e6);
                        const pct = Math.max(0, Math.min(99, Math.round((done / duration) * 100)));
                        const el = (Date.now() - started) / 1000;
                        const speed = el > 2 ? done / el : 0;
                        opts.onProgress({
                            percent: pct,
                            etaSec: speed > 0 ? Math.round((duration - done) / speed) : null,
                            speed: speed
                        });
                    }
                }
            });

            child.on("error", (e) => { cleanup(); reject(new Error("Could not start ffmpeg: " + e.message)); });
            child.on("close", (code) => {
                cleanup();
                if (cancelled) {
                    try { fs.rmSync(opts.out, { force: true }); } catch (e) { /* ignore */ }
                    reject(Object.assign(new Error("Cancelled"), { cancelled: true }));
                } else if (code === 0) {
                    resolve({ path: opts.out });
                } else {
                    try { fs.rmSync(opts.out, { force: true }); } catch (e) { /* ignore */ }
                    reject(new Error(plainError(log)));
                }
            });
        } catch (e) {
            cleanup();
            reject(e);
        }
    });

    return {
        promise,
        cancel() {
            cancelled = true;
            if (child) { try { child.kill(); } catch (e) { /* ignore */ } }
        }
    };
}

module.exports = { runExport };
