import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classifyArchiveEntries, createManager, discoverInstalledWallpaper, importRomSource, scanRomSource, startManager } from "../manager/server.js";

test("manager identifies flat compressed ROMs from their archive contents", () => {
  assert.equal(classifyArchiveEntries(["Game.sfc", "readme.txt"]).system.id, "snes");
  assert.equal(classifyArchiveEntries(["Game.gb", "readme.txt"]).system.id, "gb");
  assert.equal(classifyArchiveEntries(["Game.z64", "readme.txt"]).system.id, "n64");
  assert.equal(classifyArchiveEntries(["Sonic.md"], "SEGA GENESIS").system.id, "genesis");
  assert.equal(classifyArchiveEntries(["Game.md"], "SEGA 32X").system.id, "sega32x");
  assert.equal(
    classifyArchiveEntries(["Game/Game.bin", "Game/Game.cue"], "Licensed by Sony Computer Entertainment").system.id,
    "psx",
  );
  assert.equal(
    classifyArchiveEntries(["Game/Game.bin", "Game/Game.cue"], "SEGA SEGASATURN").system.id,
    "saturn",
  );
});

test("manager stores authenticated saves and keeps a prior backup", async (context) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "retrosignal-manager-test-"));
  const manager = createManager({ dataRoot, port: 0, token: "a".repeat(43) });
  await new Promise((resolve) => manager.server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => manager.server.close(resolve)));
  const port = manager.server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/v1/saves/nes-deadbeef`;
  const headers = { "X-RetroSignal-Token": manager.token, "Content-Type": "application/json" };

  const page = await fetch(`http://127.0.0.1:${port}/`);
  const pageHtml = await page.text();
  assert.doesNotMatch(pageHtml, /N64 quick start|Open N64 library|Manager library folder/);
  assert.match(pageHtml, /Folder containing ROMs and BIOS files/);
  assert.match(pageHtml, /Choose folder/);
  assert.match(pageHtml, /Import games/);
  assert.doesNotMatch(pageHtml, /choose-wallpaper|Installed RetroSignal wallpaper folder/);
  assert.match(pageHtml, /retro-manager-banner\.png/);
  assert.match(pageHtml, /Manager font/);
  assert.match(pageHtml, /id="open-player">Open emulator player/);
  assert.match(pageHtml, /id="open-lively">Open Lively/);
  assert.match(pageHtml, /Open a system to see synced games/);
  assert.match(pageHtml, /class="system-open"/);
  assert.match(pageHtml, /Controller mapping/);
  assert.match(pageHtml, /Keyboard mapping/);
  assert.match(pageHtml, /data-controller-mapper/);
  assert.match(pageHtml, /LEFT STICK/);
  assert.doesNotMatch(pageHtml, /Pixel garden|retrosignal-manager-garden|manager-garden-host/);
  assert.doesNotMatch(pageHtml, new RegExp(manager.token));
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const cookie = page.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);

  const unauthorized = await fetch(endpoint);
  assert.equal(unauthorized.status, 401);
  const cookieAuthorized = await fetch(endpoint, { headers: { Cookie: cookie } });
  assert.equal(cookieAuthorized.status, 404);
  const disabledGardenAsset = await fetch(`http://127.0.0.1:${port}/manager-garden/manager/main.js`, { headers: { Cookie: cookie } });
  assert.equal(disabledGardenAsset.status, 404);

  const deniedCors = await fetch(endpoint, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(deniedCors.status, 403);
  assert.equal(deniedCors.headers.get("access-control-allow-origin"), null);
  const livelyCors = await fetch(endpoint, {
    method: "OPTIONS",
    headers: { Origin: "null" },
  });
  assert.equal(livelyCors.status, 204);
  assert.equal(livelyCors.headers.get("access-control-allow-origin"), "null");

  const invalidContentType = await fetch(endpoint, {
    method: "PUT",
    headers: { "X-RetroSignal-Token": manager.token, "Content-Type": "text/plain" },
    body: "not-json",
  });
  assert.equal(invalidContentType.status, 415);

  const first = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify({ files: [
      { path: "game.srm", data: Buffer.from("first").toString("base64") },
      { path: "stale.state", data: Buffer.from("stale").toString("base64") },
    ] }),
  });
  assert.equal(first.status, 200);
  const second = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify({ files: [{ path: "game.srm", data: Buffer.from("second").toString("base64") }] }),
  });
  assert.equal(second.status, 200);

  const restored = await fetch(endpoint, { headers: { "X-RetroSignal-Token": manager.token } });
  const payload = await restored.json();
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].path, "game.srm");
  assert.equal(Buffer.from(payload.files[0].data, "base64").toString(), "second");
  const backups = await readdir(join(dataRoot, "Backups", "nes-deadbeef"));
  assert.equal(backups.length, 1);

  const savesRoot = join(dataRoot, "Saves");
  const activeRoot = join(savesRoot, "nes-deadbeef");
  const incompleteStage = join(savesRoot, ".nes-deadbeef.staging-incomplete");
  await mkdir(incompleteStage, { recursive: true });
  await writeFile(join(incompleteStage, "partial.srm"), "partial");
  await rename(activeRoot, join(dataRoot, "parked-active-snapshot"));
  const recovered = await fetch(endpoint, { headers });
  const recoveredPayload = await recovered.json();
  assert.equal(recovered.status, 200);
  assert.equal(Buffer.from(recoveredPayload.files[0].data, "base64").toString(), "first");

  const malformed = await fetch(`http://127.0.0.1:${port}/api/v1/saves/%`, { headers: { "X-RetroSignal-Token": manager.token } });
  assert.equal(malformed.status, 400);
});

test("manager recursively imports supported ROMs, reports unusable files, and creates destinations", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-source-import-test-"));
  const source = join(root, "My ROMs");
  const wallpaper = join(root, "Wallpaper");
  await mkdir(join(source, "n64", "collection"), { recursive: true });
  await mkdir(join(source, "nes"), { recursive: true });
  await mkdir(join(wallpaper, "roms", "nes"), { recursive: true });
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  await writeFile(join(wallpaper, "roms", "nes", "zelda.nes"), "existing-nes-fixture");
  await writeFile(join(source, "n64", "collection", "mario.z64"), "n64-fixture");
  await writeFile(join(source, "n64", "collection", "mario-copy.z64"), "n64-fixture");
  await writeFile(join(source, "nes", "zelda.nes"), "nes-fixture");
  await writeFile(join(source, "readme.txt"), "not a game");
  await writeFile(join(source, "ambiguous.bin"), "shared extension");
  await writeFile(join(source, "empty.gba"), "");

  const scan = await scanRomSource(source);
  assert.equal(scan.files.length, 3);
  assert.equal(scan.unsupported.length, 1);
  assert.equal(scan.ambiguous.length, 1);
  assert.equal(scan.invalid.length, 1);

  const first = await importRomSource(source, wallpaper);
  assert.equal(first.imported.length, 2);
  assert.equal(first.renamed.length, 1);
  assert.equal(first.alreadyImported.length, 1);
  assert.equal(first.unsupported.length, 1);
  assert.equal(first.ambiguous.length, 1);
  assert.equal(first.invalid.length, 1);
  const importedN64Path = first.manifest.n64[0].split("/").pop();
  assert.equal(await readFile(join(wallpaper, "roms", importedN64Path), "utf8"), "n64-fixture");
  assert.equal(await readFile(join(wallpaper, "roms", "nes", "zelda.nes"), "utf8"), "existing-nes-fixture");
  assert.equal(first.manifest.n64.length, 1);
  assert.match(first.manifest.n64[0], /^roms\/mario/);
  assert.deepEqual(first.manifest.nes, ["roms/nes/zelda (2).nes"]);
  assert.equal(await readFile(join(wallpaper, "roms", "nes", "zelda (2).nes"), "utf8"), "nes-fixture");
  const scriptManifest = await readFile(join(wallpaper, "roms", "library.local.js"), "utf8");
  assert.match(scriptManifest, /RETROSIGNAL_LIBRARY_MANIFEST/);
  assert.match(scriptManifest, /zelda \(2\)\.nes/);

  const second = await importRomSource(source, wallpaper);
  assert.equal(second.imported.length, 0);
  assert.equal(second.renamed.length, 0);
  assert.equal(second.alreadyImported.length, 3);
  assert.equal(existsSync(join(root, "missing-source")), false);
  const missing = await scanRomSource(join(root, "missing-source"));
  assert.deepEqual(missing.files, []);
  assert.equal(existsSync(join(root, "missing-source")), true);
});

test("manager imports firmware from an explicit BIOS system folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-bios-import-test-"));
  const source = join(root, "source");
  const wallpaper = join(root, "Wallpaper");
  await mkdir(join(source, "bios", "psx"), { recursive: true });
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  await writeFile(join(source, "bios", "psx", "scph5501.bin"), Buffer.alloc(512 * 1024, 7));
  await writeFile(join(source, "bios", "psx", "wrong-size.bin"), Buffer.alloc(10, 7));

  const scan = await scanRomSource(source);
  assert.equal(scan.files.length, 0);
  assert.equal(scan.bios.length, 1);
  assert.equal(scan.bios[0].system.id, "psx");
  assert.equal(scan.invalid.length, 1);

  const result = await importRomSource(source, wallpaper);
  assert.equal(result.imported.length, 1);
  assert.equal(result.imported[0].kind, "bios");
  assert.equal(result.manifest.bios.psx, "bios/psx/scph5501.bin");
  assert.equal((await readFile(join(wallpaper, "bios", "psx", "scph5501.bin"))).byteLength, 512 * 1024);
});

test("manager recognizes a normally named PS1 BIOS beside flat ROM files", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-flat-bios-test-"));
  const source = join(root, "source");
  const wallpaper = join(root, "Wallpaper");
  await mkdir(source, { recursive: true });
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(source, "SCPH1001.BIN"), Buffer.alloc(512 * 1024, 7));
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));

  const scan = await scanRomSource(source);
  assert.equal(scan.bios.length, 1);
  assert.equal(scan.bios[0].system.id, "psx");
  assert.equal(scan.ambiguous.length, 0);

  const result = await importRomSource(source, wallpaper);
  assert.equal(result.imported.length, 1);
  assert.equal(result.manifest.bios.psx, "bios/psx/scph5501.bin");
  assert.equal((await readFile(join(wallpaper, "bios", "psx", "scph5501.bin"))).byteLength, 512 * 1024);
});

test("manager finds a PS1 BIOS inside the ROM directory tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-nested-ps1-bios-test-"));
  const source = join(root, "source");
  const wallpaper = join(root, "Wallpaper");
  await mkdir(join(source, "roms", "psx", "firmware"), { recursive: true });
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(source, "roms", "psx", "firmware", "PS1.BIN"), Buffer.alloc(512 * 1024, 9));
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));

  const scan = await scanRomSource(source);
  assert.equal(scan.bios.length, 1);
  assert.equal(scan.bios[0].system.id, "psx");
  assert.equal(scan.bios[0].relativePath, "roms/psx/firmware/PS1.BIN");

  const result = await importRomSource(source, wallpaper);
  assert.equal(result.imported.length, 1);
  assert.equal(result.manifest.bios.psx, "bios/psx/scph5501.bin");
  assert.equal((await readFile(join(wallpaper, "bios", "psx", "scph5501.bin"))).byteLength, 512 * 1024);
});

test("manager repairs a previously imported noncanonical PS1 BIOS filename", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-bios-repair-test-"));
  const source = join(root, "source");
  const wallpaper = join(root, "Wallpaper");
  const bytes = Buffer.alloc(512 * 1024, 7);
  await mkdir(source, { recursive: true });
  await mkdir(join(wallpaper, "bios", "psx"), { recursive: true });
  await mkdir(join(wallpaper, "roms"), { recursive: true });
  await writeFile(join(source, "SCPH1001.BIN"), bytes);
  await writeFile(join(wallpaper, "bios", "psx", "SCPH1001.BIN"), bytes);
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  await writeFile(join(wallpaper, "roms", "library.local.json"), JSON.stringify({ bios: { psx: "bios/psx/SCPH1001.BIN" } }));

  const result = await importRomSource(source, wallpaper);
  assert.equal(result.failed.length, 0);
  assert.equal(result.renamed.length, 1);
  assert.equal(result.manifest.bios.psx, "bios/psx/scph5501.bin");
  assert.deepEqual(await readFile(join(wallpaper, "bios", "psx", "scph5501.bin")), bytes);
});

test("manager pair endpoint remembers a ROM source for the next desktop launch", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-source-pair-test-"));
  const source = join(root, "source");
  const wallpaper = join(root, "Wallpaper");
  const dataRoot = join(root, "ManagerData");
  await mkdir(join(source, "gba"), { recursive: true });
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(source, "gba", "metroid.gba"), "gba-fixture");
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));

  const manager = createManager({ dataRoot, port: 0, token: "c".repeat(43), wallpaperPath: wallpaper });
  await new Promise((resolve) => manager.server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => manager.server.close(resolve)));
  const endpoint = `http://127.0.0.1:${manager.server.address().port}`;
  const page = await fetch(`${endpoint}/`);
  const pair = await fetch(`${endpoint}/api/v1/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: page.headers.get("set-cookie") },
    body: JSON.stringify({ sourcePath: source }),
  });
  const payload = await pair.json();
  assert.equal(pair.status, 200);
  assert.equal(payload.imported, 1);
  assert.equal(payload.alreadyImported, 0);
  assert.equal(payload.sourceRoot, source);
  assert.equal(payload.biosImported, 0);
  assert.equal(await readFile(join(wallpaper, "roms", "gba", "metroid.gba"), "utf8"), "gba-fixture");
  assert.equal(JSON.parse(await readFile(join(dataRoot, "rom-source.json"), "utf8")).sourcePath, source);
  assert.equal(JSON.parse(await readFile(join(dataRoot, "paired-wallpaper.json"), "utf8")).wallpaperPath, wallpaper);

  const library = await fetch(`${endpoint}/api/v1/library`, {
    headers: { "X-RetroSignal-Token": manager.token },
  });
  const libraryPayload = await library.json();
  assert.equal(library.status, 200);
  assert.deepEqual(libraryPayload.manifest.gba, ["roms/gba/metroid.gba"]);
  assert.equal(libraryPayload.report.imported.length, 1);
  assert.deepEqual(libraryPayload.controls.gba, []);
  assert.match((await fetch(`${endpoint}/`).then((response) => response.text())), /data-system-id="gba"/);

  const controls = await fetch(`${endpoint}/api/v1/controls`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-RetroSignal-Token": manager.token },
    body: JSON.stringify({ systemId: "gba", bindings: ["b", "c", "u", "p"] }),
  });
  assert.equal(controls.status, 200);
  assert.deepEqual((await controls.json()).bindings.slice(0, 4), ["b", "c", "u", "p"]);
  assert.deepEqual(JSON.parse(await readFile(join(wallpaper, "keyboard-controls.json"))).gba.slice(0, 4), ["b", "c", "u", "p"]);

  for (const asset of ['component.js', 'layouts.js', 'binding-state.js', 'illustrations.js', 'integration.js', 'controller-layouts.css']) {
    const resource = await fetch(`${endpoint}/controller-layouts/${asset}`, { headers: { 'X-RetroSignal-Token': manager.token } });
    assert.equal(resource.status, 200, asset);
    assert.match(resource.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /text\/javascript/);
  }
  const hiddenConfig = JSON.parse(await readFile(join(wallpaper, 'keyboard-controls.json')));
  hiddenConfig.n64 = []; hiddenConfig.n64[12] = 'b'; hiddenConfig.n64[31] = 'legacy-hidden-key';
  await writeFile(join(wallpaper, 'keyboard-controls.json'), JSON.stringify(hiddenConfig));
  const sparse = await fetch(`${endpoint}/api/v1/controls`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RetroSignal-Token': manager.token },
    body: JSON.stringify({ systemId: 'n64', bindings: { 23: 'o' } }),
  });
  assert.equal(sparse.status, 200);
  const persisted = JSON.parse(await readFile(join(wallpaper, 'keyboard-controls.json')));
  assert.equal(persisted.n64[23], 'o'); assert.equal(persisted.n64[12], 'b'); assert.equal(persisted.n64[31], 'legacy-hidden-key');
  const rejected = await fetch(`${endpoint}/api/v1/controls`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RetroSignal-Token': manager.token },
    body: JSON.stringify({ systemId: 'n64', bindings: { 0: 'o' } }),
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(JSON.parse(await readFile(join(wallpaper, 'keyboard-controls.json'))), persisted);

  await writeFile(join(source, "gba", "advance-wars.gba"), "second-gba-fixture");
  const rescan = await fetch(`${endpoint}/api/v1/rescan`, {
    method: "POST",
    headers: { "X-RetroSignal-Token": manager.token },
  });
  const rescanned = await rescan.json();
  assert.equal(rescan.status, 200);
  assert.equal(rescanned.imported, 1);
  assert.ok(rescanned.manifest.gba.includes("roms/gba/advance-wars.gba"));
  assert.equal(await readFile(join(wallpaper, "roms", "gba", "advance-wars.gba"), "utf8"), "second-gba-fixture");

  const nextPage = await fetch(`${endpoint}/`);
  assert.match(await nextPage.text(), new RegExp(source.replaceAll("\\", "\\\\")));
});

test("manager startup persists its token and reports its local endpoint", async (context) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "retrosignal-startup-test-"));
  const first = await startManager({ dataRoot, port: 0, discoverWallpaper: false });
  context.after(() => new Promise((resolve) => first.server.close(resolve)));
  assert.match(first.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
  const storedToken = await readFile(join(dataRoot, "manager-token.txt"), "utf8");
  assert.equal(storedToken.trim(), first.token);
});

test("manager refreshes the wallpaper connection whenever the desktop app starts", async (context) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "retrosignal-startup-pair-test-"));
  const wallpaper = join(dataRoot, "Wallpaper");
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  const manager = await startManager({ dataRoot, wallpaperPath: wallpaper, port: 0 });
  context.after(() => new Promise((resolve) => manager.server.close(resolve)));
  const config = JSON.parse(await readFile(join(wallpaper, "manager.json"), "utf8"));
  assert.equal(config.endpoint, manager.endpoint);
  assert.equal(config.token, manager.token);
});

test("manager discovers the compatible wallpaper inside a Lively library", async () => {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-lively-discovery-test-"));
  const unrelated = join(root, "other-wallpaper");
  const expected = join(root, "hashed-retrosignal-folder");
  await mkdir(unrelated, { recursive: true });
  await mkdir(expected, { recursive: true });
  await writeFile(join(unrelated, "LivelyInfo.json"), JSON.stringify({ Title: "Something Else", Type: 1, FileName: "index.html" }));
  await writeFile(join(expected, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  assert.equal(await discoverInstalledWallpaper([root]), expected);
});

test("manager desktop player endpoint uses the authenticated local callback", async (context) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "retrosignal-player-endpoint-test-"));
  const wallpaper = join(dataRoot, "Wallpaper");
  await mkdir(wallpaper, { recursive: true });
  await writeFile(join(wallpaper, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", Type: 1, FileName: "index.html" }));
  let received;
  const manager = createManager({ dataRoot, port: 0, token: "p".repeat(43), wallpaperPath: wallpaper, openPlayer: async (options) => { received = options; } });
  await new Promise((resolve) => manager.server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => manager.server.close(resolve)));
  const endpoint = `http://127.0.0.1:${manager.server.address().port}`;
  const page = await fetch(`${endpoint}/`);
  const response = await fetch(`${endpoint}/api/v1/player`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: page.headers.get("set-cookie") },
    body: JSON.stringify({ blur: 1.5 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { wallpaperPath: wallpaper, blur: 1.5 });
});
