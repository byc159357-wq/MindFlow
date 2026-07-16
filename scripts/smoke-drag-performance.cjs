const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-drag-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const dragFromCenter = async (win, selector, deltaX) => {
  const before = await win.webContents.executeJavaScript(`
    (() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const element = elements.find((candidate) => {
        const rect = candidate.closest('.react-flow__node').getBoundingClientRect();
        return rect.x + rect.width / 2 > 24 && rect.x + rect.width / 2 < window.innerWidth - 24 && rect.y + rect.height / 2 > 90 && rect.y + rect.height / 2 < window.innerHeight - 24;
      }) || elements[0];
      const wrapper = element.closest('.react-flow__node');
      const rect = wrapper.getBoundingClientRect();
      return { id: wrapper.getAttribute('data-id'), x: rect.x, y: rect.y, centerX: Math.round(rect.x + rect.width / 2), centerY: Math.round(rect.y + rect.height / 2) };
    })()
  `);
  win.webContents.sendInputEvent({ type: "mouseDown", x: before.centerX, y: before.centerY, button: "left", clickCount: 1 });
  const steps = 42;
  for (let index = 1; index <= steps; index += 1) {
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(before.centerX + (deltaX * index) / steps),
      y: before.centerY,
      movementX: deltaX / steps,
      movementY: 0,
    });
    await wait(12);
  }
  win.webContents.sendInputEvent({ type: "mouseUp", x: before.centerX + deltaX, y: before.centerY, button: "left", clickCount: 1 });
  await wait(70);
  const immediate = await win.webContents.executeJavaScript(`
    (() => {
      const rect = document.querySelector('.react-flow__node[data-id="${before.id}"]').getBoundingClientRect();
      return { x: rect.x, y: rect.y, writes: window.__canvasStorageWrites || 0 };
    })()
  `);
  await wait(320);
  const delayedWrites = await win.webContents.executeJavaScript("window.__canvasStorageWrites || 0");
  return { before, deltaX: Math.round((immediate.x - before.x) * 10) / 10, deltaY: Math.round((immediate.y - before.y) * 10) / 10, writesDuringDrag: immediate.writes, writesAfterDebounce: delayedWrites };
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "workflow" });
  await wait(750);
  await win.webContents.executeJavaScript(`
    (() => {
      const original = Storage.prototype.setItem;
      window.__canvasStorageWrites = 0;
      Storage.prototype.setItem = function patchedSetItem(key, value) {
        if (String(key).startsWith('mindflow-workflow-v3-') || String(key).startsWith('mindflow-mindmap-v2-')) window.__canvasStorageWrites += 1;
        return original.call(this, key, value);
      };
    })()
  `);

  const workflow = await dragFromCenter(win, ".flow-node", 83);

  await win.webContents.executeJavaScript(`document.querySelector('.app-sidebar [title="导图"]').click()`);
  await wait(750);
  await win.webContents.executeJavaScript("window.__canvasStorageWrites = 0");
  const mindmap = await dragFromCenter(win, ".mind-node", 77);

  const workflowPassed = workflow.deltaX >= 75 && workflow.deltaX <= 83
    && Math.abs(workflow.deltaY) <= 1
    && workflow.writesDuringDrag === 0
    && workflow.writesAfterDebounce <= 1;
  const mindmapPassed = mindmap.deltaX >= 69 && mindmap.deltaX <= 77
    && Math.abs(mindmap.deltaY) <= 1
    && mindmap.writesDuringDrag === 0
    && mindmap.writesAfterDebounce <= 1;
  const passed = workflowPassed && mindmapPassed;

  process.stdout.write(`${JSON.stringify({ passed, workflowPassed, mindmapPassed, workflow, mindmap }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
