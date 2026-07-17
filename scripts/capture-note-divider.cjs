const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-divider-capture-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "artifacts", "latest", "note-divider.png");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(700);
  await win.webContents.executeJavaScript(`
    (() => {
      const editor = document.querySelector('.editor-body');
      editor.innerHTML = '<h2>宣传主题</h2><p>渔文化海洋探索之旅</p><p>面向学生、家长与研学团队，突出航海实践与海洋知识。</p><hr><h2>推荐海报形式</h2><p>建议制作一张竖版宣传海报，并为不同平台保留适配尺寸。</p>';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    })()
  `);
  await wait(180);
  await win.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(output, (await win.webContents.capturePage()).toPNG());
  process.stdout.write(`${output}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
