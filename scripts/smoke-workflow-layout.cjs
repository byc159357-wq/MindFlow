const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-workflow-layout-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "workflow" });
  await wait(800);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const buttons = () => [...document.querySelectorAll('.workspace-header button')];
      const wrappers = () => [...document.querySelectorAll('.react-flow__node')];
      const nodeWrapper = (id) => document.querySelector('.react-flow__node[data-id="' + id + '"]');
      const edgeCount = () => document.querySelectorAll('.react-flow__edge').length;
      const sendDelete = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true }));
      const initialIds = new Set(wrappers().map((node) => node.getAttribute('data-id')));
      const initial = { nodes: initialIds.size, edges: edgeCount() };

      document.querySelector('.add-node-button').click();
      await wait(180);
      document.querySelector('.node-library-list > button').click();
      await wait(240);
      const added = wrappers().find((node) => !initialIds.has(node.getAttribute('data-id')));
      const addedId = added?.getAttribute('data-id');
      const inspectorInput = document.querySelector('.node-inspector input');
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inputSetter.call(inspectorInput, '保留的自定义模块');
      inspectorInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      const positionBefore = nodeWrapper(addedId)?.style.transform || '';

      const route = nodeWrapper('route');
      route.querySelector('.flow-node').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(100);
      sendDelete(route);
      await wait(250);

      const beforeLayout = {
        nodes: wrappers().length,
        edges: edgeCount(),
        routeExists: Boolean(nodeWrapper('route')),
        customExists: Boolean(nodeWrapper(addedId)),
      };

      buttons().find((button) => button.textContent.includes('整理布局')).click();
      await wait(650);

      const position = (id) => {
        const match = (nodeWrapper(id)?.style.transform || '').match(/translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/);
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
      };
      const afterLayout = {
        nodes: wrappers().length,
        edges: edgeCount(),
        routeExists: Boolean(nodeWrapper('route')),
        customExists: Boolean(nodeWrapper(addedId)),
        customLabel: nodeWrapper(addedId)?.textContent || '',
        customPosition: nodeWrapper(addedId)?.style.transform || '',
        input: position('input'),
        budget: position('budget'),
        map: position('map'),
      };

      return {
        initial,
        beforeLayout,
        afterLayout,
        positionChanged: positionBefore !== afterLayout.customPosition,
      };
    })()
  `);

  const orderedByConnections = result.afterLayout.input
    && result.afterLayout.budget
    && result.afterLayout.map
    && result.afterLayout.input.x < result.afterLayout.budget.x
    && result.afterLayout.budget.x < result.afterLayout.map.x;
  const passed = result.initial.nodes === 5
    && result.initial.edges === 6
    && result.beforeLayout.nodes === 5
    && result.beforeLayout.edges === 4
    && !result.beforeLayout.routeExists
    && result.beforeLayout.customExists
    && result.afterLayout.nodes === result.beforeLayout.nodes
    && result.afterLayout.edges === result.beforeLayout.edges
    && !result.afterLayout.routeExists
    && result.afterLayout.customExists
    && result.afterLayout.customLabel.includes("保留的自定义模块")
    && result.positionChanged
    && orderedByConnections;

  process.stdout.write(`${JSON.stringify({ passed, orderedByConnections, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
