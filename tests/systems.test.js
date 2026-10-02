import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectPsxBios, validateLaunch } from "../js/emulator-host.js";
import {
  KEYBOARD_ACTIONS,
  KEYBOARD_DUPLICATE_WINDOW_MS,
  isRescanShortcut,
  keyboardActionFor,
  KeyboardShortcutGate,
  RESCAN_SHORTCUTS,
} from "../js/keyboard-shortcuts.js";
import { catalogEntryCount, sanitizeCatalog, withoutCatalogEntries } from "../js/library-store.js";
import {
  buildKeyboardControls,
  emptyLibrary,
  gameIdentity,
  hashString,
  localAssetUrl,
  mergeLibraryEntries,
  normalizeBiosFile,
  normalizeSystemFile,
  SYSTEM_BY_ID,
  SYSTEMS,
} from "../js/systems.js";
import { backTargetForSelector, SELECTOR_LEVELS, wrapIndex } from "../js/navigation.js";

test("all requested systems have local cores and reports", () => {
  assert.equal(SYSTEMS.length, 21);
  for (const system of SYSTEMS) {
    assert.ok(existsSync(`emulatorjs/cores/${system.core}-wasm.data`), `${system.id} wasm core`);
    assert.ok(existsSync(`emulatorjs/cores/${system.core}-legacy-wasm.data`), `${system.id} legacy core`);
    assert.ok(existsSync(`emulatorjs/cores/reports/${system.core}.json`), `${system.id} core report`);
  }
});

test("the friend archive core matrix omits unreachable builds without dropping a system", () => {
  const releaseFiles = readFileSync("emulatorjs/cores/RELEASE_FILES.txt", "utf8").trim().split(/\r?\n/).sort();
  assert.deepEqual(releaseFiles, [
    "fceumm-legacy-wasm.data",
    "gambatte-legacy-wasm.data",
    "mgba-legacy-wasm.data",
    "mupen64plus_next-legacy-wasm.data",
    "mupen64plus_next-wasm.data",
    "pcsx_rearmed-legacy-wasm.data",
    "pcsx_rearmed-wasm.data",
    "snes9x-legacy-wasm.data",
    "stella2014-legacy-wasm.data",
    "a5200-legacy-wasm.data",
    "prosystem-legacy-wasm.data",
    "smsplus-legacy-wasm.data",
    "genesis_plus_gx-legacy-wasm.data",
    "mednafen_pce-legacy-wasm.data",
    "same_cdi-legacy-wasm.data",
    "virtualjaguar-legacy-wasm.data",
    "picodrive-legacy-wasm.data",
    "yabause-legacy-wasm.data",
    "beetle_vb-legacy-wasm.data",
    "handy-legacy-wasm.data",
  ].sort());
  assert.ok(releaseFiles.every((file) => existsSync(`emulatorjs/cores/${file}`)));
  assert.ok(releaseFiles.every((file) => !file.includes("-thread")));
});

test("the N64 identity remains compatible with the original save key", () => {
  const path = "roms/example.z64";
  const identity = gameIdentity(SYSTEM_BY_ID.get("n64"), path);
  assert.equal(identity.gameId, hashString(path));
  assert.equal(identity.gameName, "example");
  assert.equal(identity.saveNamespace, "");
});

test("other systems receive stable, separate save namespaces", () => {
  const gb = gameIdentity(SYSTEM_BY_ID.get("gb"), "roms/gb/example.gb");
  const gba = gameIdentity(SYSTEM_BY_ID.get("gba"), "roms/gba/example.gba");
  assert.notEqual(gb.gameId, gba.gameId);
  assert.notEqual(gb.saveNamespace, gba.saveNamespace);
  assert.match(gb.saveNamespace, /^gb-[a-f0-9]+$/);
  assert.match(gba.saveNamespace, /^gba-[a-f0-9]+$/);
});

test("file selection is restricted to the selected system folder and extensions", () => {
  const nes = SYSTEM_BY_ID.get("nes");
  assert.equal(normalizeSystemFile("C:\\games\\sample.nes", nes), "roms/nes/sample.nes");
  assert.equal(normalizeSystemFile("../../sample.nes", nes), "roms/nes/sample.nes");
  assert.equal(normalizeSystemFile("sample.exe", nes), "");
});

test("PS1 BIOS selection accepts local firmware files only", () => {
  const psx = SYSTEM_BY_ID.get("psx");
  assert.equal(normalizeBiosFile("C:\\firmware\\firmware.bin", psx), "bios/psx/firmware.bin");
  assert.equal(normalizeBiosFile("firmware.zip", psx), "");
});

test("local asset URLs preserve filenames containing URL delimiters", () => {
  assert.equal(localAssetUrl("roms/nes/Space #1? 100%.nes"), "roms/nes/Space%20%231%3F%20100%25.nes");
});

test("CD-i firmware uses the core's required name and virtual directory", async () => {
  const cdi = SYSTEM_BY_ID.get("cdi");
  assert.equal(normalizeBiosFile("C:\\firmware\\cdimono1.zip", cdi), "bios/cdi/cdimono1.zip");
  assert.equal(normalizeBiosFile("bios/cdi/cdibios.zip", cdi), "");
  const frameSource = readFileSync("js/emulator-frame.js", "utf8");
  assert.match(frameSource, /EJS_externalFiles = system\.id === "cdi"[\s\S]*?"\/same_cdi\/bios\/"/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, headers: { get: () => "660996" }, body: { cancel: async () => {} } });
  try {
    const invalid = await inspectPsxBios(cdi, "bios/cdi/cdibios.zip");
    assert.equal(invalid.code, "invalid-bios-name");
    const valid = await inspectPsxBios(cdi, "bios/cdi/cdimono1.zip");
    assert.equal(valid.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("library entries are deduplicated, sorted, and sanitized", () => {
  const library = emptyLibrary();
  const gb = SYSTEM_BY_ID.get("gb");
  mergeLibraryEntries(library, gb, ["z.gb", "a.gbc", "z.gb", "bad.exe"]);
  assert.deepEqual(library.gb, ["roms/gb/a.gbc", "roms/gb/z.gb"]);
});

test("the persistent catalog round-trips multiple games per system", () => {
  const library = emptyLibrary();
  mergeLibraryEntries(library, SYSTEM_BY_ID.get("nes"), ["mario.nes", "zelda.nes"]);
  mergeLibraryEntries(library, SYSTEM_BY_ID.get("gb"), ["tetris.gb"]);
  const restored = sanitizeCatalog(JSON.parse(JSON.stringify(library)));
  assert.equal(catalogEntryCount(restored), 3);
  assert.deepEqual(restored.nes, ["roms/nes/mario.nes", "roms/nes/zelda.nes"]);
});

test("missing catalog entries can be removed without touching other games", () => {
  const library = emptyLibrary();
  mergeLibraryEntries(library, SYSTEM_BY_ID.get("gba"), ["keep.gba", "gone.gba"]);
  mergeLibraryEntries(library, SYSTEM_BY_ID.get("n64"), ["legacy.z64"]);
  const next = withoutCatalogEntries(library, new Set(["roms/gba/gone.gba"]));
  assert.deepEqual(next.gba, ["roms/gba/keep.gba"]);
  assert.deepEqual(next.n64, ["roms/legacy.z64"]);
});

test("EmulatorJS automatic gamepad bindings are disabled", () => {
  const controls = buildKeyboardControls();
  for (const mapping of Object.values(controls[0])) {
    if (mapping.value) assert.equal(mapping.value2, "");
  }
});

test("keyboard shortcuts provide a complete no-View game flow", () => {
  assert.equal(keyboardActionFor({ key: "F8", repeat: false }), KEYBOARD_ACTIONS.toggleMode);
  assert.equal(keyboardActionFor({ key: "`", repeat: false }), KEYBOARD_ACTIONS.toggleMode);
  assert.equal(keyboardActionFor({ key: "ArrowLeft", repeat: false }), KEYBOARD_ACTIONS.previousSystem);
  assert.equal(keyboardActionFor({ key: "ArrowRight", repeat: false }), KEYBOARD_ACTIONS.nextSystem);
  assert.equal(keyboardActionFor({ key: "ArrowUp", repeat: false }), KEYBOARD_ACTIONS.previousGame);
  assert.equal(keyboardActionFor({ key: "ArrowDown", repeat: false }), KEYBOARD_ACTIONS.nextGame);
  assert.equal(keyboardActionFor({ key: "Enter", repeat: false }), KEYBOARD_ACTIONS.start);
  assert.equal(keyboardActionFor({ key: "Tab", repeat: false }), KEYBOARD_ACTIONS.start);
  assert.equal(keyboardActionFor({ key: "Escape", repeat: false }), KEYBOARD_ACTIONS.back);
  assert.equal(keyboardActionFor({ key: "F8", repeat: true }), "");
  assert.equal(keyboardActionFor({ key: "x", repeat: false }), "");
});

test("keyboard controls accept per-system overrides", () => {
  const controls = buildKeyboardControls(["j", "k"]);
  assert.equal(controls[0][0].value, "j");
  assert.equal(controls[0][1].value, "k");
  assert.equal(controls[0][2].value, "v");
});

test("keyboard editor slots match each system controller", () => {
  const gameBoyLabels = SYSTEM_BY_ID.get("gb").keyboardControlSlots.map(([, label]) => label);
  const playStationLabels = SYSTEM_BY_ID.get("psx").keyboardControlSlots.map(([, label]) => label);
  assert.deepEqual(gameBoyLabels, ["A", "B", "SELECT", "START", "UP", "DOWN", "LEFT", "RIGHT"]);
  assert.ok(playStationLabels.includes("CROSS"));
  assert.ok(playStationLabels.includes("L2"));
  assert.ok(!gameBoyLabels.includes("L1"));
});

test("selector navigation has an explicit game-list back target and wraps safely", () => {
  assert.equal(backTargetForSelector(SELECTOR_LEVELS.games), SELECTOR_LEVELS.systems);
  assert.equal(backTargetForSelector(SELECTOR_LEVELS.systems), "off");
  assert.equal(wrapIndex(0, -1, 21), 20);
  assert.equal(wrapIndex(20, 1, 21), 0);
  assert.equal(wrapIndex(4, 0, 0), 0);
});

test("keyboard shortcut debounce rejects Lively's duplicate focused key event", () => {
  const gate = new KeyboardShortcutGate();
  assert.equal(gate.accept(KEYBOARD_ACTIONS.toggleMode, 1000), true);
  assert.equal(gate.accept(KEYBOARD_ACTIONS.toggleMode, 1000 + KEYBOARD_DUPLICATE_WINDOW_MS - 1), false);
  assert.equal(gate.accept(KEYBOARD_ACTIONS.toggleMode, 1000 + KEYBOARD_DUPLICATE_WINDOW_MS), true);
  assert.equal(gate.accept(KEYBOARD_ACTIONS.start, 1001), true);
});

test("the emulator render surface stays on-screen beneath the room instead of being visibility-throttled", () => {
  const source = readFileSync("index.html", "utf8");
  assert.doesNotMatch(source, /#emulator-shell[\s\S]*?opacity:\s*0/);
  assert.doesNotMatch(source, /#emulator-shell[\s\S]*?-(?:100|200)v[wh]/);
  assert.match(source, /#container[\s\S]*?z-index:\s*1/);
  assert.match(source, /#emulator-shell[\s\S]*?z-index:\s*0/);
});

test("Enter can reactivate a running core without requiring an iframe click", () => {
  const frameSource = readFileSync("js/emulator-frame.js", "utf8");
  const wallpaperSource = readFileSync("js/retrosignal.js", "utf8");
  assert.match(frameSource, /function activate\([\s\S]*?simulateInput\(0, 3, 1\)/);
  assert.match(frameSource, /context\.state === "suspended"[\s\S]*?context\.resume/);
  assert.match(wallpaperSource, /state\.view === "playing"[\s\S]*?emulatorHost\.activate/);
});

test("the emulator WebGL buffer remains readable by the curved CRT compositor", () => {
  const frameSource = readFileSync("js/emulator-frame.js", "utf8");
  assert.match(frameSource, /preserveDrawingBuffer:\s*true/);
});

test("Lively properties avoid the native folder dropdown crash path", () => {
  const properties = JSON.parse(readFileSync("LivelyProperties.json", "utf8"));
  assert.ok(Object.values(properties).every((property) => property.type !== "folderDropdown"));
  assert.equal(properties.selectedSystem, undefined);
  assert.match(properties.inputHelp.value, /Wallpaper Input/);
});

test("the Lively rescan shortcut defaults to Numpad star and follows its configured choice", () => {
  assert.equal(RESCAN_SHORTCUTS[0].label, "Numpad *");
  assert.equal(isRescanShortcut({ code: "NumpadMultiply", key: "*", repeat: false }, 0), true);
  assert.equal(isRescanShortcut({ code: "KeyR", key: "r", repeat: false }, 4), true);
  assert.equal(isRescanShortcut({ code: "NumpadMultiply", key: "*", repeat: false }, 5), false);
  assert.equal(isRescanShortcut({ code: "NumpadMultiply", key: "*", repeat: true }, 0), false);
});

test("Lively exposes only the simplified active game, display, and camera controls", () => {
  const properties = JSON.parse(readFileSync("LivelyProperties.json", "utf8"));
  assert.equal(properties.backToGameSelection.type, "button");
  assert.equal(properties.rescanShortcut.type, "dropdown");
  assert.equal(properties.rescanShortcut.value, 0);
  assert.equal(properties.rescanShortcut.items[0], "Numpad *");
  assert.equal(properties.crtBlur.type, "slider");
  for (const name of ["reloadLibrary", "removeMissing", "firstRunGuide", "nextSetupStep", "finishSetup", "storageDiagnostic", "closeSetup", "showSetup", "controllerShortcut"]) {
    assert.equal(properties[name], undefined);
  }
  for (const name of ["startSelected", "stopSystem", "previousSystem", "nextSystem"]) {
    assert.equal(properties[name], undefined);
  }
});

test("managed manifest and standalone player bypass local WebView fetch limitations", () => {
  const index = readFileSync("index.html", "utf8");
  const source = readFileSync("js/retrosignal.js", "utf8");
  const desktop = readFileSync("manager/electron-main.mjs", "utf8");
  assert.match(index, /roms\/library\.local\.js/);
  assert.match(source, /RETROSIGNAL_LIBRARY_MANIFEST/);
  assert.match(source, /library\.local\.js\?rescan=\$\{Date\.now\(\)\}/);
  assert.match(source, /library\.local\.json\?refresh=\$\{Date\.now\(\)\}/);
  assert.match(source, /MANAGED_LIBRARY_POLL_MS = 2000/);
  assert.match(source, /startManagedLibraryWatcher\(\)/);
  assert.match(source, /standaloneMode/);
  assert.match(source, /case "crtBlur"/);
  assert.match(desktop, /startManager\(\{[\s\S]*openPlayer: openStandalonePlayer,[\s\S]*isPlayerOpen:/);
  assert.match(desktop, /openPlayerWindow\(/);
  assert.doesNotMatch(desktop, /lively\.setPlayback\(/);
  assert.match(readFileSync("manager/lively-controller.mjs", "utf8"), /app --play/);
  assert.match(desktop, /input\.key === "F10"/);
  assert.match(desktop, /input\.key === "F11"/);
});

test("Lively back action uses the native property callback and the wallpaper keeps hierarchical selection", () => {
  const properties = JSON.parse(readFileSync("LivelyProperties.json", "utf8"));
  assert.equal(properties.backToGameSelection.type, "button");
  assert.match(properties.backToGameSelection.text, /game list/i);
  const source = readFileSync("js/retrosignal.js", "utf8");
  assert.match(source, /case "backToGameSelection"[\s\S]*backToGameSelection\("lively"\)/);
  assert.match(source, /backTargetForSelector\(state\.selectorLevel\)/);
  assert.match(source, /state\.selectorLevel = SELECTOR_LEVELS\.games/);
});

test("PS1 BIOS inspection distinguishes a standard dump from a wrong-size file", async () => {
  const originalFetch = globalThis.fetch;
  const psx = SYSTEM_BY_ID.get("psx");
  globalThis.fetch = async (path) => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-length" ? String(path.includes("small") ? 1024 : 524288) : null) },
    body: { cancel: async () => {} },
  });
  try {
    const valid = await inspectPsxBios(psx, "bios/psx/scph5501.bin");
    assert.equal(valid.ok, true);
    assert.equal(valid.code, "bios-size-ok");
    const invalid = await inspectPsxBios(psx, "bios/psx/small.bin");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, "invalid-bios-size");
    assert.match(invalid.message, /512 KiB/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PS1 BIOS inspection does not mistake a missing Content-Length header for zero bytes", async () => {
  const originalFetch = globalThis.fetch;
  const psx = SYSTEM_BY_ID.get("psx");
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: { cancel: async () => {} },
  });
  try {
    const result = await inspectPsxBios(psx, "bios/psx/scph5501.bin");
    assert.equal(result.ok, true);
    assert.equal(result.code, "bios-found");
    assert.equal(result.size, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("save namespaces are mounted while the legacy N64 path stays intact", () => {
  const managerSource = readFileSync("emulatorjs/src/GameManager.js", "utf8");
  assert.match(managerSource, /saveNamespace \? "\/data\/saves\/" \+ saveNamespace : "\/data\/saves"/);
  assert.match(managerSource, /FS\.mount\(this\.FS\.filesystems\.IDBFS, \{ autoPersist: true \}, this\.savePath\)/);
});

test("readable EmulatorJS assets run without debug cache bypasses or version checks", () => {
  const frameHtml = readFileSync("emulator-frame.html", "utf8");
  const frameSource = readFileSync("js/emulator-frame.js", "utf8");
  const loaderSource = readFileSync("emulatorjs/loader.js", "utf8");
  const emulatorSource = readFileSync("emulatorjs/src/emulator.js", "utf8");
  assert.match(frameSource, /EJS_USE_UNMINIFIED = true/);
  assert.match(frameSource, /EJS_DEBUG_XX = false/);
  assert.match(frameSource, /EJS_DISABLE_VERSION_CHECK = true/);
  assert.match(frameHtml, /emulator-frame\.js\?version=7/);
  assert.match(frameSource, /loader\.js\?retrosignal=7/);
  assert.match(frameSource, /emulator\.js\?retrosignal=7/);
  assert.match(frameSource, /failedToStart/);
  assert.match(frameSource, /emulator-start-failed/);
  assert.match(loaderSource, /EJS_USE_UNMINIFIED === true \|\|/);
  assert.match(emulatorSource, /EJS_DISABLE_VERSION_CHECK !== true/);
  assert.ok((emulatorSource.match(/if \(!this\.debug\)/g) || []).length >= 3);
});

test("compressed games receive extra startup time and expose the real failure", () => {
  const hostSource = readFileSync("js/emulator-host.js", "utf8");
  const wallpaperSource = readFileSync("js/retrosignal.js", "utf8");
  assert.match(hostSource, /ARCHIVE_START_TIMEOUT_MS = 180000/);
  assert.match(hostSource, /\[\"zip\", \"7z\"\]\.includes\(extension\)/);
  assert.match(wallpaperSource, /return event\.message \|\| \"PS1 could not start/);
});

test("frame shutdown releases input, saves, syncs, mutes, and pauses", () => {
  const frameSource = readFileSync("js/emulator-frame.js", "utf8");
  assert.match(frameSource, /releaseInputs\(\)/);
  assert.match(frameSource, /saveSaveFiles/);
  assert.match(frameSource, /flushSaveFileSystem\(fileSystem/);
  assert.match(readFileSync("js/save-flush.js", "utf8"), /syncfs\(false/);
  assert.match(frameSource, /setVolume\?\.\(0\)/);
  assert.match(frameSource, /pause\?\.\(true\)/);
  assert.match(frameSource, /try \{\s+const current = emulator\(\);\s+if \(!current\) return;/);
  assert.match(frameSource, /finally \{\s+suspendPromise = null;/);
});

test("launch validation returns friendly errors before starting a core", async () => {
  const n64 = SYSTEM_BY_ID.get("n64");
  const psx = SYSTEM_BY_ID.get("psx");
  assert.deepEqual(await validateLaunch(n64, ""), {
    ok: false,
    code: "missing-rom",
    message: "Add a N64 game in Customize.",
  });
  assert.equal((await validateLaunch(n64, "roms/sample.exe")).code, "unsupported-file");
  assert.equal((await validateLaunch(psx, "roms/psx/sample.chd", "")).code, "missing-bios");
});

test("launch validation identifies absent core files", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path) => ({
    ok: String(path).startsWith("roms/"),
    status: String(path).startsWith("roms/") ? 200 : 404,
    body: { cancel: async () => {} },
  });
  try {
    const result = await validateLaunch(SYSTEM_BY_ID.get("gb"), "roms/gb/sample.gb");
    assert.equal(result.code, "missing-core");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("every system has a deterministic direct-controller mapping", () => {
  for (const system of SYSTEMS) {
    assert.ok(system.buttons.length > 0, `${system.id} buttons`);
    for (const [physicalButton, coreInput] of system.buttons) {
      assert.ok(Number.isInteger(physicalButton) && physicalButton >= 0 && physicalButton <= 15);
      assert.ok(Number.isInteger(coreInput) && coreInput >= 0 && coreInput <= 23);
    }
  }
});
