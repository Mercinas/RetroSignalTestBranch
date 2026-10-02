import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SYSTEMS } from "../js/systems.js";
import { migrateLivelyInstall } from "../tools/migrate-lively-install.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "retrosignal-migration-test-"));
  const wallpaperRoot = join(root, "RetroSignal");
  const savedPath = join(root, "saved-properties.json");
  await mkdir(join(wallpaperRoot, "roms"), { recursive: true });
  await writeFile(join(wallpaperRoot, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal", FileName: "index.html", Type: 1 }));
  await writeFile(join(wallpaperRoot, "LivelyProperties.json"), JSON.stringify({ legacy: { type: "text", value: "legacy" } }));
  await writeFile(join(wallpaperRoot, "roms", "library.local.json"), JSON.stringify({ bios: {}, n64: ["roms/existing.z64"] }));
  const n64 = SYSTEMS.find((system) => system.id === "n64");
  await writeFile(savedPath, JSON.stringify({
    [n64.property]: { type: "text", value: "C:\\old-library\\migrated.z64" },
    xAngleCamera: { type: "slider", value: 33 },
  }));
  return { root, wallpaperRoot, savedPath };
}

test("migration preserves existing manifest entries and stays idempotent", async () => {
  const { root, wallpaperRoot, savedPath } = await fixture();
  const options = { wallpaperRoot, savedPath, apply: true, backupBasePath: join(root, "MigrationBackups") };
  const first = await migrateLivelyInstall(options);
  assert.equal(first.applied, true);
  assert.deepEqual(first.manifest.n64, ["roms/existing.z64", "roms/migrated.z64"]);
  assert.equal(JSON.parse(await readFile(join(wallpaperRoot, "roms", ".retrosignal-migration.json"), "utf8")).version, 1);
  assert.ok((await readdir(first.backupRoot)).includes("library.local.json"));

  const second = await migrateLivelyInstall(options);
  assert.deepEqual(second.manifest.n64, first.manifest.n64);
  assert.deepEqual(JSON.parse(await readFile(join(wallpaperRoot, "roms", "library.local.json"), "utf8")).n64, first.manifest.n64);
  assert.equal(JSON.parse(await readFile(savedPath, "utf8")).xAngleCamera.value, 33);
});

test("migration rejects an ambiguous or self-referential target", async () => {
  const { wallpaperRoot, savedPath } = await fixture();
  await assert.rejects(() => migrateLivelyInstall({ wallpaperRoot, savedPath: join(wallpaperRoot, "LivelyProperties.json") }), /cannot be the target wallpaper schema/);
  await writeFile(join(wallpaperRoot, "LivelyInfo.json"), JSON.stringify({ Title: "RetroSignal copy", FileName: "index.html", Type: 1 }));
  await assert.rejects(() => migrateLivelyInstall({ wallpaperRoot, savedPath }), /exact RetroSignal installation/);
});
