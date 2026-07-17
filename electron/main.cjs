const {
  app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, Notification, Menu, screen, shell, Tray,
} = require("electron");
const fs = require("fs");
const path = require("path");

const isSmokeTest = process.env.MINDFLOW_SMOKE_TEST === "1";
const capturePath = process.env.MINDFLOW_CAPTURE_PATH || "";
const capturePage = process.env.MINDFLOW_CAPTURE_PAGE || "notes";
const isHeadlessCheck = isSmokeTest || Boolean(capturePath);
const isWidgetLifecycleSmoke = process.env.MINDFLOW_WIDGET_SMOKE === "1";
const isWidgetStartup = process.argv.includes("--widget");

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let isQuitting = false;
let widgetBoundsTimer = null;

app.setAppUserModelId("com.mindflow.desktop");

if (isHeadlessCheck || isWidgetLifecycleSmoke) {
  app.setPath("userData", path.join(app.getPath("temp"), "mindflow-qa"));
  if (isWidgetLifecycleSmoke) {
    try { fs.rmSync(path.join(app.getPath("userData"), "widget-window.json"), { force: true }); } catch {}
  }
}

const hasSingleInstanceLock = isHeadlessCheck || isWidgetLifecycleSmoke || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const appIconPath = path.join(__dirname, "..", "assets", "mindflow-app-icon.png");
const widgetStatePath = () => path.join(app.getPath("userData"), "widget-window.json");
const normalWidgetSize = { width: 372, height: 570 };
const compactWidgetSize = { width: 236, height: 224 };

const readWidgetState = () => {
  try {
    return { alwaysOnTop: false, compact: false, ...JSON.parse(fs.readFileSync(widgetStatePath(), "utf8")) };
  } catch {
    return { alwaysOnTop: false, compact: false };
  }
};

const writeWidgetState = (patch = {}) => {
  const next = { ...readWidgetState(), ...patch };
  fs.mkdirSync(path.dirname(widgetStatePath()), { recursive: true });
  fs.writeFileSync(widgetStatePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
};

const titlebarThemes = {
  mist: { color: "#f1f3f2", symbolColor: "#4c5553" },
  cream: { color: "#f4f0e6", symbolColor: "#58544a" },
  parchment: { color: "#e3d6b7", symbolColor: "#5c5445" },
  glacier: { color: "#edf1f5", symbolColor: "#4d5c68" },
  sage: { color: "#ebf0ea", symbolColor: "#506056" },
  rose: { color: "#f3edef", symbolColor: "#63535b" },
  midnight: { color: "#15202a", symbolColor: "#bac7d0" },
  graphite: { color: "#1b201f", symbolColor: "#bdc7c4" },
};

const applyTitlebarTheme = (win, requestedTheme = "mist") => {
  if (!win || win.isDestroyed() || win === widgetWindow) return;
  const resolvedTheme = requestedTheme === "system"
    ? (nativeTheme.shouldUseDarkColors ? "graphite" : "mist")
    : requestedTheme;
  const palette = titlebarThemes[resolvedTheme] || titlebarThemes.mist;
  win.__mindflowTheme = requestedTheme;
  win.setBackgroundColor(palette.color);
  if (typeof win.setTitleBarOverlay === "function") {
    win.setTitleBarOverlay({ ...palette, height: 38 });
  }
};

const loadAppPage = (win, hash = "") => {
  if (app.isPackaged || isWidgetLifecycleSmoke) {
    return win.loadFile(path.join(__dirname, "..", "dist", "index.html"), hash ? { hash } : undefined);
  }
  return win.loadURL(`http://127.0.0.1:5173/${hash ? `#${hash}` : ""}`);
};

const attachExternalLinkPolicy = (win) => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
};

function createWindow({ show = true } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (show) {
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: "#f1f3f2",
    icon: appIconPath,
    title: "MindFlow",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#f1f3f2", symbolColor: "#4c5553", height: 38 },
    show: show && !isHeadlessCheck,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  applyTitlebarTheme(win, "mist");
  attachExternalLinkPolicy(win);
  loadAppPage(win, isHeadlessCheck ? capturePage : "");

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isHeadlessCheck) {
    const timeout = setTimeout(() => app.exit(1), 15000);
    win.webContents.once("did-finish-load", async () => {
      const rendered = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const startedAt = Date.now();
          const check = () => {
            if ((document.querySelector('.app-shell') || document.querySelector('.task-widget-shell')) && document.title === 'MindFlow') return resolve(true);
            if (Date.now() - startedAt > 5000) return resolve(false);
            setTimeout(check, 50);
          };
          check();
        })
      `).catch(() => false);
      if (rendered && capturePath) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        await fs.promises.mkdir(path.dirname(capturePath), { recursive: true });
        const image = await win.webContents.capturePage();
        await fs.promises.writeFile(capturePath, image.toPNG());
      }
      clearTimeout(timeout);
      app.exit(rendered ? 0 : 1);
    });
    win.webContents.once("did-fail-load", () => {
      clearTimeout(timeout);
      app.exit(1);
    });
  }
  return win;
}

const preferredWidgetBounds = () => {
  const state = readWidgetState();
  const saved = state.compact ? state.compactBounds : (state.normalBounds || state.bounds);
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
  const { workArea } = screen.getPrimaryDisplay();
  const size = state.compact ? compactWidgetSize : normalWidgetSize;
  return { ...size, x: workArea.x + workArea.width - size.width - 20, y: workArea.y + workArea.height - size.height - 20 };
};

const saveWidgetBoundsSoon = () => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  clearTimeout(widgetBoundsTimer);
  widgetBoundsTimer = setTimeout(() => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const bounds = widgetWindow.getBounds();
    writeWidgetState(widgetWindow.__mindflowCompact ? { compactBounds: bounds } : { normalBounds: bounds, bounds });
  }, 250);
};

const clampWidgetBounds = (bounds) => {
  const { workArea } = screen.getDisplayMatching(bounds);
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - bounds.height),
  };
};

const setWidgetCompact = (compact) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return { compact: Boolean(compact) };
  const nextCompact = Boolean(compact);
  const current = widgetWindow.getBounds();
  const state = readWidgetState();
  let target;
  if (nextCompact) {
    const normalBounds = widgetWindow.__mindflowCompact ? state.normalBounds : current;
    target = clampWidgetBounds({
      ...compactWidgetSize,
      x: current.x + current.width - compactWidgetSize.width,
      y: current.y,
    });
    widgetWindow.setMinimumSize(compactWidgetSize.width, compactWidgetSize.height);
    widgetWindow.setMaximumSize(compactWidgetSize.width, compactWidgetSize.height);
    widgetWindow.setResizable(false);
    widgetWindow.setBounds(target, true);
    writeWidgetState({ compact: true, normalBounds, compactBounds: target });
  } else {
    const normalBounds = state.normalBounds || { ...normalWidgetSize, x: current.x, y: current.y };
    target = clampWidgetBounds({
      width: Math.max(332, Math.min(460, normalBounds.width || normalWidgetSize.width)),
      height: Math.max(430, Math.min(760, normalBounds.height || normalWidgetSize.height)),
      x: current.x + current.width - (normalBounds.width || normalWidgetSize.width),
      y: current.y,
    });
    widgetWindow.setResizable(true);
    widgetWindow.setMaximumSize(460, 760);
    widgetWindow.setMinimumSize(332, 430);
    widgetWindow.setBounds(target, true);
    writeWidgetState({ compact: false, normalBounds: target, bounds: target });
  }
  widgetWindow.__mindflowCompact = nextCompact;
  widgetWindow.webContents.send("mindflow:widget-compact-updated", nextCompact);
  return { compact: nextCompact, bounds: target };
};

const createTray = () => {
  if (tray || isHeadlessCheck || isWidgetLifecycleSmoke) return;
  const icon = nativeImage.createFromPath(appIconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("MindFlow 任务挂件");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示任务挂件", click: () => showWidget() },
    { label: "打开 MindFlow", click: () => openMainWindow("tasks") },
    { type: "separator" },
    { label: "退出 MindFlow", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", () => showWidget());
};

function createWidgetWindow({ show = true } = {}) {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (show) showWidget();
    return widgetWindow;
  }

  const state = readWidgetState();
  const bounds = preferredWidgetBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: state.compact ? compactWidgetSize.width : 332,
    minHeight: state.compact ? compactWidgetSize.height : 430,
    maxWidth: state.compact ? compactWidgetSize.width : 460,
    maxHeight: state.compact ? compactWidgetSize.height : 760,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: !state.compact,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    hasShadow: false,
    alwaysOnTop: Boolean(state.alwaysOnTop),
    skipTaskbar: true,
    show: false,
    icon: appIconPath,
    title: "MindFlow 任务挂件",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widgetWindow = win;
  win.__mindflowKeepOnTop = Boolean(state.alwaysOnTop);
  win.__mindflowCompact = Boolean(state.compact);
  if (typeof win.setHasShadow === "function") win.setHasShadow(false);
  attachExternalLinkPolicy(win);
  createTray();
  loadAppPage(win, "widget");

  if (isWidgetLifecycleSmoke) {
    const timeout = setTimeout(() => app.exit(1), 15000);
    win.webContents.once("did-finish-load", async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const renderer = await win.webContents.executeJavaScript(`({
        widget: Boolean(document.querySelector('.task-widget-shell')),
        mainChromeAbsent: !document.querySelector('.desktop-titlebar') && !document.querySelector('.app-sidebar'),
        desktopBridge: Boolean(window.mindflow?.desktop),
        taskSyncBridge: typeof window.mindflow?.broadcastTasksChanged === 'function',
        widgetBridge: typeof window.mindflow?.showWidget === 'function' && typeof window.mindflow?.hideWidget === 'function',
        startupBridge: typeof window.mindflow?.getLoginItemSettings === 'function' && typeof window.mindflow?.setLoginItemSettings === 'function'
      })`).catch(() => ({}));
      const normalBounds = win.getBounds();
      const compactRenderer = await win.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('[aria-label="收起任务挂件"]')?.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            compactClass: document.querySelector('.task-widget-shell')?.classList.contains('compact'),
            tomorrowHidden: getComputedStyle(document.querySelector('.widget-tomorrow-section')).display === 'none',
            actionCount: document.querySelectorAll('.task-widget-actions button').length
          };
        })()
      `).catch(() => ({}));
      const compactBounds = win.getBounds();
      await win.webContents.executeJavaScript(`document.querySelector('[aria-label="展开任务挂件"]')?.click()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const restoredBounds = win.getBounds();
      const result = {
        passed: Boolean(renderer.widget && renderer.mainChromeAbsent && renderer.desktopBridge && renderer.taskSyncBridge && renderer.widgetBridge && renderer.startupBridge),
        renderer,
        compactRenderer,
        backgroundThrottling: !win.webContents.getBackgroundThrottling(),
        normalBounds,
        compactBounds,
        restoredBounds,
      };
      const compactRatio = (compactBounds.width * compactBounds.height) / (normalBounds.width * normalBounds.height);
      result.passed = result.passed
        && result.backgroundThrottling
        && normalBounds.width >= 332
        && normalBounds.height >= 430
        && compactRenderer.compactClass
        && compactRenderer.tomorrowHidden
        && compactRenderer.actionCount === 2
        && Math.abs(compactBounds.width - compactWidgetSize.width) <= 1
        && Math.abs(compactBounds.height - compactWidgetSize.height) <= 1
        && compactRatio >= .2
        && compactRatio <= .3
        && Math.abs(restoredBounds.width - normalBounds.width) <= 2
        && Math.abs(restoredBounds.height - normalBounds.height) <= 2;
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      clearTimeout(timeout);
      app.exit(result.passed ? 0 : 1);
    });
  }

  win.once("ready-to-show", () => {
    if (show) win.show();
  });
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on("move", saveWidgetBoundsSoon);
  win.on("resize", saveWidgetBoundsSoon);
  win.on("closed", () => {
    if (widgetWindow === win) widgetWindow = null;
  });
  return win;
}

function showWidget() {
  const win = createWidgetWindow({ show: false });
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openMainWindow(hash = "") {
  const existed = Boolean(mainWindow && !mainWindow.isDestroyed());
  const win = createWindow({ show: true });
  if (hash) {
    const navigate = () => win.webContents.send("mindflow:navigate", hash);
    if (!existed || win.webContents.isLoadingMainFrame()) win.webContents.once("did-finish-load", navigate);
    else navigate();
  }
  return win;
}

const loginItemOptions = (openAtLogin) => ({
  openAtLogin,
  path: process.execPath,
  args: app.isPackaged ? ["--widget"] : [app.getAppPath(), "--widget"],
});

const broadcastToOtherWindows = (sender, channel, payload) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed() && win.webContents !== sender) win.webContents.send(channel, payload);
  });
};

ipcMain.on("mindflow:set-titlebar-theme", (event, requestedTheme) => {
  applyTitlebarTheme(BrowserWindow.fromWebContents(event.sender), requestedTheme);
});

ipcMain.on("mindflow:show-notification", (event, payload = {}) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: String(payload.title || "MindFlow 提醒"),
    body: String(payload.body || "你有一项待处理内容"),
    icon: appIconPath,
    silent: false,
  });
  notification.on("click", () => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === widgetWindow) showWidget();
    else openMainWindow("tasks");
  });
  notification.show();
});

ipcMain.handle("mindflow:save-file", async (event, payload = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const safeName = String(payload.defaultName || "MindFlow-export").replace(/[\\/:*?"<>|]/g, "-");
  const result = await dialog.showSaveDialog(win, {
    title: "另存为",
    defaultPath: path.join(app.getPath("documents"), safeName),
    filters: Array.isArray(payload.filters) ? payload.filters : [{ name: "所有文件", extensions: ["*"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) return { saved: false, canceled: true };
  const bytes = payload.data instanceof Uint8Array ? payload.data : new Uint8Array(payload.data || []);
  await fs.promises.writeFile(result.filePath, Buffer.from(bytes));
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle("mindflow:get-login-item-settings", () => {
  const settings = app.getLoginItemSettings(loginItemOptions(true));
  return { openAtLogin: Boolean(settings.openAtLogin), wasOpenedAtLogin: Boolean(settings.wasOpenedAtLogin) };
});

ipcMain.handle("mindflow:set-login-item-settings", (_event, enabled) => {
  app.setLoginItemSettings(loginItemOptions(Boolean(enabled)));
  return { openAtLogin: Boolean(app.getLoginItemSettings(loginItemOptions(true)).openAtLogin) };
});

ipcMain.on("mindflow:show-widget", () => showWidget());
ipcMain.on("mindflow:hide-widget", () => widgetWindow?.hide());
ipcMain.on("mindflow:open-main", (_event, page = "tasks") => openMainWindow(String(page || "tasks")));
ipcMain.on("mindflow:get-widget-window-state-sync", (event) => {
  event.returnValue = { compact: Boolean(readWidgetState().compact) };
});
ipcMain.handle("mindflow:get-widget-window-state", () => ({ compact: Boolean(readWidgetState().compact) }));
ipcMain.handle("mindflow:set-widget-compact", (_event, compact) => setWidgetCompact(compact));
ipcMain.on("mindflow:set-widget-always-on-top", (_event, enabled) => {
  const keepOnTop = Boolean(enabled);
  writeWidgetState({ alwaysOnTop: keepOnTop });
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.__mindflowKeepOnTop = keepOnTop;
  widgetWindow.setAlwaysOnTop(keepOnTop, "floating");
});
ipcMain.on("mindflow:show-widget-alert", () => {
  const win = createWidgetWindow({ show: false });
  win.setAlwaysOnTop(true, "screen-saver");
  win.show();
  win.focus();
  win.flashFrame(true);
});
ipcMain.on("mindflow:ack-widget-alert", (_event, keepOnTop) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.flashFrame(false);
  const shouldStayOnTop = Boolean(keepOnTop ?? widgetWindow.__mindflowKeepOnTop);
  widgetWindow.setAlwaysOnTop(shouldStayOnTop, shouldStayOnTop ? "floating" : "normal");
});
ipcMain.on("mindflow:tasks-changed", (event) => broadcastToOtherWindows(event.sender, "mindflow:tasks-updated"));
ipcMain.on("mindflow:settings-changed", (event) => broadcastToOtherWindows(event.sender, "mindflow:settings-updated"));
ipcMain.on("mindflow:widget-settings-changed", (event) => broadcastToOtherWindows(event.sender, "mindflow:widget-settings-updated"));

nativeTheme.on("updated", () => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.__mindflowTheme === "system") applyTitlebarTheme(win, "system");
  });
});

app.whenReady().then(() => {
  if (isHeadlessCheck) createWindow();
  else if (isWidgetLifecycleSmoke) createWidgetWindow({ show: false });
  else if (isWidgetStartup) createWidgetWindow({ show: true });
  else createWindow({ show: true });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) openMainWindow();
    else if (widgetWindow && !widgetWindow.isDestroyed()) showWidget();
    else createWindow({ show: true });
  });
});

app.on("second-instance", (_event, commandLine) => {
  if (commandLine.includes("--widget")) showWidget();
  else openMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (isHeadlessCheck || (!widgetWindow && process.platform !== "darwin")) app.quit();
});
