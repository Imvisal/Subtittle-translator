const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
    fetch: (url, init) => ipcRenderer.invoke("api-fetch", url, init),
    notify: (msg) => ipcRenderer.send("notify", msg),
    saveFile: (text, filename) => ipcRenderer.invoke("save-file", text, filename),
    openExternal: (url) => ipcRenderer.send("open-external", url),
    pickVideo: () => ipcRenderer.invoke("pick-video"),
    pickSubtitle: () => ipcRenderer.invoke("pick-subtitle"),
    saveSubNextToVideo: (text) => ipcRenderer.invoke("save-sub-next-to-video", text),
    exportVideo: (opts) => ipcRenderer.invoke("export-video", opts),
    cancelExport: () => ipcRenderer.send("export-cancel"),
    showInFolder: (p) => ipcRenderer.send("show-in-folder", p),
    onExportProgress: (cb) => {
        ipcRenderer.removeAllListeners("export-progress");
        ipcRenderer.on("export-progress", (_e, p) => cb(p));
    }
});
