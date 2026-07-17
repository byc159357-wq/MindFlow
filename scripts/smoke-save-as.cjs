const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-save-as-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(650);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const captured = [];
      let currentBlob = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { currentBlob = blob; return originalCreateObjectURL(blob); };
      HTMLAnchorElement.prototype.click = function captureDownload() { captured.push({ filename: this.download, blob: currentBlob }); };

      const openSaveAs = async () => {
        document.querySelector('.editor-more-wrap .icon-button').click();
        await wait(70);
        const labels = [...document.querySelectorAll('.editor-more-menu button')].map((button) => button.textContent.trim());
        [...document.querySelectorAll('.editor-more-menu button')].find((button) => button.textContent.includes('另存为')).click();
        await wait(100);
        return labels;
      };
      const saveFormat = async (label, waitTime) => {
        const labels = await openSaveAs();
        [...document.querySelectorAll('.save-as-formats button')].find((button) => button.textContent.startsWith(label)).click();
        await wait(100);
        document.querySelector('.save-as-dialog > footer .primary-button').click();
        await wait(waitTime);
        return labels;
      };

      const menuLabels = await saveFormat('JPG', 2300);
      await saveFormat('PNG', 2300);
      await saveFormat('Markdown', 500);
      await saveFormat('TXT', 500);
      await saveFormat('DOCX', 4500);

      const files = [];
      let docxBase64 = '';
      for (const item of captured) {
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        const metadata = { filename: item.filename, type: item.blob.type, size: item.blob.size, signature: [...bytes.slice(0, 4)] };
        if (item.filename.endsWith('.md') || item.filename.endsWith('.txt')) metadata.text = await item.blob.text();
        if (item.filename.endsWith('.docx')) {
          docxBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.readAsDataURL(item.blob);
          });
        }
        files.push(metadata);
      }
      HTMLAnchorElement.prototype.click = originalClick;
      URL.createObjectURL = originalCreateObjectURL;
      return {
        menuLabels,
        formatLabels: [...document.querySelectorAll('.save-as-formats button')].map((button) => button.textContent.trim()),
        files,
        docxBase64,
        exportError: window.__mindflowLastExportError || null,
      };
    })()
  `);

  const byExtension = Object.fromEntries(result.files.map((item) => [path.extname(item.filename), item]));
  const outputDirectory = path.join(__dirname, "..", "artifacts", "save-as");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const docxPath = path.join(outputDirectory, "MindFlow-note-export.docx");
  if (result.docxBase64) fs.writeFileSync(docxPath, Buffer.from(result.docxBase64, "base64"));

  const passed = result.menuLabels.filter((label) => label.includes("另存为")).length === 1
    && !result.menuLabels.some((label) => label.includes("导出 Markdown") || label.includes("导出为 JPG"))
    && result.files.length === 5
    && byExtension[".jpg"]?.type === "image/jpeg"
    && byExtension[".jpg"]?.size > 10000
    && byExtension[".png"]?.type === "image/png"
    && byExtension[".png"]?.size > 10000
    && byExtension[".md"]?.text.includes("# 日本旅行计划")
    && byExtension[".md"]?.text.includes("## 旅行时间")
    && byExtension[".txt"]?.text.startsWith("日本旅行计划")
    && !byExtension[".txt"]?.text.includes("##")
    && byExtension[".docx"]?.signature[0] === 80
    && byExtension[".docx"]?.signature[1] === 75
    && byExtension[".docx"]?.size > 5000
    && fs.existsSync(docxPath)
    && !result.exportError;

  process.stdout.write(`${JSON.stringify({ passed, menuLabels: result.menuLabels, files: result.files, docxPath, exportError: result.exportError }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
