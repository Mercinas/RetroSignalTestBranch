import { buildKeyboardControls, DIRECT_INPUTS, localAssetUrl, SYSTEM_BY_ID } from "./systems.js";
import { ManagerSaveBridge } from "./save-bridge.js";
import { flushSaveFileSystem } from "./save-flush.js";

const params = new URLSearchParams(window.location.search);
const instance = Number(params.get("instance"));
const system = SYSTEM_BY_ID.get(params.get("system"));
const romPath = params.get("rom") || "";
const biosPath = params.get("bios") || "";
const volume = Math.max(0, Math.min(1, Number(params.get("volume")) || 0));
const lifecycleOnly = params.get("lifecycle") === "1";
const managerNamespace = system
  ? `${system.id}-${Math.max(0, Number(params.get("gameId")) || 0).toString(16)}`
  : "";
const managerSaveBridge = await ManagerSaveBridge.connect(managerNamespace);
window.RetroSignalSaveBridge = managerSaveBridge;

const nativeCanvasGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getPersistentEmulatorContext(type, attributes) {
  if (typeof type === "string" && type.toLowerCase().startsWith("webgl")) {
    return nativeCanvasGetContext.call(this, type, { ...(attributes || {}), preserveDrawingBuffer: true });
  }
  return nativeCanvasGetContext.call(this, type, attributes);
};

let shuttingDown = false;
let suspendPromise = null;
let autosaveTimer = null;
let startupFailureTimer = null;

function notify(type, extra = {}) {
  window.parent.postMessage({ source: "retrosignal-emulator", instance, type, ...extra }, "*");
}

async function loadKeyboardControls(system) {
  try {
    const response = await fetch(localAssetUrl("keyboard-controls.json"), { cache: "no-store" });
    if (!response.ok) throw new Error("No saved keyboard layout.");
    const config = await response.json();
    return buildKeyboardControls(config?.[system.id]);
  } catch {
    return buildKeyboardControls();
  }
}

window.addEventListener("retrosignal-save-warning", (event) => {
  notify("save-warning", { message: String(event.detail || "The manager could not synchronize a save.") });
});

function ignoredRuntimeRejection(reason) {
  const name = String(reason?.name || "");
  const message = String(reason?.message || reason || "");
  return name === "NotAllowedError" && /wake\s*lock/i.test(message);
}

const hostShortcutKeys = new Set(["F8", "`", "Backquote", "Escape"]);
window.addEventListener("keydown", (event) => {
  if (event.repeat || !hostShortcutKeys.has(event.key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  notify("shortcut", { key: event.key });
}, true);

function emulator() {
  return window.EJS_emulator || null;
}

function releaseInputs() {
  const gameManager = emulator()?.gameManager;
  if (!gameManager?.simulateInput) return;
  for (const input of DIRECT_INPUTS) {
    try {
      gameManager.simulateInput(0, input, 0);
    } catch (error) {
      break;
    }
  }
}

function syncSaveFileSystem() {
  const fileSystem = emulator()?.gameManager?.FS;
  return flushSaveFileSystem(fileSystem, {
    backup: async () => {
      const backedUp = await managerSaveBridge?.backup(fileSystem, emulator()?.gameManager?.savePath || "/data/saves");
      if (backedUp === false && managerSaveBridge.lastBackupFailure) throw new Error(managerSaveBridge.lastBackupFailure);
      return backedUp;
    },
    warn: message => notify("save-warning", { message }),
  });
}

async function suspend() {
  if (suspendPromise) return suspendPromise;
  suspendPromise = (async () => {
    try {
      const current = emulator();
      if (!current) return;
      releaseInputs();
      current.setVolume?.(0);
      current.pause?.(true);
      current.gameManager?.saveSaveFiles?.();
      return await syncSaveFileSystem();
    } finally {
      suspendPromise = null;
    }
  })();
  return suspendPromise;
}

function resume(nextVolume = volume) {
  if (shuttingDown) return;
  const current = emulator();
  const audioContexts = new Set();
  const activeAudioContext = current?.Module?.AL?.currentCtx?.audioCtx;
  if (activeAudioContext) audioContexts.add(activeAudioContext);
  for (const source of current?.Module?.AL?.currentCtx?.sources || []) {
    const context = source?.gain?.context;
    if (context) audioContexts.add(context);
  }
  for (const context of audioContexts) {
    if (context.state === "suspended") void context.resume().catch(() => {});
  }
  current?.play?.(true);
  current?.setVolume?.(Math.max(0, Math.min(1, Number(nextVolume) || 0)));
}

function activate(nextVolume = volume) {
  resume(nextVolume);
  const gameManager = emulator()?.gameManager;
  if (!gameManager?.simulateInput) return;
  try {
    gameManager.simulateInput(0, 3, 1);
    window.setTimeout(() => {
      try {
        gameManager.simulateInput(0, 3, 0);
      } catch (error) {
        // The frame may have been closed during the short input pulse.
      }
    }, 100);
  } catch (error) {
    // Resuming remains useful even when a core does not expose direct input yet.
  }
}

async function shutdown() {
  if (shuttingDown) return;
  if (startupFailureTimer !== null) {
    window.clearInterval(startupFailureTimer);
    startupFailureTimer = null;
  }
  shuttingDown = true;
  if (autosaveTimer !== null) {
    window.clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
  const saveResult = await suspend();
  const current = emulator();
  current?.gamepad?.terminate?.();
  try {
    current?.callEvent?.("exit");
  } catch (error) {
    // The parent removes this complete browsing context after the save flush.
  }
  return saveResult;
}

window.RetroSignalFrame = {
  activate,
  suspend,
  resume,
  shutdown,
  setVolume(nextVolume) {
    emulator()?.setVolume?.(Math.max(0, Math.min(1, Number(nextVolume) || 0)));
  },
};

if (lifecycleOnly) {
  notify("ready");
  notify("started");
} else if (!system || !romPath) {
  notify("error", { code: "invalid-launch", message: "The emulator received an invalid game selection." });
} else {
  window.EJS_player = "#game";
  window.EJS_core = system.core;
  window.EJS_controlScheme = system.controlScheme;
  window.EJS_gameUrl = `${localAssetUrl(romPath)}?retrosignal=${encodeURIComponent(system.id)}`;
  // SAME_CDI looks for cdimono1.zip under its own virtual firmware directory.
  // EmulatorJS's ordinary BIOS loader flattens archive paths, so mount this
  // one archive explicitly before the core starts.
  window.EJS_biosUrl = system.id === "cdi" ? "" : localAssetUrl(biosPath);
  window.EJS_externalFiles = system.id === "cdi" && biosPath
    ? { "/same_cdi/bios/": localAssetUrl(biosPath) }
    : undefined;
  window.EJS_gameName = params.get("gameName") || "game";
  window.EJS_gameID = Number(params.get("gameId"));
  window.EJS_saveNamespace = params.get("saveNamespace") || "";
  window.EJS_pathtodata = "emulatorjs/";
  window.EJS_paths = { "emulator.js": "emulatorjs/src/emulator.js?retrosignal=7" };
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  window.EJS_volume = volume;
  window.EJS_language = "en-US";
  window.EJS_disableAutoLang = true;
  window.EJS_color = "#c98231";
  window.EJS_backgroundColor = "#050403";
  window.EJS_noAutoFocus = true;
  window.EJS_disableLocalStorage = true;
  window.EJS_defaultControls = await loadKeyboardControls(system);
  // Load the bundled readable sources without enabling EmulatorJS debug mode.
  // Debug mode bypasses the ROM, BIOS, and core caches on every launch.
  window.EJS_USE_UNMINIFIED = true;
  window.EJS_DEBUG_XX = false;
  window.EJS_DISABLE_VERSION_CHECK = true;
  window.EJS_Buttons = {
    fullscreen: false,
    screenRecord: false,
    screenshot: false,
    netplay: false,
  };

  window.EJS_ready = () => {
    emulator()?.gamepad?.terminate?.();
    notify("ready");
  };

  window.EJS_onGameStart = () => {
    if (startupFailureTimer !== null) {
      window.clearInterval(startupFailureTimer);
      startupFailureTimer = null;
    }
    emulator()?.gamepad?.terminate?.();
    if (autosaveTimer === null) {
      autosaveTimer = window.setInterval(() => {
        if (shuttingDown || !emulator()) return;
        emulator()?.gameManager?.saveSaveFiles?.();
        void syncSaveFileSystem();
      }, 30000);
    }
    notify("started");
  };

  window.EJS_onExit = () => {
    if (!shuttingDown) notify("exit", { message: "The emulator stopped." });
  };

  window.addEventListener("error", (event) => {
    notify("error", { code: "runtime-error", message: event.message || "The emulator could not start." });
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (ignoredRuntimeRejection(event.reason)) {
      event.preventDefault();
      return;
    }
    const message = typeof event.reason?.message === "string" ? event.reason.message : "The emulator could not start.";
    notify("error", { code: "runtime-error", message });
  });

  // EmulatorJS renders some startup failures internally instead of throwing a
  // window error. Mirror those failures to the wallpaper so it cannot remain
  // on its generic loading screen forever.
  startupFailureTimer = window.setInterval(() => {
    const current = emulator();
    if (!current?.failedToStart) return;
    const message = String(current.textElem?.innerText || "The emulator could not start.").trim();
    window.clearInterval(startupFailureTimer);
    startupFailureTimer = null;
    notify("error", { code: "emulator-start-failed", message });
  }, 250);

  const loader = document.createElement("script");
  loader.src = "emulatorjs/loader.js?retrosignal=7";
  loader.onerror = () => {
    notify("error", { code: "loader-error", message: "The emulator files could not be loaded." });
  };
  document.head.appendChild(loader);
}
