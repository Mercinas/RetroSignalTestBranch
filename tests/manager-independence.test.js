import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createLivelyController } from "../manager/lively-controller.mjs";
import { prepareStandaloneRuntime } from "../manager/player-runtime.mjs";
import { startManager } from "../manager/server.js";

async function runtimeFixture() {
  const base = await mkdtemp(join(tmpdir(), "retrosignal-independent-"));
  const source = join(base, "bundle");
  const dataRoot = join(base, "data");
  await mkdir(source);
  for (const directory of ["js", "models", "textures", "emulatorjs", "roms", "bios"]) await mkdir(join(source, directory));
  await mkdir(join(source, "emulatorjs", "cores"));
  await mkdir(join(source, "docs", "screenshots"), { recursive: true });
  await writeFile(join(source, "docs", "screenshots", "selector.png"), "preview-fixture");
  await writeFile(join(source, "emulatorjs", "cores", "RELEASE_FILES.txt"), "approved-legacy-wasm.data\n");
  await writeFile(join(source, "emulatorjs", "cores", "approved-legacy-wasm.data"), "approved-core");
  await writeFile(join(source, "emulatorjs", "cores", "unshipped-thread-wasm.data"), "development-core");
  for (const file of ["index.html", "emulator-frame.html", "LivelyProperties.json", "VERSION"]) await writeFile(join(source, file), "fixture");
  await writeFile(join(source, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html", Thumbnail: "docs/screenshots/selector.png", Preview: "docs/screenshots/selector.png" }));
  await writeFile(join(source, "js", "runtime.js"), "initial-code");
  await writeFile(join(source, "roms", "must-not-copy.gba"), "not-part-of-bundle");
  return { base, source, dataRoot };
}

test("Lively controller is inert until requested and playback never starts stopped Lively", async () => {
  const calls = [];
  const controller = createLivelyController({ execute: (command, args, options, done) => {
    calls.push({ command, script: args.at(-1), options });
    done(null, '{"changed":false}');
  } });
  assert.equal(calls.length, 0);
  assert.equal((await controller.setPlayback(false)).changed, false);
  assert.equal((await controller.setPlayback(true)).changed, false);
  for (const call of calls) {
    assert.equal(call.options.windowsHide, true);
    assert.ok(call.script.indexOf("if (!$livelyProcess)") < call.script.indexOf("& $livelyExe app --play"));
    assert.equal(call.script.includes("Start-Process"), false);
  }
});

test("Lively commands parse as PowerShell without executing them", { skip: process.platform !== "win32" }, async () => {
  const scripts = [];
  const controller = createLivelyController({ execute: (_command, args, _options, done) => {
    scripts.push(args.at(-1)); done(null, "{}");
  } });
  await controller.open();
  await controller.setPlayback(false);
  await controller.setPlayback(true);
  for (const script of scripts) {
    const parseOnly = `$parseErrors = $null; [void][System.Management.Automation.Language.Parser]::ParseInput('${script.replaceAll("'", "''")}', [ref]$null, [ref]$parseErrors); if ($parseErrors.Count) { $parseErrors | Out-String | Write-Error; exit 1 }`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", parseOnly], { windowsHide: true, timeout: 10_000 });
  }
});

test("bundled runtime updates preserve games, BIOS, controls and connection settings", async () => {
  const { source, dataRoot } = await runtimeFixture();
  const player = await prepareStandaloneRuntime(source, dataRoot);
  const metadata = JSON.parse(await readFile(join(player, "LivelyInfo.json"), "utf8"));
  assert.equal(await readFile(join(player, metadata.Thumbnail), "utf8"), "preview-fixture");
  assert.equal(await readFile(join(player, metadata.Preview), "utf8"), "preview-fixture");
  await assert.rejects(readFile(join(player, "roms", "must-not-copy.gba")), { code: "ENOENT" });
  await assert.rejects(readFile(join(player, "emulatorjs", "cores", "unshipped-thread-wasm.data")), { code: "ENOENT" });
  assert.equal(await readFile(join(player, "emulatorjs", "cores", "approved-legacy-wasm.data"), "utf8"), "approved-core");
  const userFiles = ["roms/game.gba", "bios/firmware.bin", "keyboard-controls.json", "manager.json"];
  for (const file of userFiles) await writeFile(join(player, file), "preserved-user-data");
  await writeFile(join(source, "js", "runtime.js"), "updated-code");
  assert.equal(await prepareStandaloneRuntime(source, dataRoot), player);
  assert.equal(await readFile(join(player, "js", "runtime.js"), "utf8"), "updated-code");
  for (const file of userFiles) assert.equal(await readFile(join(player, file), "utf8"), "preserved-user-data");
});

test("Manager bundles the pinned release core allowlist without games or firmware", async () => {
  const packageManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const filter = packageManifest.build.extraResources.find(resource => resource.to === "player-runtime").filter;
  const metadata = JSON.parse(await readFile(new URL("../LivelyInfo.json", import.meta.url), "utf8"));
  assert.ok(filter.includes(metadata.Thumbnail));
  assert.ok(filter.includes(metadata.Preview));
  const expected = (await readFile(new URL("../emulatorjs/cores/RELEASE_FILES.txt", import.meta.url), "utf8")).trim().split(/\r?\n/).map(core => `emulatorjs/cores/${core}`).sort();
  assert.deepEqual(filter.filter(path => path.endsWith(".data")).sort(), expected);
  assert.equal(filter.includes("emulatorjs/**/*"), false);
  assert.equal(filter.some(path => path.startsWith("roms/") || path.startsWith("bios/")), false);
});

test("Manager works with its bundled player and opens optional Lively only on authenticated request", async context => {
  const { source, dataRoot, base } = await runtimeFixture();
  const standaloneRuntimePath = await prepareStandaloneRuntime(source, dataRoot);
  let livelyRequests = 0;
  let playerOptions;
  let settings;
  const manager = await startManager({ dataRoot, port: 0, discoverWallpaper: false, standaloneRuntimePath,
    openLively: async () => { livelyRequests += 1; return { opened: false, message: "Lively is not installed. The Manager works independently." }; },
    openPlayer: async options => { playerOptions = options; },
    updatePlayerSettings: async payload => { settings = payload; return false; },
  });
  context.after(() => new Promise(resolve => manager.server.close(resolve)));
  const page = await fetch(manager.endpoint);
  const html = await page.text();
  assert.match(html, /id="open-lively">Open Lively/);
  assert.match(html, /standalone player works without Lively/);
  assert.match(html, /bundled player works without Lively/);
  assert.doesNotMatch(html, /<li>Import the <strong>.* Wallpaper<\/strong> folder into Lively\.<\/li>/);
  assert.doesNotMatch(html, /IMPORT THE .* WALLPAPER INTO LIVELY FIRST/);
  assert.equal(livelyRequests, 0);
  const headers = { "Content-Type": "application/json", "X-RetroSignal-Token": manager.token };
  const unauthenticatedSettings = await fetch(manager.endpoint + "/api/v1/player-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"blur":2}' });
  assert.equal(unauthenticatedSettings.status, 401);
  assert.equal(settings, undefined);
  const liveSettings = await fetch(manager.endpoint + "/api/v1/player-settings", { method: "POST", headers, body: '{"blur":2,"monochrome":true}' });
  assert.equal(liveSettings.status, 200);
  assert.equal((await liveSettings.json()).updated, false);
  assert.deepEqual(settings, { blur: 2, monochrome: true, sepia: false, hue: 0, saturation: 100, contrast: 100 });
  assert.equal(playerOptions, undefined, "Live updates must never open or refocus a player");
  assert.equal(livelyRequests, 0);
  const forbidden = await fetch(manager.endpoint + "/api/v1/open-lively", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forbidden.status, 401);
  assert.equal(livelyRequests, 0);
  const optional = await fetch(manager.endpoint + "/api/v1/open-lively", { method: "POST", headers, body: "{}" });
  assert.equal(optional.status, 200);
  assert.equal((await optional.json()).opened, false);
  assert.equal(livelyRequests, 1);
  const games = join(base, "games", "gba");
  await mkdir(games, { recursive: true });
  await writeFile(join(games, "synthetic.gba"), "gba-test-fixture");
  const imported = await fetch(manager.endpoint + "/api/v1/pair", { method: "POST", headers, body: JSON.stringify({ sourcePath: join(base, "games") }) });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).games, 1);
  assert.equal(await readFile(join(standaloneRuntimePath, "roms", "gba", "synthetic.gba"), "utf8"), "gba-test-fixture");
  const player = await fetch(manager.endpoint + "/api/v1/player", { method: "POST", headers, body: "{}" });
  assert.equal(player.status, 200);
  assert.equal(playerOptions.wallpaperPath, standaloneRuntimePath);
  assert.equal(livelyRequests, 1);
});

test("display preferences survive Manager restart without a player or wallpaper dependency", async context => {
  const { source, dataRoot } = await runtimeFixture();
  const standaloneRuntimePath = await prepareStandaloneRuntime(source, dataRoot);
  const settings = { blur: 2.5, monochrome: false, sepia: true, hue: 25, saturation: 85, contrast: 115 };
  let manager = await startManager({ dataRoot, port: 0, discoverWallpaper: false, standaloneRuntimePath, updatePlayerSettings: async () => false });
  context.after(() => new Promise(resolve => manager.server.close(resolve)));
  const headers = { "Content-Type": "application/json", "X-RetroSignal-Token": manager.token };
  const initial = await fetch(manager.endpoint + "/api/v1/display-settings", { headers });
  assert.equal((await initial.json()).saved, false);
  const saved = await fetch(manager.endpoint + "/api/v1/player-settings", { method: "POST", headers, body: JSON.stringify(settings) });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).updated, false);
  await new Promise(resolve => manager.server.close(resolve));
  manager = await startManager({ dataRoot, port: 0, discoverWallpaper: false, standaloneRuntimePath, updatePlayerSettings: async () => false });
  const restored = await fetch(manager.endpoint + "/api/v1/display-settings", { headers: { "X-RetroSignal-Token": manager.token } });
  assert.deepEqual(await restored.json(), { saved: true, settings });
});
