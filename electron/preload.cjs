const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mindflow", {
  platform: process.platform,
  desktop: true,
  setTitlebarTheme: (theme) => ipcRenderer.send("mindflow:set-titlebar-theme", theme),
});
