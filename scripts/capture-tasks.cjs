const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-task-capture-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "artifacts", "tasks");
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "tasks" });
  await wait(350);
  await win.webContents.executeJavaScript(`
    (() => {
      const now = new Date();
      const key = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const today = key(now);
      const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1);
      const tomorrow = key(tomorrowDate);
      const weekday = now.getDay();
      localStorage.setItem('mindflow-tasks-v1', JSON.stringify([
        { id: 101, title: '整理宣传海报内容', details: '确认标题、受众与最终输出尺寸', startDate: today, repeatType: 'once', weekdays: [weekday], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '09:30', noteId: 1, completedDates: [] },
        { id: 102, title: '每日项目复盘', details: '记录今天完成的内容与明天的重点', startDate: today, repeatType: 'daily', weekdays: [weekday], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '18:20', noteId: '', completedDates: [today] },
        { id: 103, title: '每周整理资料库', details: '清理临时笔记并补充标签', startDate: today, repeatType: 'weekly', weekdays: [weekday, (weekday + 3) % 7], interval: 1, intervalUnit: 'week', reminderEnabled: true, reminderTime: '16:00', noteId: 2, completedDates: [] },
        { id: 104, title: '备份 MindFlow 数据', details: '', startDate: tomorrow, repeatType: 'custom', weekdays: [tomorrowDate.getDay()], interval: 2, intervalUnit: 'week', reminderEnabled: false, reminderTime: '09:00', noteId: '', completedDates: [] }
      ]));
      return true;
    })()
  `);
  await win.reload();
  await wait(600);
  fs.writeFileSync(path.join(output, "tasks-today.png"), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.task-workspace-header .primary-button').click()`);
  await wait(250);
  await win.webContents.executeJavaScript(`
    (() => {
      document.querySelector('.save-as-backdrop').style.animation = 'none';
      document.querySelector('.save-as-backdrop').style.opacity = '1';
      document.querySelector('.task-editor-dialog').style.animation = 'none';
      document.querySelector('.task-editor-dialog').style.opacity = '1';
    })()
  `);
  await wait(80);
  const taskDialogDiagnostics = await win.webContents.executeJavaScript(`
    (() => {
      const backdrop = document.querySelector('.save-as-backdrop');
      const dialog = document.querySelector('.task-editor-dialog');
      const backdropStyle = getComputedStyle(backdrop);
      const dialogStyle = getComputedStyle(dialog);
      return { backdrop: { opacity: backdropStyle.opacity, animation: backdropStyle.animationName, background: backdropStyle.backgroundColor }, dialog: { opacity: dialogStyle.opacity, animation: dialogStyle.animationName, color: dialogStyle.color, background: dialogStyle.backgroundColor, rect: dialog.getBoundingClientRect().toJSON() } };
    })()
  `);
  await win.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(path.join(output, "task-editor.png"), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.task-editor-dialog .icon-button').click()`);
  await wait(100);
  await win.webContents.executeJavaScript(`document.querySelector('.app-sidebar [title="笔记"]').click()`);
  await wait(220);
  await win.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('.note-row');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 350, clientY: 250 }));
    })()
  `);
  await wait(100);
  await win.webContents.executeJavaScript(`
    [...document.querySelectorAll('.note-context-menu button')].find((button) => button.textContent.includes('设置提醒')).click()
  `);
  await wait(220);
  await win.webContents.executeJavaScript(`
    (() => {
      document.querySelector('.save-as-backdrop').style.animation = 'none';
      document.querySelector('.save-as-backdrop').style.opacity = '1';
      document.querySelector('.reminder-dialog').style.animation = 'none';
      document.querySelector('.reminder-dialog').style.opacity = '1';
    })()
  `);
  await wait(80);
  await win.webContents.capturePage();
  await wait(80);
  fs.writeFileSync(path.join(output, "note-reminder.png"), (await win.webContents.capturePage()).toPNG());
  process.stdout.write(`${JSON.stringify({ output, taskDialogDiagnostics }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
