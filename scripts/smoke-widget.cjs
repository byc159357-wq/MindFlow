const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-widget-smoke-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
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
      localStorage.setItem('mindflow-settings', JSON.stringify({ theme: 'graphite', density: 'comfortable', reduceMotion: false, fontSize: '14', defaultOpen: 'notes' }));
      localStorage.setItem('mindflow-widget-settings-v1', JSON.stringify({ overdueEnabled: true, nudgeTime: '00:00', alwaysOnTop: false, showTomorrow: true }));
      localStorage.setItem('mindflow-tasks-v1', JSON.stringify([
        { id: 901, title: '检查今日海报文案', details: '', startDate: today, repeatType: 'once', weekdays: [now.getDay()], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '09:30', noteId: '', completedDates: [] },
        { id: 902, title: '整理项目复盘', details: '', startDate: today, repeatType: 'daily', weekdays: [now.getDay()], interval: 1, intervalUnit: 'day', reminderEnabled: false, reminderTime: '18:00', noteId: '', completedDates: [today] },
        { id: 903, title: '准备明日会议', details: '', startDate: tomorrow, repeatType: 'once', weekdays: [tomorrowDate.getDay()], interval: 1, intervalUnit: 'day', reminderEnabled: true, reminderTime: '10:00', noteId: '', completedDates: [] }
      ]));
    })()
  `);
  await win.reload();
  await wait(950);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const alert = document.querySelector('.task-widget-alert');
      const alertMessage = alert?.querySelector('p')?.textContent || '';
      await wait(300);
      const alertStillVisible = Boolean(document.querySelector('.task-widget-alert'));
      alert.querySelector('button').click();
      await wait(80);
      const alertClosed = !document.querySelector('.task-widget-alert');
      const firstCheck = document.querySelector('.widget-day-section .widget-task-row:not(.completed) .widget-task-check');
      firstCheck.click();
      await wait(100);
      const tasks = JSON.parse(localStorage.getItem('mindflow-tasks-v1') || '[]');
      const todaySection = document.querySelector('.widget-day-section');
      const tomorrowSection = document.querySelector('.widget-tomorrow-section');
      const computed = getComputedStyle(document.querySelector('.task-widget-surface'));
      document.querySelector('[aria-label="收起任务挂件"]').click();
      await wait(100);
      const compactShell = document.querySelector('.task-widget-shell');
      return {
        widgetRendered: Boolean(document.querySelector('.task-widget-shell')),
        mainChromeAbsent: !document.querySelector('.desktop-titlebar') && !document.querySelector('.app-sidebar'),
        todayRows: todaySection?.querySelectorAll('.widget-task-row').length || 0,
        tomorrowRows: tomorrowSection?.querySelectorAll('.widget-task-row').length || 0,
        completedPersisted: tasks.find((task) => task.id === 901)?.completedDates?.length === 1,
        struckRows: document.querySelectorAll('.widget-task-row.completed').length,
        alertMessage,
        alertStillVisible,
        alertClosed,
        actionCount: document.querySelectorAll('.task-widget-actions button').length,
        compactClass: compactShell.classList.contains('compact'),
        compactTomorrowHidden: getComputedStyle(tomorrowSection).display === 'none',
        compactFooterHidden: getComputedStyle(document.querySelector('.task-widget-footer')).display === 'none',
        surface: computed.backgroundColor,
        shadow: computed.boxShadow,
        radius: computed.borderRadius,
      };
    })()
  `);

  const settingsWin = new BrowserWindow({ width: 1100, height: 760, show: false, webPreferences: { backgroundThrottling: false } });
  await settingsWin.loadFile(file, { hash: "settings" });
  await wait(450);
  const settingsResult = await settingsWin.webContents.executeJavaScript(`
    (async () => {
      const button = [...document.querySelectorAll('.settings-nav button')].find((item) => item.textContent.includes('任务挂件'));
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        navExists: Boolean(button),
        introExists: Boolean(document.querySelector('.widget-settings-intro')),
        hasStartup: document.body.textContent.includes('开机启动任务挂件'),
        hasNudgeTime: Boolean(document.querySelector('.widget-time-setting input[type="time"]')),
      };
    })()
  `);

  const passed = result.widgetRendered
    && result.mainChromeAbsent
    && result.todayRows === 2
    && result.tomorrowRows === 2
    && result.completedPersisted
    && result.struckRows === 2
    && result.alertMessage.includes('任务未完成，请查看')
    && result.alertStillVisible
    && result.alertClosed
    && result.actionCount === 2
    && result.compactClass
    && result.compactTomorrowHidden
    && result.compactFooterHidden
    && result.shadow === 'none'
    && result.radius === '15px'
    && settingsResult.navExists
    && settingsResult.introExists
    && settingsResult.hasStartup
    && settingsResult.hasNudgeTime;

  process.stdout.write(`${JSON.stringify({ passed, ...result, settings: settingsResult }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
