// Sandboxed Electron preload uses the limited CommonJS electron API.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('RetroSignalDesktop', Object.freeze({
  chooseRomSourceFolder: () => ipcRenderer.invoke('retrosignal:choose-rom-source-folder'),
}));
