const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-drawing-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const drawLine = async (win, from, to) => {
  win.webContents.sendInputEvent({ type: "mouseDown", x: from.x, y: from.y, button: "left", clickCount: 1 });
  for (let index = 1; index <= 24; index += 1) {
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(from.x + ((to.x - from.x) * index) / 24),
      y: Math.round(from.y + ((to.y - from.y) * index) / 24),
      button: "left",
      movementX: (to.x - from.x) / 24,
      movementY: (to.y - from.y) / 24,
    });
    await wait(7);
  }
  win.webContents.sendInputEvent({ type: "mouseUp", x: to.x, y: to.y, button: "left", clickCount: 1 });
  await wait(280);
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "drawing" });
  await wait(700);

  const initial = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('.drawing-sheet canvas');
      const rect = canvas.getBoundingClientRect();
      const nav = [...document.querySelectorAll('.app-sidebar nav button')].map((button) => button.title);
      return {
        hasPage: Boolean(document.querySelector('.drawing-page')),
        nav,
        from: { x: Math.round(rect.left + rect.width * .25), y: Math.round(rect.top + rect.height * .35) },
        to: { x: Math.round(rect.left + rect.width * .67), y: Math.round(rect.top + rect.height * .62) },
      };
    })()
  `);

  await drawLine(win, initial.from, initial.to);
  const pen = await win.webContents.executeJavaScript(`
    (() => {
      const strokes = JSON.parse(localStorage.getItem('mindflow-drawing-v1') || '[]');
      const canvas = document.querySelector('.drawing-sheet canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) visiblePixels += 1;
      return { count: strokes.length, tool: strokes[0]?.tool, points: strokes[0]?.points?.length || 0, visiblePixels };
    })()
  `);

  await win.webContents.executeJavaScript(`document.querySelector('.drawing-tool-switch button:nth-child(2)').click()`);
  await drawLine(win, { x: initial.from.x + 80, y: initial.from.y + 40 }, { x: initial.to.x - 80, y: initial.to.y - 40 });

  const history = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const read = () => JSON.parse(localStorage.getItem('mindflow-drawing-v1') || '[]');
      const afterEraser = read();
      document.querySelector('button[aria-label="撤销"]').click();
      await wait(280);
      const afterUndo = read();
      document.querySelector('button[aria-label="重做"]').click();
      await wait(280);
      const afterRedo = read();
      let download = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function captureDownload() { download = { filename: this.download, href: this.href }; };
      [...document.querySelectorAll('.workspace-header button')].find((button) => button.textContent.includes('另存为')).click();
      await wait(100);
      document.querySelector('.save-as-dialog > footer .primary-button').click();
      await wait(2600);
      HTMLAnchorElement.prototype.click = originalClick;
      return {
        afterEraser: { count: afterEraser.length, tool: afterEraser[1]?.tool },
        afterUndo: afterUndo.length,
        afterRedo: afterRedo.length,
        download,
      };
    })()
  `);

  await win.reload();
  await wait(650);
  const reloaded = await win.webContents.executeJavaScript(`
    (() => ({
      page: Boolean(document.querySelector('.drawing-page')),
      strokes: JSON.parse(localStorage.getItem('mindflow-drawing-v1') || '[]').length,
      undoEnabled: !document.querySelector('button[aria-label="撤销"]').disabled,
    }))()
  `);

  const passed = initial.hasPage
    && initial.nav[0] === "笔记"
    && initial.nav[1] === "画图"
    && pen.count === 1
    && pen.tool === "pen"
    && pen.points >= 3
    && pen.visiblePixels > 20
    && history.afterEraser.count === 2
    && history.afterEraser.tool === "eraser"
    && history.afterUndo === 1
    && history.afterRedo === 2
    && history.download?.filename.endsWith(".png")
    && history.download?.href.startsWith("blob:")
    && reloaded.page
    && reloaded.strokes === 2
    && reloaded.undoEnabled;

  process.stdout.write(`${JSON.stringify({ passed, initial, pen, history, reloaded }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
