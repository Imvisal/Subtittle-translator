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
        if (!window.__spLoaded) { window.__spLoaded = 1; try { loadSuggested(); } catch (e) { /* ignore */ } }
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
            if (q.status === "approved" && q.email) {
                var mb = el("button", "ghost mini", "Send email"); mb.type = "button"; mb.style.marginTop = "6px";
                mb.addEventListener("click", function () {
                    if (!window.confirm("Send the 'Premium is active' e-mail to " + q.email + "?")) { return; }
                    mb.disabled = true; mb.textContent = "Sending…";
                    postAction({ action: "planMail", id: q.id }).then(function () { mb.textContent = "Sent ✓"; })
                        .catch(function (e) { mb.disabled = false; mb.textContent = "Send email"; window.alert(e.message); });
                });
                row.appendChild(mb);
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
        $("anWeb").checked = !!a.platforms && a.platforms.indexOf("web") !== -1;
    }

    function post(action, id, extra) {
        return fetch("/api/stats?admin=1", {
            method: "POST",
            headers: { "x-admin-key": KEY, "Content-Type": "application/json" },
            body: JSON.stringify(Object.assign({ action: action, id: id }, extra || {}))
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { throw new Error(d.error || "Failed"); } return d; }); });
    }
    // Policy update e-mail: counts, then sends in batches of 50 until everybody has it (or Resend's limit stops it)
    (function () {
        var bs = document.getElementById("polSend"), bc = document.getElementById("polCount"), msg = document.getElementById("polMsg");
        if (!bs || !bc || !msg) { return; }
        var dv = document.getElementById("polVer"); if (dv && !dv.value) { dv.value = new Date().toISOString().slice(0, 10); }
        function payload(dry) { return { what: document.getElementById("polWhat").value, ver: document.getElementById("polVer").value.trim(), note: document.getElementById("polNote").value, dry: !!dry }; }
        function line(d) { return d.total + " members with an e-mail address: " + d.sent + " already sent, " + d.left + " waiting."; }
        bc.addEventListener("click", function () {
            bc.disabled = true; msg.textContent = "Counting...";
            post("policyMail", "", payload(true)).then(function (d) { msg.textContent = line(d); }).catch(function (e) { msg.textContent = e.message; }).then(function () { bc.disabled = false; });
        });
        bs.addEventListener("click", function () {
            if (!window.confirm("E-mail the policy update to every member? Members who already got this update name are skipped.")) { return; }
            bs.disabled = bc.disabled = true;
            (function next() {
                msg.textContent = "Sending...";
                post("policyMail", "", payload(false)).then(function (d) {
                    msg.textContent = line(d) + (d.done ? " Finished." : " Sending the next batch...");
                    if (!d.done && d.left > 0) { setTimeout(next, 1200); } else { bs.disabled = bc.disabled = false; }
                }).catch(function (e) { msg.textContent = "Stopped: " + e.message + " Press Send again later to continue."; bs.disabled = bc.disabled = false; });
            })();
        });
    })();
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

    var mtFilled = false;
    function mtFmt(t) { try { return new Date(t).toLocaleString(); } catch (e) { return ""; } }
    function mtStatus(m) {
        // same rules as the server (api/_admin.js maintState)
        var mode = m && (m.mode || (m.on ? "full" : "off")) || "off";
        if (mode !== "translate" && mode !== "full") { mode = "off"; }
        var now = Date.now(), from = Number(m && m.from) || 0, until = Number(m && m.until) || 0;
        if (mode !== "off" && until && now >= until) { return { mode: "off", text: "OFF (it ended by itself at " + mtFmt(until) + ")" }; }
        if (mode !== "off" && from && now < from) { return { mode: "soon", text: "Starts at " + mtFmt(from) + " (" + (mode === "full" ? "whole website" : "translating only") + ")" }; }
        if (mode === "off") { return { mode: "off", text: "OFF - everything works." }; }
        return { mode: mode, text: (mode === "full" ? "ON - whole website is in maintenance" : "ON - translating is paused, the rest works") + (m.auto ? " (switched on by itself: the Gemini keys were rejected)" : "") + (until ? ". Ends at " + mtFmt(until) + "." : ". Stays on until you turn it off.") };
    }
    function renderMaint(m) {
        var st = mtStatus(m);
        $("mtState").textContent = st.mode === "off" ? "OFF" : st.mode === "soon" ? "SCHEDULED" : st.mode === "full" ? "ON - WEBSITE" : "ON - TRANSLATING";
        $("mtState").style.background = st.mode === "off" ? "" : "var(--bad)";
        $("mtNow").textContent = st.text;
        if (mtFilled || !m) { return; }
        mtFilled = true;
        $("mtMsg").value = m.msg || "";
        $("mtAuto").checked = m.autoPause !== false;
        var mode = m.mode || (m.on ? "full" : "translate");
        var r = document.querySelector('input[name="mtMode"][value="' + (mode === "full" ? "full" : "translate") + '"]');
        if (r) { r.checked = true; }
    }
    function mtSet(on) {
        var mode = (document.querySelector('input[name="mtMode"]:checked') || {}).value || "translate";
        if (on && mode === "full" && !window.confirm("Turn ON maintenance for the WHOLE website? Visitors will see the maintenance page.")) { return; }
        postAction({ action: "maintenance", mode: on ? mode : "off", message: $("mtMsg").value, minutes: Number($("mtMin").value) || 0, delay: Number($("mtDelay").value) || 0, autoPause: $("mtAuto").checked })
            .then(function () {
                var m = { mode: on ? mode : "off", msg: $("mtMsg").value, from: on && Number($("mtDelay").value) ? Date.now() + Number($("mtDelay").value) * 60000 : 0, autoPause: $("mtAuto").checked };
                m.until = on && Number($("mtMin").value) ? (m.from || Date.now()) + Number($("mtMin").value) * 60000 : 0;
                mtFilled = true; renderMaint(m);
                $("mtOut").textContent = on ? "Saved. Maintenance is set." : "Maintenance OFF.";
            })
            .catch(function (e) { $("mtOut").textContent = e.message; window.alert(e.message); });
    }
    $("mtOn").addEventListener("click", function () { mtSet(true); });
    $("mtOff").addEventListener("click", function () { mtSet(false); });
    Array.prototype.forEach.call(document.querySelectorAll(".mtPreset"), function (b) { b.addEventListener("click", function () { $("mtMsg").value = b.getAttribute("data-m"); }); });

    function render(d) {
        renderMaint(d.maintenance);
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
            row.appendChild(el("span", "", "#" + k.n + (k.name ? " " + k.name : "") + (k.premium ? " (Premium)" : "")));
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
            var qk = (d.quota.keys || []).filter(function (x) { return x.n === k.n; })[0] || {};
            tr.appendChild(el("td", "", "#" + k.n + (qk.name ? " " + qk.name : "") + (qk.premium ? " (Premium)" : "")));
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
                    li.appendChild(el("span", "", x.ok ? (x.note && x.note !== "OK" ? x.note + " \u00b7 " : "") + x.ms + " ms" : x.note));
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
        if (name === "health") { loadSubdl(); }
        if (name === "auto") { loadQueue(); loadReady(); runnerStatus(); }
        if (name === "approve") { loadSuggested(); }
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
        var f = $("arFilms");
        if (f) { f.addEventListener("click", function () {
            f.disabled = true; $("arMsg").textContent = "Starting the films run...";
            runnerCall("startfilms").then(function (d) {
                $("arMsg").textContent = d.started ? "Films run started (picks up to 5 random films, then translates them). Watch the Logs tab. It stops by itself after 90 minutes." : (d.error || "Could not start.");
                setTimeout(runnerStatus, 4000);
            }).catch(function () { $("arMsg").textContent = "Could not start."; }).then(function () { f.disabled = false; });
        }); }
        var w = $("arAll");
        if (w) { w.addEventListener("click", function () {
            w.disabled = true; $("arMsg").textContent = "Starting the whole-list run...";
            runnerCall("startall").then(function (d) {
                $("arMsg").textContent = d.started ? "Started: every film and series in the list (films first). It takes about a minute to begin; watch the Logs tab. It stops by itself after 60 minutes." : (d.error || "Could not start.");
                setTimeout(runnerStatus, 4000);
            }).catch(function () { $("arMsg").textContent = "Could not start."; }).then(function () { w.disabled = false; });
        }); }
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
            fetch("/api/stats?autoq=find&kind=" + ($("aqKind") ? $("aqKind").value : "tv") + "&q=" + encodeURIComponent(t), { headers: { "x-admin-key": KEY }, cache: "no-store" })
                .then(function (r) { return r.json(); }).then(function (d) {
                    out.textContent = "";
                    if (d.error) { out.textContent = d.error; return; }
                    var items = d.items || [];
                    if (!items.length) { out.appendChild(el("div", "muted", "Nothing found" + (d.hidden ? " (" + d.hidden + " result(s) had no IMDb id)." : "."))); return; }
                    items.forEach(function (it) {
                        var row = el("div", "row", "");
                        row.style.cssText = "justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                        var left = el("div", "", "");
                        left.style.cssText = "display:flex;gap:10px;align-items:center;min-width:0";
                        if (it.poster) { var im = document.createElement("img"); im.src = it.poster; im.alt = ""; im.width = 40; im.style.borderRadius = "6px"; left.appendChild(im); }
                        var tx = el("div", "", "");
                        tx.appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : "")));
                        tx.appendChild(el("div", "muted", it.type === "movie" ? "Film" : it.total + " episodes · " + it.seasons.length + " season(s)"));
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

    // Discover tab: TMDB lists -> check the Sinhala sites per title -> add the ones nobody has translated to the auto list
    (function () {
        var out = $("dcOut"), load = $("dcLoad"), more = $("dcMore"), addAll = $("dcAddAll"), msg = $("dcMsg"), only = $("dcOnly");
        if (!out || !load) { return; }
        var H = { "x-admin-key": KEY, "Content-Type": "application/json" };
        var page = 0, rows = [], queue = [], running = 0, gen = 0;
        function setTag(r, cls, text) { r.tag.className = "tag"; r.tag.style.cssText = cls; r.tag.textContent = text; }
        function refresh() {
            var shown = 0, free = 0;
            rows.forEach(function (r) {
                var hide = only.checked && r.found === true;
                r.el.hidden = hide;
                if (!hide) { shown++; }
                if (r.found === false && !r.it.inList && !r.added) { free++; }
            });
            $("dcCount").textContent = rows.length ? shown + " / " + rows.length : "";
            addAll.hidden = !free; addAll.textContent = "Add all " + free + " \"no Sinhala sub\" to the list";
        }
        function check(r) {
            var kind = r.it.type === "movie" ? "movie" : "series";
            return fetch("/api/sinhala-search?title=" + encodeURIComponent(r.it.title) + "&year=" + encodeURIComponent(r.it.year || "") + "&type=" + kind + "&_r=" + Date.now(), { headers: { "x-admin-key": KEY }, cache: "no-store" })
                .then(function (x) { return x.ok ? x.json() : null; }).then(function (d) {
                    if (!d) { r.found = null; setTag(r, "", "could not check"); return; }
                    r.found = !!d.found;
                    if (r.found) { setTag(r, "background:#3a2a2a;color:#f0b4b4", "has Sinhala sub (" + ((d.sources || []).map(function (s) { return s.source; }).slice(0, 2).join(", ") || "other site") + ")"); }
                    else { setTag(r, "background:#12361f;color:#7fe6a1", "no Sinhala sub \u2713"); }
                }).catch(function () { r.found = null; setTag(r, "", "could not check"); });
        }
        function pump(g) {
            while (running < 2 && queue.length && g === gen) {
                (function (r) { running++; check(r).then(function () { running--; refresh(); pump(g); }); })(queue.shift());
            }
        }
        function add(r, top) {
            r.btns.forEach(function (b) { b.disabled = true; });
            return fetch("/api/stats?autoq=add", { method: "POST", headers: H, body: JSON.stringify({ items: [r.it], top: top }) }).then(function (x) { return x.json(); }).then(function (d) {
                r.added = !!d.added || true; r.acts.textContent = ""; r.acts.appendChild(el("span", "tag", d.added ? "added" : "already there / list full"));
                refresh(); if (typeof loadQueue === "function") { loadQueue(); }
            }).catch(function () { r.btns.forEach(function (b) { b.disabled = false; }); });
        }
        function addRow(it) {
            var row = el("div", "row", "");
            row.style.cssText = "justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
            var left = el("div", "", ""); left.style.cssText = "display:flex;gap:10px;align-items:center;min-width:0";
            if (it.poster) { var im = document.createElement("img"); im.src = it.poster; im.alt = ""; im.width = 40; im.style.borderRadius = "6px"; left.appendChild(im); }
            var tx = el("div", "", "");
            tx.appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : "") + (it.rating ? "  \u2605 " + it.rating : "")));
            tx.appendChild(el("div", "muted", it.type === "movie" ? "Film" : it.total + " episodes \u00b7 " + it.seasons.length + " season(s)"));
            var tag = el("span", "tag", "checking..."); tag.style.marginTop = "4px"; tag.style.display = "inline-block"; tx.appendChild(tag);
            left.appendChild(tx); row.appendChild(left);
            var acts = el("div", "", ""); acts.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
            var r = { it: it, el: row, tag: tag, acts: acts, found: undefined, btns: [] };
            if (it.inList) { acts.appendChild(el("span", "tag", "already in the list")); }
            else {
                var a1 = el("button", "btn", "Add"), a2 = el("button", "btn ghost", "Add first"); a1.type = a2.type = "button";
                a1.addEventListener("click", function () { add(r, false); }); a2.addEventListener("click", function () { add(r, true); });
                acts.appendChild(a1); acts.appendChild(a2); r.btns = [a1, a2];
            }
            row.appendChild(acts); out.appendChild(row); rows.push(r); queue.push(r);
        }
        function fetchPage(p, fresh) {
            load.disabled = more.disabled = true; msg.textContent = "Loading...";
            if (fresh) { gen++; out.textContent = ""; rows = []; queue = []; running = 0; }
            fetch("/api/stats?autoq=discover&kind=" + $("dcKind").value + "&list=" + $("dcList").value + "&lang=" + $("dcLang").value + "&page=" + p, { headers: H, cache: "no-store" })
                .then(function (r) { return r.json(); }).then(function (d) {
                    if (d.error) { msg.textContent = d.error; return; }
                    page = d.page; (d.items || []).forEach(addRow);
                    msg.textContent = (d.items || []).length ? "Checking the Sinhala sites (a few seconds per title)..." : "Nothing new on this page.";
                    more.hidden = !(page < (d.totalPages || 1)); refresh(); pump(gen);
                }).catch(function () { msg.textContent = "Could not load."; }).then(function () { load.disabled = more.disabled = false; });
        }
        load.addEventListener("click", function () { fetchPage(1, true); });
        more.addEventListener("click", function () { fetchPage(page + 1, false); });
        only.addEventListener("change", refresh);
        addAll.addEventListener("click", function () {
            var todo = rows.filter(function (r) { return r.found === false && !r.it.inList && !r.added; });
            if (!todo.length || !window.confirm("Add " + todo.length + " titles to the end of the auto list?")) { return; }
            addAll.disabled = true;
            fetch("/api/stats?autoq=add", { method: "POST", headers: H, body: JSON.stringify({ items: todo.map(function (r) { return r.it; }).slice(0, 30) }) }).then(function (x) { return x.json(); }).then(function (d) {
                todo.slice(0, 30).forEach(function (r) { r.added = true; r.acts.textContent = ""; r.acts.appendChild(el("span", "tag", "added")); });
                msg.textContent = "Added " + (d.added || 0) + " (list size " + (d.size || "?") + ")."; refresh(); if (typeof loadQueue === "function") { loadQueue(); }
            }).catch(function () { msg.textContent = "Could not add."; }).then(function () { addAll.disabled = false; });
        });
    })();

    // visitor requests (request.html): approve = put on top of the runner list, reject = remove
    var rqN = 0, spN = 0;
    function badge() { var tb = $("tabnApprove"); if (tb) { var n = rqN + spN; tb.textContent = String(n); tb.hidden = !n; } }
    function loadRequests() {
        var box = $("rqList"); if (!box) { return; }
        var H = { "x-admin-key": KEY, "Content-Type": "application/json" };
        fetch("/api/stats?req=list", { headers: H, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            var items = d.items || [];
            box.textContent = "";
            if ($("rqCount")) { $("rqCount").textContent = items.length ? String(items.length) : ""; }
            rqN = items.length; badge();
            if (!items.length) { box.appendChild(el("div", "muted", "No requests.")); return; }
            items.forEach(function (it) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                var left = el("div", "", ""); left.style.cssText = "display:flex;gap:10px;align-items:center;min-width:0";
                if (it.poster) { var im = document.createElement("img"); im.src = it.poster; im.alt = ""; im.width = 40; im.style.borderRadius = "6px"; left.appendChild(im); }
                var tx = el("div", "", "");
                tx.appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : "")));
                tx.appendChild(el("div", "muted", (it.type === "movie" ? "Film" : "TV series") + " · " + it.votes + (it.votes === 1 ? " request" : " requests")));
                left.appendChild(tx); row.appendChild(left);
                var acts = el("div", "", ""); acts.style.cssText = "display:flex;gap:6px";
                var ok = el("button", "btn", "Approve"), no = el("button", "btn ghost", "Reject"); ok.type = no.type = "button";
                function drop() { return fetch("/api/stats?req=drop", { method: "POST", headers: H, body: JSON.stringify({ imdb: it.imdb }) }); }
                no.addEventListener("click", function () { no.disabled = ok.disabled = true; drop().then(loadRequests); });
                ok.addEventListener("click", function () {
                    ok.disabled = no.disabled = true; ok.textContent = "Adding...";
                    fetch("/api/stats?autoq=find&kind=" + it.type + "&q=" + it.imdb, { headers: H, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (f) {
                        var m = (f.items || []).filter(function (x) { return x.imdb === it.imdb; })[0];
                        if (!m) { throw new Error("Not found on TMDB / no episodes"); }
                        if (m.inList) { return drop(); }
                        return fetch("/api/stats?autoq=add", { method: "POST", headers: H, body: JSON.stringify({ items: [m], top: true }) }).then(function (r) { return r.json(); }).then(function (a) {
                            if (!a.added) { throw new Error(a.error || "Not added (list full?)"); }
                            return drop();
                        });
                    }).then(function () { loadRequests(); loadQueue(); }).catch(function (e) { ok.textContent = (e && e.message) || "Failed"; no.disabled = false; });
                });
                acts.appendChild(ok); acts.appendChild(no); row.appendChild(acts); box.appendChild(row);
            });
        }).catch(function () { box.textContent = "Could not load requests."; });
    }
    loadRequests();
    // database backup / restore (api/_backup.js): pages through Redis, saves one JSON file
    (function () {
        var go = $("bkGo"), file = $("bkFile"), msg = $("bkMsg");
        if (!go) { return; }
        var H = { "x-admin-key": KEY, "Content-Type": "application/json" };
        function post(a, body) { return fetch("/api/stats?backup=" + a, { method: "POST", headers: H, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); }); }
        go.addEventListener("click", function () {
            go.disabled = true; msg.textContent = "Listing keys...";
            var keys = [], cur = "0";
            (function page() {
                fetch("/api/stats?backup=keys&cursor=" + cur, { headers: H, cache: "no-store" }).then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); }).then(function (d) {
                    keys = keys.concat(d.keys || []); cur = d.cursor || "0";
                    msg.textContent = "Listing keys... " + keys.length;
                    if (cur !== "0") { return page(); }
                    var items = [], i = 0;
                    (function batch() {
                        if (i >= keys.length) { return finish(items); }
                        post("dump", { keys: keys.slice(i, i + 40) }).then(function (r) { items = items.concat(r.items || []); i += 40; msg.textContent = "Saving... " + Math.min(i, keys.length) + " / " + keys.length; batch(); }).catch(fail);
                    })();
                }).catch(fail);
            })();
            function finish(items) {
                var blob = new Blob([JSON.stringify({ app: "sinsubz", at: new Date().toISOString(), count: items.length, items: items })], { type: "application/json" });
                var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sinsubz-backup-" + new Date().toISOString().slice(0, 10) + ".json";
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
                msg.textContent = "Done. " + items.length + " keys saved."; go.disabled = false;
            }
            function fail(e) { msg.textContent = "Failed: " + ((e && e.message) || "error") + ". Try again."; go.disabled = false; }
        });
        file.addEventListener("change", function () {
            var f = file.files && file.files[0]; file.value = "";
            if (!f) { return; }
            if (window.prompt("This REPLACES the same keys in the live database with the file's copy. Type RESTORE to continue.") !== "RESTORE") { msg.textContent = "Cancelled."; return; }
            (/\.gz$/i.test(f.name) && window.DecompressionStream
                ? new Response(f.stream().pipeThrough(new DecompressionStream("gzip"))).text()
                : f.text()).then(function (t) {
                var d = JSON.parse(t), items = (d && d.items) || [], i = 0, done = 0;
                if (d.app !== "sinsubz" || !items.length) { throw new Error("Not a SinSubz backup"); }
                (function batch() {
                    if (i >= items.length) { msg.textContent = "Restored " + done + " keys."; return; }
                    post("restore", { items: items.slice(i, i + 40) }).then(function (r) { done += r.restored || 0; i += 40; msg.textContent = "Restoring... " + Math.min(i, items.length) + " / " + items.length; batch(); })
                        .catch(function (e) { msg.textContent = "Failed at " + i + ": " + e.message; });
                })();
            }).catch(function (e) { msg.textContent = "Could not read the file: " + e.message; });
        });
    })();
    if ($("tgTest")) {
        $("tgTest").addEventListener("click", function () {
            var m = $("tgMsg"); m.textContent = "Sending...";
            fetch("/api/stats?tg=test", { method: "POST", headers: { "x-admin-key": KEY } }).then(function (r) { return r.json(); })
                .then(function (d) { m.textContent = d.ok ? "Sent. Check your channel." : (d.error || "Failed"); })
                .catch(function () { m.textContent = "Failed"; });
        });
    }

    function loadSubdl() {
        if (!KEY || !($("sdBars") || $("sdBars2"))) { return; }
        fetch("/api/stats?autoq=subdl", { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            [["sdBars", "sdNote"], ["sdBars2", "sdNote2"]].forEach(function (ids) {
                var bars = $(ids[0]), note = $(ids[1]); if (!bars) { return; }
                bars.textContent = "";
                var ks = d.keys || [];
                if (!ks.length) { bars.appendChild(el("div", "muted", "No SubDL key is set.")); return; }
                var left = 0;
                ks.forEach(function (k) {
                    left += Math.max(0, d.limit - k.used);
                    var row = el("div", "b");
                    row.appendChild(el("span", "", "Key #" + k.n));
                    var tr = el("div", "track"), f = el("div", "fill");
                    f.style.width = k.left + "%";
                    tr.appendChild(f); row.appendChild(tr);
                    row.appendChild(el("span", "n", k.limited ? "empty" : (k.used + " / " + d.limit)));
                    bars.appendChild(row);
                });
                var inMs = Math.max(0, d.resetAt - Date.now());
                note.textContent = "About " + left + " downloads left across " + ks.length + " keys. Resets in " + Math.floor(inMs / 3600e3) + " h " + Math.floor(inMs % 3600e3 / 60e3) + " min (05:30 Sri Lanka). Keys 1-" + Math.min(ks.length, ks.filter(function (k) { return k.role === "visitors"; }).length) + " are for visitors, the others for the auto runner. SubDL does not tell us the real number: this counts the downloads this site made (change the limit with SUBDL_DAILY_LIMIT). \"empty\" = SubDL itself said the limit is reached.";
            });
        }).catch(function () { ["sdBars", "sdBars2"].forEach(function (i) { var b = $(i); if (b) { b.textContent = "Could not load."; } }); });
    }

    var aqTab = "w";
    // drag a list row up or down (pointer events: works with a mouse and with a finger); on release the new order is saved
    function aqDrag(ev, handle, row, host) {
        if (ev.button != null && ev.button > 0) { return; }
        ev.preventDefault();
        row.style.opacity = ".55"; row.style.background = "rgba(124,140,255,.14)";
        function visibleRows() { return Array.prototype.filter.call(host.children, function (r) { return r.getAttribute && r.getAttribute("data-imdb") && r.style.display !== "none" && r !== row; }); }
        function move(e) {
            if (e.clientY < 70) { window.scrollBy(0, -14); } else if (e.clientY > window.innerHeight - 70) { window.scrollBy(0, 14); }
            var rows = visibleRows(), target = null;
            for (var i = 0; i < rows.length; i++) { var rc = rows[i].getBoundingClientRect(); if (e.clientY < rc.top + rc.height / 2) { target = rows[i]; break; } }
            if (target) { if (row.nextSibling !== target) { host.insertBefore(row, target); } }
            else if (rows.length) { var last = rows[rows.length - 1]; if (last.nextSibling !== row) { host.insertBefore(row, last.nextSibling); } }
        }
        function up() {
            window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
            row.style.opacity = ""; row.style.background = "";
            var order = Array.prototype.filter.call(host.children, function (r) { return r.getAttribute && r.getAttribute("data-imdb"); }).map(function (r) { return r.getAttribute("data-imdb"); });
            fetch("/api/stats?autoq=reorder", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ order: order }) })
                .then(function () { loadQueue(); }).catch(function () { loadQueue(); });
        }
        // on the window (not the handle): moving the row in the page would drop a capture held by the handle
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    }
    function loadQueue() {
        if (!KEY) { return; }
        loadSubdl();
        fetch("/api/stats?autoq=get", { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            var host = $("aqList"); if (!host) { return; }
            host.textContent = "";
            var list = d.list || [];
            var pending = list.filter(function (x) { return x.todo && x.todo.length; });
            $("aqCount").textContent = pending.length + " working / " + list.length + " total";
            ["aqTabW", "aqTabD"].forEach(function (id) { var t = $(id); if (t && !t.__b) { t.__b = 1; t.addEventListener("click", function () { aqTab = id === "aqTabW" ? "w" : "d"; loadQueue(); }); } });
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
            var isDone = function (x) { return x.total > 0 && x.done >= x.total; };
            var doneList = list.filter(isDone), workList = list.filter(function (x) { return !isDone(x); });
            var tw = $("aqTabW"), td = $("aqTabD");
            if (tw) { tw.textContent = "Working (" + workList.length + ")"; tw.className = aqTab === "w" ? "btn" : "btn ghost"; }
            if (td) { td.textContent = "Done (" + doneList.length + ")"; td.className = aqTab === "d" ? "btn" : "btn ghost"; }
            var shown = aqTab === "d" ? doneList : workList;
            if (aqTab === "d" && doneList.length) {
                var ra = el("button", "btn", "Remove all " + doneList.length + " done");
                ra.type = "button"; ra.style.marginBottom = "6px";
                ra.addEventListener("click", function () {
                    if (!window.confirm("Remove all finished series / films from the list? Their Sinhala subtitles and pages stay.")) { return; }
                    ra.disabled = true;
                    fetch("/api/stats?autoq=dropdone", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: "{}" })
                        .then(function () { loadQueue(); }).catch(function () { ra.disabled = false; });
                });
                host.appendChild(ra);
            }
            if (!shown.length) { host.appendChild(el("div", "muted", aqTab === "d" ? "Nothing finished yet." : "Nothing waiting. The next runner start fills it.")); }
            var AQ_SHOW = 5, aqMore = [];
            shown.forEach(function (it, i) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
                row.setAttribute("data-imdb", it.imdb);
                if (i >= AQ_SHOW) { row.style.display = "none"; aqMore.push(row); }
                if (aqTab === "w") {            // drag handle: move the item up or down (mouse or finger)
                    var hd = el("span", "", "\u2630");
                    hd.title = "Drag up or down to change the order";
                    hd.style.cssText = "cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;padding:6px 8px;font-size:18px;line-height:1;opacity:.75;flex:none";
                    hd.addEventListener("pointerdown", function (ev) { aqDrag(ev, hd, row, host); });
                    row.appendChild(hd);
                }
                var state = aqTab === "d" ? "done" : (it === firstPending ? "NOW" : (it.todo && it.todo.length ? "waiting" : "no subtitle yet"));
                var film = it.type === "movie";
                var txt = el("div", "", "");
                txt.appendChild(el("b", "", (i + 1) + ". " + it.title + (it.year ? " (" + it.year + ")" : "") + " "));
                txt.appendChild(el("span", "tag", film ? "Film" : "Series"));
                txt.appendChild(document.createTextNode(" "));
                txt.appendChild(el("span", "tag", state));
                txt.appendChild(el("div", "muted", (film ? (it.done ? "translated" : "not translated yet") : it.done + " / " + it.total + " episodes") + (it.skipped ? " · " + it.skipped + " waiting for an English subtitle" : "") + " · from " + (it.src || "?")));
                txt.style.flex = "1 1 160px";
                row.appendChild(txt);
                var b = el("button", "btn ghost", "Remove");
                b.type = "button";
                b.addEventListener("click", function () {
                    if (!window.confirm("Remove this from the list?")) { return; }
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
    // ---- translations suggested by visitors: approve = it becomes a Ready entry + its own page ----
    (function () {
        var b = $("spFind"); if (!b) { return; }
        b.addEventListener("click", function () {
            b.disabled = true; $("spFindOut").textContent = "Looking through the visitors' saved translations... (up to 40 seconds)";
            fetch("/api/stats?ready=recover", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: "{}" })
                .then(function (r) { return r.json(); }).then(function (d) {
                    $("spFindOut").textContent = d.error ? d.error : ("Checked " + d.looked + ". Added " + d.added + " to the list" + (d.names && d.names.length ? " (" + d.names.join(", ") + ")" : "") + ". Already there: " + d.exists + ". Not sure about the name: " + d.unsure + ".");
                    loadSuggested();
                }).catch(function () { $("spFindOut").textContent = "Could not finish. Press again."; }).then(function () { b.disabled = false; });
        });
    })();
    // Approve all / Reject all (one by one, so a failure stops at that item and nothing is half-done)
    (function () {
        var ba = $("spApproveAll"), br = $("spRejectAll"), out = $("spBulkOut");
        if (!ba || !br) { return; }
        function setBusy(on) { ba.disabled = br.disabled = on; }
        function pdel(id) { return fetch("/api/stats?ready=pdel", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) }); }
        function approveOne(it) {
            return fetch("/api/stats?ready=pending&id=" + it.id, { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (full) {
                if (!full || !full.srt) { throw new Error((full && full.error) || "Could not read it"); }
                return fetch("/api/stats?ready=put", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({ imdb: full.imdb, title: full.title, year: full.year, poster: full.poster, type: full.type, season: full.s, episode: full.e, srt: full.srt, filename: full.filename }) });
            }).then(function (r) { if (!r.ok) { throw new Error("Could not add it (" + r.status + ")"); } return pdel(it.id); });
        }
        function run(list, fn, verb) {
            setBusy(true);
            var i = 0, ok = 0;
            (function next() {
                if (i >= list.length) { out.textContent = verb + " " + ok + " of " + list.length + "."; setBusy(false); loadSuggested(); loadReady(); return; }
                out.textContent = verb + "... " + (i + 1) + " / " + list.length;
                var it = list[i++];
                fn(it).then(function () { ok++; next(); }).catch(function (e) {
                    out.textContent = "Stopped at " + (it.title || it.id) + ": " + (e && e.message ? e.message : "failed") + ". " + ok + " done.";
                    setBusy(false); loadSuggested(); loadReady();
                });
            })();
        }
        ba.addEventListener("click", function () {
            var items = (window.__spItems || []).filter(function (x) { return !x.unsorted; });      // the ones that still need a category are approved one by one
            if (!items.length) { out.textContent = "Nothing waiting that can be approved in bulk."; return; }
            var unsure = items.filter(function (x) { return x.maybe; });
            if (!window.confirm("Approve all " + items.length + " suggested translations? Each one gets its own film / TV page.")) { return; }
            if (unsure.length && !window.confirm(unsure.length + " of them are NOT SURE (the name did not match exactly).\n\nOK = approve those too\nCancel = approve only the sure ones and leave the " + unsure.length + " for you to check")) {
                items = items.filter(function (x) { return !x.maybe; });
            }
            if (!items.length) { out.textContent = "Nothing to approve."; return; }
            run(items, approveOne, "Approved");
        });
        br.addEventListener("click", function () {
            var items = (window.__spItems || []).slice();
            if (!items.length) { out.textContent = "Nothing waiting."; return; }
            if (!window.confirm("Reject (delete) all " + items.length + " suggested translations? This cannot be undone.")) { return; }
            run(items, function (it) { return pdel(it.id).then(function (r) { if (!r.ok) { throw new Error("Failed (" + r.status + ")"); } }); }, "Rejected");
        });
    })();
    function loadSuggested() {
        var host = $("spList"); if (!host) { return; }
        fetch("/api/stats?ready=pending", { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
            var items = (d && d.items) || [];
            window.__spItems = items;
            host.textContent = "";
            var cnt = $("spCount"); if (cnt) { cnt.textContent = items.length ? String(items.length) : ""; }
            spN = items.length; badge();
            if (!items.length) { host.appendChild(el("p", "muted", "Nothing waiting.")); return; }
            items.forEach(function (it) {
                var row = el("div", "", ""); row.style.cssText = "padding:10px 0;border-top:1px solid var(--line)";
                row.appendChild(el("div", "", "").appendChild(el("b", "", it.title + (it.year ? " (" + it.year + ")" : "") + (it.type === "tv" ? "  S" + it.s + "E" + it.e : ""))).parentNode);
                row.appendChild(el("div", "muted", (it.unsorted ? "no title yet" : it.imdb) + " \u00B7 " + it.lines + " lines \u00B7 by " + it.by + (it.maybe ? " \u00B7 NOT SURE: " + (it.filename || "") : "")));
                if (it.sample) { row.appendChild(el("div", "muted", it.sample)); }
                var chosen = null;
                if (it.unsorted) {
                    // the site could not tell which film this is: pick the category (Movies / TV series) and the title here
                    var tvSel = it.type === "tv";
                    var box = el("div", "", ""); box.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:8px";
                    box.appendChild(el("div", "muted", "Needs a category: " + (it.filename || it.title)));
                    var tabs = el("div", "row", ""); tabs.style.cssText = "gap:8px";
                    var tM = el("button", "ghost", "Movies"), tT = el("button", "ghost", "TV series"); tM.type = tT.type = "button";
                    tabs.appendChild(tM); tabs.appendChild(tT); box.appendChild(tabs);
                    var qrow = el("div", "row", ""); qrow.style.cssText = "gap:8px";
                    var qi = el("input"); qi.type = "search"; qi.value = it.title; qi.style.cssText = "flex:1;min-width:0;padding:9px 11px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit";
                    var go = el("button", "ghost", "Search"); go.type = "button"; qrow.appendChild(qi); qrow.appendChild(go); box.appendChild(qrow);
                    var seRow = el("div", "row", ""); seRow.style.cssText = "gap:8px";
                    var si = el("input"); si.type = "number"; si.placeholder = "Season"; si.value = it.s || ""; var ei = el("input"); ei.type = "number"; ei.placeholder = "Episode"; ei.value = it.e || "";
                    [si, ei].forEach(function (i) { i.style.cssText = "width:110px;padding:9px 11px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit"; seRow.appendChild(i); });
                    box.appendChild(seRow);
                    var res = el("div", "", ""); box.appendChild(res);
                    var picked = el("div", "muted", "Nothing chosen yet."); box.appendChild(picked);
                    function paintTabs() { tM.className = tvSel ? "ghost" : "btn"; tT.className = tvSel ? "btn" : "ghost"; seRow.style.display = tvSel ? "" : "none"; }
                    tM.addEventListener("click", function () { tvSel = false; chosen = null; picked.textContent = "Nothing chosen yet."; paintTabs(); doSearch(); });
                    tT.addEventListener("click", function () { tvSel = true; chosen = null; picked.textContent = "Nothing chosen yet."; paintTabs(); doSearch(); });
                    function doSearch() {
                        var qv = qi.value.trim(); if (qv.length < 2) { return; }
                        res.textContent = "Searching...";
                        fetch("/api/search?query=" + encodeURIComponent(qv)).then(function (r) { return r.json(); }).then(function (d) {
                            res.textContent = "";
                            var rs = ((d && d.results) || []).filter(function (x) { return (x.type === "series") === tvSel; }).slice(0, 6);
                            if (!rs.length) { res.appendChild(el("div", "muted", "Nothing found in " + (tvSel ? "TV series" : "Movies") + ". Try another name.")); return; }
                            rs.forEach(function (x) {
                                var b = el("button", "ghost", x.title + (x.year ? " (" + x.year + ")" : "")); b.type = "button"; b.style.cssText = "display:block;width:100%;text-align:left;margin-top:4px";
                                b.addEventListener("click", function () { chosen = x; picked.textContent = "Chosen: " + x.title + (x.year ? " (" + x.year + ")" : ""); });
                                res.appendChild(b);
                            });
                        }).catch(function () { res.textContent = "Could not search."; });
                    }
                    go.addEventListener("click", doSearch);
                    qi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
                    paintTabs(); doSearch();
                    row.appendChild(box);
                    it.__pick = function () { return chosen ? { imdb: chosen.imdbID, title: chosen.title, year: chosen.year, poster: chosen.poster, type: tvSel ? "tv" : "movie", season: tvSel ? Number(si.value) : 0, episode: tvSel ? Number(ei.value) : 0 } : null; };
                }
                var act = el("div", "row", ""); act.style.cssText = "gap:8px;margin-top:8px";
                var ok = el("button", "btn", "Approve"), no = el("button", "ghost", "Reject");
                ok.type = "button"; no.type = "button";
                no.addEventListener("click", function () {
                    ok.disabled = no.disabled = true;
                    fetch("/api/stats?ready=pdel", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }).then(loadSuggested);
                });
                ok.addEventListener("click", function () {
                    var pk = it.unsorted && it.__pick ? it.__pick() : null;
                    if (it.unsorted && !pk) { window.alert("Pick the film or series first (search, then tap the right title)."); return; }
                    if (pk && pk.type === "tv" && !(pk.season && pk.episode)) { window.alert("Enter the season and episode number."); return; }
                    ok.disabled = no.disabled = true; ok.textContent = "Working...";
                    fetch("/api/stats?ready=pending&id=" + it.id, { headers: { "x-admin-key": KEY }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (full) {
                        if (!full || !full.srt) { throw new Error((full && full.error) || "Could not read it"); }
                        var body = pk ? { imdb: pk.imdb, title: pk.title, year: pk.year, poster: pk.poster, type: pk.type, season: pk.season, episode: pk.episode, srt: full.srt, filename: full.filename }
                            : { imdb: full.imdb, title: full.title, year: full.year, poster: full.poster, type: full.type, season: full.s, episode: full.e, srt: full.srt, filename: full.filename };
                        return fetch("/api/stats?ready=put", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
                    }).then(function (r) { if (!r.ok) { throw new Error("Could not add it (" + r.status + ")"); } return fetch("/api/stats?ready=pdel", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }); })
                        .then(function () { loadSuggested(); loadReady(); })
                        .catch(function (e) { ok.disabled = no.disabled = false; ok.textContent = "Approve"; window.alert(e.message); });
                });
                act.appendChild(ok); act.appendChild(no); row.appendChild(act); host.appendChild(row);
            });
        }).catch(function () { /* ignore */ });
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
        if ($("anWeb").checked) { pf.push("web"); }
        if (!pf.length) { $("anMsg").textContent = "Tick at least one place to show it."; return; }
        if (!window.confirm("Send this announcement to everybody you ticked?")) { return; }
        postAction({ action: "announce", announcement: {
            enabled: true, id: $("anId").value.trim(), title: $("anTitle").value, body: $("anBody").value,
            image: $("anImg").value.trim(), url: $("anUrl").value.trim(), openLabel: $("anOpen").value, laterLabel: $("anLater").value,
            platforms: pf, expires: $("anExp").value
        } }).then(function () { $("anMsg").textContent = "Sent. The website shows it within a few minutes; apps within about 15 minutes (Android) / 6 hours (Windows)."; annFilled = false; load(); })
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
