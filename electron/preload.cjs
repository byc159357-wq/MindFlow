const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("mindflow", {
  platform: process.platform,
  desktop: true,
  widgetInitialState: ipcRenderer.sendSync("mindflow:get-widget-window-state-sync"),
  setTitlebarTheme: (theme) => ipcRenderer.send("mindflow:set-titlebar-theme", theme),
  showNotification: (payload) => ipcRenderer.send("mindflow:show-notification", payload),
  saveFile: (payload) => ipcRenderer.invoke("mindflow:save-file", payload),
  getLoginItemSettings: () => ipcRenderer.invoke("mindflow:get-login-item-settings"),
  setLoginItemSettings: (enabled) => ipcRenderer.invoke("mindflow:set-login-item-settings", enabled),
  showWidget: () => ipcRenderer.send("mindflow:show-widget"),
  hideWidget: () => ipcRenderer.send("mindflow:hide-widget"),
  openMain: (page = "tasks") => ipcRenderer.send("mindflow:open-main", page),
  getWidgetWindowState: () => ipcRenderer.invoke("mindflow:get-widget-window-state"),
  setWidgetCompact: (compact) => ipcRenderer.invoke("mindflow:set-widget-compact", compact),
  setWidgetAlwaysOnTop: (enabled) => ipcRenderer.send("mindflow:set-widget-always-on-top", enabled),
  showWidgetAlert: (payload) => ipcRenderer.send("mindflow:show-widget-alert", payload),
  ackWidgetAlert: (keepOnTop) => ipcRenderer.send("mindflow:ack-widget-alert", keepOnTop),
  broadcastTasksChanged: () => ipcRenderer.send("mindflow:tasks-changed"),
  broadcastSettingsChanged: () => ipcRenderer.send("mindflow:settings-changed"),
  broadcastWidgetSettingsChanged: () => ipcRenderer.send("mindflow:widget-settings-changed"),
  onTasksUpdated: (callback) => subscribe("mindflow:tasks-updated", callback),
  onSettingsUpdated: (callback) => subscribe("mindflow:settings-updated", callback),
  onWidgetSettingsUpdated: (callback) => subscribe("mindflow:widget-settings-updated", callback),
  onWidgetCompactUpdated: (callback) => subscribe("mindflow:widget-compact-updated", callback),
  onNavigate: (callback) => subscribe("mindflow:navigate", callback),
});
