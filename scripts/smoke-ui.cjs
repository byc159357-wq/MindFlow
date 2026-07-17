const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-ui-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(400);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const changeSelect = async (value) => {
        document.querySelector('.note-switcher-trigger').click();
        await wait(100);
        document.querySelector('.note-switcher-option[data-note-id="' + value + '"]').click();
        await wait(350);
      };

      const notesLayout = document.querySelector('.notes-layout');
      notesLayout.style.transition = 'none';
      const expandedWidth = document.querySelector('.notes-list-pane').getBoundingClientRect().width;
      document.querySelector('.pane-collapse').click();
      await wait(300);
      const collapsedWidth = document.querySelector('.notes-list-pane').getBoundingClientRect().width;
      const collapsedStored = localStorage.getItem('mindflow-note-list-collapsed') === '1';
      document.querySelector('.notes-pane-expand').click();
      await wait(500);
      const restoredWidth = document.querySelector('.notes-list-pane').getBoundingClientRect().width;
      const expandedStored = localStorage.getItem('mindflow-note-list-collapsed') === '0';
      const expandedClass = !document.querySelector('.notes-layout').classList.contains('notes-list-collapsed');
      const listCollapse = { expandedWidth, collapsedWidth, restoredWidth, collapsedStored, expandedStored, expandedClass };

      const rows = document.querySelectorAll('.note-row');
      rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 360, clientY: 280 }));
      await wait(100);
      const contextLabels = [...document.querySelectorAll('.note-context-menu button')].map((button) => button.textContent.trim());

      document.querySelector('.app-sidebar [title="工作流"]').click();
      await wait(350);
      await changeSelect(2);
      const secondWorkflow = {
        title: document.querySelector('.note-switcher-trigger span').textContent,
        nodes: document.querySelectorAll('.flow-node').length,
        stored: Boolean(localStorage.getItem('mindflow-workflow-v3-2')),
      };

      document.querySelector('.app-sidebar [title="导图"]').click();
      await wait(350);
      const secondMindMap = {
        title: document.querySelector('.note-switcher-trigger span').textContent,
        nodes: document.querySelectorAll('.mind-node').length,
        stored: Boolean(localStorage.getItem('mindflow-mindmap-v2-2')),
      };

      document.querySelector('.app-sidebar [title="工作流"]').click();
      await wait(300);
      await changeSelect(1);
      const firstWorkflow = {
        title: document.querySelector('.note-switcher-trigger span').textContent,
        nodes: document.querySelectorAll('.flow-node').length,
        stored: Boolean(localStorage.getItem('mindflow-workflow-v3-1')),
      };

      return { listCollapse, contextLabels, secondWorkflow, secondMindMap, firstWorkflow };
    })()
  `);

  const passed = result.listCollapse.expandedWidth >= 260
    && result.listCollapse.collapsedWidth <= 44
    && result.listCollapse.restoredWidth >= 260
    && result.listCollapse.collapsedStored
    && result.listCollapse.expandedStored
    && result.listCollapse.expandedClass
    && result.contextLabels.length === 5
    && result.contextLabels.some((label) => label.includes("标记重点"))
    && result.contextLabels.some((label) => label.includes("设置提醒"))
    && result.contextLabels.some((label) => label.includes("另存为"))
    && result.contextLabels.some((label) => label.includes("删除笔记"))
    && result.secondWorkflow.title === "产品设计思路"
    && result.secondWorkflow.nodes === 2
    && result.secondWorkflow.stored
    && result.secondMindMap.title === "产品设计思路"
    && result.secondMindMap.nodes === 1
    && result.secondMindMap.stored
    && result.firstWorkflow.title === "日本旅行计划"
    && result.firstWorkflow.nodes === 5
    && result.firstWorkflow.stored;

  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
