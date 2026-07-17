const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-widget-capture-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const output = path.join(__dirname, "..", "artifacts", "widget");
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ width: 372, height: 570, show: false, transparent: true, webPreferences: { backgroundThrottling: false } });
  const file = path.join(__dirname, "..", "dist", "index.html");
  await win.loadFile(file, { hash: "widget" });
  await win.webContents.executeJavaScript(`
    (() => {
      const now = new Date();
      const key = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const today = key(now);
      const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1);
      const tomorrow = key(tomorrowDate);
      const weekday = now.getDay();
      localStorage.setItem('mindflow-settings', JSON.stringify({ theme: 'mist', density: 'comfortable', reduceMotion: false, fontSize: '14', defaultOpen: 'notes' }));
      localStorage.setItem('mindflow-widget-settings-v1', JSON.stringify({ overdueEnabled: false, nudgeTime: '18:00', alwaysOnTop: false, showTomorrow: true }));
      localStorage.setItem('mindflow-tasks-v1', JSON.stringify([
        { id: 1001, title: '确认宣传海报终稿', startDate: today, repeatType: 'once', weekdays: [weekday], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '10:30', noteId: '', completedDates: [] },
        { id: 1002, title: '每日项目复盘', startDate: today, repeatType: 'daily', weekdays: [weekday], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '18:20', noteId: '', completedDates: [today] },
        { id: 1003, title: '整理灵感资料', startDate: today, repeatType: 'once', weekdays: [weekday], interval: 1, intervalUnit: 'day', reminderEnabled: false, reminderTime: '09:00', noteId: '', completedDates: [] },
        { id: 1004, title: '准备明日评审会议', startDate: tomorrow, repeatType: 'once', weekdays: [tomorrowDate.getDay()], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '09:45', noteId: '', completedDates: [] }
      ]));
    })()
  `);
  await win.reload();
  await wait(650);
  fs.writeFileSync(path.join(output, "task-widget.png"), (await win.webContents.capturePage()).toPNG());
  const compactWin = new BrowserWindow({ width: 236, height: 224, frame: false, show: false, transparent: true, webPreferences: { backgroundThrottling: false } });
  await compactWin.loadFile(file, { hash: "widget" });
  await wait(350);
  const compactDiagnostics = await compactWin.webContents.executeJavaScript(`
    (async () => {
      const button = [...document.querySelectorAll('.task-widget-actions button')].find((item) => item.title === '收起');
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { buttonFound: Boolean(button), compact: document.querySelector('.task-widget-shell')?.classList.contains('compact'), actions: document.querySelectorAll('.task-widget-actions button').length };
    })()
  `);
  fs.writeFileSync(path.join(output, "task-widget-compact-v141.png"), (await compactWin.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`
    (() => {
      const settings = JSON.parse(localStorage.getItem('mindflow-widget-settings-v1'));
      localStorage.setItem('mindflow-widget-settings-v1', JSON.stringify({ ...settings, overdueEnabled: true, nudgeTime: '00:00' }));
    })()
  `);
  await win.reload();
  await wait(900);
  const alertDiagnostics = await win.webContents.executeJavaScript(`
    (() => {
      const alert = document.querySelector('.task-widget-alert');
      const style = getComputedStyle(alert);
      const headingStyle = getComputedStyle(alert.querySelector('h2'));
      return { opacity: style.opacity, background: style.backgroundColor, color: style.color, animation: style.animationName, playState: style.animationPlayState, headingColor: headingStyle.color };
    })()
  `);
  fs.writeFileSync(path.join(output, "task-widget-alert.png"), (await win.webContents.capturePage()).toPNG());
  const settingsWin = new BrowserWindow({ width: 1180, height: 780, show: false, webPreferences: { backgroundThrottling: false } });
  await settingsWin.loadFile(file, { hash: "settings" });
  await wait(450);
  await settingsWin.webContents.executeJavaScript(`
    (async () => {
      const button = [...document.querySelectorAll('.settings-nav button')].find((item) => item.textContent.includes('任务挂件'));
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    })()
  `);
  fs.writeFileSync(path.join(output, "task-widget-settings.png"), (await settingsWin.webContents.capturePage()).toPNG());
  process.stdout.write(`${JSON.stringify({ output, alertDiagnostics, compactDiagnostics }, null, 2)}\n`);
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
