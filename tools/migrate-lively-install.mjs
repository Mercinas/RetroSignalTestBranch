import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { biosKey, normalizeBiosFile, normalizeSystemFile, SYSTEMS } from "../js/systems.js";

const MIGRATION_VERSION = 1;
const MANIFEST_NAME = "library.local.json";
const MARKER_NAME = ".retrosignal-migration.json";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, text);
  await rename(temporary, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfPresent(path, fallback) {
  return existsSync(path) ? readJson(path) : fallback;
}

function migrationBackupRoot(wallpaperRoot, backupBasePath, applicationName) {
  const folderName = String(applicationName || "wallpaper").replace(/[<>:"/\\|?*]/g, "").trim() || "wallpaper";
  return join(
    backupBasePath || join(process.env.LOCALAPPDATA || dirname(wallpaperRoot), folderName, "MigrationBackups"),
    new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"),
    basename(wallpaperRoot),
  );
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function migrateProperties(schema, saved) {
  return Object.fromEntries(Object.entries(schema).map(([name, property]) => {
    const previous = saved?.[name];
    return [name, previous?.type === property.type ? { ...property, value: previous.value } : property];
  }));
}

export function buildManifest(saved) {
  const manifest = { bios: {} };
  for (const system of SYSTEMS) {
    const rom = normalizeSystemFile(saved?.[system.property]?.value, system);
    manifest[system.id] = rom ? [rom] : [];
    if (system.biosRequired) {
      const firmware = normalizeBiosFile(saved?.[system.biosProperty]?.value, system);
      if (firmware) manifest.bios[biosKey(system)] = firmware;
    }
  }
  return manifest;
}

export function mergeManifest(existing, migrated) {
  const manifest = { bios: {} };
  for (const system of SYSTEMS) {
    const values = [
      ...(Array.isArray(existing?.[system.id]) ? existing[system.id] : []),
      ...(Array.isArray(migrated?.[system.id]) ? migrated[system.id] : []),
    ].map((value) => normalizeSystemFile(value, system));
    manifest[system.id] = uniqueSorted(values);
    if (system.biosRequired) {
      const firmware = normalizeBiosFile(existing?.bios?.[biosKey(system)], system)
        || normalizeBiosFile(migrated?.bios?.[biosKey(system)], system);
      if (firmware) manifest.bios[biosKey(system)] = firmware;
    }
  }
  return manifest;
}

async function validateWallpaperTarget(wallpaperRoot, savedPath, projectRoot) {
  const infoPath = join(wallpaperRoot, "LivelyInfo.json");
  const propertiesPath = join(wallpaperRoot, "LivelyProperties.json");
  if (!existsSync(infoPath) || !existsSync(propertiesPath)) throw new Error("The target does not contain a compatible wallpaper installation.");
  if (resolve(propertiesPath) === resolve(savedPath)) throw new Error("The saved properties source cannot be the target wallpaper schema.");
  const [info, expected] = await Promise.all([
    readJson(infoPath),
    readJson(join(projectRoot, "LivelyInfo.json")),
  ]);
  if (info.Title !== expected.Title || info.FileName !== expected.FileName || info.Type !== expected.Type) {
    throw new Error(`The wallpaper folder is not an exact ${expected.Title || "compatible"} installation.`);
  }
  return info;
}

async function backupFileIfPresent(source, target) {
  if (existsSync(source)) await copyFile(source, target);
}

export async function migrateLivelyInstall({ wallpaperRoot, savedPath, apply = false, projectRoot, backupBasePath } = {}) {
  if (!wallpaperRoot || !savedPath) throw new Error("Provide wallpaper and saved-properties paths.");
  const resolvedWallpaperRoot = resolve(wallpaperRoot);
  const resolvedSavedPath = resolve(savedPath);
  const resolvedProjectRoot = projectRoot ? resolve(projectRoot) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!existsSync(resolvedSavedPath)) throw new Error("The saved Lively properties file does not exist.");
  const wallpaperInfo = await validateWallpaperTarget(resolvedWallpaperRoot, resolvedSavedPath, resolvedProjectRoot);

  const manifestPath = join(resolvedWallpaperRoot, "roms", MANIFEST_NAME);
  const markerPath = join(resolvedWallpaperRoot, "roms", MARKER_NAME);
  const [schema, saved, existingManifest] = await Promise.all([
    readJson(join(resolvedProjectRoot, "LivelyProperties.json")),
    readJson(resolvedSavedPath),
    readJsonIfPresent(manifestPath, { bios: {} }),
  ]);
  const migratedProperties = migrateProperties(schema, saved);
  const manifest = mergeManifest(existingManifest, buildManifest(saved));
  const gameCount = SYSTEMS.reduce((total, system) => total + manifest[system.id].length, 0);
  const firmwareCount = Object.keys(manifest.bios).length;
  const result = { wallpaperRoot: resolvedWallpaperRoot, savedPath: resolvedSavedPath, manifest, migratedProperties, gameCount, firmwareCount, applied: false };
  if (!apply) return result;

  const backupRoot = migrationBackupRoot(resolvedWallpaperRoot, backupBasePath, wallpaperInfo.Title);
  await mkdir(backupRoot, { recursive: true });
  await Promise.all([
    copyFile(join(resolvedWallpaperRoot, "LivelyProperties.json"), join(backupRoot, "wallpaper-LivelyProperties.json")),
    copyFile(resolvedSavedPath, join(backupRoot, "saved-LivelyProperties.json")),
    backupFileIfPresent(manifestPath, join(backupRoot, MANIFEST_NAME)),
    backupFileIfPresent(markerPath, join(backupRoot, MARKER_NAME)),
  ]);
  const marker = {
    format: "retrosignal-lively-migration",
    version: MIGRATION_VERSION,
    migratedAt: new Date().toISOString(),
  };
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await atomicWrite(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  await atomicWrite(join(resolvedWallpaperRoot, "LivelyProperties.json"), `${JSON.stringify(schema, null, 2)}\n`);
  await atomicWrite(resolvedSavedPath, `${JSON.stringify(migratedProperties, null, 2)}\n`);
  return { ...result, backupRoot, marker, applied: true };
}

async function main() {
  const wallpaperRoot = argument("--wallpaper");
  const savedPath = argument("--saved-properties");
  const result = await migrateLivelyInstall({ wallpaperRoot, savedPath, apply: process.argv.includes("--apply") });
  process.stdout.write(`Wallpaper: ${result.wallpaperRoot}\n`);
  process.stdout.write(`Saved properties: ${result.savedPath}\n`);
  process.stdout.write(`Games in merged manifest: ${result.gameCount}\n`);
  process.stdout.write(`Firmware entries in merged manifest: ${result.firmwareCount}\n`);
  if (!result.applied) {
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
    process.stdout.write("Dry run only; add --apply to write backups and migrated files.\n");
    return;
  }
  process.stdout.write(`Backup: ${result.backupRoot}\n`);
  process.stdout.write(`Migration marker: ${result.marker.version}\n`);
  process.stdout.write("Migration complete. Re-running safely preserves the merged manifest.\n");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
