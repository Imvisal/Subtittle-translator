/* Adds a subtitle to a video file WITHOUT re-encoding (ffmpeg -c copy):
   the picture and sound are copied as they are, the subtitle is added as a
   selectable "Sinhala" track and marked as the default one. A NEW file is
   written next to the original; the original is never touched.

   mp4 / m4v / mov  ->  new .mp4 (subtitle stored as mov_text)
   anything else    ->  new .mkv (subtitle stored as SRT) */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function hms(h, m, s) {
    return (+h) * 3600 + (+m) * 60 + parseFloat(s);
}

// duration + number of subtitle tracks the video already has
function probe(ffmpeg, video) {
    return new Promise((resolve, reject) => {
        const p = spawn(ffmpeg, ["-hide_banner", "-i", video], { windowsHide: true });
        let err = "";
        p.stderr.on("data", (d) => { err += d.toString(); });
        p.on("error", reject);
        p.on("close", () => {
            const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(err);
            const subs = (err.match(/Stream #0:\d+[^\n]*: Subtitle/g) || []).length;
            if (!/Stream #0:/.test(err)) {
                reject(new Error("This file does not look like a video ffmpeg can read."));
                return;
            }
            resolve({ duration: d ? hms(d[1], d[2], d[3]) : 0, subs });
        });
    });
}

function uniqueOut(video, ext) {
    const dir = path.dirname(video);
    const base = path.basename(video, path.extname(video));
    let file = path.join(dir, base + ".SinSubz" + ext);
    for (let n = 1; fs.existsSync(file); n++) {
        file = path.join(dir, base + ".SinSubz (" + n + ")" + ext);
    }
    return file;
}

function start({ ffmpeg, video, srtText, onProgress }) {
    let proc = null;
    let cancelled = false;
    let out = null;
    let tmp = null;

    const promise = (async () => {
        const info = await probe(ffmpeg, video);
        const ext = path.extname(video).toLowerCase();
        const mp4 = ext === ".mp4" || ext === ".m4v" || ext === ".mov";
        out = uniqueOut(video, mp4 ? ".mp4" : ".mkv");

        // the new file is about as big as the video: make sure the drive has room
        try {
            const need = fs.statSync(video).size * 1.02 + 5 * 1024 * 1024;
            const st = fs.statfsSync(path.dirname(video));
            if (st.bavail * st.bsize < need) {
                throw new Error("Not enough free space next to the video for the new file.");
            }
        } catch (e) {
            if (/free space/.test(e.message)) throw e;
        }

        tmp = path.join(os.tmpdir(), "sinsubz-" + process.pid + "-" + Date.now() + ".srt");
        fs.writeFileSync(tmp, "﻿" + srtText, "utf8");

        const n = mp4 ? 0 : info.subs;          // index of the new subtitle track
        const args = ["-hide_banner", "-nostdin", "-progress", "pipe:1", "-nostats",
            "-i", video, "-sub_charenc", "UTF-8", "-i", tmp];
        if (mp4) {
            args.push("-map", "0:v", "-map", "0:a?", "-map", "1:0", "-c", "copy", "-c:s", "mov_text");
        } else {
            args.push("-map", "0:v", "-map", "0:a?", "-map", "0:s?", "-map", "0:t?", "-map", "1:0",
                "-c", "copy", "-c:s", "srt");
            for (let i = 0; i < n; i++) args.push("-disposition:s:" + i, "0");
        }
        args.push("-metadata:s:s:" + n, "language=sin", "-metadata:s:s:" + n, "title=Sinhala",
            "-disposition:s:" + n, "default", "-y", out);

        await new Promise((resolve, reject) => {
            proc = spawn(ffmpeg, args, { windowsHide: true });
            let buf = "";
            let tail = "";
            proc.stdout.on("data", (d) => {
                buf += d.toString();
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
                    if (m && info.duration > 0 && onProgress) {
                        onProgress(Math.min(99, Math.round((Number(m[1]) / 1e6 / info.duration) * 100)));
                    }
                }
            });
            proc.stderr.on("data", (d) => { tail = (tail + d.toString()).slice(-1500); });
            proc.on("error", reject);
            proc.on("close", (code) => {
                if (cancelled) return reject(new Error("Cancelled"));
                if (code === 0) return resolve();
                const last = tail.trim().split("\n").filter(Boolean).pop() || ("ffmpeg exited with code " + code);
                reject(new Error(last));
            });
        });

        if (onProgress) onProgress(100);
        return { path: out, size: fs.statSync(out).size };
    })();

    const done = promise.finally(() => {
        try { if (tmp) fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }).catch((e) => {
        try { if (out && fs.existsSync(out)) fs.unlinkSync(out); } catch (x) { /* ignore */ }
        throw e;
    });

    return {
        promise: done,
        cancel() { cancelled = true; if (proc) proc.kill(); }
    };
}

module.exports = { start, probe };
