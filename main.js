'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { convert, probe } = require('./src/converter');
const { resolveFfmpeg } = require('./src/transcode');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 660,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0e1014',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    // 自动化测试时保持隐藏，不抢焦点
    const headless = !!(process.env.NCM_SHOT || process.env.NCM_HEADLESS);
    if (headless) {
      if (app.dock) app.dock.hide();
      setTimeout(runHeadlessTest, 1200);
    } else {
      mainWindow.show();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function runHeadlessTest() {
  try {
    if (process.env.NCM_SHOT_DEMO) {
      await mainWindow.webContents.executeJavaScript(
        `window.__addPaths(${JSON.stringify(process.env.NCM_SHOT_DEMO.split('|'))})`
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      const before = await mainWindow.webContents.executeJavaScript(
        `(() => { const b = document.getElementById('convertBtn'); return { disabled: b.disabled, text: b.textContent, status: document.getElementById('status').textContent }; })()`
      );
      console.error('[demo] before click', JSON.stringify(before));
      await mainWindow.webContents.executeJavaScript(
        `document.getElementById('convertBtn').click()`
      );
      console.error('[demo] clicked, flacChoice=', process.env.NCM_FLAC_CHOICE || '(ask)');
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const text = await mainWindow.webContents.executeJavaScript(
          `document.getElementById('status').textContent`
        );
        if (text.startsWith('完成') || text === '已取消') {
          console.error('[demo] done:', text);
          break;
        }
      }
    }
    if (process.env.NCM_SHOT) {
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(process.env.NCM_SHOT, image.toPNG());
      console.error('[demo] screenshot written');
    }
  } catch (err) {
    console.error('[demo] error', err && err.message);
  }
  app.quit();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 NCM 文件',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '网易云音乐 NCM', extensions: ['ncm'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('expand', (_event, paths) => {
  const found = [];
  const walk = (target) => {
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) {
        if (name.startsWith('.')) continue;
        walk(path.join(target, name));
      }
    } else if (target.toLowerCase().endsWith('.ncm')) {
      found.push(target);
    }
  };
  paths.forEach(walk);
  return found;
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择输出文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('convert', async (event, { files, outDir }) => {
  // 先快速探测音源格式：有无损文件时问用户要什么输出
  let flacCount = 0;
  for (const file of files) {
    try {
      if (fs.existsSync(file) && probe(file).format === 'flac') flacCount++;
    } catch {
      // 探测失败的文件留给转换阶段报错
    }
  }

  let flacOutput = 'flac';
  if (flacCount > 0) {
    if (process.env.NCM_FLAC_CHOICE === 'mp3' || process.env.NCM_FLAC_CHOICE === 'flac') {
      flacOutput = process.env.NCM_FLAC_CHOICE;
    } else {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: '无损音源',
        message: `这批文件里有 ${flacCount} 个无损（FLAC）音源`,
        detail:
          '无损转 MP3 会变成 320kbps 的有损文件，体积小、兼容性好；保留 FLAC 音质最好，但部分车机和老播放器不支持。',
        buttons: ['转成 MP3（320k）', '保留 FLAC', '取消'],
        defaultId: 1,
        cancelId: 2,
        noLink: true,
      });
      if (answer.response === 2) return { cancelled: true, results: [] };
      flacOutput = answer.response === 0 ? 'mp3' : 'flac';
    }
  }

  const ffmpegPath = flacOutput === 'mp3' ? resolveFfmpeg() : null;
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    event.sender.send('progress', {
      index: i,
      total: files.length,
      file: path.basename(file),
    });
    await new Promise((resolve) => setImmediate(resolve));
    try {
      if (!fs.existsSync(file)) throw new Error('文件不存在');
      const info = await convert(file, { outDir: outDir || null, flacOutput, ffmpegPath });
      results.push({ ok: true, ...info });
    } catch (err) {
      results.push({ ok: false, input: file, error: err.message || String(err) });
    }
  }
  return { cancelled: false, results };
});

ipcMain.handle('reveal', (_event, target) => {
  if (target && fs.existsSync(target)) shell.showItemInFolder(target);
});

ipcMain.handle('open-file', (_event, target) => {
  if (target && fs.existsSync(target)) return shell.openPath(target);
});

ipcMain.handle('toast', () => undefined);
