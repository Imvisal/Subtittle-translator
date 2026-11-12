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
        if (name === "auto") { loadQueue(); loadReady(); }
    }
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-go")); });
    });
    try { var savedTab = localStorage.getItem("sinsubz-admin-tab"); if (savedTab) { openTab(savedTab); } } catch (e) { /* ignore */ }


    // ---- backup translator test ----
    (function () {
        var btn = $("mtTest"); if (!btn) { return; }
        btn.addEventListener("click", function () {
            var out = $("mtOut"); out.textContent = "Testing..."; btn.disabled = true;
            fetch("/api/stats?mttest=1", { method: "POST", headers: { "x-admin-key": KEY, "Content-Type": "application/json" }, body: "{}" })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    btn.disabled = false; out.textContent = "";
                    $("mtProv").textContent = d.provider || "";
                    if (d.error) { out.appendChild(el("div", "bad", "Failed: " + d.error)); }
                    else { out.appendChild(el("div", "muted", "Works (" + d.provider + ", " + d.ms + " ms)")); }
                    (d.lines || []).forEach(function (l) {
                        var row = el("div", "", "");
                        row.style.cssText = "padding:6px 0;border-top:1px solid var(--line)";
                        row.appendChild(el("div", "muted", l.en));
                        row.appendChild(el("div", "", l.si));
                        out.appendChild(row);
                    });
                })
                .catch(function (e) { btn.disabled = false; out.textContent = "Error: " + e.message; });
        });
    })();

    // ---- live log tab: refreshes every 10 s while it is open ----
    var logFilter = "all", logTimer = null;
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
            list.forEach(function (it, i) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
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
            items.forEach(function (it) {
                var row = el("div", "row", "");
                row.style.cssText = "justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap";
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
})();
