// Curi Creator preload — the ONLY bridge between renderer and Node.
// contextIsolation: true and nodeIntegration: false are set in main.js.
// No Node globals, no require(), no filesystem access leak to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('curiCreator', {
  isDesktop: true,
  pickVideo: () => ipcRenderer.invoke('curi:pick-video'),
  transcribe: (filePath) => ipcRenderer.invoke('curi:transcribe', filePath),
});
