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
  const cursorPoint = await drawingWin.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.drawing-size input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '14');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const rect = document.querySelector('.drawing-sheet canvas').getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width * .48), y: Math.round(rect.top + rect.height * .46) };
    })()
  `);
  drawingWin.webContents.sendInputEvent({ type: "mouseMove", x: cursorPoint.x, y: cursorPoint.y, movementX: 1, movementY: 1 });
  await wait(120);
  await drawingWin.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(path.join(output, "drawing.png"), (await drawingWin.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output, "drawing-pen-cursor.png"), (await drawingWin.webContents.capturePage()).toPNG());
  await drawingWin.webContents.executeJavaScript(`document.querySelector('.drawing-tool-switch button:nth-child(2)').click()`);
  drawingWin.webContents.sendInputEvent({ type: "mouseMove", x: cursorPoint.x + 80, y: cursorPoint.y + 36, movementX: 80, movementY: 36 });
  await wait(120);
  fs.writeFileSync(path.join(output, "drawing-eraser-cursor.png"), (await drawingWin.webContents.capturePage()).toPNG());
  await drawingWin.webContents.executeJavaScript(`
    (() => {
      const settings = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
      localStorage.setItem('mindflow-settings', JSON.stringify({ ...settings, theme: 'graphite' }));
      location.reload();
    })()
  `);
  await wait(650);
  const darkCursorPoint = await drawingWin.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.drawing-size input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '12');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.drawing-tool-switch button:nth-child(2)').click();
      const rect = document.querySelector('.drawing-sheet canvas').getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width * .54), y: Math.round(rect.top + rect.height * .5) };
    })()
  `);
  await wait(100);
  drawingWin.webContents.sendInputEvent({ type: "mouseMove", x: darkCursorPoint.x, y: darkCursorPoint.y, movementX: 1, movementY: 1 });
  await wait(120);
  await drawingWin.webContents.executeJavaScript(`
    (() => {
      const cursor = document.querySelector('.drawing-brush-cursor');
      const sheet = document.querySelector('.drawing-sheet').getBoundingClientRect();
      cursor.dataset.visible = 'true';
      cursor.style.transform = 'translate3d(' + (${darkCursorPoint.x} - sheet.left) + 'px,' + (${darkCursorPoint.y} - sheet.top) + 'px,0) translate(-50%,-50%)';
    })()
  `);
  const darkCursorDiagnostics = await drawingWin.webContents.executeJavaScript(`
    (() => {
      const cursor = document.querySelector('.drawing-brush-cursor');
      const style = getComputedStyle(cursor);
      return { visible: cursor.dataset.visible, opacity: style.opacity, width: style.width, border: style.borderColor, transform: style.transform };
    })()
  `);
  fs.writeFileSync(path.join(output, "drawing-eraser-cursor-dark.png"), (await drawingWin.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output, "drawing-eraser-cursor-dark-detail.png"), (await drawingWin.webContents.capturePage({ x: darkCursorPoint.x - 80, y: darkCursorPoint.y - 80, width: 160, height: 160 })).toPNG());
  process.stdout.write(`${JSON.stringify({ output, diagnostics, darkCursorDiagnostics }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
