"use strict";

/*
========================================================
SUBLANKA AI — ui.js
Presentation-only behaviour: theme toggle, scroll effects,
reveal animations, hero subtitle demo, ripples, drag & drop.

This file never calls any API and never touches the
translation logic in script.js. It only reads/dispatches the
same DOM events a user would (e.g. the file input's
"change" event).
========================================================
*/

(function () {

    const root = document.documentElement;

    root.classList.remove("no-js");

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;


    // ====================================================
    // THEME TOGGLE
    // ====================================================

    const themeToggle = document.getElementById("themeToggle");
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    function applyTheme(theme) {

        root.setAttribute("data-theme", theme);

        if (themeMeta) {
            themeMeta.setAttribute(
                "content",
                theme === "light" ? "#f7f3ec" : "#07080d"
            );
        }

    }

    applyTheme(root.getAttribute("data-theme") || "dark");

    if (themeToggle) {

        themeToggle.addEventListener("click", function () {

            const next =
                root.getAttribute("data-theme") === "light"
                    ? "dark"
                    : "light";

            applyTheme(next);

            try {
                localStorage.setItem("sublanka-theme", next);
            } catch (e) {
                /* storage can be unavailable (private mode) */
            }

        });

    }


    // ====================================================
    // SETTINGS BUTTON → translation settings
    // ====================================================

    const settingsButton = document.querySelector(".settings-button");

    if (settingsButton) {

        settingsButton.addEventListener("click", function () {

            const target = document.querySelector(".settings-section");

            if (target) {
                target.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "center"
                });
            }

        });

    }


    // ====================================================
    // HEADER, SCROLL PROGRESS, BACK-TO-TOP
    // ====================================================

    const header = document.getElementById("topHeader");
    const progress = document.getElementById("scrollProgress");
    const toTop = document.getElementById("toTop");

    let ticking = false;

    function onScroll() {

        const y = window.scrollY || window.pageYOffset;
        const max =
            document.documentElement.scrollHeight - window.innerHeight;

        if (header) {
            header.classList.toggle("scrolled", y > 20);
        }

        if (progress) {
            progress.style.transform =
                "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
        }

        if (toTop) {
            toTop.classList.toggle("show", y > 700);
        }

        ticking = false;

    }

    window.addEventListener("scroll", function () {

        if (!ticking) {
            ticking = true;
            window.requestAnimationFrame(onScroll);
        }

    }, { passive: true });

    onScroll();

    if (toTop) {

        toTop.addEventListener("click", function () {
            window.scrollTo({
                top: 0,
                behavior: reduceMotion ? "auto" : "smooth"
            });
        });

    }


    // ====================================================
    // SCROLL REVEAL
    // ====================================================

    const revealItems = document.querySelectorAll(".reveal");

    if ("IntersectionObserver" in window && !reduceMotion) {

        const observer = new IntersectionObserver(
            function (entries) {

                entries.forEach(function (entry) {

                    if (entry.isIntersecting) {
                        entry.target.classList.add("in");
                        observer.unobserve(entry.target);
                    }

                });

            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -40px 0px"
            }
        );

        revealItems.forEach(function (item) {
            observer.observe(item);
        });

    } else {

        revealItems.forEach(function (item) {
            item.classList.add("in");
        });

    }


    // ====================================================
    // HERO — ANIMATED SUBTITLE DEMO
    // ====================================================

    const stageSubs = document.getElementById("stageSubs");

    if (stageSubs) {

        const lines = [
            ["Hello, how are you?",
                "හෙලෝ, ඔයාට කොහොමද?"],
            ["We have to leave now.",
                "අපි දැන්ම යන්න ඕනේ."],
            ["I will always find you.",
                "මම ඔයාව හැමවිටම හොයාගන්නවා."],
            ["This is only the beginning.",
                "මේක ආරම්භය විතරයි."]
        ];

        let index = 0;

        function showLine() {

            const pair = lines[index % lines.length];

            stageSubs.textContent = "";

            const en = document.createElement("span");
            en.className = "stage-line en is-in";
            en.textContent = pair[0];

            const si = document.createElement("span");
            si.className = "stage-line si is-in";
            si.textContent = pair[1];
            si.style.animationDelay = "0.55s";

            stageSubs.appendChild(en);
            stageSubs.appendChild(si);

            // fade out shortly before the next pair
            setTimeout(function () {

                en.classList.remove("is-in");
                si.classList.remove("is-in");
                en.style.animationDelay = "0s";
                si.style.animationDelay = "0s";
                en.classList.add("is-out");
                si.classList.add("is-out");

            }, 2600);

            index++;

        }

        showLine();
        setInterval(showLine, 3000);

    }


    // ====================================================
    // BUTTON RIPPLE
    // ====================================================

    document.addEventListener("pointerdown", function (event) {

        const button = event.target.closest(
            ".btn, #searchBtn, #translateBtn, #downloadBtn, " +
            ".upload-btn, .select-title-btn, .category-select-btn, " +
            ".subtitle-select-btn"
        );

        if (!button || button.disabled || reduceMotion) {
            return;
        }

        if (getComputedStyle(button).position === "static") {
            button.style.position = "relative";
        }

        button.style.overflow = "hidden";

        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);

        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
        ripple.style.top = (event.clientY - rect.top - size / 2) + "px";

        button.appendChild(ripple);

        setTimeout(function () {
            ripple.remove();
        }, 700);

    });


    // ====================================================
    // FEATURE CARDS → jump to the matching section
    // ====================================================

    const featureCards = document.querySelectorAll(".quick-action-card");

    featureCards.forEach(function (card, i) {

        card.style.cursor = "pointer";

        card.addEventListener("click", function () {

            const target = document.getElementById(
                i === 0 ? "search" : "upload"
            );

            if (target) {
                target.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start"
                });
            }

            if (i === 0) {
                const input = document.getElementById("searchInput");
                if (input) {
                    setTimeout(function () {
                        input.focus({ preventScroll: true });
                    }, 500);
                }
            }

        });

    });


    // ====================================================
    // DRAG & DROP SRT FILES
    // Hands the file to script.js through the same
    // "change" event the file picker fires.
    // ====================================================

    const dropZone = document.getElementById("upload");
    const fileInput = document.getElementById("subtitleFile");

    if (dropZone && fileInput) {

        ["dragenter", "dragover"].forEach(function (name) {

            dropZone.addEventListener(name, function (event) {
                event.preventDefault();
                dropZone.classList.add("drag-over");
            });

        });

        ["dragleave", "drop"].forEach(function (name) {

            dropZone.addEventListener(name, function (event) {
                event.preventDefault();
                dropZone.classList.remove("drag-over");
            });

        });

        dropZone.addEventListener("drop", function (event) {

            const files = event.dataTransfer && event.dataTransfer.files;

            if (!files || !files.length) {
                return;
            }

            try {

                const transfer = new DataTransfer();
                transfer.items.add(files[0]);

                fileInput.files = transfer.files;

                fileInput.dispatchEvent(
                    new Event("change", { bubbles: true })
                );

            } catch (error) {
                /* very old browsers: fall back to the file picker */
                console.warn("Drag & drop not supported:", error);
            }

        });

    }

})();
