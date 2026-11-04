// Curi Creator — Electron main process (first slice).
// Security model: contextIsolation ON, nodeIntegration OFF, sandbox OFF
// only for the preload bridge below. The renderer (Curi Studio web app,
// or the local captions window) never gets direct Node access; it only
// gets the narrow window.curiCreator API exposed by preload.js.
//
// Dev mode: loads the Curi web app from a local server. Start it first:
//   cd ~/workspace/curi && npm run start -- -p 3100
// then run this app with:  npm start
// Packaged mode is NOT faked here: if app.isPackaged and no bundled
// web build is present, the window shows a local explanation page
// instead of pretending the Studio is bundled. See README.md.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const STUDIO_URL = process.env.CURI_STUDIO_URL || 'http://localhost:3100/studio';
const BUNDLED_WEB_INDEX = path.join(process.resourcesPath || '', 'curi-web', 'index.html');

let mainWindow = null;
let captionsWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    title: 'Curi Creator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (app.isPackaged && fs.existsSync(BUNDLED_WEB_INDEX)) {
    mainWindow.loadFile(BUNDLED_WEB_INDEX);
  } else if (app.isPackaged) {
    // Honest packaged-mode fallback for this first slice: the web
    // build is not yet bundled into the installer (see README.md,
    // "Packaged mode, later"). Do not silently load a remote URL.
    mainWindow.loadFile(path.join(__dirname, 'packaged-not-bundled.html'));
  } else {
    mainWindow.loadURL(STUDIO_URL);
  }

  // Verification hook only: when CURI_SCREENSHOT_PATH is set, save a
  // capture of the loaded window after load + 3s. This is how the
  // Electron window was screenshotted on a headless Linux VM (under
  // xvfb). It is not a user-facing feature and does not fake content.
  const shotPath = process.env.CURI_SCREENSHOT_PATH;
  if (shotPath) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(shotPath, image.toPNG());
          console.log(`[curi-creator] screenshot saved to ${shotPath}`);
        } catch (e) {
          console.error(`[curi-creator] screenshot failed: ${e.message}`);
        }
      }, 3000);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createCaptionsWindow() {
  if (captionsWindow && !captionsWindow.isDestroyed()) {
    captionsWindow.focus();
    return captionsWindow;
  }
  captionsWindow = new BrowserWindow({
    width: 760,
    height: 720,
    title: 'Curi Creator — Local Captions',
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  captionsWindow.loadFile(path.join(__dirname, 'captions.html'));
  captionsWindow.on('closed', () => { captionsWindow = null; });
  return captionsWindow;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video for Local Captions…',
          accelerator: 'CmdOrCtrl+O',
          click: () => createCaptionsWindow(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Local Captions…',
          click: () => createCaptionsWindow(),
        },
        {
          label: 'Open Curi Studio (creator)',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(STUDIO_URL);
          },
        },
        {
          // Same Next.js app, learner routes — not a second app.
          // The shell loads both route groups from ~/workspace/curi:
          // /studio/* for creators and / + /courses/* for learners.
          label: 'Open Learner Home (student)',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const base = STUDIO_URL.replace(/\/studio\/?$/, '') || 'http://localhost:3100';
              mainWindow.loadURL(`${base}/`);
            }
          },
        },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Curi Creator',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Curi Creator',
              message: 'Curi Creator 0.1.0 (first slice)',
              detail: 'Desktop creator app for Curi. Studio + OBS-file import + local Whisper captions. See README.md in curi-desktop for what is and is not verified.',
            });
          },
        },
        {
          label: 'Open Curi Studio in Browser',
          click: () => shell.openExternal(STUDIO_URL),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Caption IPC -------------------------------------------------------
// Renderer -> main: 'curi:pick-video' returns a file path or null.
// Renderer -> main: 'curi:transcribe' takes a file path and returns
//   { ok: true, model, file, vtt, text, segments, durationMs }
// or { ok: false, error }.
// Transcription itself runs in a separate Node worker process
// (src/caption-worker.js) so the ONNX runtime does not live inside
// Electron's main process. The worker is never given sample/fake
// text: on failure it exits non-zero and the error is returned verbatim.
ipcMain.handle('curi:pick-video', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose a video or audio file to caption locally',
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] },
      { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('curi:transcribe', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'No file path given.' };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }
  return new Promise((resolve) => {
    const worker = path.join(__dirname, 'caption-worker.js');
    // Use the system node for the worker (not Electron's node) so
    // @xenova/transformers / onnxruntime-node loads normally.
    const nodeBin = process.execPath.includes('electron') ? 'node' : process.execPath;
    const child = spawn(nodeBin, [worker, filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CURI_CAPTION_CACHE: process.env.CURI_CAPTION_CACHE || path.join(app.getPath('userData'), 'models') },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
      resolve({ ok: false, error: 'Transcription timed out after 10 minutes. Try a shorter file or the tiny model.' });
    }, 10 * 60 * 1000);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not start the caption worker: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = (stderr || stdout || '').trim().slice(-2000);
        resolve({ ok: false, error: `Caption worker failed (exit ${code}). ${detail}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ ok: true, ...parsed });
      } catch (e) {
        resolve({ ok: false, error: `Caption worker returned unparsable output: ${e.message}` });
      }
    });
  });
});

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
