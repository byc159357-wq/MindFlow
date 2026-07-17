const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-cursor-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function inspectRoute(route) {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: route });
  await wait(700);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const pane = document.querySelector('.react-flow__pane');
      const wrapper = document.querySelector('.react-flow__node');
      const node = document.querySelector('${route === "workflow" ? ".flow-node" : ".mind-node"}');
      const handle = document.querySelector('.react-flow__handle');
      const edge = document.querySelector('.react-flow__edge');
      const before = {
        pane: getComputedStyle(pane).cursor,
        wrapper: getComputedStyle(wrapper).cursor,
        node: getComputedStyle(node).cursor,
        handle: getComputedStyle(handle).cursor,
        edge: getComputedStyle(edge).cursor,
      };
      pane.classList.add('dragging');
      wrapper.classList.add('dragging');
      const dragging = {
        pane: getComputedStyle(pane).cursor,
        wrapper: getComputedStyle(wrapper).cursor,
        node: getComputedStyle(node).cursor,
      };
      pane.classList.remove('dragging');
      wrapper.classList.remove('dragging');

      let input = null;
      if ('${route}' === 'mindmap') {
        node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        await wait(120);
        const editor = document.querySelector('.mind-node-input');
        input = editor ? getComputedStyle(editor).cursor : null;
      }
      return { before, dragging, input };
    })()
  `);
  return result;
}

app.whenReady().then(async () => {
  const workflow = await inspectRoute("workflow");
  const mindmap = await inspectRoute("mindmap");
  const routePassed = (result) => result.before.pane === "default"
    && result.before.wrapper === "move"
    && result.before.node === "move"
    && result.before.handle === "crosshair"
    && result.before.edge === "default"
    && result.dragging.pane === "move"
    && result.dragging.wrapper === "move"
    && result.dragging.node === "move";
  const passed = routePassed(workflow) && routePassed(mindmap) && mindmap.input === "text";
  process.stdout.write(`${JSON.stringify({ passed, workflow, mindmap }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
