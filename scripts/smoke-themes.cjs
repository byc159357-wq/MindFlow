const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.setPath("userData", path.join(app.getPath("temp"), `mindflow-theme-smoke-${Date.now()}`));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const captureDirectory = path.join(__dirname, "..", "artifacts", "themes");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: "#eef0ef",
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "settings" });
  await wait(450);
  await win.webContents.executeJavaScript(`
    [...document.querySelectorAll('.settings-nav button')]
      .find((button) => button.textContent.trim() === '外观')
      .click()
  `);
  await wait(180);
  await fs.promises.mkdir(captureDirectory, { recursive: true });

  const themes = ["mist", "cream", "parchment", "glacier", "sage", "rose", "midnight", "graphite", "system"];
  const results = [];

  for (const theme of themes) {
    const result = await win.webContents.executeJavaScript(`
      (async () => {
        const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
        const option = [...document.querySelectorAll('.theme-option')]
          .find((button) => button.classList.contains('theme-preview-${theme}') || button.querySelector('.theme-preview-${theme}'));
        option.click();
        await wait(420);

        const shell = document.querySelector('.app-shell');
        const style = getComputedStyle(shell);
        const colorToRgb = (value) => {
          const probe = document.createElement('span');
          probe.style.color = value;
          document.body.appendChild(probe);
          const rgb = getComputedStyle(probe).color.match(/[\\d.]+/g).slice(0, 3).map(Number);
          probe.remove();
          return rgb;
        };
        const luminance = (rgb) => {
          const parts = rgb.map((part) => {
            const channel = part / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
        };
        const contrast = (one, two) => {
          const first = luminance(colorToRgb(one));
          const second = luminance(colorToRgb(two));
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const stored = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
        const selected = document.querySelector('.theme-option.selected');
        return {
          requested: '${theme}',
          classApplied: shell.classList.contains('theme-${theme}'),
          stored: stored.theme,
          selectedLabel: selected?.querySelector('.theme-option-copy strong')?.textContent || '',
          accent: style.getPropertyValue('--accent').trim(),
          panel: style.getPropertyValue('--panel').trim(),
          chrome: style.getPropertyValue('--chrome').trim(),
          ink: style.getPropertyValue('--ink').trim(),
          colorScheme: style.colorScheme,
          contrast: contrast(style.getPropertyValue('--ink'), style.getPropertyValue('--panel')),
          titlebarBackground: getComputedStyle(document.querySelector('.desktop-titlebar')).backgroundColor,
          settingsBackground: getComputedStyle(document.querySelector('.settings-content')).backgroundColor,
          canvasBackground: style.getPropertyValue('--canvas').trim(),
          optionBackgrounds: [...document.querySelectorAll('.theme-option')].map((button) => ({ label: button.textContent.trim(), selected: button.classList.contains('selected'), background: getComputedStyle(button).backgroundColor, panel: getComputedStyle(button).getPropertyValue('--panel').trim() })),
        };
      })()
    `);
    results.push(result);
    // Give Chromium one compositor frame after the React state update so the
    // visual capture and the computed theme result always describe the same theme.
    await wait(120);
    const image = await win.webContents.capturePage();
    await fs.promises.writeFile(path.join(captureDirectory, `${theme}.png`), image.toPNG());
  }

  await win.reload();
  await wait(260);
  const persisted = await win.webContents.executeJavaScript(`
    ({
      stored: JSON.parse(localStorage.getItem('mindflow-settings') || '{}').theme,
      classApplied: document.querySelector('.app-shell').classList.contains('theme-system')
    })
  `);

  const legacyMigrations = [];
  for (const [legacy, migrated] of [["salt", "glacier"], ["yolk", "parchment"]]) {
    await win.webContents.executeJavaScript(`
      (() => {
        const settings = JSON.parse(localStorage.getItem('mindflow-settings') || '{}');
        localStorage.setItem('mindflow-settings', JSON.stringify({ ...settings, theme: '${legacy}' }));
      })()
    `);
    await win.reload();
    await wait(320);
    legacyMigrations.push(await win.webContents.executeJavaScript(`
      ({
        legacy: '${legacy}',
        migrated: '${migrated}',
        classApplied: document.querySelector('.app-shell').classList.contains('theme-${migrated}'),
        selectedLabel: document.querySelector('.theme-option.selected .theme-option-copy strong')?.textContent || ''
      })
    `));
  }

  const fixedThemes = results.filter((result) => result.requested !== "system");
  const uniqueAccents = new Set(fixedThemes.map((result) => result.accent)).size === fixedThemes.length;
  const passed = results.every((result) => result.classApplied
      && result.stored === result.requested
      && result.contrast >= 4.5
      && result.titlebarBackground === result.chrome.replace(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`)
      && result.settingsBackground === result.panel.replace(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`))
    && uniqueAccents
    && persisted.stored === "system"
    && persisted.classApplied
    && legacyMigrations.every((result) => result.classApplied);

  process.stdout.write(`${JSON.stringify({ passed, uniqueAccents, persisted, legacyMigrations, results, captureDirectory }, null, 2)}\n`);
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
