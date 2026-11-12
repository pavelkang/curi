// Curi Creator preload — the ONLY bridge between renderer and Node.
// contextIsolation: true and nodeIntegration: false are set in main.js.
// No Node globals, no require(), no filesystem access leak to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('curiCreator', {
  isDesktop: true,
  pickVideo: () => ipcRenderer.invoke('curi:pick-video'),
  transcribe: (filePath) => ipcRenderer.invoke('curi:transcribe', filePath),
  generateDrafts: (transcript) => ipcRenderer.invoke('curi:generate-drafts', transcript),
  // Desktop capture (Step 3): screen/window sources via desktopCapturer
  // (main only — the renderer cannot require electron), and saving a
  // recorded Blob (sent as an ArrayBuffer) to the Recordings folder.
  getCaptureSources: () => ipcRenderer.invoke('curi:capture-sources'),
  saveRecording: (arrayBuffer, filename) => ipcRenderer.invoke('curi:capture-save', arrayBuffer, filename),
  getRecordingsDir: () => ipcRenderer.invoke('curi:capture-recordings-dir'),
  openRecording: (filePath) => ipcRenderer.invoke('curi:capture-open-recording', filePath),
});
