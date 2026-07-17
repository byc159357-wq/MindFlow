const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-scroll-select-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 620,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "notes" });
  await wait(400);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const editor = document.querySelector('.editor-body');
      editor.innerHTML = Array.from({ length: 90 }, (_, index) => '<p>滚动测试内容 ' + (index + 1) + '</p>').join('');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      await wait(120);
      const editorScrollable = editor.scrollHeight > editor.clientHeight;
      editor.scrollTop = editor.scrollHeight;
      const editorScrolled = editor.scrollTop > 0;

      const list = document.querySelector('.note-rows');
      const template = document.querySelector('.note-row');
      for (let index = 0; index < 24; index += 1) list.appendChild(template.cloneNode(true));
      const listScrollable = list.scrollHeight > list.clientHeight;
      list.scrollTop = list.scrollHeight;
      const listScrolled = list.scrollTop > 0;

      document.querySelector('.app-sidebar [title="设置"]').click();
      await wait(250);
      const trigger = document.querySelector('.setting-row .select-menu-trigger[aria-label="启动后默认打开"]');
      trigger.click();
      await wait(80);
      const menu = document.querySelector('.select-menu-popover');
      const workflowOption = menu.querySelector('.select-menu-option[data-value="workflow"]');
      const customStyled = getComputedStyle(menu).position === 'fixed' && Number.parseFloat(getComputedStyle(menu).borderRadius) >= 10;
      workflowOption.click();
      await wait(120);
      const storedSettings = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
      const customSelectChanged = trigger.textContent.includes('工作流') && storedSettings.defaultOpen === 'workflow';
      const nativeSelectCount = document.querySelectorAll('select').length;

      return { editorScrollable, editorScrolled, listScrollable, listScrolled, customStyled, customSelectChanged, nativeSelectCount };
    })()
  `);

  const passed = result.editorScrollable
    && result.editorScrolled
    && result.listScrollable
    && result.listScrolled
    && result.customStyled
    && result.customSelectChanged
    && result.nativeSelectCount === 0;

  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
