/*
 * RetroSignal extends the MIT-licensed music visualizer scene with a local emulator host.
 * EmulatorJS and its bundled cores remain separately licensed components.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EmulatorHost, inspectSystemBios, resourceExists, validateLaunch } from "./emulator-host.js?version=2";
import { isRescanShortcut, KEYBOARD_ACTIONS, keyboardActionFor, KeyboardShortcutGate } from "./keyboard-shortcuts.js";
import { catalogEntryCount, LibraryStore, withoutCatalogEntries } from "./library-store.js";
import { backTargetForSelector, SELECTOR_LEVELS, wrapIndex } from "./navigation.js";
import { WallpaperPlayReporter } from "./play-session-bridge.js";
import { requestManagerLibraryRescan } from "./save-bridge.js";
import {
  DIRECT_INPUTS,
  biosKey,
  displayGameName,
  emptyLibrary,
  INPUT_MAX,
  mergeLibraryEntries,
  normalizeBiosFile,
  normalizeSystemFile,
  SYSTEM_BY_BIOS_PROPERTY,
  SYSTEM_BY_PROPERTY,
  SYSTEMS,
} from "./systems.js";

const SCREEN_WIDTH = 640;
const SCREEN_HEIGHT = 480;
const GAME_SAFE_INSET_X = 42;
const GAME_SAFE_INSET_Y = 34;
const TOGGLE_HOLD_MS = 2000;
const LIBRARY_HOLD_MS = 1200;
const BACKGROUND_RELEASE_MS = 12000;
const GAMEPAD_DEADZONE = 0.14;
const MENU_CHORD = [4, 5, 3];
const GAME_CAMERA_OFFSET = -1;
const MAX_PIXEL_RATIO = 1;
const DIAGNOSTIC_INTERVAL_MS = 1000;
const STATIC_SCENE_FPS = 15;
const MANAGED_LIBRARY_POLL_MS = 2000;
const runtimeParameters = new URLSearchParams(window.location.search);
const standaloneMode = runtimeParameters.get("standalone") === "1";
const standaloneBlur = Math.max(0, Math.min(6, Number(runtimeParameters.get("blur")) || 0));
const standaloneMonochrome = runtimeParameters.get("monochrome") === "1";

const artistCanvas = document.createElement("canvas");
artistCanvas.width = SCREEN_WIDTH;
artistCanvas.height = SCREEN_HEIGHT;
const artistContext = artistCanvas.getContext("2d", { alpha: false });

const visualizerCanvas = document.createElement("canvas");
visualizerCanvas.width = SCREEN_WIDTH;
visualizerCanvas.height = SCREEN_HEIGHT;
const visualizerContext = visualizerCanvas.getContext("2d");

const gameCanvas = document.createElement("canvas");
gameCanvas.width = SCREEN_WIDTH;
gameCanvas.height = SCREEN_HEIGHT;
const gameContext = gameCanvas.getContext("2d", { alpha: false });
const scanlineCanvas = document.createElement("canvas");
scanlineCanvas.width = 1;
scanlineCanvas.height = 4;
const scanlineContext = scanlineCanvas.getContext("2d");
scanlineContext.fillStyle = "rgba(0, 0, 0, 0.10)";
scanlineContext.fillRect(0, 0, 1, 1);
const scanlinePattern = gameContext.createPattern(scanlineCanvas, "repeat");

const noSignalVideo = document.createElement("video");
noSignalVideo.src = "textures/no_signal.webm";
noSignalVideo.preload = "none";
noSignalVideo.muted = true;
noSignalVideo.loop = true;
noSignalVideo.playsInline = true;

let gameCanvasDirty = true;
const nonvisualGameCanvasState = new Set(["gamepads", "pageFocused", "pageVisible", "livelyPaused"]);
const state = new Proxy({
  fps: 30,
  noSignal: true,
  controllerMode: false,
  controllerShortcut: true,
  rescanShortcut: 0,
  showSetup: false,
  guideVisible: false,
  guidePage: 0,
  storageVisible: false,
  setupComplete: false,
  legacyManifestImported: false,
  selectedSystemIndex: 0,
  selectedGameIndex: 0,
  selectorLevel: SELECTOR_LEVELS.systems,
  library: emptyLibrary(),
  libraryReady: false,
  missingGames: new Set(),
  catalogStatus: "CHECKING GAME LIBRARY",
  storageDiagnostic: {
    available: false,
    readWriteVerifiedThisLoad: false,
    foundEarlierLoad: false,
    foundEarlierWebView: false,
    browserPersisted: null,
    usage: null,
    quota: null,
    previousSavedAt: "",
    loads: 0,
    error: "Not checked yet.",
  },
  bios: {},
  biosStatus: { ok: true, code: "not-required", message: "No BIOS is required." },
  gameVolume: 0.65,
  crtBlur: standaloneBlur,
  crtMonochrome: standaloneMonochrome,
  cameraZoom: 0,
  emulatorLoading: false,
  emulatorReady: false,
  sceneReady: false,
  gameStarted: false,
  gameStatus: "SELECT A SYSTEM",
  errorCode: "",
  activeGame: null,
  view: "selector",
  gamepads: [],
  gamepadSignature: "",
  pageFocused: false,
  pageVisible: !document.hidden,
  livelyPaused: false,
  toast: "",
  toastUntil: 0,
  standaloneNoticeUntil: standaloneMode ? performance.now() + 4000 : 0,
  songTitle: "",
  songArtist: "",
  albumColor: [225, 225, 225],
}, {
  set(target, property, value) {
    const changed = target[property] !== value;
    const result = Reflect.set(target, property, value);
    if (changed && !nonvisualGameCanvasState.has(property)) gameCanvasDirty = true;
    return result;
  },
});

const previewParameters = runtimeParameters;
const previewMode = previewParameters.get("preview");
const diagnosticsEnabled = previewParameters.get("diagnostics") === "1";
if (previewParameters.get("fps") === "60") state.fps = 60;
if (standaloneMode) state.controllerMode = true;
if (standaloneMode && standaloneMonochrome) document.documentElement.style.filter = "grayscale(1)";
if (previewMode === "selector") state.controllerMode = true;
if (previewMode === "setup") {
  state.controllerMode = true;
  state.showSetup = true;
}
if (previewMode === "storage") state.storageVisible = true;

let camera;
let cameraContainer;
let scene;
let renderer;
let artistTexture;
let visualizerTexture;
let gameTexture;
let artistMaterial;
let gameMaterial;
let screenArtist;
let screenVisualizer;
let noSignalScreen;
let renderRequestId = null;
let lastRenderAt = 0;
let renderBudget = 0;
let backgroundReleaseId = null;
let toggleStartedAt = 0;
let toggleLatched = false;
let libraryStartedAt = 0;
let libraryLatched = false;
let directInputWasActive = false;
let initialGameActivationPending = false;
let lifecycleToken = 0;
let playbackToken = 0;
let previousUiButtons = [];
let renderedFrameCount = 0;
let gameCanvasDrawCount = 0;
let lastDiagnosticAt = -DIAGNOSTIC_INTERVAL_MS;
let signalVideoActive = false;
let lastAudioDrawAt = 0;
let managedLibraryWatchId = null;
let managedLibraryCheckPromise = null;
let managedLibrarySnapshot = null;
const directInputValues = new Map();
const pendingCatalogSelections = new Map();
const libraryStore = new LibraryStore(window);
const diagnosticsOutput = diagnosticsEnabled ? document.createElement("output") : null;
if (diagnosticsOutput) {
  diagnosticsOutput.id = "retrosignal-diagnostics";
  diagnosticsOutput.hidden = true;
  diagnosticsOutput.setAttribute("aria-hidden", "true");
  document.body.appendChild(diagnosticsOutput);
}

const nativeGetGamepads = navigator.getGamepads
  ? navigator.getGamepads.bind(navigator)
  : navigator.webkitGetGamepads
    ? navigator.webkitGetGamepads.bind(navigator)
    : null;

const emulatorHost = new EmulatorHost(document.getElementById("emulator-shell"), handleEmulatorEvent);
const keyboardShortcutGate = new KeyboardShortcutGate();
const wallpaperPlayReporter = standaloneMode || typeof globalThis.crypto?.randomUUID !== "function" ? null : new WallpaperPlayReporter(() => {
  try {
    const emulator = emulatorHost.emulator;
    return shouldRunEmulator() && emulator?.started === true && emulator?.paused === false && !emulator.failedToStart;
  } catch { return false; }
});
wallpaperPlayReporter?.start();

function selectedSystem() {
  return SYSTEMS[state.selectedSystemIndex] || SYSTEMS[0];
}

function selectedGames() {
  return (state.library[selectedSystem().id] || []).filter((path) => !state.missingGames.has(path));
}

function selectedGame() {
  const games = selectedGames();
  if (games.length === 0) return "";
  const index = Math.max(0, Math.min(state.selectedGameIndex, games.length - 1));
  state.selectedGameIndex = index;
  return games[index];
}

function crtOverlayVisible() {
  return state.guideVisible || state.storageVisible || state.showSetup;
}

function preferenceSnapshot() {
  const selectedGamesBySystem = {};
  for (const system of SYSTEMS) {
    const games = state.library[system.id] || [];
    selectedGamesBySystem[system.id] = system.id === selectedSystem().id ? selectedGame() : games[0] || "";
  }
  return {
    setupComplete: state.setupComplete,
    legacyManifestImported: state.legacyManifestImported,
    bios: { ...state.bios },
    selection: {
      systemId: selectedSystem().id,
      games: selectedGamesBySystem,
    },
  };
}

function noteStorageFailure(error) {
  state.storageDiagnostic = {
    ...state.storageDiagnostic,
    available: false,
    readWriteVerifiedThisLoad: false,
    error: error?.message || "Browser storage is unavailable.",
  };
}

async function persistCatalog() {
  if (!state.libraryReady) return;
  try {
    await libraryStore.saveCatalog(state.library);
  } catch (error) {
    noteStorageFailure(error);
  }
}

async function persistPreferences() {
  if (!state.libraryReady) return;
  try {
    await libraryStore.savePreferences(preferenceSnapshot());
  } catch (error) {
    noteStorageFailure(error);
  }
}

function rememberCatalogSelection(system, romPath, select = true) {
  if (!romPath) return;
  if (!state.libraryReady) {
    if (!pendingCatalogSelections.has(system.id)) pendingCatalogSelections.set(system.id, new Set());
    pendingCatalogSelections.get(system.id).add(romPath);
  }
  mergeLibraryEntries(state.library, system, [romPath]);
  state.missingGames.delete(romPath);
  if (select && state.selectedSystemIndex === SYSTEMS.indexOf(system)) {
    state.selectedGameIndex = state.library[system.id].indexOf(romPath);
  }
  state.catalogStatus = `${catalogEntryCount(state.library)} GAME${catalogEntryCount(state.library) === 1 ? "" : "S"} CATALOGED`;
  if (state.libraryReady) {
    runInBackground(persistCatalog(), "persistCatalog");
    runInBackground(persistPreferences(), "persistPreferences");
  }
}

function biosPathFor(system) {
  return system?.biosRequired ? state.bios[biosKey(system)] || "" : "";
}

async function refreshBiosStatus(system = selectedSystem(), showToast = false) {
  state.biosStatus = system.biosRequired
    ? await inspectSystemBios(system, biosPathFor(system))
    : { ok: true, code: "not-required", message: "No BIOS is required." };
  if (showToast && state.biosStatus.ok && system.biosRequired) {
    setToast(`${system.shortName} BIOS FOUND · BOOT NOT YET VERIFIED`, 3000);
  } else if (showToast && biosPathFor(system)) {
    setToast(state.biosStatus.message.toUpperCase(), 3600);
  }
  updateDiagnostics();
}

async function initializeLibraryStore() {
  try {
    const restored = await libraryStore.initialize();
    const nextLibrary = restored.catalog;
    for (const system of SYSTEMS) {
      mergeLibraryEntries(nextLibrary, system, Array.from(pendingCatalogSelections.get(system.id) || []));
    }
    state.library = nextLibrary;
    state.storageDiagnostic = restored.diagnostic;
    state.setupComplete = Boolean(restored.preferences.setupComplete);
    state.legacyManifestImported = Boolean(restored.preferences.legacyManifestImported);
    state.bios = { ...(restored.preferences.bios || {}), ...state.bios };

    const systemIndex = SYSTEMS.findIndex((system) => system.id === restored.preferences.selection?.systemId);
    if (systemIndex >= 0) state.selectedSystemIndex = systemIndex;
    const preferredGame = restored.preferences.selection?.games?.[selectedSystem().id] || "";
    const preferredIndex = selectedGames().indexOf(preferredGame);
    if (preferredIndex >= 0) state.selectedGameIndex = preferredIndex;

    await importManagedManifest();
    state.libraryReady = true;
    state.catalogStatus = `${catalogEntryCount(state.library)} GAME${catalogEntryCount(state.library) === 1 ? "" : "S"} CATALOGED`;
    state.setupComplete = true;
    await Promise.all([persistCatalog(), persistPreferences()]);
  } catch (error) {
    state.libraryReady = true;
    noteStorageFailure(error);
    state.catalogStatus = "CATALOG IS CURRENT-SESSION ONLY";
    if (!previewMode) state.guideVisible = true;
  }
  pendingCatalogSelections.clear();
  await refreshBiosStatus();
  await rescanLibrary(false);
  startManagedLibraryWatcher();
  updateOverlayVisibility();
}

function initScene() {
  const container = document.getElementById("container");

  if (standaloneMode) {
    document.body.classList.add("standalone-player");
    gameCanvas.id = "standalone-game-screen";
    container.appendChild(gameCanvas);
    state.sceneReady = true;
    return;
  }

  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    stencil: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(52.5, window.innerWidth / window.innerHeight, 0.25, 1000);
  camera.position.set(0, 0, 12.4);
  camera.lookAt(0, 0, -0.1);
  cameraContainer = new THREE.Object3D();
  cameraContainer.add(camera);
  cameraContainer.rotation.x = THREE.MathUtils.degToRad(10);

  scene = new THREE.Scene();
  scene.add(cameraContainer);
  scene.environment = new RGBELoader().load("textures/colorful_studio_1k.hdr?retrosignal=3");
  scene.environment.mapping = THREE.EquirectangularReflectionMapping;

  const loader = new GLTFLoader();
  loader.load(
    "models/screen_low.glb?retrosignal=5",
    (gltf) => {
      gltf.scene.scale.set(0.01, 0.01, 0.01);
      gltf.scene.rotation.y = THREE.MathUtils.degToRad(-30);
      gltf.scene.position.set(0, -5, -6);

      artistTexture = makeCanvasTexture(artistCanvas, false);
      artistMaterial = new THREE.MeshBasicMaterial({ map: artistTexture, transparent: false });
      gameTexture = makeCanvasTexture(gameCanvas, false);
      gameMaterial = new THREE.MeshBasicMaterial({ map: gameTexture, transparent: false });
      visualizerTexture = makeCanvasTexture(visualizerCanvas, true);
      const visualizerMaterial = new THREE.MeshBasicMaterial({ map: visualizerTexture, transparent: true });

      screenArtist = gltf.scene.children[0].getObjectByName("SCREEN");
      screenVisualizer = screenArtist.clone(false);
      screenArtist.getWorldPosition(screenVisualizer.position);
      screenArtist.getWorldQuaternion(screenVisualizer.quaternion);
      screenVisualizer.position.z += 0.001;
      screenVisualizer.material = visualizerMaterial;

      const videoTexture = new THREE.VideoTexture(noSignalVideo);
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.minFilter = THREE.NearestFilter;
      videoTexture.magFilter = THREE.NearestFilter;
      videoTexture.generateMipmaps = false;
      videoTexture.flipY = false;
      const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, transparent: false });
      videoMaterial.map.offset.set(0, -0.12);

      noSignalScreen = screenArtist.clone(false);
      screenArtist.getWorldPosition(noSignalScreen.position);
      screenArtist.getWorldQuaternion(noSignalScreen.quaternion);
      noSignalScreen.position.z += 0.002;
      noSignalScreen.material = videoMaterial;

      scene.add(gltf.scene);
      scene.add(screenVisualizer);
      scene.add(noSignalScreen);
      state.sceneReady = true;
      syncScreenMode();
    },
    undefined,
    () => setGameError("scene-error", "The television scene could not be loaded."),
  );

  window.addEventListener("resize", onWindowResize);
}

function makeCanvasTexture(canvas, transparent) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.flipY = false;
  texture.premultiplyAlpha = transparent;
  return texture;
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function syncCameraZoom() {
  if (!cameraContainer) return;
  const gameScreenVisible = state.controllerMode || crtOverlayVisible();
  cameraContainer.position.z = state.cameraZoom + (gameScreenVisible ? GAME_CAMERA_OFFSET : 0);
}

function effectiveRenderFps() {
  const activeGame = state.controllerMode && state.view === "playing" && state.gameStarted;
  const activeVisualizer = !state.controllerMode && !crtOverlayVisible() && !state.noSignal;
  return activeGame || activeVisualizer ? state.fps : Math.min(state.fps, STATIC_SCENE_FPS);
}

function updateDiagnostics(renderTimestamp = lastRenderAt, force = true) {
  if (!diagnosticsOutput) return;
  if (!force && renderTimestamp - lastDiagnosticAt < DIAGNOSTIC_INTERVAL_MS) return;
  lastDiagnosticAt = renderTimestamp;
  const emulatorResources = emulatorHost.diagnostics();
  diagnosticsOutput.textContent = JSON.stringify({
    ready: true,
    sceneReady: state.sceneReady,
    renderedFrames: renderedFrameCount,
    gameCanvasDraws: gameCanvasDrawCount,
    renderTimestamp: Math.round(renderTimestamp),
    emulatorFrames: emulatorResources.frameCount,
    emulatorFramesCreated: emulatorResources.framesCreated,
    emulatorFramesRemoved: emulatorResources.framesRemoved,
    activeAudioContexts: emulatorResources.audioContextCount,
    activeAudioSources: emulatorResources.audioSourceCount,
    emulatorApiAvailable: emulatorResources.frameApiAvailable,
    emulatorCanvasWidth: emulatorResources.canvasWidth,
    emulatorCanvasHeight: emulatorResources.canvasHeight,
    preserveDrawingBuffer: emulatorResources.preserveDrawingBuffer,
    emulatorNonBlackSamples: emulatorResources.nonBlackPixelSamples,
    coreFrameNumber: emulatorResources.coreFrameNumber,
    pendingKnownTimers:
      emulatorResources.pendingStartTimers + (backgroundReleaseId === null ? 0 : 1),
    pendingRoomAnimationFrames: renderRequestId === null ? 0 : 1,
    knownMessageListeners: emulatorResources.messageListeners,
    controllerMode: state.controllerMode,
    view: state.view,
    gameStarted: state.gameStarted,
    emulatorLoading: state.emulatorLoading,
    gameStatus: state.gameStatus,
    errorCode: state.errorCode,
    overlayVisible: crtOverlayVisible(),
    activeSystem: state.activeGame?.system.id || "",
    selectedSystem: selectedSystem().id,
    selectedGame: (state.library[selectedSystem().id] || [])[state.selectedGameIndex] || "",
    catalogEntries: catalogEntryCount(state.library),
    missingCatalogEntries: state.missingGames.size,
    storage: state.storageDiagnostic,
    fpsTarget: state.fps,
    effectiveFpsTarget: effectiveRenderFps(),
    pageVisible: state.pageVisible,
    livelyPaused: state.livelyPaused,
  });
}

function queueRenderFrame() {
  if (!state.pageVisible || state.livelyPaused || renderRequestId !== null) return;
  renderRequestId = window.requestAnimationFrame(render);
}

function startRenderLoop() {
  queueRenderFrame();
}

function stopRenderLoop() {
  if (renderRequestId !== null) {
    window.cancelAnimationFrame(renderRequestId);
    renderRequestId = null;
  }
  lastRenderAt = 0;
  renderBudget = 0;
}

function render(now) {
  renderRequestId = null;
  if (!state.pageVisible || state.livelyPaused) return;
  const frameInterval = 1000 / effectiveRenderFps();
  renderBudget += lastRenderAt ? Math.min(250, now - lastRenderAt) : frameInterval;
  lastRenderAt = now;
  if (renderBudget < frameInterval) {
    queueRenderFrame();
    return;
  }
  renderBudget %= frameInterval;
  renderedFrameCount += 1;
  monitorGamepads();
  routeXboxInputDirectly();
  monitorControllerShortcut(now);
  monitorLibraryShortcut(now);
  monitorSelectorInput();

  if (state.toast && now >= state.toastUntil) {
    state.toast = "";
    state.toastUntil = 0;
  }
  const activeGameFrame = state.controllerMode && state.view === "playing" && state.gameStarted;
  if ((state.controllerMode || crtOverlayVisible()) && (activeGameFrame || gameCanvasDirty)) {
    gameCanvasDirty = false;
    drawGameFrame(now);
    gameCanvasDrawCount += 1;
    if (gameTexture) gameTexture.needsUpdate = true;
  }

  syncSignalVideo();
  renderer?.render(scene, camera);
  queueRenderFrame();
  updateDiagnostics(now, false);
}

function syncScreenMode() {
  if (!screenArtist) return;
  const gameScreenVisible = state.controllerMode || crtOverlayVisible();
  screenArtist.material = gameScreenVisible ? gameMaterial : artistMaterial;
  if (screenVisualizer) screenVisualizer.visible = !gameScreenVisible;
  syncCameraZoom();
  syncSignalVideo();
}

function syncSignalVideo() {
  if (!noSignalScreen) return;
  const visible = !state.controllerMode && !crtOverlayVisible() && state.noSignal && state.pageVisible && !state.livelyPaused;
  noSignalScreen.visible = visible;
  if (screenArtist) screenArtist.visible = !visible;
  if (screenVisualizer) screenVisualizer.visible = !visible && !state.controllerMode && !crtOverlayVisible();
  if (visible === signalVideoActive) return;
  signalVideoActive = visible;
  if (visible) noSignalVideo.play().catch(() => {});
  else noSignalVideo.pause();
}

function drawGameFrame(now) {
  gameContext.fillStyle = "#050403";
  gameContext.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  if (state.storageVisible) {
    drawStorageDiagnostic();
  } else if (state.guideVisible) {
    drawFirstRunGuide();
  } else if (state.showSetup) {
    drawControllerSetup();
  } else if (state.view === "selector") {
    drawSelector();
  } else {
    const source = emulatorHost.canvas;
    if (source && state.gameStarted) {
      drawContained(
        source,
        gameContext,
        GAME_SAFE_INSET_X,
        GAME_SAFE_INSET_Y,
        SCREEN_WIDTH - GAME_SAFE_INSET_X * 2,
        SCREEN_HEIGHT - GAME_SAFE_INSET_Y * 2,
      );
      if (state.gamepads.length === 0 && (!standaloneMode || now < state.standaloneNoticeUntil)) drawControllerNotice();
    } else {
      drawGameStatus();
    }
  }

  drawScanlines();
  if (state.toast && now < state.toastUntil) drawToast(state.toast);
}

function drawScanlines() {
  if (!scanlinePattern) return;
  gameContext.fillStyle = scanlinePattern;
  gameContext.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

function drawToast(message) {
  gameContext.fillStyle = "rgba(8, 6, 3, 0.90)";
  gameContext.fillRect(30, 24, SCREEN_WIDTH - 60, 52);
  gameContext.strokeStyle = "#d99843";
  gameContext.lineWidth = 2;
  gameContext.strokeRect(30, 24, SCREEN_WIDTH - 60, 52);
  gameContext.fillStyle = "#ffd79a";
  gameContext.font = "bold 22px Consolas, monospace";
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillText(message, SCREEN_WIDTH / 2, 50, SCREEN_WIDTH - 80);
}

function drawSelector() {
  if (state.selectorLevel === SELECTOR_LEVELS.games) drawGameSelector();
  else drawSystemSelector();
}

function drawSelectorHeading(kicker, title) {
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillStyle = "#c98231";
  gameContext.font = "bold 15px Consolas, monospace";
  gameContext.fillText(kicker, SCREEN_WIDTH / 2, 42);
  gameContext.fillStyle = "#ffd79a";
  gameContext.font = "bold 29px Consolas, monospace";
  gameContext.fillText(title, SCREEN_WIDTH / 2, 76, 570);
}

function drawListRow(label, index, selected, y, detail = "") {
  if (selected) {
    gameContext.fillStyle = "#c98231";
    gameContext.fillRect(68, y - 18, 504, 31);
  }
  gameContext.textAlign = "left";
  gameContext.textBaseline = "middle";
  gameContext.fillStyle = selected ? "#130d07" : "#d9c7aa";
  gameContext.font = `${selected ? "bold " : ""}17px Consolas, monospace`;
  gameContext.fillText(`${String(index + 1).padStart(2, "0")}  ${label}`, 82, y, 350);
  if (detail) {
    gameContext.textAlign = "right";
    gameContext.font = "13px Consolas, monospace";
    gameContext.fillText(detail, 554, y);
  }
}

function visibleListStart(index, count, visibleCount) {
  return Math.max(0, Math.min(Math.max(0, count - visibleCount), index - Math.floor(visibleCount / 2)));
}

function drawSystemSelector() {
  drawSelectorHeading("SYSTEM SELECT", "CHOOSE AN EMULATOR");
  gameContext.strokeStyle = "#8e5e2c";
  gameContext.lineWidth = 2;
  gameContext.strokeRect(58, 96, 524, 260);
  const visibleCount = 7;
  const start = visibleListStart(state.selectedSystemIndex, SYSTEMS.length, visibleCount);
  for (let offset = 0; offset < Math.min(visibleCount, SYSTEMS.length); offset += 1) {
    const index = start + offset;
    const system = SYSTEMS[index];
    drawListRow(system.name.toUpperCase(), index, index === state.selectedSystemIndex, 124 + offset * 31, `${system.core}`);
  }
  gameContext.textAlign = "center";
  gameContext.fillStyle = "#8e7a60";
  gameContext.font = "13px Consolas, monospace";
  gameContext.fillText(`${SYSTEMS.length} CONFIGURED SYSTEMS · ${state.catalogStatus}`, SCREEN_WIDTH / 2, 382, 520);
  gameContext.fillStyle = "#d9c7aa";
  gameContext.font = "16px Consolas, monospace";
  gameContext.fillText("ARROWS: SYSTEMS    ENTER / TAB: GAMES", SCREEN_WIDTH / 2, 414);
  gameContext.fillStyle = "#ffd79a";
  gameContext.font = "bold 16px Consolas, monospace";
  gameContext.fillText("F8: GAME MODE    ESC: EXIT", SCREEN_WIDTH / 2, 442);
}

function drawGameSelector() {
  const system = selectedSystem();
  const games = selectedGames();
  const game = selectedGame();
  drawSelectorHeading("GAME SELECT", system.name.toUpperCase());
  gameContext.strokeStyle = "#8e5e2c";
  gameContext.lineWidth = 2;
  gameContext.strokeRect(58, 96, 524, 260);
  if (games.length === 0) {
    gameContext.textAlign = "center";
    gameContext.fillStyle = "#e0a354";
    gameContext.font = "bold 25px Consolas, monospace";
    gameContext.fillText("NO COMPATIBLE GAMES", SCREEN_WIDTH / 2, 180);
    gameContext.fillStyle = "#d9c7aa";
    gameContext.font = "16px Consolas, monospace";
    gameContext.fillText("IMPORT A SUPPORTED FILE TO THIS SYSTEM", SCREEN_WIDTH / 2, 222, 490);
    gameContext.fillStyle = "#8e7a60";
    gameContext.font = "13px Consolas, monospace";
    gameContext.fillText(system.extensions.map((extension) => `.${extension}`).join("  ").toUpperCase(), SCREEN_WIDTH / 2, 260, 500);
  } else {
    const visibleCount = 7;
    const start = visibleListStart(state.selectedGameIndex, games.length, visibleCount);
    for (let offset = 0; offset < Math.min(visibleCount, games.length); offset += 1) {
      const index = start + offset;
      const path = games[index];
      drawListRow(displayGameName(path).toUpperCase(), index, index === state.selectedGameIndex, 124 + offset * 31, state.missingGames.has(path) ? "MISSING" : "READY");
    }
  }
  gameContext.textAlign = "center";
  gameContext.fillStyle = state.missingGames.size ? "#e6a05a" : "#8e7a60";
  gameContext.font = "13px Consolas, monospace";
  gameContext.fillText(games.length ? `GAME ${state.selectedGameIndex + 1} OF ${games.length} · ${state.catalogStatus}` : state.catalogStatus, SCREEN_WIDTH / 2, 382, 520);
  gameContext.fillStyle = "#d9c7aa";
  gameContext.font = "16px Consolas, monospace";
  gameContext.fillText("ARROWS: GAMES    ENTER / TAB: START", SCREEN_WIDTH / 2, 414);
  gameContext.fillStyle = game ? "#ffd79a" : "#8e7a60";
  gameContext.font = "bold 16px Consolas, monospace";
  gameContext.fillText("ESC: SYSTEMS    F8: EXIT", SCREEN_WIDTH / 2, 442);
}

function drawSetupHeading(kicker, title) {
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillStyle = "#c98231";
  gameContext.font = "bold 15px Consolas, monospace";
  gameContext.fillText(kicker, SCREEN_WIDTH / 2, 52);
  gameContext.fillStyle = "#ffd79a";
  gameContext.font = "bold 29px Consolas, monospace";
  gameContext.fillText(title, SCREEN_WIDTH / 2, 88, 560);
  gameContext.strokeStyle = "#8e5e2c";
  gameContext.lineWidth = 2;
  gameContext.strokeRect(48, 120, 544, 270);
}

function drawSetupLines(lines, startY = 158, lineHeight = 37) {
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  lines.forEach((line, index) => {
    gameContext.fillStyle = line.accent ? "#f2b55f" : line.good ? "#8ee39a" : "#d9c7aa";
    gameContext.font = `${line.bold ? "bold " : ""}${line.small ? 14 : 17}px Consolas, monospace`;
    gameContext.fillText(line.text, SCREEN_WIDTH / 2, startY + index * lineHeight, 500);
  });
}

function drawFirstRunGuide() {
  const pages = [
    {
      title: "KEEP SAVES BETWEEN RESTARTS",
      lines: [
        { text: "IN LIVELY SETTINGS, ENABLE THE WEB BROWSER", accent: true },
        { text: "DISK CACHE BEFORE YOU START PLAYING.", accent: true },
        { text: "THE GAME CATALOG AND SAVES USE BROWSER STORAGE." },
        { text: "A SAME-SESSION WRITE TEST IS NOT RESTART PROOF.", small: true },
        { text: "USE STORAGE CHECK AFTER RESTARTING LIVELY.", small: true },
      ],
    },
    {
      title: "IMPORT YOUR GAMES",
      lines: [
        { text: "OPEN RETROSIGNAL MANAGER.", accent: true },
        { text: "CHOOSE YOUR ROM SOURCE FOLDER ONCE." },
        { text: "CHOOSE THE INSTALLED WALLPAPER, THEN SCAN + IMPORT." },
        { text: "FILES ARE SORTED INTO CONFIGURED SYSTEM FOLDERS." },
        { text: "PRESS RESCAN GAME LIBRARY IN CUSTOMIZE.", good: true },
      ],
    },
    {
      title: "KEYBOARD OR CONTROLLER",
      lines: [
        { text: "LIVELY SETTINGS > WALLPAPER > INTERACTION." },
        { text: "SET WALLPAPER INPUT TO KEYBOARD.", accent: true },
        { text: "F8 / BACKTICK: GAME MODE" },
        { text: "ARROWS: NAVIGATE    ENTER / TAB: SELECT" },
        { text: "ESC: GAME LIST / SYSTEMS / EXIT" },
        { text: "CLOSE LIVELY + CLICK DESKTOP; ENTER IF BLACK", good: true },
      ],
    },
    {
      title: "GAMES AND FIRMWARE",
      lines: [
        { text: "OPEN THE MANAGER AND CHOOSE ONE SOURCE FOLDER.", accent: true },
        { text: "PUT ROMS ANYWHERE INSIDE IT; SYSTEM FOLDERS HELP." },
        { text: "PUT FIRMWARE UNDER BIOS / SYSTEM-ID." },
        { text: "SCAN + IMPORT CREATES THE WALLPAPER FOLDERS." },
        { text: "RESCAN GAME LIBRARY AFTER CHANGING THE SOURCE.", good: true },
      ],
    },
  ];
  const page = pages[Math.max(0, Math.min(pages.length - 1, state.guidePage))];
  drawSetupHeading(`FIRST-RUN SETUP · ${state.guidePage + 1} OF ${pages.length}`, page.title);
  drawSetupLines(page.lines);
  gameContext.fillStyle = "#aa9474";
  gameContext.font = "15px Consolas, monospace";
  gameContext.fillText("LEFT / RIGHT: STEP    A: NEXT", SCREEN_WIDTH / 2, 426);
}

function formatStorageBytes(value) {
  if (!Number.isFinite(value)) return "UNKNOWN";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GIB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MIB`;
  return `${Math.round(value / 1024)} KIB`;
}

function drawStorageDiagnostic() {
  const diagnostic = state.storageDiagnostic;
  const earlierLoad = diagnostic.foundEarlierLoad ? "FOUND" : "NOT FOUND YET";
  const earlierWebView = diagnostic.sessionIdentityReliable
    ? diagnostic.foundEarlierWebView
      ? "FOUND"
      : "NOT FOUND YET"
    : "UNAVAILABLE";
  const protection =
    diagnostic.browserPersisted === true ? "ON" : diagnostic.browserPersisted === false ? "OFF / NOT REPORTED" : "UNKNOWN";
  drawSetupHeading("RETROSIGNAL DIAGNOSTICS", "STORAGE CHECK");
  drawSetupLines(
    [
      {
        text: diagnostic.readWriteVerifiedThisLoad
          ? "CURRENT LOAD: INDEXEDDB READ + WRITE PASSED"
          : "CURRENT LOAD: BROWSER STORAGE UNAVAILABLE",
        good: diagnostic.readWriteVerifiedThisLoad,
        accent: !diagnostic.readWriteVerifiedThisLoad,
      },
      { text: `DATA FROM AN EARLIER PAGE LOAD: ${earlierLoad}` },
      { text: `DATA FROM AN EARLIER WEBVIEW: ${earlierWebView}` },
      { text: `BROWSER EVICTION PROTECTION: ${protection}`, small: true },
      { text: `USAGE / QUOTA: ${formatStorageBytes(diagnostic.usage)} / ${formatStorageBytes(diagnostic.quota)}`, small: true },
      {
        text: `CATALOG: ${catalogEntryCount(state.library)}  ·  MISSING: ${state.missingGames.size}`,
        accent: state.missingGames.size > 0,
      },
    ],
    150,
    35,
  );
  gameContext.fillStyle = "#e6a05a";
  gameContext.font = "bold 14px Consolas, monospace";
  gameContext.fillText("THIS DOES NOT PROVE A LIVELY OR PC RESTART.", SCREEN_WIDTH / 2, 375, 500);
  gameContext.fillStyle = "#aa9474";
  gameContext.font = "14px Consolas, monospace";
  gameContext.fillText("RESTART LIVELY, REOPEN THIS SCREEN, THEN CHECK AGAIN.", SCREEN_WIDTH / 2, 424, 540);
}

function drawControllerSetup() {
  const system = selectedSystem();
  const detected = state.gamepads.length > 0;
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillStyle = detected ? "#8ee39a" : "#e0a354";
  gameContext.font = "bold 28px Consolas, monospace";
  gameContext.fillText(detected ? "CONTROLLER READY" : "CONTROLLER NOT FOUND", SCREEN_WIDTH / 2, 105);
  gameContext.fillStyle = "#d9c7aa";
  gameContext.font = "17px Consolas, monospace";
  gameContext.fillText(detected ? String(state.gamepads[0].id || "STANDARD GAMEPAD").slice(0, 56) : "CONNECT AN XINPUT CONTROLLER", SCREEN_WIDTH / 2, 144, 540);
  gameContext.fillStyle = "#f2b55f";
  gameContext.font = "bold 20px Consolas, monospace";
  gameContext.fillText(system.shortName, SCREEN_WIDTH / 2, 190);
  gameContext.fillStyle = "#d9c7aa";
  gameContext.font = "17px Consolas, monospace";
  system.mappingLines.forEach((line, index) => gameContext.fillText(line, SCREEN_WIDTH / 2, 235 + index * 38, 520));
  gameContext.fillStyle = "#aa9474";
  gameContext.font = "15px Consolas, monospace";
  gameContext.fillText("F8: TOGGLE GAME MODE    ENTER: START", SCREEN_WIDTH / 2, 406);
  gameContext.fillText("ESC OR LB + RB + Y: STOP + LIBRARY", SCREEN_WIDTH / 2, 435);
}

function drawControllerNotice() {
  gameContext.fillStyle = "rgba(8, 6, 3, 0.86)";
  gameContext.fillRect(102, 375, 436, 52);
  gameContext.fillStyle = "#e0a354";
  gameContext.font = "bold 18px Consolas, monospace";
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillText("KEYBOARD READY · CONTROLLER NOT FOUND", SCREEN_WIDTH / 2, 401);
}

function drawGameStatus() {
  const system = state.activeGame?.system || selectedSystem();
  gameContext.textAlign = "center";
  gameContext.textBaseline = "middle";
  gameContext.fillStyle = state.errorCode ? "#e6a05a" : "#e0a354";
  gameContext.font = "bold 28px Consolas, monospace";
  gameContext.fillText(state.gameStatus, SCREEN_WIDTH / 2, 202, SCREEN_WIDTH - 90);
  gameContext.fillStyle = "#d9c7aa";
  gameContext.font = "18px Consolas, monospace";
  gameContext.fillText(system.name.toUpperCase(), SCREEN_WIDTH / 2, 252, SCREEN_WIDTH - 100);
  gameContext.fillStyle = "#aa9474";
  gameContext.font = "15px Consolas, monospace";
  gameContext.fillText("ESC OR LB + RB + Y: STOP + LIBRARY", SCREEN_WIDTH / 2, 310);
}

function drawContained(source, context, targetX, targetY, targetWidth, targetHeight) {
  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const x = targetX + Math.round((targetWidth - width) / 2);
  const y = targetY + Math.round((targetHeight - height) / 2);
  try {
    context.save();
    context.filter = state.crtBlur ? `blur(${state.crtBlur}px)` : "none";
    context.drawImage(source, x, y, width, height);
    context.restore();
  } catch (error) {
    context.restore();
    state.gameStatus = "CONNECTING VIDEO";
  }
}

function setToast(message, duration = 2400) {
  state.toast = message;
  state.toastUntil = performance.now() + duration;
}

function setGameError(code, message) {
  state.errorCode = code;
  state.gameStatus = String(message || "The game could not be started.").toUpperCase();
  state.gameStarted = false;
  state.emulatorReady = false;
  state.emulatorLoading = false;
  state.view = "status";
}

async function launchSelectedGame() {
  const system = selectedSystem();
  const romPath = selectedGame();
  const biosPath = biosPathFor(system);
  const token = ++lifecycleToken;

  state.errorCode = "";
  state.view = "status";
  state.gameStatus = `CHECKING ${system.shortName}`;
  state.emulatorLoading = true;
  const validation = await validateLaunch(system, romPath, biosPath);
  if (token !== lifecycleToken) return;
  if (!validation.ok) {
    setGameError(validation.code, validation.message);
    return;
  }

  releaseDirectInputs();
  state.activeGame = { system, romPath, biosPath };
  if (!state.pageVisible || state.livelyPaused) {
    state.view = "playing";
    state.gameStatus = `${system.shortName} READY WHEN WALLPAPER RESUMES`;
    state.emulatorLoading = false;
    state.emulatorReady = false;
    state.gameStarted = false;
    setToast("CLOSE LIVELY, THEN CLICK THE DESKTOP", 5000);
    return;
  }
  state.gameStatus = `LOADING ${system.shortName}`;
  try {
    await emulatorHost.start(system, romPath, biosPath, state.gameVolume);
  } catch (error) {
    if (token === lifecycleToken) setGameError("launch-error", "The emulator could not be started.");
  }
}

async function launchActiveGame() {
  if (!state.activeGame) return;
  const { system, romPath, biosPath } = state.activeGame;
  const systemIndex = SYSTEMS.findIndex((entry) => entry.id === system.id);
  if (systemIndex >= 0) state.selectedSystemIndex = systemIndex;
  const games = state.library[system.id] || [];
  const gameIndex = games.indexOf(romPath);
  if (gameIndex >= 0) state.selectedGameIndex = gameIndex;
  await launchSelectedGame();
}

async function openLibrary(source = "settings", level = SELECTOR_LEVELS.games) {
  if (!state.controllerMode && source !== "initial") return;
  ++lifecycleToken;
  releaseDirectInputs();
  state.view = "selector";
  state.selectorLevel = level;
  state.gameStarted = false;
  state.emulatorReady = false;
  state.emulatorLoading = false;
  state.activeGame = null;
  state.errorCode = "";
  state.gameStatus = level === SELECTOR_LEVELS.games ? "SELECT A GAME" : "SELECT A SYSTEM";
  initialGameActivationPending = false;
  try {
    await emulatorHost.stop("library");
    if (source === "controller") setToast("LIBRARY OPEN");
  } catch (error) {
    setGameError("library-error", "Could not open the game library.");
    console.error("[RetroSignal] openLibrary failed", error);
  }
}

async function selectSystem(index, source = "settings") {
  const nextIndex = wrapIndex(Number(index) || 0, 0, SYSTEMS.length);
  const changed = nextIndex !== state.selectedSystemIndex;
  if (changed && emulatorHost.frame) await openLibrary(source, SELECTOR_LEVELS.systems);
  state.selectedSystemIndex = nextIndex;
  state.selectedGameIndex = 0;
  state.selectorLevel = SELECTOR_LEVELS.systems;
  state.errorCode = "";
  if (state.controllerMode) {
    state.view = "selector";
    setToast(selectedSystem().shortName, 1200);
  }
  await refreshBiosStatus(selectedSystem());
  runInBackground(persistPreferences(), "persistPreferences");
}

function openSelectedSystem() {
  state.selectorLevel = SELECTOR_LEVELS.games;
  state.selectedGameIndex = Math.max(0, Math.min(state.selectedGameIndex, Math.max(0, selectedGames().length - 1)));
  state.errorCode = "";
  state.gameStatus = selectedGames().length ? "SELECT A GAME" : "NO COMPATIBLE GAMES";
  setToast(selectedGames().length ? `${selectedSystem().shortName} GAMES` : `NO ${selectedSystem().shortName} GAMES`, 1600);
  runInBackground(persistPreferences(), "persistPreferences");
}

function backToSystemSelection() {
  state.selectorLevel = SELECTOR_LEVELS.systems;
  state.selectedGameIndex = 0;
  state.errorCode = "";
  state.gameStatus = "SELECT A SYSTEM";
  setToast("SYSTEM SELECT", 1400);
  runInBackground(persistPreferences(), "persistPreferences");
}

async function backToGameSelection(source = "keyboard") {
  if (!state.controllerMode) await setControllerMode(true, source);
  if (state.view === "playing" || state.view === "status" || emulatorHost.frame) {
    await openLibrary(source, SELECTOR_LEVELS.games);
  } else {
    state.view = "selector";
    state.selectorLevel = SELECTOR_LEVELS.games;
    state.gameStatus = "SELECT A GAME";
    updateOverlayVisibility();
  }
  setToast("GAME SELECT", 1600);
}

function handleEmulatorEvent(event) {
  switch (event.type) {
    case "loading":
      state.emulatorLoading = true;
      state.gameStatus = `LOADING ${event.system.shortName}`;
      break;
    case "ready":
      state.emulatorReady = true;
      state.gameStatus = "STARTING GAME";
      break;
    case "started":
      state.emulatorLoading = false;
      state.emulatorReady = true;
      state.gameStarted = true;
      state.errorCode = "";
      state.view = "playing";
      initialGameActivationPending = true;
      if (shouldRunEmulator()) emulatorHost.resume(state.gameVolume);
      else runInBackground(emulatorHost.suspend(), "emulatorHost.suspend");
      setToast(`${event.system.shortName} READY · CLICK DESKTOP IF NEEDED`, 8000);
      break;
    case "error":
      setGameError(event.code || "runtime-error", friendlyRuntimeError(event));
      runInBackground(emulatorHost.stop("error"), "emulatorHost.stop");
      break;
    case "exit":
      if (state.view === "playing") setGameError("unexpected-exit", event.message || "The emulator stopped.");
      break;
    case "save-warning":
      setToast(`SAVE WARNING · ${event.message || "MANAGER SYNC FAILED"}`, 8000);
      break;
    case "stopped":
      releaseDirectInputs();
      break;
    case "shortcut":
      handleKeyboard({
        key: event.key,
        ctrlKey: Boolean(event.ctrlKey),
        altKey: Boolean(event.altKey),
        repeat: false,
        timeStamp: performance.now(),
        preventDefault() {},
      });
      break;
    default:
      break;
  }
  updateDiagnostics();
}

function friendlyRuntimeError(event) {
  if (state.activeGame?.system.id === "psx") {
    return event.message || "PS1 could not start. Check the BIOS and disc files.";
  }
  if (event.code === "start-timeout") return event.message;
  return event.message || `${state.activeGame?.system.shortName || "The game"} could not start.`;
}

function shouldRunEmulator() {
  return Boolean(
      state.controllerMode &&
      !crtOverlayVisible() &&
      state.pageVisible &&
      !state.livelyPaused &&
      state.view === "playing" &&
      state.gameStarted,
  );
}

async function setControllerMode(enabled, source = "settings") {
  const next = Boolean(enabled);
  if (state.controllerMode === next && source !== "initial") return;
  state.controllerMode = next;
  syncScreenMode();
  if (next) {
    requestGamepadFocus();
    state.view = "selector";
    state.selectorLevel = SELECTOR_LEVELS.systems;
    state.gameStatus = "SELECT A SYSTEM";
    state.errorCode = "";
    setToast(source === "controller" ? "GAME MODE ON" : "SELECT A GAME");
  } else {
    ++lifecycleToken;
    releaseDirectInputs();
    try {
      await emulatorHost.stop("game-mode-off");
    } catch (error) {
      setGameError("controller-mode-error", "Could not exit game mode.");
      console.error("[RetroSignal] setControllerMode failed", error);
    }
    state.gameStarted = false;
    state.emulatorReady = false;
    state.emulatorLoading = false;
    state.activeGame = null;
    state.view = "selector";
    state.gameStatus = "SELECT A SYSTEM";
    initialGameActivationPending = false;
    setToast("GAME MODE OFF");
  }
}

function monitorControllerShortcut(now) {
  if (!state.controllerShortcut || !nativeGetGamepads) return;
  const chordPressed = state.gamepads.some((pad) => buttonPressed(pad, 8) && buttonPressed(pad, 9));
  if (!chordPressed) {
    toggleStartedAt = 0;
    toggleLatched = false;
    return;
  }
  if (!toggleStartedAt) toggleStartedAt = now;
  if (!toggleLatched && now - toggleStartedAt >= TOGGLE_HOLD_MS) {
    toggleLatched = true;
    runInBackground(setControllerMode(!state.controllerMode, "controller"), "setControllerMode");
  }
}

function monitorLibraryShortcut(now) {
  if (!state.controllerMode || state.view !== "playing") {
    libraryStartedAt = 0;
    libraryLatched = false;
    return;
  }
  const chordPressed = state.gamepads.some((pad) => MENU_CHORD.every((button) => buttonPressed(pad, button)));
  if (!chordPressed) {
    libraryStartedAt = 0;
    libraryLatched = false;
    return;
  }
  if (!libraryStartedAt) libraryStartedAt = now;
  if (!libraryLatched && now - libraryStartedAt >= LIBRARY_HOLD_MS) {
    libraryLatched = true;
    runInBackground(backToGameSelection("controller"), "backToGameSelection");
  }
}

function monitorSelectorInput() {
  const pad = state.gamepads[0];
  const current = Array.from({ length: 16 }, (_, index) => buttonPressed(pad, index));
  const edge = (index) => current[index] && !previousUiButtons[index];

  if (state.guideVisible) {
    if (edge(14)) changeGuidePage(-1);
    if (edge(15)) changeGuidePage(1);
    if (edge(0)) {
      if (state.guidePage >= 3) runInBackground(completeFirstRun(), "completeFirstRun");
      else changeGuidePage(1);
    }
  } else if (state.storageVisible) {
    if (edge(0) || edge(1)) closeCrtOverlays();
  } else if (state.controllerMode && state.view === "selector" && !state.showSetup) {
    if (state.selectorLevel === SELECTOR_LEVELS.systems) {
      if (edge(14) || edge(12)) changeSystem(-1);
      if (edge(15) || edge(13)) changeSystem(1);
      if (edge(0)) openSelectedSystem();
      if (edge(1)) runInBackground(setControllerMode(false, "controller"), "setControllerMode");
    } else {
      if (edge(14)) changeSystem(-1);
      if (edge(15)) changeSystem(1);
      if (edge(12)) changeGame(-1);
      if (edge(13)) changeGame(1);
      if (edge(0) && !state.emulatorLoading) runInBackground(launchSelectedGame(), "launchSelectedGame");
      if (edge(1)) backToSystemSelection();
    }
  }
  previousUiButtons = current;
}

function changeSystem(delta) {
  runInBackground(selectSystem(state.selectedSystemIndex + delta, "controller"), "selectSystem");
}

function changeGame(delta) {
  const games = selectedGames();
  if (games.length === 0) return;
  state.selectedGameIndex = wrapIndex(state.selectedGameIndex, delta, games.length);
  state.errorCode = "";
  setToast(displayGameName(selectedGame()).toUpperCase(), 1200);
  runInBackground(persistPreferences(), "persistPreferences");
}

function monitorGamepads() {
  state.pageFocused = document.hasFocus();
  if (!nativeGetGamepads) {
    state.gamepads = [];
    return;
  }
  let pads = [];
  try {
    pads = Array.from(nativeGetGamepads() || []).filter(Boolean);
  } catch (error) {
    pads = [];
  }
  const signature = pads.map((pad) => `${pad.index}:${pad.id}`).join("|");
  if (signature !== state.gamepadSignature) {
    if (pads.length > 0) setToast("CONTROLLER READY", 2600);
    else if (state.gamepadSignature) setToast("CONTROLLER DISCONNECTED", 3200);
    state.gamepadSignature = signature;
  }
  state.gamepads = pads;
}

function requestGamepadFocus() {
  try {
    window.focus();
    document.body.focus({ preventScroll: true });
  } catch (error) {
    // Gamepad polling still works when the host does not grant focus.
  }
}

function buttonPressed(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  return Boolean(typeof button === "number" ? button > 0.5 : button?.pressed || button?.value > 0.5);
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (typeof button === "number") return button;
  if (!button) return 0;
  return Number.isFinite(button.value) ? button.value : button.pressed ? 1 : 0;
}

function normalizeAxis(value) {
  const axis = Number(value) || 0;
  if (Math.abs(axis) < GAMEPAD_DEADZONE) return 0;
  return Math.max(-1, Math.min(1, axis));
}

function sendDirectInput(gameManager, input, value) {
  if (directInputValues.get(input) === value) return;
  gameManager.simulateInput(0, input, value);
  directInputValues.set(input, value);
}

function releaseDirectInputs() {
  const gameManager = emulatorHost.emulator?.gameManager;
  if (gameManager?.simulateInput) {
    for (const input of DIRECT_INPUTS) {
      try {
        gameManager.simulateInput(0, input, 0);
      } catch (error) {
        break;
      }
    }
  }
  directInputValues.clear();
  directInputWasActive = false;
}

function routeXboxInputDirectly() {
  const gameManager = emulatorHost.emulator?.gameManager;
  const gamepad = state.gamepads[0];
  const system = state.activeGame?.system;
  const active = Boolean(gameManager && gamepad && system && shouldRunEmulator());
  if (!active) {
    if (directInputWasActive) releaseDirectInputs();
    return;
  }

  const values = new Map(DIRECT_INPUTS.map((input) => [input, 0]));
  for (const [xboxButton, emulatorInput] of system.buttons) {
    values.set(emulatorInput, buttonValue(gamepad, xboxButton) > 0.25 ? 1 : 0);
  }

  const leftX = normalizeAxis(gamepad.axes?.[0]);
  const leftY = normalizeAxis(gamepad.axes?.[1]);
  const rightX = normalizeAxis(gamepad.axes?.[2]);
  const rightY = normalizeAxis(gamepad.axes?.[3]);
  if (system.stickAsDpad) {
    values.set(4, Math.max(values.get(4), leftY < -0.5 ? 1 : 0));
    values.set(5, Math.max(values.get(5), leftY > 0.5 ? 1 : 0));
    values.set(6, Math.max(values.get(6), leftX < -0.5 ? 1 : 0));
    values.set(7, Math.max(values.get(7), leftX > 0.5 ? 1 : 0));
  }
  if (system.analog) {
    values.set(16, Math.round(Math.max(0, leftX) * INPUT_MAX));
    values.set(17, Math.round(Math.max(0, -leftX) * INPUT_MAX));
    values.set(18, Math.round(Math.max(0, leftY) * INPUT_MAX));
    values.set(19, Math.round(Math.max(0, -leftY) * INPUT_MAX));
    values.set(20, Math.round(Math.max(0, rightX) * INPUT_MAX));
    values.set(21, Math.round(Math.max(0, -rightX) * INPUT_MAX));
    values.set(22, Math.round(Math.max(0, rightY) * INPUT_MAX));
    values.set(23, Math.round(Math.max(0, -rightY) * INPUT_MAX));
  }

  for (const [input, value] of values) sendDirectInput(gameManager, input, value);
  if (!directInputWasActive) setToast("DIRECT XINPUT ACTIVE", 2200);
  directInputWasActive = true;
}

function changeGuidePage(delta) {
  state.guidePage = Math.max(0, Math.min(3, state.guidePage + delta));
  setToast(`SETUP ${state.guidePage + 1} OF 4`, 1200);
}

async function completeFirstRun() {
  state.setupComplete = true;
  state.guideVisible = false;
  await persistPreferences();
  updateOverlayVisibility();
  setToast("SETUP SAVED", 1800);
}

function showFirstRunGuide() {
  state.storageVisible = false;
  state.guideVisible = true;
  state.guidePage = 0;
  requestGamepadFocus();
  updateOverlayVisibility();
}

function showStorageDiagnostic() {
  state.guideVisible = false;
  state.storageVisible = true;
  updateOverlayVisibility();
}

function closeCrtOverlays() {
  state.guideVisible = false;
  state.storageVisible = false;
  state.showSetup = false;
  updateOverlayVisibility();
}

function updateOverlayVisibility() {
  if (crtOverlayVisible()) {
    releaseDirectInputs();
    runInBackground(emulatorHost.suspend(), "emulatorHost.suspend");
  } else if (shouldRunEmulator()) {
    emulatorHost.resume(state.gameVolume);
  }
  syncScreenMode();
}

function clearBackgroundRelease() {
  if (backgroundReleaseId !== null) {
    window.clearTimeout(backgroundReleaseId);
    backgroundReleaseId = null;
  }
}

function scheduleBackgroundRelease(token) {
  clearBackgroundRelease();
  if (!emulatorHost.frame) return;
  backgroundReleaseId = window.setTimeout(async () => {
    backgroundReleaseId = null;
    if (token !== playbackToken || state.pageVisible && !state.livelyPaused) return;
    releaseDirectInputs();
    await emulatorHost.stop("background");
    state.gameStarted = false;
    state.emulatorReady = false;
    state.emulatorLoading = false;
    if (state.controllerMode && state.activeGame) {
      state.view = "playing";
      state.gameStatus = `${state.activeGame.system.shortName} READY WHEN WALLPAPER RESUMES`;
    }
  }, BACKGROUND_RELEASE_MS);
}

async function syncPlaybackState() {
  const token = ++playbackToken;
  const active = state.pageVisible && !state.livelyPaused;
  if (active) {
    clearBackgroundRelease();
    startRenderLoop();
    if (shouldRunEmulator()) emulatorHost.resume(state.gameVolume);
    else if (state.controllerMode && state.activeGame && state.view === "playing" && !emulatorHost.frame) await launchActiveGame();
  } else {
    stopRenderLoop();
    noSignalVideo.pause();
    releaseDirectInputs();
    await emulatorHost.suspend();
    if (token !== playbackToken || state.pageVisible && !state.livelyPaused) return;
    scheduleBackgroundRelease(token);
  }
  if (token !== playbackToken) return;
  syncSignalVideo();
  updateDiagnostics();
}

function handleVisibilityChange() {
  state.pageVisible = !document.hidden;
  runInBackground(syncPlaybackState(), "syncPlaybackState");
}

function handlePointerActivation() {
  if (!shouldRunEmulator()) return;
  if (initialGameActivationPending) {
    initialGameActivationPending = false;
    emulatorHost.activate(state.gameVolume);
  } else {
    emulatorHost.resume(state.gameVolume);
  }
}

window.livelyWallpaperPlaybackChanged = (data) => {
  try {
    const playback = typeof data === "string" ? JSON.parse(data) : data;
    state.livelyPaused = Boolean(playback?.IsPaused);
  } catch (error) {
    return;
  }
  runInBackground(syncPlaybackState(), "syncPlaybackState");
};

window.livelyPropertyListener = (name, value) => {
  try {
    const system = SYSTEM_BY_PROPERTY.get(name);
    if (system) {
      const romPath = normalizeSystemFile(value, system);
      if (value && !romPath) {
        state.selectedSystemIndex = SYSTEMS.indexOf(system);
        setGameError("unsupported-file", `That file is not supported for ${system.shortName}.`);
        return;
      }
      if (romPath) {
        rememberCatalogSelection(system, romPath);
        if (state.activeGame?.system.id === system.id && state.activeGame.romPath !== romPath) {
          runInBackground(openLibrary("rom-change"), "openLibrary");
        }
      }
      return;
    }

    const biosSystem = SYSTEM_BY_BIOS_PROPERTY.get(name);
    if (biosSystem) {
      state.bios[biosKey(biosSystem)] = normalizeBiosFile(value, biosSystem);
      runInBackground(persistPreferences(), "persistPreferences");
      if (biosSystem.id === selectedSystem().id) {
        runInBackground(refreshBiosStatus(biosSystem, true), "refreshBiosStatus");
      }
      return;
    }

    switch (name) {
    case "controllerMode":
      runInBackground(setControllerMode(Boolean(value)), "setControllerMode");
      break;
    case "controllerShortcut":
      state.controllerShortcut = Boolean(value);
      break;
    case "backToGameSelection":
      runInBackground(backToGameSelection("lively"), "backToGameSelection");
      break;
    case "reloadLibrary":
      runInBackground(refreshManagedLibrary(), "refreshManagedLibrary");
      break;
    case "rescanShortcut":
      state.rescanShortcut = Math.max(0, Math.min(5, Number(value) || 0));
      break;
    case "removeMissing":
      runInBackground(removeMissingCatalogEntries(), "removeMissingCatalogEntries");
      break;
    case "firstRunGuide":
      showFirstRunGuide();
      break;
    case "nextSetupStep":
      if (!state.guideVisible) showFirstRunGuide();
      else if (state.guidePage >= 3) runInBackground(completeFirstRun(), "completeFirstRun");
      else changeGuidePage(1);
      break;
    case "finishSetup":
      runInBackground(completeFirstRun(), "completeFirstRun");
      break;
    case "storageDiagnostic":
      showStorageDiagnostic();
      break;
    case "closeSetup":
      closeCrtOverlays();
      break;
    case "showSetup":
      state.showSetup = Boolean(value);
      if (state.showSetup) requestGamepadFocus();
      updateOverlayVisibility();
      break;
    case "gameVolume":
      state.gameVolume = Math.max(0, Math.min(1, Number(value) / 100));
      if (shouldRunEmulator()) emulatorHost.setVolume(state.gameVolume);
      break;
    case "crtBlur":
      state.crtBlur = Math.max(0, Math.min(4, Number(value) || 0));
      break;
    case "xAngleCamera":
      if (cameraContainer) cameraContainer.rotation.x = THREE.MathUtils.degToRad(Number(value));
      break;
    case "yAngleCamera":
      if (cameraContainer) cameraContainer.rotation.y = THREE.MathUtils.degToRad(Number(value));
      break;
    case "zoomCamera":
      state.cameraZoom = Number(value);
      syncCameraZoom();
      break;
    case "30fps":
      state.fps = value ? 30 : 60;
      break;
    default:
      break;
    }
  } catch (error) {
    console.error("[RetroSignal] livelyPropertyListener failed", error);
  }
};

function addDiagnosticControls() {
  if (!diagnosticsEnabled) return;
  const panel = document.createElement("nav");
  panel.setAttribute("aria-label", "Lifecycle diagnostics");
  for (const [label, isPaused] of [["Pause", true], ["Resume", false]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => window.livelyWallpaperPlaybackChanged({ IsPaused: isPaused }));
    panel.appendChild(button);
  }
  document.body.appendChild(panel);
}

function handleKeyboard(event) {
  const action = isRescanShortcut(event, state.rescanShortcut) ? KEYBOARD_ACTIONS.rescan : keyboardActionFor(event);
  if (!action) return;
  const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
  if (!keyboardShortcutGate.accept(action, timestamp)) {
    event.preventDefault();
    return;
  }

  if (action === KEYBOARD_ACTIONS.toggleMode) {
    closeCrtOverlays();
    runInBackground(setControllerMode(!state.controllerMode, "keyboard"), "setControllerMode");
    event.preventDefault();
    return;
  }

  if (state.guideVisible) {
    if ([KEYBOARD_ACTIONS.previousSystem, KEYBOARD_ACTIONS.previousGame].includes(action)) changeGuidePage(-1);
    else if ([KEYBOARD_ACTIONS.nextSystem, KEYBOARD_ACTIONS.nextGame].includes(action)) changeGuidePage(1);
    else if (action === KEYBOARD_ACTIONS.start) {
      if (state.guidePage >= 3) runInBackground(completeFirstRun(), "completeFirstRun");
      else changeGuidePage(1);
    } else if (action === KEYBOARD_ACTIONS.back) closeCrtOverlays();
    else return;
    event.preventDefault();
    return;
  }
  if ((state.storageVisible || state.showSetup) && [KEYBOARD_ACTIONS.start, KEYBOARD_ACTIONS.back].includes(action)) {
    closeCrtOverlays();
    event.preventDefault();
    return;
  }

  if (action === KEYBOARD_ACTIONS.back && state.controllerMode) {
    if (state.view === "selector") {
      if (backTargetForSelector(state.selectorLevel) === SELECTOR_LEVELS.systems) backToSystemSelection();
      else runInBackground(setControllerMode(false, "keyboard"), "setControllerMode");
    } else runInBackground(backToGameSelection("keyboard"), "backToGameSelection");
    event.preventDefault();
    return;
  }

  if (action === KEYBOARD_ACTIONS.rescan) {
    runInBackground(refreshManagedLibrary(), "refreshManagedLibrary");
    event.preventDefault();
    return;
  }

  if (action === KEYBOARD_ACTIONS.start && state.controllerMode && state.view === "playing") {
    initialGameActivationPending = false;
    emulatorHost.activate(state.gameVolume);
    setToast("GAME ACTIVE");
    event.preventDefault();
    return;
  }

  if (!state.controllerMode || state.view !== "selector") return;
  if (state.selectorLevel === SELECTOR_LEVELS.systems) {
    if ([KEYBOARD_ACTIONS.previousSystem, KEYBOARD_ACTIONS.previousGame].includes(action)) changeSystem(-1);
    else if ([KEYBOARD_ACTIONS.nextSystem, KEYBOARD_ACTIONS.nextGame].includes(action)) changeSystem(1);
    else if (action === KEYBOARD_ACTIONS.start) openSelectedSystem();
    else return;
  } else {
    if (action === KEYBOARD_ACTIONS.previousGame) changeGame(-1);
    else if (action === KEYBOARD_ACTIONS.nextGame) changeGame(1);
    else if (action === KEYBOARD_ACTIONS.start && !state.emulatorLoading) runInBackground(launchSelectedGame(), "launchSelectedGame");
    else return;
  }
  event.preventDefault();
}

async function reloadManagedManifestScript() {
  await new Promise((resolveReload, rejectReload) => {
    const script = document.createElement("script");
    script.src = `roms/library.local.js?rescan=${Date.now()}`;
    script.onload = () => {
      script.remove();
      resolveReload();
    };
    script.onerror = () => {
      script.remove();
      rejectReload(new Error("The local game catalog could not be reloaded."));
    };
    document.head.appendChild(script);
  });
}

function mergeManagedManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return;
  for (const system of SYSTEMS) mergeLibraryEntries(state.library, system, manifest[system.id]);
  for (const system of SYSTEMS.filter((entry) => entry.biosRequired)) {
    const configured = normalizeBiosFile(manifest.bios?.[biosKey(system)], system);
    if (configured) state.bios[biosKey(system)] = configured;
  }
}

async function importManagedManifest() {
  let manifest = null;
  try {
    const response = await fetch(`roms/library.local.json?refresh=${Date.now()}`, { cache: "no-store" });
    if (response.ok) {
      const source = await response.text();
      manifest = JSON.parse(source);
      managedLibrarySnapshot = source;
    }
  } catch (error) {
    // Some Lively WebViews cannot fetch local JSON; use the cache-busted script below.
  }
  if (!manifest) {
    try {
      await reloadManagedManifestScript();
      manifest = globalThis.RETROSIGNAL_LIBRARY_MANIFEST;
    } catch (error) {
      // The companion manager is optional; browser storage remains the fallback.
    }
    manifest ||= globalThis.RETROSIGNAL_LIBRARY_MANIFEST;
  }
  mergeManagedManifest(manifest);
  state.legacyManifestImported = true;
  return Boolean(manifest && typeof manifest === "object");
}

async function readManagedManifestSnapshot() {
  try {
    const response = await fetch(`roms/library.local.json?watch=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    return null;
  }
}

async function checkManagedLibrary() {
  if (!state.libraryReady || !state.pageVisible || state.livelyPaused || managedLibraryCheckPromise) return;
  managedLibraryCheckPromise = (async () => {
    const snapshot = await readManagedManifestSnapshot();
    if (snapshot === null || snapshot === managedLibrarySnapshot) return;
    const previousSnapshot = managedLibrarySnapshot;
    const hadSnapshot = previousSnapshot !== null;
    if (!await importManagedManifest()) {
      managedLibrarySnapshot = previousSnapshot;
      return;
    }
    managedLibrarySnapshot = snapshot;
    await Promise.all([persistCatalog(), persistPreferences()]);
    await refreshBiosStatus();
    await rescanLibrary(false);
    if (hadSnapshot) setToast("GAME LIBRARY UPDATED", 2600);
  })().catch(() => {
    // A missing or temporarily unavailable managed manifest is non-fatal.
  }).finally(() => {
    managedLibraryCheckPromise = null;
  });
  await managedLibraryCheckPromise;
}

function startManagedLibraryWatcher() {
  if (managedLibraryWatchId !== null) return;
  managedLibraryWatchId = window.setInterval(
    () => runInBackground(checkManagedLibrary(), "checkManagedLibrary"),
    MANAGED_LIBRARY_POLL_MS,
  );
}

function stopManagedLibraryWatcher() {
  if (managedLibraryWatchId === null) return;
  window.clearInterval(managedLibraryWatchId);
  managedLibraryWatchId = null;
}

async function refreshManagedLibrary() {
  try {
    const payload = await requestManagerLibraryRescan();
    if (payload.manifest && typeof payload.manifest === "object") {
      for (const system of SYSTEMS) mergeLibraryEntries(state.library, system, payload.manifest[system.id]);
      for (const system of SYSTEMS.filter((entry) => entry.biosRequired)) {
        const configured = normalizeBiosFile(payload.manifest.bios?.[biosKey(system)], system);
        if (configured) state.bios[biosKey(system)] = configured;
      }
    }
    setToast(`${payload.games || 0} GAMES READY`, 2600);
  } catch (error) {
    await importManagedManifest();
    setToast("LOCAL GAME CATALOG RELOADED", 2600);
  }
  await Promise.all([persistCatalog(), persistPreferences()]);
  await refreshBiosStatus();
  await rescanLibrary(true);
}

async function rescanLibrary(showToast = false) {
  const entries = SYSTEMS.flatMap((system) => (state.library[system.id] || []).map((path) => ({ system, path })));
  state.catalogStatus = entries.length ? "CHECKING CATALOG FILES" : "NO GAMES CATALOGED";
  const missing = new Set();
  let nextIndex = 0;
  const workerCount = Math.min(6, entries.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex];
      nextIndex += 1;
      if (!(await resourceExists(entry.path))) missing.add(entry.path);
    }
  });
  await Promise.all(workers);
  state.missingGames = missing;
  const count = catalogEntryCount(state.library);
  state.catalogStatus = missing.size
    ? `${missing.size} MISSING · RESCAN OR REMOVE IN CUSTOMIZE`
    : `${count} GAME${count === 1 ? "" : "S"} CATALOGED · FILES FOUND`;
  if (showToast) {
    setToast(
      missing.size
        ? `${missing.size} MISSING ${missing.size === 1 ? "ENTRY" : "ENTRIES"}`
        : count
          ? "GAME LIBRARY CHECKED"
          : "NO GAMES CATALOGED",
      2600,
    );
  }
  updateDiagnostics();
}

async function removeMissingCatalogEntries() {
  if (state.missingGames.size === 0) {
    await rescanLibrary(true);
    if (state.missingGames.size === 0) return;
  }
  const removed = state.missingGames.size;
  state.library = withoutCatalogEntries(state.library, state.missingGames);
  state.missingGames = new Set();
  state.selectedGameIndex = Math.min(state.selectedGameIndex, Math.max(0, selectedGames().length - 1));
  state.catalogStatus = `${catalogEntryCount(state.library)} GAME${catalogEntryCount(state.library) === 1 ? "" : "S"} CATALOGED`;
  await Promise.all([persistCatalog(), persistPreferences()]);
  setToast(`${removed} MISSING ${removed === 1 ? "ENTRY" : "ENTRIES"} REMOVED`, 2800);
  updateDiagnostics();
}

let colorThief = null;
const albumImage = new Image();

window.livelyCurrentTrack = (data) => {
  let track = null;
  try {
    track = JSON.parse(data);
  } catch (error) {
    track = null;
  }
  if (!track) {
    state.noSignal = true;
    document.body.style.setProperty("--gradientColor1", "#2d2d2d");
    syncSignalVideo();
    return;
  }
  state.noSignal = false;
  state.songTitle = track.Title || "Unknown track";
  state.songArtist = track.Artist || "";
  syncSignalVideo();
  if (track.Thumbnail) albumImage.src = `data:image/png;base64,${track.Thumbnail}`;
  else {
    state.albumColor = [225, 225, 225];
    drawAlbumScreen(null);
  }
};

albumImage.onload = () => {
  try {
    colorThief ||= new window.ColorThief();
    state.albumColor = colorThief.getColor(albumImage);
  } catch (error) {
    state.albumColor = [225, 225, 225];
  }
  drawAlbumScreen(albumImage);
};

function drawAlbumScreen(image) {
  artistContext.fillStyle = "#070707";
  artistContext.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  if (image) {
    const size = 330;
    artistContext.drawImage(image, (SCREEN_WIDTH - size) / 2, 24, size, size);
  }
  artistContext.textAlign = "center";
  artistContext.textBaseline = "middle";
  artistContext.fillStyle = `rgb(${state.albumColor.join(",")})`;
  artistContext.font = state.songTitle.length > 28 ? "bold 24px Arial, sans-serif" : "bold 30px Arial, sans-serif";
  artistContext.fillText(state.songTitle, SCREEN_WIDTH / 2, image ? 392 : 220, SCREEN_WIDTH - 50);
  artistContext.fillStyle = "#e8e8e8";
  artistContext.font = "20px Arial, sans-serif";
  artistContext.fillText(state.songArtist, SCREEN_WIDTH / 2, image ? 430 : 260, SCREEN_WIDTH - 70);
  document.body.style.setProperty("--gradientColor1", `rgb(${state.albumColor.join(",")})`);
  updateVisualizerGeometry();
  if (artistTexture) artistTexture.needsUpdate = true;
}

let visualizerGradient;
let visualizerMaxHeight;
let visualizerStart;
let visualizerWidth;
let visualizerMidY;

function runInBackground(task, label = "background-operation") {
  void Promise.resolve(task).catch((error) => {
    console.error(`[RetroSignal] ${label} failed`, error);
  });
}

function updateVisualizerGeometry() {
  visualizerMaxHeight = visualizerCanvas.height * 0.5;
  visualizerStart = visualizerCanvas.width * 0.1;
  visualizerWidth = visualizerCanvas.width * 0.8;
  visualizerMidY = visualizerCanvas.height - visualizerCanvas.height / 6;
  visualizerGradient = visualizerContext.createLinearGradient(0, visualizerMidY, 0, visualizerMaxHeight);
  visualizerGradient.addColorStop(0, "rgba(0,0,0,1)");
  visualizerGradient.addColorStop(0.5, `rgb(${state.albumColor.join(",")})`);
  visualizerGradient.addColorStop(1, "rgb(255,255,255)");
}

window.livelyAudioListener = (audioArray) => {
  if (
    state.noSignal ||
    state.controllerMode ||
    !state.pageVisible ||
    state.livelyPaused ||
    !audioArray?.length
  ) return;
  const now = performance.now();
  if (now - lastAudioDrawAt < 1000 / state.fps) return;
  lastAudioDrawAt = now;
  let maxValue = 1;
  for (const value of audioArray) maxValue = Math.max(maxValue, value);
  const offset = visualizerWidth / audioArray.length;
  visualizerContext.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  visualizerContext.beginPath();
  visualizerContext.lineJoin = "round";
  visualizerContext.moveTo(visualizerStart - offset * 3, visualizerMidY);
  visualizerContext.lineTo(visualizerStart, visualizerMidY);
  let position = -1;
  for (const value of audioArray) {
    position += 1;
    const y = visualizerMidY - (value / maxValue) * visualizerMaxHeight;
    visualizerContext.lineTo(visualizerStart + offset * position, y);
    visualizerContext.lineTo(visualizerStart + offset * (position + 1), y);
  }
  visualizerContext.lineTo(visualizerStart + offset * (position + 1), visualizerMidY);
  visualizerContext.lineTo(visualizerStart + offset * (position + 4), visualizerMidY);
  visualizerContext.fillStyle = visualizerGradient;
  visualizerContext.fill();
  if (visualizerTexture) visualizerTexture.needsUpdate = true;
};

function releaseWallpaperResources() {
  wallpaperPlayReporter?.stop();
  state.pageVisible = false;
  stopManagedLibraryWatcher();
  clearBackgroundRelease();
  stopRenderLoop();
  releaseDirectInputs();
  runInBackground(emulatorHost.destroy(), "emulatorHost.destroy");
  noSignalVideo.pause();
  noSignalVideo.removeAttribute("src");
  albumImage.onload = null;
  albumImage.removeAttribute("src");
  libraryStore.close();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("keydown", handleKeyboard);
  document.removeEventListener("pointerdown", handlePointerActivation);
  window.removeEventListener("resize", onWindowResize);
  if (scene) {
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material?.map?.dispose?.();
        material?.dispose?.();
      }
    });
    scene.environment?.dispose?.();
  }
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
}

artistContext.fillStyle = "#070707";
artistContext.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
updateVisualizerGeometry();
drawSelector();
initScene();
updateDiagnostics();
addDiagnosticControls();
runInBackground(initializeLibraryStore(), "initializeLibraryStore");
document.addEventListener("visibilitychange", handleVisibilityChange);
document.addEventListener("keydown", handleKeyboard);
document.addEventListener("pointerdown", handlePointerActivation, { passive: true });
window.addEventListener("retrosignal-settings", (event) => {
  const blur = event.detail?.crtBlur;
  if (standaloneMode && Number.isFinite(Number(blur))) state.crtBlur = Math.max(0, Math.min(4, Number(blur)));
  if (standaloneMode && typeof event.detail?.crtMonochrome === "boolean") {
    state.crtMonochrome = event.detail.crtMonochrome;
    document.documentElement.style.filter = state.crtMonochrome ? "grayscale(1)" : "none";
  }
});
window.addEventListener("pagehide", releaseWallpaperResources, { once: true });
startRenderLoop();
