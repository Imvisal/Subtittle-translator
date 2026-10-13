const { app, BrowserWindow, ipcMain, shell, Menu, Notification, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// The desktop app has no server of its own: /api/... calls go to the deployed site.
const API_ORIGIN = "https://subtittle-translator.vercel.app";

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

let win;
let tray = null;
let quitting = false;
let trayHintShown = false;

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: "#07080d",
        title: "SinSubz",
        icon: path.join(__dirname, "app", "logo.png"),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false   // keep release checks running while hidden in the tray
        }
    });

    Menu.setApplicationMenu(null);
    win.loadFile(path.join(__dirname, "app", "index.html"));

    // Closing the window keeps the app in the system tray so new-release
    // notifications keep arriving. Use the tray menu -> Quit to exit.
    win.on("close", (event) => {
        if (quitting) return;
        event.preventDefault();
        win.hide();
        if (!trayHintShown) {
            trayHintShown = true;
            toast(
                "SinSubz is still running",
                "It stays in the system tray to tell you about new movies and Sinhala subtitles. Right-click the tray icon to quit.",
                true
            );
        }
    });

    // external links open in the normal browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith("file://")) {
            event.preventDefault();
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        }
    });
}

// Network calls run here (not in the page) so there are no CORS problems.
ipcMain.handle("api-fetch", async (_event, url, init) => {
    const allowed =
        typeof url === "string" &&
        (url.startsWith(API_ORIGIN + "/api/") || url.startsWith(API_ORIGIN + "/version.json"));
    if (!allowed) {
        throw new Error("Blocked request");
    }
    const opts = {
        method: (init && init.method) || "GET",
        headers: (init && init.headers) || {}
    };
    if (init && typeof init.body === "string") opts.body = init.body;

    const res = await fetch(url, opts);
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get("content-type") || "",
        body: buf
    };
});

// Translation notifications + taskbar progress
function toast(title, body, silent, onClick) {
    if (!Notification.isSupported()) return;
    const n = new Notification({
        title,
        body,
        silent: !!silent,
        icon: path.join(__dirname, "app", "logo.png")
    });
    n.on("click", () => {
        if (onClick) {
            onClick();
            return;
        }
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    });
    n.show();
}

let startedToast = false;

// Save the translated / synced .srt into Downloads\SinSubz\
ipcMain.handle("save-file", async (_event, text, filename) => {
    if (typeof text !== "string" || typeof filename !== "string") {
        throw new Error("Invalid file");
    }

    const safeName =
        path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "subtitle.srt";

    const dir = path.join(app.getPath("downloads"), "SinSubz");
    fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    let file = path.join(dir, safeName);
    for (let n = 1; fs.existsSync(file); n++) {
        file = path.join(dir, base + " (" + n + ")" + ext);
    }

    // UTF-8 BOM so Sinhala opens correctly in every player
    fs.writeFileSync(file, "\uFEFF" + text, "utf8");

    toast("Subtitle saved to Downloads", file, false, () => shell.showItemInFolder(file));
    return { path: file };
});

// Only the update download links are allowed to open in the browser
ipcMain.on("open-external", (_event, url) => {
    if (typeof url === "string" && /^https:\/\/(github\.com|subtittle-translator\.vercel\.app)\//i.test(url)) {
        shell.openExternal(url);
    }
});

ipcMain.on("notify", (_event, msg) => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "update" || msg.type === "toast") {
        toast(String(msg.title || "Update available"), String(msg.body || ""), false);
        return;
    }

    if (msg.type === "progress") {
        const pct = Math.max(0, Math.min(100, Number(msg.percent) || 0));
        if (win) win.setProgressBar(pct / 100);
        if (!startedToast) {
            startedToast = true;
            toast("Translating subtitle...", "SinSubz is translating " + msg.total + " lines. We'll tell you when it's done.", true);
        }
        if (win) win.setTitle("SinSubz - Translating " + pct + "%");
    }

    if (msg.type === "done" || msg.type === "failed") {
        startedToast = false;
        if (win) {
            win.setProgressBar(-1);
            win.setTitle("SinSubz");
            if (!win.isFocused()) win.flashFrame(true);
        }
        if (msg.type === "done") {
            toast("Translation finished \u2713", msg.count + " subtitles translated to Sinhala. Your file is ready.", false);
        } else {
            toast("Translation failed", String(msg.message || "Something went wrong. Please try again."), false);
        }
    }
});

app.setAppUserModelId("com.visal.sinsubz.desktop");

function showWindow() {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function createTray() {
    const icon = nativeImage
        .createFromPath(path.join(__dirname, "app", "logo.png"))
        .resize({ width: 24, height: 24 });

    tray = new Tray(icon);
    tray.setToolTip("SinSubz");

    const menu = () => Menu.buildFromTemplate([
        { label: "Open SinSubz", click: showWindow },
        {
            label: "Start with Windows",
            type: "checkbox",
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
        },
        { type: "separator" },
        { label: "Quit", click: () => { quitting = true; app.quit(); } }
    ]);

    tray.setContextMenu(menu());
    tray.on("click", showWindow);
    tray.on("right-click", () => tray.setContextMenu(menu()));
}

app.on("before-quit", () => { quitting = true; });

app.whenReady().then(() => {
    createWindow();
    createTray();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("second-instance", showWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
