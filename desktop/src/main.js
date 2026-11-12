// Curi Creator — Electron main process (first slice).
// Security model: contextIsolation ON, nodeIntegration OFF, sandbox OFF
// only for the preload bridge below. The renderer (Curi Studio web app,
// or the local captions window) never gets direct Node access; it only
// gets the narrow window.curiCreator API exposed by preload.js.
//
// Dev mode: loads the Curi web app from a local server. Start it first:
//   cd ~/workspace/curi && npm run start -- -p 3100
// then run this app with:  npm start
// Packaged mode: spawns the bundled Next.js standalone server from
// resources/curi-web/server.js (copied by scripts/bundle-web.sh) using
// the Electron binary as Node (ELECTRON_RUN_AS_NODE=1), waits for its
// local port to respond, then loads Studio from it — no dev server.
// Only if the bundle is missing or the server fails to start does the
// window show src/packaged-not-bundled.html. See README.md.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
// AI drafts (Step 2): pure deterministic transcript-derived drafts, no
// native deps, so main can require it directly — no worker spawn needed.
const { generateDrafts } = require('./ai-drafts');

const STUDIO_URL = process.env.CURI_STUDIO_URL || 'http://localhost:3100/studio';
// Bundled Next.js standalone server (copied by scripts/bundle-web.sh):
//   resources/curi-web/server.js  (+ .next/, node_modules/, public/)
const BUNDLED_WEB_DIR = path.join(process.resourcesPath || '', 'curi-web');
const BUNDLED_WEB_SERVER = path.join(BUNDLED_WEB_DIR, 'server.js');

// In packaged mode this becomes http://127.0.0.1:<port> once the bundled
// server is up; in dev mode it stays STUDIO_URL. Menu actions use
// getStudioUrl() so they point at whichever server is actually serving.
let bundledBaseUrl = null;
let bundledServer = null;

function getStudioUrl() {
  return bundledBaseUrl ? `${bundledBaseUrl}/studio` : STUDIO_URL;
}
function getLearnerUrl() {
  return bundledBaseUrl || STUDIO_URL.replace(/\/studio\/?$/, '') || 'http://localhost:3100';
}

// Pick a free localhost port for the bundled server (probe with a
// throwaway listener, then release it — the spawn follows immediately).
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(`${baseUrl}/studio`, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => {
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

// Spawn the bundled Next.js standalone server using the Electron binary
// itself as Node (ELECTRON_RUN_AS_NODE=1). Verified on this VM: the
// Electron binary serves /studio with HTTP 200 from resources/curi-web.
// Returns the base URL once the port responds, or null on failure.
async function startBundledServer() {
  if (!fs.existsSync(BUNDLED_WEB_SERVER)) {
    console.error(`[curi-creator] bundled web server not found: ${BUNDLED_WEB_SERVER}`);
    return null;
  }
  let port;
  try {
    port = await pickFreePort();
  } catch (e) {
    console.error(`[curi-creator] could not pick a free port: ${e.message}`);
    return null;
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  bundledServer = spawn(process.execPath, [BUNDLED_WEB_SERVER], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
  });
  bundledServer.stdout.on('data', (d) => console.log(`[bundled-web] ${d.toString().trim()}`));
  bundledServer.stderr.on('data', (d) => console.error(`[bundled-web] ${d.toString().trim()}`));
  bundledServer.on('error', (err) => {
    console.error(`[curi-creator] bundled server failed to start: ${err.message}`);
  });
  const up = await waitForServer(baseUrl);
  if (!up) {
    console.error(`[curi-creator] bundled server did not respond on ${baseUrl} within 30s`);
    stopBundledServer();
    return null;
  }
  console.log(`[curi-creator] bundled web server up at ${baseUrl}`);
  return baseUrl;
}

function stopBundledServer() {
  if (!bundledServer) return;
  const child = bundledServer;
  bundledServer = null;
  try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { /* not a group leader */ }
  try { child.kill('SIGTERM'); } catch (_) { /* already gone */ }
  setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* already gone */ } }, 3000);
}

let mainWindow = null;
let captionsWindow = null;
let captureWindow = null;

async function createMainWindow() {
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

  if (app.isPackaged) {
    // Packaged mode: run the bundled Next.js standalone server (no dev
    // server needed) and load Studio from it. Only if the bundle is
    // missing or the server fails to start do we fall back to the
    // explanation page — that is a genuine failure path now, not the
    // normal packaged behaviour. See README.md, "Packaged mode".
    bundledBaseUrl = await startBundledServer();
    if (bundledBaseUrl) {
      mainWindow.loadURL(`${bundledBaseUrl}/studio`);
    } else {
      mainWindow.loadFile(path.join(__dirname, 'packaged-not-bundled.html'));
    }
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
    // Taller in demo mode so the drafts section is visible in the capture.
    height: process.env.CURI_CAPTIONS_DEMO_FILE ? 1180 : 720,
    title: 'Curi Creator — Local Captions & AI Drafts',
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
  // Verification hook only (env-gated, never in normal use): when
  // CURI_CAPTIONS_DEMO_FILE is set, drive the real captions UI flow
  // (transcribe -> drafts) for that file, then capture the drafts UI
  // to CURI_CAPTIONS_SCREENSHOT_PATH if set. This is how the Step 2
  // UI was screenshotted on a headless Linux VM (under xvfb).
  captionsWindow.webContents.on('did-finish-load', async () => {
    const demoFile = process.env.CURI_CAPTIONS_DEMO_FILE;
    if (!demoFile) return;
    try {
      const outcome = await captionsWindow.webContents.executeJavaScript(
        `window.curiCaptions && window.curiCaptions.demo(${JSON.stringify(demoFile)})`,
      );
      console.log(`[curi-creator] captions demo: ${outcome}`);
      // Prove the UI state independently of the pixels: report what
      // the textareas actually contain after the flow.
      const state = await captionsWindow.webContents.executeJavaScript(
        `({ vttChars: document.getElementById('vtt').value.length, ` +
        `notesChars: document.getElementById('notes-md').value.length, ` +
        `quizChars: document.getElementById('quiz-json').value.length, ` +
        `draftsStatus: document.getElementById('drafts-status').textContent })`,
      );
      console.log(`[curi-creator] captions demo UI state: ${JSON.stringify(state)}`);
      // Let the compositor present the final frame (headless xvfb can
      // otherwise capture a stale frame), scroll the drafts into view.
      await new Promise((r) => setTimeout(r, 3000));
      await captionsWindow.webContents.executeJavaScript(
        `document.getElementById('drafts-section').scrollIntoView(); 'scrolled'`,
      );
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[curi-creator] captions demo failed: ${e.message}`);
    }
    const shotPath = process.env.CURI_CAPTIONS_SCREENSHOT_PATH;
    if (shotPath) {
      try {
        const image = await captionsWindow.webContents.capturePage();
        fs.writeFileSync(shotPath, image.toPNG());
        console.log(`[curi-creator] captions screenshot saved to ${shotPath}`);
      } catch (e) {
        console.error(`[curi-creator] captions screenshot failed: ${e.message}`);
      }
    }
  });
  return captionsWindow;
}

function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.focus();
    return captureWindow;
  }
  captureWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    title: 'Curi Creator — Record Screen + Camera',
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  captureWindow.loadFile(path.join(__dirname, 'capture.html'));
  captureWindow.on('closed', () => { captureWindow = null; });
  // Verification hook only (env-gated, never in normal use): when
  // CURI_CAPTURE_DEMO_MS is set, drive a real screen-only capture
  // headlessly, then capture the Capture UI to
  // CURI_CAPTURE_SCREENSHOT_PATH if set. This is how Step 3 was
  // verified on a headless Linux VM (under xvfb).
  captureWindow.webContents.on('did-finish-load', async () => {
    const demoMs = process.env.CURI_CAPTURE_DEMO_MS;
    if (!demoMs) return;
    try {
      const outcome = await captureWindow.webContents.executeJavaScript(
        `window.curiCapture && window.curiCapture.demo(${JSON.stringify(Number(demoMs) || 5000)})`,
      );
      console.log(`[curi-creator] capture demo: ${outcome}`);
      const state = await captureWindow.webContents.executeJavaScript(
        `window.curiCapture ? window.curiCapture.state() : null`,
      );
      console.log(`[curi-creator] capture demo state: ${JSON.stringify(state)}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`[curi-creator] capture demo failed: ${e.message}`);
    }
    const shotPath = process.env.CURI_CAPTURE_SCREENSHOT_PATH;
    if (shotPath) {
      try {
        const image = await captureWindow.webContents.capturePage();
        fs.writeFileSync(shotPath, image.toPNG());
        console.log(`[curi-creator] capture screenshot saved to ${shotPath}`);
      } catch (e) {
        console.error(`[curi-creator] capture screenshot failed: ${e.message}`);
      }
    }
  });
  return captureWindow;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Record Screen + Camera…',
          accelerator: 'CmdOrCtrl+R',
          click: () => createCaptureWindow(),
        },
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
          label: 'Record Screen + Camera…',
          click: () => createCaptureWindow(),
        },
        {
          label: 'Open Curi Studio (creator)',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(getStudioUrl());
          },
        },
        {
          // Same Next.js app, learner routes — not a second app.
          // The shell loads both route groups from ~/workspace/curi:
          // /studio/* for creators and / + /courses/* for learners.
          label: 'Open Learner Home (student)',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(`${getLearnerUrl()}/`);
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
              detail: 'Desktop creator app for Curi. Studio + OBS-file import + local Whisper captions + local AI drafts (notes, chapters, quiz) + in-app screen/camera capture. See README.md in curi-desktop for what is and is not verified.',
            });
          },
        },
        {
          label: 'Open Curi Studio in Browser',
          click: () => shell.openExternal(getStudioUrl()),
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

// --- AI drafts IPC (Step 2) -------------------------------------------
// Renderer -> main: 'curi:generate-drafts' takes a transcript object
//   { segments: [{start, end, text}], text }
// (the shape the transcribe handler returns) and returns
//   { ok: true, drafts } or { ok: false, error }.
// Drafts are deterministic and transcript-derived (src/ai-drafts.js):
// no LLM, no cloud, no network. They are returned for the teacher to
// edit and copy into Studio — this handler never writes to Supabase
// or to Studio's store, and nothing is published automatically.
ipcMain.handle('curi:generate-drafts', async (_event, transcript) => {
  try {
    const drafts = generateDrafts(transcript);
    return { ok: true, drafts };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// --- Desktop capture IPC (Step 3) --------------------------------------
// Recordings folder: app.getPath('videos') + 'Curi Creator'
// (~/Videos/Curi Creator on Linux/Mac; Videos\Curi Creator on
// Windows). No user-specific path is hardcoded; the folder is created
// on first save. Renderer -> main:
//   'curi:capture-sources' -> { ok, sources: [{id, name, thumbnail}] }
//   'curi:capture-save' (ArrayBuffer, filename) -> { ok, path, dir, size }
//   'curi:capture-recordings-dir' -> { ok, dir }
//   'curi:capture-open-recording' (path) -> reveals the file in its folder.
function getRecordingsDir() {
  try {
    return path.join(app.getPath('videos'), 'Curi Creator');
  } catch (_) {
    return path.join(app.getPath('userData'), 'Recordings');
  }
}

ipcMain.handle('curi:capture-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return {
      ok: true,
      sources: sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : '' })),
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('curi:capture-recordings-dir', async () => ({ ok: true, dir: getRecordingsDir() }));

ipcMain.handle('curi:capture-save', async (_event, arrayBuffer, filename) => {
  try {
    if (!arrayBuffer) return { ok: false, error: 'No recording data received.' };
    const dir = getRecordingsDir();
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(filename || 'curi-recording.webm').replace(/[^A-Za-z0-9._-]/g, '_');
    const filePath = path.join(dir, safe);
    const buf = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buf);
    return { ok: true, path: filePath, dir, size: buf.length };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('curi:capture-open-recording', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  return { ok: true };
});

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();
  // Verification hook only: CURI_CAPTIONS_DEMO_FILE opens the captions
  // window at startup so the demo hook above can drive it headlessly.
  if (process.env.CURI_CAPTIONS_DEMO_FILE) createCaptionsWindow();
  if (process.env.CURI_CAPTURE_DEMO_MS) createCaptureWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  stopBundledServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => stopBundledServer());
