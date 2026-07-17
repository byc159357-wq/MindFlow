const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-layout-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "mindmap" });
  await wait(750);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const buttons = () => [...document.querySelectorAll('.workspace-header button')];
      const nodeCount = () => document.querySelectorAll('.mind-node').length;
      const edgeCount = () => document.querySelectorAll('.react-flow__edge').length;
      const nodeWrapper = (id) => document.querySelector('.react-flow__node[data-id="' + id + '"]');
      const sendDelete = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true }));

      const initial = { nodes: nodeCount(), edges: edgeCount() };
      buttons().find((button) => button.textContent.includes('添加分支')).click();
      await wait(220);

      const added = document.querySelector('.react-flow__node.selected');
      const addedId = added?.getAttribute('data-id');
      const input = document.querySelector('.mind-edit-dock input');
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inputSetter.call(input, '保留的自定义分支');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      const positionBefore = nodeWrapper(addedId)?.style.transform || '';

      const route = nodeWrapper('route');
      route.querySelector('.mind-node').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(100);
      sendDelete(route);
      await wait(250);

      const beforeLayout = {
        nodes: nodeCount(),
        edges: edgeCount(),
        routeExists: Boolean(nodeWrapper('route')),
        customExists: Boolean(nodeWrapper(addedId)),
      };

      buttons().find((button) => button.textContent.includes('整理布局')).click();
      await wait(650);

      const afterLayout = {
        nodes: nodeCount(),
        edges: edgeCount(),
        routeExists: Boolean(nodeWrapper('route')),
        customExists: Boolean(nodeWrapper(addedId)),
        customLabel: nodeWrapper(addedId)?.textContent || '',
        position: nodeWrapper(addedId)?.style.transform || '',
      };

      return {
        initial,
        beforeLayout,
        afterLayout,
        positionChanged: positionBefore !== afterLayout.position,
      };
    })()
  `);

  const passed = result.initial.nodes === 14
    && result.initial.edges === 13
    && result.beforeLayout.nodes === 14
    && result.beforeLayout.edges === 10
    && !result.beforeLayout.routeExists
    && result.beforeLayout.customExists
    && result.afterLayout.nodes === result.beforeLayout.nodes
    && result.afterLayout.edges === result.beforeLayout.edges
    && !result.afterLayout.routeExists
    && result.afterLayout.customExists
    && result.afterLayout.customLabel.includes("保留的自定义分支")
    && result.positionChanged;

  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
