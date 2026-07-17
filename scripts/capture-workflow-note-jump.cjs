const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-workflow-jump-capture-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "artifacts", "latest", "workflow-note-jump.png");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "workflow" });
  await wait(750);
  await win.webContents.executeJavaScript(`document.querySelector('.flow-node').click()`);
  await wait(280);
  await win.webContents.executeJavaScript(`document.querySelector('.node-inspector').style.animation = 'none'`);
  await wait(80);
  const diagnostics = await win.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('.node-inspector');
      const buttons = [...panel.querySelectorAll('.inspector-actions button')];
      return {
        opacity: getComputedStyle(panel).opacity,
        background: getComputedStyle(panel).backgroundColor,
        panel: panel.getBoundingClientRect().toJSON(),
        scrollWidth: panel.scrollWidth,
        clientWidth: panel.clientWidth,
        buttons: buttons.map((button) => ({ label: button.textContent, rect: button.getBoundingClientRect().toJSON() })),
      };
    })()
  `);
  await win.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(output, (await win.webContents.capturePage()).toPNG());
  process.stdout.write(`${JSON.stringify({ output, diagnostics }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
