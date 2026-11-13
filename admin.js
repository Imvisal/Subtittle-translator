/* SinSubz admin panel. Shows the numbers from GET /api/stats?admin=1 (needs the ADMIN_KEY).
   Everything is written with textContent, so a name or title can never run code. */
(function () {
    "use strict";

    var KEYNAME = "sinsubz-admin-key";
    var KEY = "";
    var DATA = null;

    var $ = function (id) { return document.getElementById(id); };
    try { KEY = sessionStorage.getItem(KEYNAME) || ""; } catch (e) { /* ignore */ }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = text; }
        return n;
    }
    function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
    function when(ms) {
        if (!ms) { return "-"; }
        var d = new Date(ms), diff = Date.now() - ms;
        if (diff < 60e3) { return "just now"; }
        if (diff < 3600e3) { return Math.floor(diff / 60e3) + " min ago"; }
        if (diff < 86400e3) { return Math.floor(diff / 3600e3) + " h ago"; }
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function postAction(payload) {
        return fetch("/api/stats?admin=1", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { throw new Error(d.error || "Failed"); } return d; }); });
    }
    var planFilled = false;
    function renderPlan(pl) {
        if (!pl) { return; }
        var tn = $("tabnPrem"); if (tn) { tn.hidden = !pl.pending; tn.textContent = pl.pending || ""; }
        $("planState").textContent = pl.pending ? pl.pending + " waiting" : "no requests waiting";
        if (!planFilled) {
            planFilled = true;
            $("plPrice").value = pl.config.price || ""; $("plBank").value = pl.config.bank || "";
            $("plHolder").value = pl.config.holder || ""; $("plBankName").value = pl.config.bankName || ""; $("plBranch").value = pl.config.branch || ""; $("plAcc").value = pl.config.account || ""; $("plOn").checked = pl.config.enabled !== false;
        }
        var host = $("plReqs"); host.textContent = "";
        if (!pl.requests.length) { host.appendChild(el("p", "empty", "No requests yet.")); }
        pl.requests.forEach(function (q) {
            var row = el("div"); row.style.cssText = "border-top:1px solid var(--line);padding:10px 0";
            row.appendChild(el("div", "", (q.name || "(no name)") + " · " + (q.email || "") + " · " + q.status + (q.until ? " until " + new Date(q.until).toISOString().slice(0, 10) : "")));
            row.appendChild(el("small", "", "Ref: " + q.ref + " · " + when(q.t)));
            if (q.status === "pending") {
                var bar = el("div", "row"); bar.style.marginTop = "6px";
                var img = el("img"); img.style.cssText = "display:none;max-width:100%;max-height:420px;border-radius:10px;margin-top:8px";
                var view = el("button", "ghost mini", "View slip");
                view.type = "button";
                view.addEventListener("click", function () {
                    view.disabled = true;
                    postAction({ action: "planSlip", id: q.id }).then(function (d) {
                        view.disabled = false;
                        if (/^data:image\//.test(d.slip)) { img.src = d.slip; img.style.display = "block"; } else { window.alert("No slip photo found."); }
                    }).catch(function (e) { view.disabled = false; window.alert(e.message); });
                });
                var ok = el("button", "mini", "Approve 30 days"); ok.type = "button";
                ok.addEventListener("click", function () {
                    if (!window.confirm("Approve Premium for " + (q.email || q.name) + " for 30 days? Check that the money arrived.")) { return; }
                    ok.disabled = true;
                    postAction({ action: "planApprove", id: q.id, days: 30 }).then(load).catch(function (e) { ok.disabled = false; window.alert(e.message); });
                });
                var no = el("button", "ghost mini danger", "Reject"); no.type = "button";
                no.addEventListener("click", function () {
                    if (!window.confirm("Reject this request?")) { return; }
                    postAction({ action: "planReject", id: q.id }).then(load).catch(function (e) { window.alert(e.message); });
                });
                bar.appendChild(view); bar.appendChild(ok); bar.appendChild(no);
                row.appendChild(bar); row.appendChild(img);
            }
            host.appendChild(row);
        });
    }

    var annFilled = false;
    function renderAnnouncement(a) {
        var live = a && a.enabled && (!a.expires || Date.now() <= Date.parse(a.expires) + 86400e3);
        $("annState").textContent = !a ? "none yet" : (live ? "live: " + a.id : "stopped: " + a.id);
        if (annFilled || !a) { return; }
        annFilled = true;
        $("anId").value = a.id || ""; $("anTitle").value = a.title || ""; $("anBody").value = a.body || "";
        $("anImg").value = a.image || ""; $("anUrl").value = a.url || ""; $("anOpen").value = a.openLabel || ""; $("anLater").value = a.laterLabel || "";
        $("anExp").value = a.expires || "";
        $("anAnd").checked = !a.platforms || a.platforms.indexOf("android") !== -1;
        $("anWin").checked = !a.platforms || a.platforms.indexOf("windows") !== -1;
    }

    function post(action, id, extra) {
        return fetch("/api/stats?admin=1", {
            method: "POST",
            headers: { "x-admin-key": KEY, "Content-Type": "application/json" },
            body: JSON.stringify(Object.assign({ action: action, id: id }, extra || {}))
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { throw new Error(d.error || "Failed"); } return d; }); });
    }
    function simpleList(host, rows, emptyText) {
        host.textContent = "";
        if (!rows.length) { host.appendChild(el("li", "empty", emptyText)); return; }
        rows.forEach(function (x) {
            var li = el("li");
            li.appendChild(el("span", "", x[0]));
            li.appendChild(el("span", "", x[1]));
            host.appendChild(li);
        });
    }

    function stat(label, value, hi) {
        var s = el("div", "stat" + (hi ? " hi" : ""));
        s.appendChild(el("b", "", fmt(value)));
        s.appendChild(el("span", "", label));
        return s;
    }

    function chart(host, days, field) {
        host.textContent = "";
        var max = Math.max.apply(null, days.map(function (d) { return d[field]; }).concat([1]));
        days.forEach(function (d) {
            var c = el("div", "c");
            c.title = d.day + ": " + d[field];
            c.appendChild(el("div", "v", d[field] ? String(d[field]) : ""));
            var bar = el("div", "bar");
            bar.style.height = Math.max(2, Math.round((d[field] / max) * 90)) + "px";
            c.appendChild(bar);
            c.appendChild(el("div", "d", d.day.slice(8)));
            host.appendChild(c);
        });
    }

    function renderUsers() {
        var q = $("find").value.trim().toLowerCase();
        var body = $("users");
        body.textContent = "";
        var list = DATA.users.filter(function (u) {
            return !q || (u.name + " " + u.email).toLowerCase().indexOf(q) !== -1;
        });
        list.forEach(function (u) {
            var tr = el("tr");
            var td = el("td");
            var who = el("div", "who");
            if (/^https:\/\//i.test(u.photo)) {
                var img = el("img");
                img.src = u.photo;
                img.alt = "";
                img.referrerPolicy = "no-referrer";
                img.loading = "lazy";
                who.appendChild(img);
            } else {
                who.appendChild(el("div", "av", (u.name || u.email || "?").charAt(0).toUpperCase()));
            }
            var t = el("div");
            t.appendChild(el("div", "", u.name || "(no name)"));
            t.appendChild(el("small", "", u.email));
            who.appendChild(t);
            td.appendChild(who);
            tr.appendChild(td);

            var tdp = el("td"); tdp.appendChild(el("span", "tag", u.platform)); tr.appendChild(tdp);
            tr.appendChild(el("td", "", when(u.first)));
            tr.appendChild(el("td", "", when(u.last)));
            tr.appendChild(el("td", "", u.translated ? fmt(u.translated) : "-"));

            var tda = el("td", "act");
            if (u.blocked) { tda.appendChild(el("span", "pill on", "blocked")); tda.appendChild(document.createTextNode(" ")); }
            if (u.premium) { tda.appendChild(el("span", "pill on", "Premium until " + new Date(u.premium).toISOString().slice(0, 10))); tda.appendChild(document.createTextNode(" ")); }
            var pb = el("button", "ghost mini", u.premium ? "Extend / end" : "Give premium");
            pb.type = "button";
            pb.addEventListener("click", function () {
                var who = u.email || u.name;
                var ans = window.prompt((u.premium ? "Add days to premium for " : "Premium for ") + who + ".\nHow many days? (30 = 1 month, 365 = 1 year)" + (u.premium ? "\nType 0 to end premium now." : ""), "30");
                if (ans === null) { return; }
                var n = Math.floor(Number(ans));
                if (u.premium && n === 0) { pb.disabled = true; post("premiumOff", u.k).then(load).catch(function (e) { pb.disabled = false; window.alert(e.message); }); return; }
                if (!(n >= 1 && n <= 3650)) { window.alert("Enter a number of days from 1 to 3650"); return; }
                pb.disabled = true;
                post("premium", u.k, { days: n }).then(load).catch(function (e) { pb.disabled = false; window.alert(e.message); });
            });
            tda.appendChild(pb);
            tda.appendChild(document.createTextNode(" "));
            var bb = el("button", "ghost mini" + (u.blocked ? "" : " danger"), u.blocked ? "Unblock" : "Block");
            bb.type = "button";
            bb.addEventListener("click", function () {
                if (!u.blocked && !window.confirm("Block " + (u.email || u.name) + " from comments and messages?")) { return; }
                bb.disabled = true;
                post(u.blocked ? "unblock" : "block", u.k).then(load).catch(function (e) { bb.disabled = false; window.alert(e.message); });
            });
            tda.appendChild(bb);
            tr.appendChild(tda);
            body.appendChild(tr);
        });
        $("usersNote").textContent = !DATA.users.length
            ? "No signed-in accounts recorded yet. They appear here after someone signs in with Google on the website."
            : (list.length + " shown" + (DATA.totals.users > DATA.usersShown ? " (newest " + DATA.usersShown + " of " + fmt(DATA.totals.users) + ")" : ""));
    }

    function render(d) {
        renderAnnouncement(d.announcement);
        renderPlan(d.plan);
        DATA = d;
        var t = d.totals;

        var today = $("today"); today.textContent = "";
        today.appendChild(stat("Translated today", d.today.translated, true));
        today.appendChild(stat("Signed-in users active today", d.today.activeUsers, true));
        today.appendChild(stat("New accounts today", d.today.newUsers, true));

        var tot = $("totals"); tot.textContent = "";
        [["Subtitles translated", t.translated], ["Signed-in accounts", t.users], ["Movies", t.movies], ["TV series", t.series],
            ["Episodes", t.episodes], ["Synced", t.synced], ["Merged", t.merged], ["Saved in library (titles)", t.libraryTitles],
            ["Comments", t.comments], ["Messages", t.messages]].forEach(function (x) { tot.appendChild(stat(x[0], x[1])); });

        chart($("chartT"), d.daily, "translated");
        chart($("chartU"), d.daily, "users");

        var rec = $("recent"); rec.textContent = "";
        if (!d.recent.length) { rec.appendChild(el("li", "empty", "Nothing yet. Titles show here from now on.")); }
        d.recent.slice(0, 15).forEach(function (r) {
            var li = el("li");
            li.appendChild(el("span", "", r.n || ""));
            li.appendChild(el("span", "", when(r.t)));
            rec.appendChild(li);
        });

        // new accounts + where they use it
        chart($("chartN"), d.daily, "newUsers");
        var pl = $("platforms"); pl.textContent = "";
        var pmax = Math.max(1, d.platforms.web || 0, d.platforms.android || 0, d.platforms.windows || 0);
        [["Web", d.platforms.web], ["Android", d.platforms.android], ["Windows", d.platforms.windows]].forEach(function (x) {
            var row = el("div", "b");
            row.appendChild(el("span", "", x[0]));
            var tr = el("div", "track"), f = el("div", "fill");
            f.style.width = Math.round(((x[1] || 0) / pmax) * 100) + "%";
            tr.appendChild(f); row.appendChild(tr);
            row.appendChild(el("span", "n", fmt(x[1] || 0)));
            pl.appendChild(row);
        });

        // estimated Gemini quota left today (per key, Pacific day)
        var qb = $("quotaBars"); qb.textContent = "";
        var Q = d.quota, qSum = 0;
        Q.keys.forEach(function (k) {
            qSum += k.left;
            var row = el("div", "b");
            row.appendChild(el("span", "", "Key #" + k.n));
            var tr = el("div", "track"), f = el("div", "fill");
            f.style.width = k.left + "%";
            tr.appendChild(f); row.appendChild(tr);
            row.appendChild(el("span", "n", k.exhausted ? "empty" : (k.left + "% (" + fmt(k.used) + " used)")));
            qb.appendChild(row);
        });
        var resetIn = Math.max(0, Q.resetAt - Date.now());
        $("quotaNote").textContent = "All keys together: about " + Math.round(qSum / Q.keys.length) + "% left. Resets in " + Math.floor(resetIn / 3600e3) + " h " + Math.floor(resetIn % 3600e3 / 60e3) + " min (" +
            new Date(Q.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "). Google does not tell us the real number: this counts the calls made since this update against " +
            fmt(Q.limit) + " per key (change it with GEMINI_DAILY_LIMIT in Vercel). A key shows \"empty\" when Google itself says its daily quota is finished.";

        // translation health
        var hd = d.health.daily, ht = hd[hd.length - 1];
        var hg = $("healthToday"); hg.textContent = "";
        hg.appendChild(stat("Chunks translated OK today", ht.ok, true));
        hg.appendChild(stat("Broken JSON from Gemini today", ht.json));
        hg.appendChild(stat("Fixed by salvage today", ht.salvaged, true));
        hg.appendChild(stat("Quota ran out today", ht.quota));
        hg.appendChild(stat("Gemini busy today", ht.busy));
        hg.appendChild(stat("Other failures today", ht.other));
        chart($("chartF"), hd.map(function (x) { return { day: x.day, fail: x.json + x.quota + x.busy + x.other }; }), "fail");

        var kb = $("keys"); kb.textContent = "";
        d.health.keys.forEach(function (k) {
            var tr = el("tr");
            tr.appendChild(el("td", "", "#" + k.n));
            tr.appendChild(el("td", k.today ? "ok" : "", fmt(k.today)));
            tr.appendChild(el("td", "", fmt(k.ok)));
            tr.appendChild(el("td", k.q429 ? "bad" : "", fmt(k.q429)));
            tr.appendChild(el("td", k.bad ? "bad" : "", fmt(k.bad)));
            tr.appendChild(el("td", k.err ? "bad" : "", fmt(k.err)));
            kb.appendChild(tr);
        });
        $("keysNote").textContent = d.health.keys.length
            ? "A key with 0 uses while others are busy is still waiting as a spare. Rejected = wrong or blocked key."
            : "No key activity recorded yet. It fills in as people translate.";

        // most translated titles
        simpleList($("topWeek"), d.top.week.map(function (x) { return [x.n, fmt(x.c)]; }), "Nothing yet. It fills in as people translate.");
        simpleList($("topAll"), d.top.all.map(function (x) { return [x.n, fmt(x.c)]; }), "Nothing yet. It fills in as people translate.");

        // saved translations re-used
        var hits = d.daily.reduce(function (a, x) { return a + x.libHit; }, 0);
        var miss = d.daily.reduce(function (a, x) { return a + x.libMiss; }, 0);
        chart($("chartL"), d.daily, "libHit");
        $("libNote").textContent = (hits + miss)
            ? ("Last 14 days: " + fmt(hits) + " of " + fmt(hits + miss) + " lookups found a saved translation (" + Math.round(hits / (hits + miss) * 100) + "%). Each one saved an AI call.")
            : "No lookups recorded yet.";

        // inbox + comments
        $("inboxTitle").textContent = "Inbox (" + d.inbox.unread + " unread of " + fmt(d.inbox.total) + ")";
        var ib = $("inboxList"); ib.textContent = "";
        if (!d.inbox.recent.length) { ib.appendChild(el("p", "empty", "No messages.")); }
        d.inbox.recent.forEach(function (m) {
            var row = el("div", "msg");
            var top = el("div", "t", (m.prem ? "\u2605 PREMIUM \u00B7 " : "") + (m.unread ? "\u25CF " : "") + (m.name || "(no name)"));
            if (m.prem) { row.style.borderLeft = "3px solid #f5c84c"; }
            if (m.unread) { top.className = "t ok"; }
            row.appendChild(top);
            row.appendChild(el("small", "", m.email + " \u00B7 " + when(Date.parse(m.t))));
            row.appendChild(el("div", "t", m.text));
            ib.appendChild(row);
        });
        var cb = $("commentList"); cb.textContent = "";
        if (!d.comments.length) { cb.appendChild(el("p", "empty", "No comments.")); }
        d.comments.forEach(function (c) {
            var row = el("div", "msg");
            row.appendChild(el("div", "t", c.name || "(no name)"));
            row.appendChild(el("small", "", (c.film ? c.film + " \u00B7 " : "") + when(c.t)));
            row.appendChild(el("div", "t", c.text));
            var del = el("button", "ghost mini danger", "Delete");
            del.type = "button";
            del.style.marginTop = "6px";
            del.addEventListener("click", function () {
                if (!window.confirm("Delete this comment?")) { return; }
                del.disabled = true;
                post("deleteComment", c.id).then(load).catch(function (e) { del.disabled = false; window.alert(e.message); });
            });
            row.appendChild(del);
            cb.appendChild(row);
        });

        $("usersTitle").textContent = "Signed-in Google accounts (" + fmt(t.users) + ")";
        renderUsers();
    }

    function runCheck() {
        var btn = $("runCheck"), ul = $("checkList");
        btn.disabled = true; btn.textContent = "Checking...";
        ul.textContent = "";
        fetch("/api/stats?health=1", { headers: { "x-admin-key": KEY }, cache: "no-store" })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { throw new Error(d.error || "Failed"); } return d; }); })
            .then(function (d) {
                d.results.forEach(function (x) {
                    var li = el("li");
                    li.appendChild(el("span", x.ok ? "ok" : "bad", (x.ok ? "\u2713 " : "\u2717 ") + x.name));
                    li.appendChild(el("span", "", x.ok ? x.ms + " ms" : x.note));
                    ul.appendChild(li);
                });
            })
            .catch(function (e) { ul.appendChild(el("li", "bad", e.message)); })
            .then(function () { btn.disabled = false; btn.textContent = "Run check now"; });
    }

    function renderDownloads(d) {
        var ul = $("downloads"); ul.textContent = "";
        if (!d || !d.enabled) { ul.appendChild(el("li", "empty", "Not available right now.")); return; }
        [["Android", d.android], ["Windows (installer + portable)", d.windowsTotal], ["  installer", d.windows], ["  portable", d.portable]].forEach(function (x) {
            var li = el("li"); li.appendChild(el("span", "", x[0])); li.appendChild(el("span", "", fmt(x[1]))); ul.appendChild(li);
        });
    }

    // ---- tabs (the last one is remembered in this browser) ----
    function openTab(name) {
        var found = false;
        Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (p) { var on = p.getAttribute("data-tab") === name; p.hidden = !on; if (on) { found = true; } });
        if (!found) { openTab("overview"); return; }
        Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) { b.classList.toggle("on", b.getAttribute("data-go") === name); });
        try { localStorage.setItem("sinsubz-admin-tab", name); } catch (e) { /* ignore */ }
        window.scrollTo(0, 0);
        if (name === "logs") { loadLogs(); }
        if (name === "auto") { loadQueue(); loadReady(); runnerStatus(); }
    }
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-go")); });
    });
    try { var savedTab = localStorage.getItem("sinsubz-admin-tab"); if (savedTab) { openTab(savedTab); } } catch (e) { /* ignore */ }


    // ---- backup translator test: sends sample lines (or the first 30 cues of an .srt) through the REAL /api/translate
    //      with "x-force-mt", so Gemini is skipped and the backup translator + all the rules/clean-up run exactly like for visitors ----
    (function () {
        var btn = $("mtTest"); if (!btn) { return; }
        var SAMPLE = ["Where were you last night?", "I told you not to come here!", "Don't lie to me. I know everything.", "Come on, we have to go. Now!",
            "You're out of your mind if you think I'll help you.", "Hey, buddy. Long time no see.", "I can't believe you did this to me.", "Mom, I'm home. What's for dinner?"];
        function cuesFrom(srt) {
            return String(srt || "").replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n{2,}/).map(function (block) {
                var ls = block.split("\n").filter(Boolean); var k = -1;
                for (var i = 0; i < ls.length; i++) { if (ls[i].indexOf("-->") >= 0) { k = i; break; } }
                return k < 0 ? "" : ls.slice(k + 1).join("\n").replace(/<[^>]+>/g, "").trim();
            }).filter(Boolean).slice(0, 30);
        }
        function call(lines, engine) {
            var subs = lines.map(function (t, i) { return { number: i + 1, text: t }; });
            var t0 = Date.now();
            var h = { "x-admin-key": KEY, "Content-Type": "application/json" };
            if (engine === "mt") { h["x-force-mt"] = "1"; }
            return fetch("/api/translate", { method: "POST", headers: h, body: JSON.stringify({ subtitles: subs, language: "si", style: "natural", job: "backup-test" }) })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d, ms: Date.now() - t0 }; }); })
                .catch(function (e) { return { ok: false, d: { error: e.message }, ms: Date.now() - t0 }; });
        }
        function run(lines) {
            var out = $("mtOut"), sel = $("mtEngine"), mode = sel ? sel.value : "mt";
            out.textContent = "Testing..."; btn.disabled = true;
            var engines = mode === "both" ? ["gemini", "mt"] : [mode];
            Promise.all(engines.map(function (e) { return call(lines, e); })).then(function (rs) {
                btn.disabled = false; out.textContent = "";
                var maps = rs.map(function (x) { var m = {}; ((x.d && x.d.subtitles) || []).forEach(function (s) { m[s.number] = s.text; }); return m; });
                rs.forEach(function (x, k) {
                    var name = engines[k] === "mt" ? "Backup translator" : "Gemini";
                    if (!x.ok) { out.appendChild(el("div", "bad", name + " failed: " + ((x.d && x.d.error) || "unknown error"))); return; }
                    var who = x.d.engine === "mt" ? "backup translator" : "Gemini";
                    out.appendChild(el("div", "muted", name + ": works (answered by " + who + ", " + x.ms + " ms)." + (engines[k] === "gemini" && x.d.engine === "mt" ? " Gemini quota is out, the backup answered instead." : "")));
                });
                lines.forEach(function (en, i) {
                    var row = el("div", "", ""); row.style.cssText = "padding:6px 0;border-top:1px solid var(--line)";
                    row.appendChild(el("div", "muted", en));
                    maps.forEach(function (m, k) {
                        var t = m[i + 1] || ""; if (!t && !rs[k].ok) { return; }
                        row.appendChild(el("div", "", (engines.length > 1 ? (engines[k] === "mt" ? "Backup: " : "Gemini: ") : "") + t));
                    });
                    out.appendChild(row);
                });
            });
        }
        btn.addEventListener("click", function () { $("mtFileName").textContent = ""; run(SAMPLE); });
        var f = $("mtFile");
        if (f) {
            f.addEventListener("change", function () {
                var file = f.files && f.files[0]; if (!file) { return; }
                var rd = new FileReader();
                rd.onload = function () { var c = cuesFrom(rd.result); $("mtFileName").textContent = file.name + " (first " + c.length + " lines)"; f.value = ""; if (c.length) { run(c); } };
                rd.readAsText(file);
            });
        }
    })();

    // ---- live log tab: refreshes every 10 s while it is open ----
    var logFilter = "all", logTimer = null;
    // ---- run now / stop the auto translator ----
    function runnerCall(act) {
        return fetch("/api/stats?cron=runner&act=" + act, { method: act === "status" ? "GET" : "POST", headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }
    function runnerStatus() {
        if (!KEY || !$("arState")) { return; }
        runnerCall("status").then(function (d) {
            $("arState").textContent = d.error ? "unknown" : (d.running ? "running" : "idle");
            if (d.error) { $("arMsg").textContent = d.error; }
        }).catch(function () { $("arState").textContent = "unknown"; });
    }
    (function () {
        var a = $("arStart"), b = $("arStop");
        if (!a || !b) { return; }
        a.addEventListener("click", function () {
            a.disabled = true; $("arMsg").textContent = "Starting...";
            runnerCall("start").then(function (d) {
                $("arMsg").textContent = d.started ? "Started. It takes about a minute to begin; watch the Logs tab. It stops by itself after 60 minutes." : (d.error || "Could not start.");
                setTimeout(runnerStatus, 4000);
            }).catch(function () { $("arMsg").textContent = "Could not start."; }).then(function () { a.disabled = false; });
        });
        b.addEventListener("click", function () {
            if (!window.confirm("Stop the auto translator?")) { return; }
            b.disabled = true; $("arMsg").textContent = "Stopping...";
            runnerCall("stop").then(function (d) {
                $("arMsg").textContent = d.ok ? (d.stopped ? "Stopped " + d.stopped + " run(s). Finished episodes are kept." : "Nothing was running. It will not start again until you press Run now.") : (d.error || "Could not stop.");
                setTimeout(runnerStatus, 3000);
            }).catch(function () { $("arMsg").textContent = "Could not stop."; }).then(function () { b.disabled = false; });
        });
    })();

    // admin: search any series and add it to the list (at the end, or first so it is worked on next)
    (function () {
        var inp = $("aqFind"), btn = $("aqFindBtn"), out = $("aqFound");
        if (!inp || !btn || !out) { return; }
        function add(it, top, b) {
            b.disabled = true;
            fetch("/api/stats?autoq=add", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ items: [it], top: top }) })
                .then(function (r) { return r.json(); }).then(function (d) {
                    b.textContent = d.added ? "Added" : (d.error || "Not added (already there or list full)");
                    loadQueue();
                }).catch(function () { b.disabled = false; b.textContent = "Failed, try again"; });
        }
        function go() {
            var t = inp.value.trim();
            if (t.length < 2) { return; }
            btn.disabled = true; out.textContent = "Searching...";
            fetch("/api/stats?autoq=find&q=" + encodeURIComponent(t), { headers: { "x-admin-key": KEY }, cache: "no-store" })
                .then(function (r) { return r.json(); }).then(function (d) {
                    out.textContent = "";
                    if (d.error) { out.textContent = d.error; return; }
                    var items = d.items || [];
                    if (!items.length) { out.appendChild(el("div", "muted", "No series found" + (d.hidden ? " (" + d.hidden + " result(s) had no IMDb id)." : "."))); return; }
                    items.forEach(function (it) {
                        var row = el("div", "row", "");
                        row.style.cssText = "justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                        var left = el("div", "", "");
                        left.style.cssText = "display:flex;gap:10px;align-items:center;min-width:0";
                        if (it.poster) { var im = document.createElement("img"); im.src = it.poster; im.alt = ""; im.width = 40; im.style.borderRadius = "6px"; left.appendChild(im); }
                        var tx = el("div", "", "");
                        tx.appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : "")));
                        tx.appendChild(el("div", "muted", it.total + " episodes · " + it.seasons.length + " season(s)"));
                        left.appendChild(tx); row.appendChild(left);
                        var acts = el("div", "", ""); acts.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
                        if (it.inList) { acts.appendChild(el("span", "tag", "already in the list")); }
                        else {
                            var a1 = el("button", "btn", "Add"); a1.type = "button";
                            var a2 = el("button", "btn ghost", "Add first"); a2.type = "button";
                            a1.addEventListener("click", function () { add(it, false, a1); a2.disabled = true; });
                            a2.addEventListener("click", function () { add(it, true, a2); a1.disabled = true; });
                            acts.appendChild(a1); acts.appendChild(a2);
                        }
                        row.appendChild(acts); out.appendChild(row);
                    });
                }).catch(function () { out.textContent = "Could not search."; }).then(function () { btn.disabled = false; });
        }
        btn.addEventListener("click", go);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    })();

    function loadQueue() {
        if (!KEY) { return; }
        fetch("/api/stats?autoq=get", { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            var host = $("aqList"); if (!host) { return; }
            host.textContent = "";
            var list = d.list || [];
            var pending = list.filter(function (x) { return x.todo && x.todo.length; });
            $("aqCount").textContent = pending.length + " working / " + list.length + " total";
            $("aqLast").textContent = d.meta && d.meta.lastRefill ? "Last refill: " + new Date(d.meta.lastRefill).toLocaleDateString() + "." : "Not filled yet: the first run fills it.";
            if (!list.length) { host.appendChild(el("div", "muted", "Empty. The next runner start fills it.")); return; }
            var firstPending = pending[0];
            var skippedAll = list.reduce(function (a, x) { return a + (x.skipped || 0); }, 0);
            if (skippedAll) {
                var rb = el("button", "btn", "Retry the " + skippedAll + " skipped episodes now");
                rb.type = "button";
                rb.addEventListener("click", function () {
                    rb.disabled = true;
                    fetch("/api/stats?autoq=unskip", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: "{}" })
                        .then(function () { loadQueue(); }).catch(function () { rb.disabled = false; });
                });
                host.appendChild(rb);
            }
            var AQ_SHOW = 5, aqMore = [];
            list.forEach(function (it, i) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                if (i >= AQ_SHOW) { row.style.display = "none"; aqMore.push(row); }
                var state = it === firstPending ? "NOW" : (it.todo && it.todo.length ? "waiting" : "done");
                var txt = el("div", "", "");
                txt.appendChild(el("b", "", (i + 1) + ". " + it.title + (it.year ? " (" + it.year + ")" : "") + " "));
                txt.appendChild(el("span", "tag", state));
                txt.appendChild(el("div", "muted", it.done + " / " + it.total + " episodes" + (it.skipped ? " · " + it.skipped + " waiting for an English subtitle" : "") + " · from " + (it.src || "?")));
                row.appendChild(txt);
                var b = el("button", "btn ghost", "Remove");
                b.type = "button";
                b.addEventListener("click", function () {
                    if (!window.confirm("Remove this series from the list?")) { return; }
                    b.disabled = true;
                    fetch("/api/stats?autoq=drop", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ imdb: it.imdb }) })
                        .then(function () { loadQueue(); }).catch(function () { b.disabled = false; });
                });
                row.appendChild(b);
                host.appendChild(row);
            });
            if (aqMore.length) {
                var amb = el("button", "ghost", "See more (" + aqMore.length + ")");
                amb.type = "button"; amb.style.marginTop = "10px";
                var aqOpen = false;
                amb.addEventListener("click", function () {
                    aqOpen = !aqOpen;
                    aqMore.forEach(function (r) { r.style.display = aqOpen ? "" : "none"; });
                    amb.textContent = aqOpen ? "Show less" : "See more (" + aqMore.length + ")";
                });
                host.appendChild(amb);
            }
        }).catch(function () { var h = $("aqList"); if (h) { h.textContent = "Could not load."; } });
    }
    function loadReady() {
        fetch("/api/stats?ready=list", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            var host = $("rdList"); if (!host) { return; }
            host.textContent = "";
            var items = d.items || [];
            $("rdCount").textContent = items.reduce(function (a, i) { return a + i.eps.length; }, 0) + " files";
            if (!items.length) { host.appendChild(el("div", "muted", "Nothing yet. The runner adds titles after its first run.")); return; }
            function del(body, btn) {
                if (!window.confirm("Remove from the Ready list?")) { return; }
                btn.disabled = true;
                fetch("/api/stats?ready=del", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
                    .then(function (r) { if (!r.ok) { throw new Error("Failed"); } loadReady(); }).catch(function (e) { btn.disabled = false; window.alert(e.message); });
            }
            var SHOW = 5, more = [];
            items.forEach(function (it, ix) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                if (ix >= SHOW) { row.style.display = "none"; more.push(row); }
                var eps = it.type === "tv" ? it.eps.map(function (e) { return "S" + e.s + "E" + e.e; }).join(", ") : "Film";
                var txt = el("div", "", "");
                txt.appendChild(el("b", "", it.t + (it.y ? " (" + it.y + ")" : "")));
                txt.appendChild(el("div", "muted", eps));
                row.appendChild(txt);
                var b = el("button", "ghost", "Remove all");
                b.type = "button";
                b.addEventListener("click", function () { del({ imdb: it.id }, b); });
                row.appendChild(b);
                host.appendChild(row);
            });
            if (more.length) {
                var mb = el("button", "ghost", "See more (" + more.length + ")");
                mb.type = "button"; mb.style.marginTop = "10px";
                var open = false;
                mb.addEventListener("click", function () {
                    open = !open;
                    more.forEach(function (r) { r.style.display = open ? "" : "none"; });
                    mb.textContent = open ? "Show less" : "See more (" + more.length + ")";
                });
                host.appendChild(mb);
            }
        }).catch(function () { /* ignore */ });
    }

    function loadLogs() {
        if (!KEY) { return; }
        fetch("/api/stats?logs=1", { headers: { "x-admin-key": KEY }, cache: "no-store" })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var rows = $("logRows"); rows.textContent = "";
                var ev = (d.events || []).filter(function (e) { return logFilter === "all" || e.lvl === logFilter; });
                $("logEmpty").hidden = ev.length > 0;
                ev.forEach(function (e) {
                    var tr = el("tr", "lg-" + (e.lvl || "info"));
                    var t = new Date(e.t);
                    [t.toLocaleTimeString() + " " + t.toLocaleDateString(undefined, { day: "numeric", month: "short" }), e.type || "", e.u || "", e.job || "", e.msg || ""].forEach(function (v) { tr.appendChild(el("td", "", v)); });
                    rows.appendChild(tr);
                });
                $("logSub").textContent = "Updated " + new Date().toLocaleTimeString();
            })
            .catch(function () { $("logSub").textContent = "Could not load."; });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".lgf"), function (b) {
        b.addEventListener("click", function () {
            logFilter = b.getAttribute("data-f");
            Array.prototype.forEach.call(document.querySelectorAll(".lgf"), function (x) { x.classList.toggle("on", x === b); });
            loadLogs();
        });
    });
    setInterval(function () {
        var pane = document.querySelector('.tabpane[data-tab="logs"]');
        if (pane && !pane.hidden && !document.hidden) { loadLogs(); }
    }, 10000);

    function show(on) {
        $("links").hidden = !on;
        $("login").hidden = on;
        $("panel").hidden = !on;
        $("tools").hidden = !on;
    }

    function load() {
        $("err").textContent = "";
        return fetch("/api/stats?admin=1", { headers: { "x-admin-key": KEY }, cache: "no-store" })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
            .then(function (res) {
                if (res.status === 401 || res.status === 503 || res.status === 429) {
                    show(false);
                    $("err").textContent = res.d.error || "Not allowed";
                    try { sessionStorage.removeItem(KEYNAME); } catch (e) { /* ignore */ }
                    return;
                }
                if (!res.ok || !res.d.enabled) {
                    show(false);
                    $("err").textContent = res.d && res.d.enabled === false
                        ? "The database (Upstash Redis) is not connected" + (res.d.error ? " (" + res.d.error + ")" : "") + "."
                        : "Could not load. Try again.";
                    return;
                }
                try { sessionStorage.setItem(KEYNAME, KEY); } catch (e) { /* ignore */ }
                show(true);
                $("sub").textContent = "Updated " + new Date().toLocaleTimeString();
                render(res.d);
                fetch("/api/stats?downloads=1", { cache: "no-store" }).then(function (r) { return r.json(); }).then(renderDownloads).catch(function () { renderDownloads(null); });
            })
            .catch(function () { $("err").textContent = "Network problem. Try again."; });
    }

    $("login").addEventListener("submit", function (e) {
        e.preventDefault();
        KEY = $("key").value.trim();
        $("key").value = "";
        if (KEY) { load(); }
    });
    $("refresh").addEventListener("click", load);
    $("runCheck").addEventListener("click", runCheck);
    $("logout").addEventListener("click", function () {
        KEY = ""; DATA = null;
        try { sessionStorage.removeItem(KEYNAME); } catch (e) { /* ignore */ }
        show(false);
        $("sub").textContent = "Locked.";
    });
    $("plSave").addEventListener("click", function () {
        postAction({ action: "planConfig", config: { price: $("plPrice").value, holder: $("plHolder").value, bankName: $("plBankName").value, branch: $("plBranch").value, account: $("plAcc").value, bank: $("plBank").value, enabled: $("plOn").checked } })
            .then(function () { window.alert("Saved."); }).catch(function (e) { window.alert(e.message); });
    });
    $("anSend").addEventListener("click", function () {
        var pf = [];
        if ($("anAnd").checked) { pf.push("android"); }
        if ($("anWin").checked) { pf.push("windows"); }
        if (!window.confirm("Send this announcement to all app users?")) { return; }
        postAction({ action: "announce", announcement: {
            enabled: true, id: $("anId").value.trim(), title: $("anTitle").value, body: $("anBody").value,
            image: $("anImg").value.trim(), url: $("anUrl").value.trim(), openLabel: $("anOpen").value, laterLabel: $("anLater").value,
            platforms: pf, expires: $("anExp").value
        } }).then(function () { $("anMsg").textContent = "Sent. Apps get it within about 15 minutes (Android) / 6 hours (Windows)."; annFilled = false; load(); })
            .catch(function (e) { $("anMsg").textContent = e.message; window.alert(e.message); });
    });
    $("anStop").addEventListener("click", function () {
        postAction({ action: "announceStop" }).then(function () { $("anMsg").textContent = "Stopped."; annFilled = false; load(); })
            .catch(function (e) { window.alert(e.message); });
    });
    $("find").addEventListener("input", function () { if (DATA) { renderUsers(); } });
    $("csv").addEventListener("click", function () {
        if (!DATA) { return; }
        function q(s) { s = String(s == null ? "" : s); if (/^[=+\-@\t\r]/.test(s)) { s = "'" + s; } return '"' + s.replace(/"/g, '""') + '"'; }
        var rows = [["name", "email", "platform", "first_seen", "last_seen", "translated"]].concat(DATA.users.map(function (u) {
            return [u.name, u.email, u.platform, u.first ? new Date(u.first).toISOString() : "", u.last ? new Date(u.last).toISOString() : "", u.translated];
        }));
        var blob = new Blob(["﻿" + rows.map(function (r) { return r.map(q).join(","); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sinsubz-users.csv";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });

    if (KEY) { load(); }

    // ---- browser (web push) notifications ----
    (function () {
        var send = document.getElementById("pnSend"), out = document.getElementById("pnOut"), cnt = document.getElementById("pnCount");
        if (!send) { return; }
        function count() {
            if (!KEY) { return; }
            fetch("/api/stats?push=count", { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); })
                .then(function (d) { cnt.textContent = d && d.error ? "" : (d.n + " subscribers" + (d.ready ? "" : " - keys not set")); }).catch(function () { /* ignore */ });
        }
        count();
        send.addEventListener("click", function () {
            var t = document.getElementById("pnTitle").value.trim(), b = document.getElementById("pnBody").value.trim(), u = document.getElementById("pnUrl").value.trim();
            if (!t) { out.textContent = "Write a title first."; return; }
            if (!window.confirm("Send this notification to every subscriber?")) { return; }
            send.disabled = true; out.textContent = "Sending...";
            fetch("/api/stats?push=send", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ title: t, body: b, url: u }) })
                .then(function (r) { return r.json(); })
                .then(function (d) { out.textContent = d.error ? d.error : "Sent to " + d.sent + (d.removed ? ", " + d.removed + " old removed" : "") + (d.failed ? ", " + d.failed + " failed" : "") + "."; count(); })
                .catch(function () { out.textContent = "Could not send."; })
                .then(function () { send.disabled = false; });
        });
    })();

    // ---- Sinhala story intros for every title (2 per call) ----
    (function () {
        var go = document.getElementById("siGo"), out = document.getElementById("siOut"), redo = document.getElementById("siRedo");
        if (!go) { return; }
        var running = false;
        go.addEventListener("click", function () {
            if (running) { return; }
            running = true; go.disabled = true;
            var tot = { made: 0, had: 0, failed: 0 };
            function step(offset) {
                fetch("/api/stats?ready=intros", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ offset: offset, redo: !!(redo && redo.checked) }) })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (!d || d.error) { throw new Error((d && d.error) || "failed"); }
                        ["made", "had", "failed"].forEach(function (k) { tot[k] += d[k] || 0; }); if (d.why) { tot.why = d.why; }
                        var txt = tot.made + " made, " + tot.had + " already had one" + (tot.failed ? ", " + tot.failed + " failed (" + (tot.why || "?") + ") - press again later" : "");
                        out.textContent = (d.done ? "Done. " : "Working... " + d.next + "/" + d.total + ". ") + txt + (d.done ? "." : "");
                        if (d.done) { running = false; go.disabled = false; return; }
                        step(d.next);
                    })
                    .catch(function (e) { out.textContent = "Stopped: " + e.message + ". Press again to continue."; running = false; go.disabled = false; });
            }
            out.textContent = "Starting...";
            step(0);
        });
    })();

    // ---- film pages from the library (backfill, a few films per call) ----
    (function () {
        var go = document.getElementById("fpGo"), out = document.getElementById("fpOut");
        if (!go) { return; }
        var running = false;
        go.addEventListener("click", function () {
            if (running) { return; }
            running = true; go.disabled = true;
            var tot = { created: 0, exists: 0, skipped: 0, errors: 0, scanned: 0 };
            function step(cursor) {
                fetch("/api/stats?ready=backfill", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ cursor: cursor }) })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (!d || d.error) { throw new Error((d && d.error) || "failed"); }
                        ["created", "exists", "skipped", "errors", "scanned"].forEach(function (k) { tot[k] += d[k] || 0; });
                        out.textContent = "Working... " + tot.created + " pages made, " + tot.exists + " already there, " + tot.skipped + " skipped" + (tot.errors ? ", " + tot.errors + " errors (press again)" : "");
                        if (d.done) { out.textContent = "Done. " + tot.created + " pages made, " + tot.exists + " already there, " + tot.skipped + " skipped (series or too short)" + (tot.errors ? ", " + tot.errors + " errors (press again)" : "") + "."; running = false; go.disabled = false; return; }
                        step(d.cursor);
                    })
                    .catch(function (e) { out.textContent = "Stopped: " + e.message + ". Press again to continue."; running = false; go.disabled = false; });
            }
            out.textContent = "Starting...";
            step("0");
        });
    })();

})();
