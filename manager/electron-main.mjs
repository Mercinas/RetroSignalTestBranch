import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { managerInternals, pairWallpaper, startManager } from "./server.js";

import { createLivelyController } from "./lively-controller.mjs";
import { prepareStandaloneRuntime } from "./player-runtime.mjs";
import { playerSettingsScript } from "./player-settings.mjs";
import { openPlayerWindow } from "./player-lifecycle.mjs";

const lively = createLivelyController();
// Lively CLI exposes setters, but no reliable prior playback-state query.
// Preserve manual pause/stopped state; Lively owns its fullscreen pause policy.

let manager;
let window;
let playerWindow;
let openingPlayer;
async function managerEndpoint() {
  // The desktop app owns a fresh loopback port. This prevents an older
  // background manager from serving stale UI after an upgrade.
  const standaloneRuntimePath = await prepareStandaloneRuntime(
    app.isPackaged ? join(process.resourcesPath, "player-runtime") : fileURLToPath(new URL("../", import.meta.url)),
    managerInternals.defaultDataRoot(),
  );
  manager = await startManager({
    port: 0,
    standaloneRuntimePath,
    openLively: () => lively.open(),
    openPlayer: openStandalonePlayer,
    updatePlayerSettings: updateStandalonePlayerSettings,
    isPlayerOpen: () => Boolean(playerWindow && !playerWindow.isDestroyed()),
  });
  return manager.endpoint;
}

function focusWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

async function updateStandalonePlayerSettings(options = {}) {
  if (!playerWindow || playerWindow.isDestroyed()) return false;
  let timeout;
  try {
    await Promise.race([
      playerWindow.webContents.executeJavaScript(playerSettingsScript(options)),
      new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("The player did not respond to display settings.")), 2000); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  return true;
}

async function openStandalonePlayer(options = {}) {
  const root = await realpath(String(options.wallpaperPath || ""));
  const info = JSON.parse(await readFile(join(root, "LivelyInfo.json"), "utf8"));
  if (info.Title !== managerInternals.applicationIdentity.name || info.FileName !== managerInternals.applicationIdentity.fileName) {
    throw new Error(`Choose the installed ${managerInternals.applicationIdentity.name} wallpaper folder first.`);
  }
  await pairWallpaper(root, manager.endpoint, manager.token);
  if (openingPlayer) await openingPlayer;
  if (playerWindow && !playerWindow.isDestroyed()) {
    if (Object.prototype.hasOwnProperty.call(options, "blur")) {
      await updateStandalonePlayerSettings(options);
    }
    playerWindow.focus();
    return true;
  }
  const url = pathToFileURL(join(root, info.FileName));
  url.searchParams.set("standalone", "1");
  url.searchParams.set("blur", String(Math.max(0, Math.min(4, Number(options.blur) || 0))));
  url.searchParams.set("monochrome", options.monochrome ? "1" : "0");
  openingPlayer = openPlayerWindow({
    create: () => new BrowserWindow({
      width: 1280, height: 900, minWidth: 640, minHeight: 480,
      title: `${managerInternals.applicationIdentity.name} Player`,
      backgroundColor: "#050403", autoHideMenuBar: true, fullscreenable: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    }),
    setup: created => {
      playerWindow = created;
      created.setMenuBarVisibility(false);
      created.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        if (input.key === "F11") {
          created.setFullScreen(!created.isFullScreen());
          event.preventDefault();
        } else if (input.key === "F10") {
          const displays = screen.getAllDisplays();
          if (displays.length > 1) {
            const current = screen.getDisplayMatching(created.getBounds());
            const index = Math.max(0, displays.findIndex(display => display.id === current.id));
            const next = displays[(index + 1) % displays.length];
            created.setFullScreen(false);
            created.setBounds(next.workArea);
            created.setFullScreen(true);
          }
          event.preventDefault();
        }
      });
      created.on("closed", () => {
        if (playerWindow === created) playerWindow = undefined;
      });
    },
    load: created => created.loadURL(url.href),
    configure: () => updateStandalonePlayerSettings(options),
    focus: created => created.focus(),
  });
  try { await openingPlayer; }
  finally { openingPlayer = undefined; }
  return true;
}

async function createWindow() {
  const endpoint = await managerEndpoint();
  window = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 820,
    minHeight: 650,
    title: `${managerInternals.applicationIdentity.name} Manager`,
    backgroundColor: "#0a0711",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: fileURLToPath(new URL("./electron-preload.cjs", import.meta.url)),
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await window.loadURL(`${endpoint}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId("com.mercinas.retrosignal-manager");
  app.on("second-instance", focusWindow);
  app.whenReady().then(async () => {
    ipcMain.handle("retrosignal:choose-rom-source-folder", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "Choose your ROM source folder",
        properties: ["openDirectory"],
      });
      return result.canceled ? "" : result.filePaths[0] || "";
    });
    await createWindow();
  }).catch((error) => {
    dialog.showErrorBox(`${managerInternals.applicationIdentity.name} Manager could not start`, String(error.stack || error));
    app.quit();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (manager?.server.listening) manager.server.close();
  });
}
