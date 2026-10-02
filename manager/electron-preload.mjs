import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("RetroSignalDesktop", Object.freeze({
  chooseRomSourceFolder: () => ipcRenderer.invoke("retrosignal:choose-rom-source-folder"),
}));
