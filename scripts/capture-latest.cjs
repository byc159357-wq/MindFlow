const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-latest-capture-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "artifacts", "latest");
  fs.mkdirSync(output, { recursive: true });
  let win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(650);
  await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      document.querySelector('.editor-more-wrap .icon-button').click();
      await wait(100);
      [...document.querySelectorAll('.editor-more-menu button')].find((button) => button.textContent.includes('另存为')).click();
    })()
  `);
  await wait(300);
  await win.webContents.executeJavaScript(`
    (() => {
      document.querySelector('.save-as-backdrop').style.animation = 'none';
      document.querySelector('.save-as-dialog').style.animation = 'none';
    })()
  `);
  const diagnostics = await win.webContents.executeJavaScript(`
    (() => {
      const backdrop = document.querySelector('.save-as-backdrop');
      const dialog = document.querySelector('.save-as-dialog');
      const backdropStyle = getComputedStyle(backdrop);
      const dialogStyle = getComputedStyle(dialog);
      return { backdrop: { opacity: backdropStyle.opacity, background: backdropStyle.backgroundColor, zIndex: backdropStyle.zIndex }, dialog: { opacity: dialogStyle.opacity, color: dialogStyle.color, background: dialogStyle.backgroundColor, rect: dialog.getBoundingClientRect().toJSON() } };
    })()
  `);
  await win.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(path.join(output, "notes-save-as.png"), (await win.webContents.capturePage()).toPNG());
  const drawingWin = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  await drawingWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "drawing" });
  await wait(650);
  await drawingWin.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(path.join(output, "drawing.png"), (await drawingWin.webContents.capturePage()).toPNG());
  process.stdout.write(`${JSON.stringify({ output, diagnostics }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
