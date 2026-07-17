const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-workflow-note-jump-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function makeWindow(activeNoteId = 1) {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "workflow" });
  await wait(750);
  if (activeNoteId !== 1) {
    await win.webContents.executeJavaScript(`localStorage.setItem('mindflow-active-note', '${activeNoteId}')`);
    await win.reload();
    await wait(750);
  }
  return win;
}

async function inspectButtonJump(win) {
  return win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const node = document.querySelector('.flow-node');
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(140);
      const jump = [...document.querySelectorAll('.node-inspector button')].find((button) => button.textContent.includes('跳转到笔记'));
      const hint = document.querySelector('.canvas-mode')?.textContent || '';
      jump?.click();
      await wait(260);
      return {
        jumpExists: Boolean(jump),
        hint,
        hash: location.hash,
        selectedTitle: document.querySelector('.note-row.selected strong')?.textContent || '',
        editorTitle: document.querySelector('.editor-title-input')?.value || '',
      };
    })()
  `);
}

async function inspectDoubleClickJump(win) {
  return win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const node = document.querySelector('.flow-node');
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await wait(260);
      return {
        hash: location.hash,
        selectedTitle: document.querySelector('.note-row.selected strong')?.textContent || '',
        editorTitle: document.querySelector('.editor-title-input')?.value || '',
      };
    })()
  `);
}

app.whenReady().then(async () => {
  const buttonWindow = await makeWindow();
  const buttonJump = await inspectButtonJump(buttonWindow);
  const doubleClickWindow = await makeWindow(2);
  const doubleClickJump = await inspectDoubleClickJump(doubleClickWindow);
  const expectedTitle = "日本旅行计划";
  const passed = buttonJump.jumpExists
    && buttonJump.hint.includes("双击节点打开笔记")
    && buttonJump.hash === "#notes"
    && buttonJump.selectedTitle.includes(expectedTitle)
    && buttonJump.editorTitle === expectedTitle
    && doubleClickJump.hash === "#notes"
    && doubleClickJump.selectedTitle.includes("产品设计思路")
    && doubleClickJump.editorTitle === "产品设计思路";
  process.stdout.write(`${JSON.stringify({ passed, buttonJump, doubleClickJump }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
