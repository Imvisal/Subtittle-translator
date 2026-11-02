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
            body.appendChild(tr);
        });
        $("usersNote").textContent = !DATA.users.length
            ? "No signed-in accounts recorded yet. They appear here after someone signs in with Google on the website."
            : (list.length + " shown" + (DATA.totals.users > DATA.usersShown ? " (newest " + DATA.usersShown + " of " + fmt(DATA.totals.users) + ")" : ""));
    }

    function render(d) {
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

        $("usersTitle").textContent = "Signed-in Google accounts (" + fmt(t.users) + ")";
        renderUsers();
    }

    function renderDownloads(d) {
        var ul = $("downloads"); ul.textContent = "";
        if (!d || !d.enabled) { ul.appendChild(el("li", "empty", "Not available right now.")); return; }
        [["Android", d.android], ["Windows (installer + portable)", d.windowsTotal], ["  installer", d.windows], ["  portable", d.portable]].forEach(function (x) {
            var li = el("li"); li.appendChild(el("span", "", x[0])); li.appendChild(el("span", "", fmt(x[1]))); ul.appendChild(li);
        });
    }

    function show(on) {
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
    $("logout").addEventListener("click", function () {
        KEY = ""; DATA = null;
        try { sessionStorage.removeItem(KEYNAME); } catch (e) { /* ignore */ }
        show(false);
        $("sub").textContent = "Locked.";
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
