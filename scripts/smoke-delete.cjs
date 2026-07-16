const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-delete-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(500);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const sendDelete = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true }));

      const notesBefore = document.querySelectorAll('.note-row').length;
      document.querySelector('.pane-actions .icon-button').click();
      await wait(180);
      const addedNote = document.querySelector('.note-row.selected');
      addedNote.focus();
      sendDelete(addedNote);
      await wait(220);
      const notesAfter = document.querySelectorAll('.note-row').length;
      const noteDelete = notesBefore === notesAfter;

      const editor = document.querySelector('.editor-body');
      editor.focus();
      sendDelete(editor);
      await wait(80);
      const typingSafe = document.querySelectorAll('.note-row').length === notesAfter;

      document.querySelector('.app-sidebar [title="工作流"]').click();
      await wait(450);
      const workflowBefore = document.querySelectorAll('.flow-node').length;
      const workflowNode = document.querySelector('.flow-node');
      workflowNode.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(100);
      sendDelete(workflowNode);
      await wait(260);
      const workflowAfter = document.querySelectorAll('.flow-node').length;
      const workflowNodeDelete = workflowAfter === workflowBefore - 1;

      document.querySelector('.app-sidebar [title="导图"]').click();
      await wait(450);
      for (let attempt = 0; attempt < 20 && document.querySelectorAll('.react-flow__edge').length === 0; attempt += 1) await wait(100);
      const mindNodesBefore = document.querySelectorAll('.mind-node').length;
      const mindEdgesBefore = document.querySelectorAll('.react-flow__edge').length;
      [...document.querySelectorAll('.workspace-header button')].find((button) => button.textContent.includes('添加分支')).click();
      await wait(220);
      const addedBranch = document.querySelector('.mind-node.selected');
      const mindNodesAdded = document.querySelectorAll('.mind-node').length;
      sendDelete(addedBranch);
      await wait(260);
      const mindNodesAfter = document.querySelectorAll('.mind-node').length;
      const mindEdgesAfterNode = document.querySelectorAll('.react-flow__edge').length;
      const mindBranchDelete = mindNodesAdded === mindNodesBefore + 1 && mindNodesAfter === mindNodesBefore && mindEdgesAfterNode === mindEdgesBefore;

      const edgeElement = document.querySelector('.react-flow__edge');
      edgeElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(100);
      sendDelete(edgeElement);
      await wait(260);
      const mindEdgesAfterEdge = document.querySelectorAll('.react-flow__edge').length;
      const mindEdgeDelete = mindEdgesAfterEdge === mindEdgesBefore - 1;

      return {
        noteDelete,
        typingSafe,
        workflowNodeDelete,
        mindBranchDelete,
        mindEdgeDelete,
        counts: { notesBefore, notesAfter, workflowBefore, workflowAfter, mindNodesBefore, mindNodesAdded, mindNodesAfter, mindEdgesBefore, mindEdgesAfterNode, mindEdgesAfterEdge },
      };
    })()
  `);

  const passed = result.noteDelete
    && result.typingSafe
    && result.workflowNodeDelete
    && result.mindBranchDelete
    && result.mindEdgeDelete;

  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
