const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-scroll-select-capture-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const outputDir = path.join(__dirname, "..", "artifacts");
  fs.mkdirSync(outputDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1180,
    height: 720,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "settings" });
  await wait(450);
  await win.webContents.executeJavaScript(`document.querySelector('.select-menu-trigger[aria-label="启动后默认打开"]').click()`);
  await wait(800);
  const settingsImage = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, "settings-custom-select.png"), settingsImage.toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('.app-sidebar [title="笔记"]').click()`);
  await wait(320);
  await win.webContents.executeJavaScript(`
    (() => {
      const editor = document.querySelector('.editor-body');
      editor.innerHTML = Array.from({ length: 55 }, (_, index) => '<p>笔记滚动内容 ' + (index + 1) + '</p>').join('');
      editor.scrollTop = 420;
      return true;
    })()
  `);
  await wait(120);
  const notesImage = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, "notes-scroll.png"), notesImage.toPNG());
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
