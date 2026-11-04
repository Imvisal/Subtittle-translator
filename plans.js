/* Website only: fills the Free / Premium cards with the real limits and price (GET /api/stats?plan=1),
   and shows "Premium active until ..." for a signed-in Premium account. Written with textContent only. */
(function () {
    "use strict";
    function $(id) { return document.getElementById(id); }
    function token() { return window.__sinsubzIdToken ? window.__sinsubzIdToken().catch(function () { return ""; }) : Promise.resolve(""); }

    function load() {
        token().then(function (tk) {
            var h = tk ? { Authorization: "Bearer " + tk } : {};
            return fetch("/api/stats?plan=1", { headers: h, cache: "no-store" });
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d) { return; }
            if (d.freeMovies != null) { $("planFreeM").textContent = d.freeMovies; $("planFreeE").textContent = d.freeEpisodes; }
            if (d.movies != null) { $("planProM").textContent = d.movies; $("planProE").textContent = d.episodes; }
            if (d.price) { $("planPrice").textContent = d.price; }
            if (d.until && d.until > Date.now()) { document.documentElement.classList.add("is-premium"); }
            if (d.until) {
                var st = $("planState"); st.hidden = false;
                st.textContent = "Active until " + new Date(d.until).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                $("planBtn").textContent = "Extend Premium";
            }
        }).catch(function () { /* the cards keep their default text */ });
    }
    // the sign-in state is restored a moment after the page loads
    setTimeout(load, 1200);
})();
