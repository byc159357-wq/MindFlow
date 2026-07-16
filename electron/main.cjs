const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const isSmokeTest = process.env.MINDFLOW_SMOKE_TEST === "1";
const capturePath = process.env.MINDFLOW_CAPTURE_PATH || "";
const capturePage = process.env.MINDFLOW_CAPTURE_PAGE || "notes";
const isHeadlessCheck = isSmokeTest || Boolean(capturePath);

app.setAppUserModelId("com.mindflow.desktop");

if (isHeadlessCheck) {
  app.setPath("userData", path.join(app.getPath("temp"), "mindflow-qa"));
}

const hasSingleInstanceLock = isHeadlessCheck || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

const titlebarThemes = {
  mist: { color: "#f1f3f2", symbolColor: "#4c5553" },
  salt: { color: "#edf2f5", symbolColor: "#53636b" },
  graphite: { color: "#1b201f", symbolColor: "#bdc7c4" },
};

const applyTitlebarTheme = (win, requestedTheme = "mist") => {
  if (!win || win.isDestroyed()) return;
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

ipcMain.on("mindflow:set-titlebar-theme", (event, requestedTheme) => {
  applyTitlebarTheme(BrowserWindow.fromWebContents(event.sender), requestedTheme);
});

nativeTheme.on("updated", () => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.__mindflowTheme === "system") applyTitlebarTheme(win, "system");
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: "#f1f3f2",
    icon: path.join(__dirname, "..", "assets", "mindflow-app-icon.png"),
    title: "MindFlow",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f1f3f2",
      symbolColor: "#4c5553",
      height: 38,
    },
    show: !isHeadlessCheck,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyTitlebarTheme(win, "mist");

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) {
    if (isHeadlessCheck) {
      win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: capturePage });
    } else {
      win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }
  } else {
    win.loadURL(`http://127.0.0.1:5173/${isHeadlessCheck ? `#${capturePage}` : ""}`);
  }

  if (isHeadlessCheck) {
    const timeout = setTimeout(() => app.exit(1), 15000);
    win.webContents.once("did-finish-load", async () => {
      const rendered = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const startedAt = Date.now();
          const check = () => {
            if (document.querySelector(".app-shell") && document.title === "MindFlow") return resolve(true);
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
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
