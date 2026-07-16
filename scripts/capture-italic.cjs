const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const output = process.env.MINDFLOW_ITALIC_CAPTURE || path.join(app.getPath("temp"), "mindflow-italic-proof.png");
app.setPath("userData", path.join(app.getPath("temp"), `mindflow-italic-capture-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1360, height: 860, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(450);
  const rect = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const editor = document.querySelector('.editor-body');
      editor.style.fontSize = '34px';
      editor.innerHTML = '<p>宣传海报字体倾斜效果</p>';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      const text = editor.querySelector('p').firstChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 4);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const button = document.querySelector('.format-bar button[aria-label="斜体"]');
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      button.click();
      await wait(180);
      const italic = editor.querySelector('em, i');
      const bounds = italic.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(bounds.x - 50)), y: Math.max(0, Math.floor(bounds.y - 35)), width: Math.ceil(bounds.width + 300), height: Math.ceil(bounds.height + 70) };
    })()
  `);
  const image = await win.webContents.capturePage(rect);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, image.toPNG());
  process.stdout.write(`${JSON.stringify({ output, rect }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
