const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-task-smoke-${Date.now()}`));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "tasks" });
  await wait(500);

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const setValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const choose = async (label, value) => {
        document.querySelector('[aria-label="' + label + '"]').click();
        await wait(60);
        document.querySelector('.select-menu-option[data-value="' + value + '"]').click();
        await wait(50);
      };
      const createTask = async (title, repeat, configure) => {
        document.querySelector('.task-workspace-header .primary-button').click();
        await wait(80);
        const dialog = document.querySelector('.task-editor-dialog');
        const titleInput = dialog.querySelector('.task-title-field input');
        setValue(titleInput, title);
        await choose('任务重复方式', repeat);
        if (configure) await configure(dialog, choose);
        dialog.querySelector('button[type="submit"]').click();
        await wait(120);
      };

      await createTask('每日复盘', 'daily', async (dialog) => {
        const time = dialog.querySelector('input[type="time"]');
        setValue(time, '10:35');
      });
      await createTask('每周整理', 'weekly', async (dialog) => {
        const extraDay = [...dialog.querySelectorAll('.task-weekdays button')].find((button) => button.textContent === '三');
        if (extraDay && extraDay.getAttribute('aria-pressed') !== 'true') extraDay.click();
      });
      await createTask('三天一次归档', 'custom', async (dialog) => {
        const interval = dialog.querySelector('input[type="number"]');
        setValue(interval, '3');
      });

      const tasksAfterCreate = JSON.parse(localStorage.getItem('mindflow-tasks-v1') || '[]');
      const firstCheck = document.querySelector('.task-row .task-check');
      firstCheck.click();
      await wait(100);
      const tasksAfterCheck = JSON.parse(localStorage.getItem('mindflow-tasks-v1') || '[]');

      const settings = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
      const darkSettings = { ...settings, theme: 'graphite' };
      localStorage.setItem('mindflow-settings', JSON.stringify(darkSettings));
      window.dispatchEvent(new CustomEvent('mindflow-settings-change', { detail: darkSettings }));
      await wait(80);
      const darkTaskSurface = getComputedStyle(document.querySelector('.task-content')).backgroundColor;
      const darkTaskText = getComputedStyle(document.querySelector('.task-row:not(.completed) .task-row-copy > strong')).color;
      const lightSettings = { ...darkSettings, theme: 'mist' };
      localStorage.setItem('mindflow-settings', JSON.stringify(lightSettings));
      window.dispatchEvent(new CustomEvent('mindflow-settings-change', { detail: lightSettings }));
      await wait(80);

      document.querySelector('.app-sidebar [title="笔记"]').click();
      await wait(150);
      const row = document.querySelector('.note-row');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 350, clientY: 250 }));
      await wait(60);
      [...document.querySelectorAll('.note-context-menu button')].find((button) => button.textContent.includes('设置提醒')).click();
      await wait(80);
      const reminderDialog = document.querySelector('.reminder-dialog');
      const dateInput = reminderDialog.querySelector('input[type="date"]');
      const timeInput = reminderDialog.querySelector('input[type="time"]');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const dateValue = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
      setValue(dateInput, dateValue);
      setValue(timeInput, '16:25');
      reminderDialog.querySelector('button[type="submit"]').click();
      await wait(120);
      const notes = JSON.parse(localStorage.getItem('mindflow-notes') || '[]');

      return {
        taskPageRendered: Boolean(document.querySelector('.app-sidebar [title="任务"]')),
        createdCount: tasksAfterCreate.length,
        repeatTypes: tasksAfterCreate.map((task) => task.repeatType).sort(),
        dailyTime: tasksAfterCreate.find((task) => task.repeatType === 'daily')?.reminderTime,
        weeklyDays: tasksAfterCreate.find((task) => task.repeatType === 'weekly')?.weekdays?.length || 0,
        customInterval: tasksAfterCreate.find((task) => task.repeatType === 'custom')?.interval,
        completedCount: tasksAfterCheck.reduce((sum, task) => sum + (task.completedDates?.length || 0), 0),
        darkTaskSurface,
        darkTaskText,
        noteReminder: notes[0]?.reminder || '',
      };
    })()
  `);

  const passed = result.taskPageRendered
    && result.createdCount === 3
    && JSON.stringify(result.repeatTypes) === JSON.stringify(["custom", "daily", "weekly"])
    && result.dailyTime === "10:35"
    && result.weeklyDays >= 1
    && result.customInterval === 3
    && result.completedCount === 1
    && result.darkTaskSurface === "rgb(32, 38, 37)"
    && result.darkTaskText === "rgb(237, 242, 240)"
    && /^\d{4}-\d{2}-\d{2}T16:25:00$/.test(result.noteReminder);
  process.stdout.write(`${JSON.stringify({ passed, ...result }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
