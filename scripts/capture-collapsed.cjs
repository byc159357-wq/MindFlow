const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const target = process.env.MINDFLOW_QA_CAPTURE;
app.setPath("userData", path.join(app.getPath("temp"), `mindflow-collapsed-capture-${Date.now()}`));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 920, show: false });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await new Promise((resolve) => setTimeout(resolve, 350));
  await win.webContents.executeJavaScript(`
    document.querySelector('.notes-layout').style.transition = 'none';
    document.querySelector('.pane-collapse').click();
  `);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const image = await win.webContents.capturePage();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, image.toPNG());
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});

