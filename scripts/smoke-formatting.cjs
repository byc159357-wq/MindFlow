const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-format-smoke-${Date.now()}`));

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
      const editor = document.querySelector('.editor-body');
      const toolbarButton = (label) => document.querySelector('.format-bar button[aria-label="' + label + '"]');
      const pressToolbar = async (label) => {
        const button = toolbarButton(label);
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        button.click();
        await wait(100);
      };
      const selectText = (textNode, start, end) => {
        editor.focus();
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      };
      const setEditorHtml = async (html) => {
        editor.innerHTML = html;
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        await wait(120);
      };

      await setEditorHtml('<p>alpha beta gamma</p>');
      selectText(editor.querySelector('p').firstChild, 0, 5);
      await pressToolbar('加粗');
      const bold = editor.querySelector('strong, b')?.textContent === 'alpha';

      const paragraphAfterBold = editor.querySelector('p');
      const betaNode = [...paragraphAfterBold.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('beta'));
      const betaStart = betaNode.nodeValue.indexOf('beta');
      selectText(betaNode, betaStart, betaStart + 4);
      await pressToolbar('斜体');
      const italic = editor.querySelector('em, i')?.textContent === 'beta';
      const italicStyle = getComputedStyle(editor.querySelector('em, i'));
      const italicVisual = italicStyle.display === 'inline-block' && italicStyle.transform !== 'none';
      await pressToolbar('斜体');
      const italicToggleOff = !editor.querySelector('em, i') && editor.textContent.includes('beta');

      const gammaNode = [...editor.querySelector('p').childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('gamma'));
      const gammaStart = gammaNode.nodeValue.indexOf('gamma');
      selectText(gammaNode, gammaStart, gammaStart + 5);
      await pressToolbar('下划线');
      const underline = editor.querySelector('u')?.textContent === 'gamma';

      await setEditorHtml('<p>one</p><p>two</p>');
      const listRange = document.createRange();
      listRange.selectNodeContents(editor);
      const listSelection = window.getSelection();
      listSelection.removeAllRanges();
      listSelection.addRange(listRange);
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await pressToolbar('列表');
      const list = editor.querySelectorAll('ul li').length === 2;

      await setEditorHtml('<p>Open MindFlow</p>');
      const linkText = editor.querySelector('p').firstChild;
      selectText(linkText, 5, 13);
      window.prompt = () => 'example.com/docs';
      await pressToolbar('链接');
      const anchor = editor.querySelector('a');
      const link = anchor?.textContent === 'MindFlow' && anchor.href === 'https://example.com/docs';

      await setEditorHtml('<p>Image below</p>');
      const imageRange = document.createRange();
      imageRange.selectNodeContents(editor);
      imageRange.collapse(false);
      const imageSelection = window.getSelection();
      imageSelection.removeAllRanges();
      imageSelection.addRange(imageRange);
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const input = document.querySelector('.format-file-input');
      const testSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#4A938B"/></svg>';
      const file = new File([testSvg], 'sample.svg', { type: 'image/svg+xml' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(700);
      const insertedImage = editor.querySelector('img');
      const image = Boolean(insertedImage?.src.startsWith('data:image/webp'));

      let downloaded = null;
      let downloadedBlob = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob?.type === 'image/jpeg') downloadedBlob = blob;
        return originalCreateObjectURL(blob);
      };
      HTMLAnchorElement.prototype.click = function captureDownload() {
        downloaded = { filename: this.download, href: this.href };
      };
      document.querySelector('.editor-more-wrap .icon-button').click();
      await wait(80);
      [...document.querySelectorAll('.editor-more-menu button')].find((button) => button.textContent.includes('导出为 JPG')).click();
      await wait(4500);
      HTMLAnchorElement.prototype.click = originalClick;
      URL.createObjectURL = originalCreateObjectURL;
      let jpgDimensions = null;
      if (downloadedBlob) {
        const bitmap = await createImageBitmap(downloadedBlob);
        jpgDimensions = { width: bitmap.width, height: bitmap.height, bytes: downloadedBlob.size, type: downloadedBlob.type };
        bitmap.close();
      }
      const jpg = Boolean(downloaded?.filename.endsWith('.jpg') && downloaded?.href.startsWith('blob:') && jpgDimensions?.width === 1440 && jpgDimensions?.height >= 960 && jpgDimensions?.bytes > 10000 && jpgDimensions?.type === 'image/jpeg');
      const jpgToast = document.querySelector('.toast')?.textContent || '';

      const stored = JSON.parse(localStorage.getItem('mindflow-notes') || '[]')[0]?.content || '';
      const persisted = stored.includes('data:image/webp') && stored.includes('Image below');
      return { bold, italic, italicVisual, italicToggleOff, underline, list, link, image, jpg, jpgDimensions, jpgToast, jpgError: window.__mindflowLastExportError || null, downloaded, persisted, contentEditable: editor.contentEditable };
    })()
  `);

  const passed = result.bold && result.italic && result.italicVisual && result.italicToggleOff && result.underline && result.list && result.link && result.image && result.jpg && result.persisted && result.contentEditable === "true";
  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
