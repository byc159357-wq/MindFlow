const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-theme-pages-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const captureDirectory = path.join(__dirname, "..", "artifacts", "themes");

app.whenReady().then(async () => {
  await fs.promises.mkdir(captureDirectory, { recursive: true });

  const pages = [
    { id: "notes", title: "笔记", probes: [".desktop-titlebar", ".app-sidebar", ".notes-list-pane", ".note-editor", ".editor-body"] },
    { id: "workflow", title: "工作流", probes: [".desktop-titlebar", ".app-sidebar", ".workspace-header", ".flow-stage", ".flow-node"] },
    { id: "mindmap", title: "导图", probes: [".desktop-titlebar", ".app-sidebar", ".workspace-header", ".mind-stage", ".mind-node.leaf"] },
  ];
  const results = [];
  const windows = [];

  for (const page of pages) {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      backgroundColor: "#171b1a",
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    windows.push(win);
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: page.id });
    await wait(320);
    await win.webContents.executeJavaScript(`
      (() => {
        const settings = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
        localStorage.setItem('mindflow-settings', JSON.stringify({ ...settings, theme: 'graphite' }));
        location.reload();
      })()
    `);
    await wait(620);
    const result = await win.webContents.executeJavaScript(`
      (() => {
        const parse = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
        const relativeLuminance = (rgb) => {
          const parts = rgb.map((part) => {
            const channel = part / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
        };
        return ${JSON.stringify(page.probes)}.map((selector) => {
          const element = document.querySelector(selector);
          const background = element ? getComputedStyle(element).backgroundColor : '';
          return { selector, found: Boolean(element), background, luminance: background ? relativeLuminance(parse(background)) : 1 };
        });
      })()
    `);
    results.push({ page: page.id, probes: result });
    const image = await win.webContents.capturePage();
    await fs.promises.writeFile(path.join(captureDirectory, `graphite-${page.id}.png`), image.toPNG());
  }

  const passed = results.every(({ probes }) => probes.every((probe) => probe.found && probe.luminance < 0.08));
  process.stdout.write(`${JSON.stringify({ passed, results, captureDirectory }, null, 2)}\n`);
  windows.forEach((win) => win.destroy());
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
