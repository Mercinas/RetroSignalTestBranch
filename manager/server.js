import { createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { biosKey, fileExtension, SYSTEMS } from "../js/systems.js";
import { renderManagerPage } from "./page.js";
import { normalizePlayerSettings } from "./player-settings.mjs";
import { normalizeKeyboardBindings } from "./keyboard-bindings.mjs";
import { getLayout } from "./controller-layouts/layouts.js";
import { CONTROLLER_ASSET_FILES } from "./controller-layouts/art-layered.js";

const DEFAULT_PORT = 41237;
const MAX_REQUEST_BYTES = 48 * 1024 * 1024;
const MAX_FILES_PER_SAVE = 64;
const MAX_SAVE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SAVE_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_BACKUPS = 10;
const MAX_ARCHIVE_LIST_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_PROBE_BYTES = 4 * 1024 * 1024;
const ARCHIVE_INSPECTION_TIMEOUT_MS = 30_000;
const ARCHIVE_EXPANSION_TIMEOUT_MS = 10 * 60_000;
const ARCHIVE_EXTENSIONS = new Set(["zip", "7z"]);
const IMPORT_REPORT_FILE = "last-import-report.json";
const KEYBOARD_CONTROLS_FILE = "keyboard-controls.json";
const DISPLAY_SETTINGS_FILE = "display-settings.json";
const namespaceQueues = new Map();
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJsonIfPresent(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function defaultKeyboardControlConfig() {
  return Object.fromEntries(SYSTEMS.map((system) => [system.id, []]));
}

function readKeyboardControlConfig(wallpaperPath) {
  if (!String(wallpaperPath || "").trim()) return defaultKeyboardControlConfig();
  return readJsonIfPresent(join(wallpaperPath, KEYBOARD_CONTROLS_FILE), defaultKeyboardControlConfig());
}


function compactImportReport(result) {
  const compactEntry = (entry) => ({
    file: String(entry?.relativePath || (entry?.path ? basename(entry.path) : "unknown file")),
    systemId: entry?.system?.id || "",
    candidates: Array.isArray(entry?.candidates) ? entry.candidates : [],
    reason: String(entry?.reason || "The file was not imported."),
  });
  return {
    updatedAt: new Date().toISOString(),
    imported: (result.imported || []).map(compactEntry),
    renamed: (result.renamed || []).map(compactEntry),
    alreadyImported: (result.alreadyImported || []).map(compactEntry),
    failed: (result.failed || []).map(compactEntry),
    unsupported: (result.unsupported || []).map(compactEntry),
    ambiguous: (result.ambiguous || []).map(compactEntry),
    invalid: (result.invalid || []).map(compactEntry),
    errors: (result.errors || []).map(compactEntry),
  };
}

async function persistImportReport(dataRoot, result) {
  await atomicWrite(
    join(dataRoot, IMPORT_REPORT_FILE),
    Buffer.from(`${JSON.stringify(compactImportReport(result), null, 2)}\n`),
  );
}

// Electron Builder moves shared runtime files into extraResources. Resolve the
// same bundled identity there when it is absent from the application archive.
const PROJECT_INFO = readJsonIfPresent(join(PROJECT_ROOT, "LivelyInfo.json"),
  readJsonIfPresent(join(PROJECT_ROOT, "..", "player-runtime", "LivelyInfo.json"), {}));
const PROJECT_PACKAGE = readJsonIfPresent(join(PROJECT_ROOT, "package.json"), {});
const APPLICATION_IDENTITY = Object.freeze({
  name: String(PROJECT_INFO.Title || PROJECT_PACKAGE.productName || PROJECT_PACKAGE.name || "Wallpaper").trim() || "Wallpaper",
  fileName: String(PROJECT_INFO.FileName || "index.html"),
  type: Number.isInteger(PROJECT_INFO.Type) ? PROJECT_INFO.Type : 1,
  folderName: String(PROJECT_INFO.Title || PROJECT_PACKAGE.name || "wallpaper")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim() || "wallpaper",
});

function defaultDataRoot() {
  const base = process.env.LOCALAPPDATA;
  return base ? join(base, APPLICATION_IDENTITY.folderName) : join(process.cwd(), ".wallpaper-manager-data");
}

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function isAllowedCorsOrigin(origin) {
  // Lively loads local wallpaper files with an opaque origin. Do not grant a
  // network page permission to make authenticated loopback requests.
  return origin === "null";
}

function safeNamespace(value) {
  const namespace = String(value || "");
  return /^[a-z0-9_-]{3,96}$/i.test(namespace) ? namespace : "";
}

function safeRelativePath(value) {
  const path = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return path;
}

function pathIsInside(root, candidate) {
  const between = relative(root, candidate);
  return between === "" || (!between.startsWith(`..${sep}`) && between !== ".." && !isAbsolute(between));
}

async function safeWallpaperTarget(wallpaperRoot, relativePath) {
  const normalized = safeRelativePath(relativePath);
  if (!normalized) throw new Error("Invalid managed file path.");
  const root = await realpath(wallpaperRoot);
  const target = resolve(root, ...normalized.split("/"));
  if (!pathIsInside(root, target)) throw new Error("Managed file path escapes the wallpaper folder.");

  const relativeDirectory = dirname(normalized).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of relativeDirectory) {
    current = join(current, part);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw new Error("The wallpaper contains an unsafe managed directory.");
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
  const safeParent = await realpath(dirname(target));
  if (!pathIsInside(root, safeParent)) throw new Error("Managed file path escapes the wallpaper folder.");
  return join(safeParent, basename(target));
}

async function resolveWallpaperRoot(wallpaperPath) {
  const root = await realpath(resolve(String(wallpaperPath || "")));
  const info = JSON.parse(await readFile(join(root, "LivelyInfo.json"), "utf8"));
  if (info.Title !== APPLICATION_IDENTITY.name || info.Type !== APPLICATION_IDENTITY.type || info.FileName !== APPLICATION_IDENTITY.fileName) {
    throw new Error(`The selected folder is not a compatible ${APPLICATION_IDENTITY.name} wallpaper.`);
  }
  return root;
}

async function defaultLivelyLibraryRoots(environment = process.env) {
  const roots = [];
  const local = String(environment.LOCALAPPDATA || "").trim();
  const roaming = String(environment.APPDATA || "").trim();
  if (local) {
    roots.push(
      join(local, "Lively Wallpaper", "Library", "wallpapers"),
      join(local, "LivelyWallpaper", "Library", "wallpapers"),
    );
    const packagesRoot = join(local, "Packages");
    try {
      for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes("livelywallpaper")) {
          roots.push(join(packagesRoot, entry.name, "LocalCache", "Local", "Lively Wallpaper", "Library", "wallpapers"));
        }
      }
    } catch {
      // The Microsoft Store package directory is optional.
    }
  }
  if (roaming) roots.push(join(roaming, "Lively Wallpaper", "Library", "wallpapers"));
  return [...new Set(roots.map((root) => resolve(root)))];
}

export async function discoverInstalledWallpaper(searchRoots) {
  const roots = Array.isArray(searchRoots) ? searchRoots.map((root) => resolve(root)) : await defaultLivelyLibraryRoots();
  const matches = [];
  for (const libraryRoot of roots) {
    let candidates = [libraryRoot];
    try {
      candidates.push(...(await readdir(libraryRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(libraryRoot, entry.name)));
    } catch {
      continue;
    }
    for (const candidate of candidates) {
      try {
        const resolved = await resolveWallpaperRoot(candidate);
        const details = await stat(join(resolved, "LivelyInfo.json"));
        matches.push({ path: resolved, modifiedAt: details.mtimeMs });
      } catch {
        // Other wallpapers and incomplete imports are expected here.
      }
    }
  }
  matches.sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path));
  return matches[0]?.path || "";
}

async function locateWallpaper(preferredPath = "", standaloneRuntimePath = "") {
  if (String(preferredPath || "").trim()) {
    try {
      return await resolveWallpaperRoot(preferredPath);
    } catch {
      // A moved or removed Lively installation should be rediscovered.
    }
  }
  const discovered = await discoverInstalledWallpaper();
  if (discovered) return discovered;
  if (standaloneRuntimePath) return resolveWallpaperRoot(standaloneRuntimePath);
  throw new RequestError(`Import the ${APPLICATION_IDENTITY.name} wallpaper folder into Lively first, then reopen the Manager. The installed wallpaper could not be found automatically.`);
}

async function readInstalledLibraryManifest(wallpaperPath) {
  if (!String(wallpaperPath || "").trim()) return null;
  try {
    const root = await resolveWallpaperRoot(wallpaperPath);
    return JSON.parse(await readFile(join(root, "roms", "library.local.json"), "utf8"));
  } catch {
    return null;
  }
}

async function assertSafeFileTarget(path) {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new Error("The wallpaper contains an unsafe managed file.");
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function listFiles(root, current = root) {
  if (!existsSync(current)) return [];
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile() && entry.name !== "manifest.json" && !entry.name.includes(".tmp-")) files.push(path);
  }
  return files;
}

async function pruneBackups(root) {
  if (!existsSync(root)) return;
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of entries.slice(MAX_BACKUPS)) {
    const directory = join(root, name);
    await rm(directory, { recursive: true, force: true });
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function snapshotStagePath(root, namespace) {
  return join(dirname(root), `.${namespace}.staging-${timestamp()}-${randomBytes(6).toString("hex")}`);
}

async function withNamespaceLock(namespace, operation) {
  const previous = namespaceQueues.get(namespace) || Promise.resolve();
  let release;
  const current = new Promise((resolveRelease) => { release = resolveRelease; });
  namespaceQueues.set(namespace, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (namespaceQueues.get(namespace) === current) namespaceQueues.delete(namespace);
  }
}

function decodeSaveData(value) {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("Invalid save file data.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("Invalid save file data.");
  return bytes;
}

function validateSaveSnapshot(namespace, entries) {
  const files = [];
  const paths = new Set();
  let totalBytes = 0;
  for (const entry of entries) {
    const relativePath = safeRelativePath(entry?.path);
    if (!relativePath || typeof entry?.data !== "string") throw new Error("Invalid save file entry.");
    if (paths.has(relativePath)) throw new Error("Duplicate save file path.");
    const bytes = decodeSaveData(entry.data);
    if (bytes.byteLength > MAX_SAVE_FILE_BYTES) throw new Error("Save file is too large.");
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SAVE_SNAPSHOT_BYTES) throw new Error("Save snapshot is too large.");
    paths.add(relativePath);
    files.push({ path: relativePath, bytes });
  }
  return {
    files,
    manifest: {
      namespace,
      updatedAt: new Date().toISOString(),
      files: files.map(({ path, bytes }) => ({ path, size: bytes.byteLength, sha256: sha256(bytes) })),
    },
  };
}

async function readManifestSnapshot(root, namespace) {
  const manifestPath = join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.namespace !== namespace || !Array.isArray(manifest.files)) throw new Error("Invalid save manifest.");
  const files = [];
  const paths = new Set();
  let totalBytes = 0;
  for (const entry of manifest.files) {
    const relativePath = safeRelativePath(entry?.path);
    if (!relativePath || paths.has(relativePath) || !Number.isSafeInteger(entry?.size) || !/^[a-f0-9]{64}$/i.test(String(entry?.sha256 || ""))) {
      throw new Error("Invalid save manifest.");
    }
    const bytes = await readFile(join(root, ...relativePath.split("/")));
    totalBytes += bytes.byteLength;
    if (bytes.byteLength !== entry.size || totalBytes > MAX_SAVE_SNAPSHOT_BYTES || sha256(bytes) !== entry.sha256) {
      throw new Error("Save snapshot integrity check failed.");
    }
    paths.add(relativePath);
    files.push({ path: relativePath, data: bytes.toString("base64") });
  }
  return files;
}

async function hasValidManifestSnapshot(root, namespace) {
  try {
    await readManifestSnapshot(root, namespace);
    return true;
  } catch {
    return false;
  }
}

async function recoverIncompleteSnapshot(dataRoot, namespace) {
  const savesRoot = join(dataRoot, "Saves");
  const root = join(savesRoot, namespace);
  const stagePrefix = `.${namespace}.staging-`;
  if (existsSync(root)) {
    if (existsSync(savesRoot)) {
      const staleStages = (await readdir(savesRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(stagePrefix));
      await Promise.all(staleStages.map((entry) => rm(join(savesRoot, entry.name), { recursive: true, force: true })));
    }
    return root;
  }
  if (existsSync(savesRoot)) {
    const stages = (await readdir(savesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(stagePrefix))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const name of stages) {
      const stage = join(savesRoot, name);
      if (await hasValidManifestSnapshot(stage, namespace)) {
        await rename(stage, root);
        return root;
      }
      await rm(stage, { recursive: true, force: true });
    }
  }
  const backupRoot = join(dataRoot, "Backups", namespace);
  if (existsSync(backupRoot)) {
    const backups = (await readdir(backupRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const name of backups) {
      const backup = join(backupRoot, name);
      if (!await hasValidManifestSnapshot(backup, namespace)) continue;
      await mkdir(dirname(root), { recursive: true });
      await rename(backup, root);
      break;
    }
  }
  return root;
}

async function readSave(dataRoot, namespace) {
  const root = await recoverIncompleteSnapshot(dataRoot, namespace);
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(root)) return [];
  if (!existsSync(manifestPath)) {
    const files = [];
    let totalBytes = 0;
    for (const path of await listFiles(root)) {
      const bytes = await readFile(path);
      totalBytes += bytes.byteLength;
      if (bytes.byteLength > MAX_SAVE_FILE_BYTES || totalBytes > MAX_SAVE_SNAPSHOT_BYTES) {
        throw new Error("Save snapshot is too large.");
      }
      files.push({ path: relative(root, path).split(sep).join("/"), data: bytes.toString("base64") });
    }
    return files;
  }
  return readManifestSnapshot(root, namespace);
}

async function writeSave(dataRoot, namespace, entries) {
  const snapshot = validateSaveSnapshot(namespace, entries);
  const root = join(dataRoot, "Saves", namespace);
  const backupRoot = join(dataRoot, "Backups", namespace);
  const stage = snapshotStagePath(root, namespace);
  let backup;
  try {
    await mkdir(stage, { recursive: true });
    for (const entry of snapshot.files) {
      await atomicWrite(join(stage, ...entry.path.split("/")), entry.bytes);
    }
    await atomicWrite(join(stage, "manifest.json"), Buffer.from(`${JSON.stringify(snapshot.manifest, null, 2)}\n`));
    if (existsSync(root)) {
      backup = join(backupRoot, `${timestamp()}-${randomBytes(4).toString("hex")}`);
      await mkdir(backupRoot, { recursive: true });
      await rename(root, backup);
    }
    try {
      await rename(stage, root);
    } catch (error) {
      if (backup && !existsSync(root) && existsSync(backup)) await rename(backup, root);
      throw error;
    }
    await pruneBackups(backupRoot);
    return snapshot.manifest;
  } finally {
    if (existsSync(stage)) await rm(stage, { recursive: true, force: true });
  }
}

function json(response, status, payload, origin = "") {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(isAllowedCorsOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(payload));
}

function requestToken(request) {
  const headerToken = String(request.headers["x-retrosignal-token"] || "");
  if (headerToken) return headerToken;
  for (const cookie of String(request.headers.cookie || "").split(";")) {
    const [name, value] = cookie.trim().split("=", 2);
    if (name === "retrosignal_token") return value || "";
  }
  return "";
}

async function readJson(request) {
  const declaredSize = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_REQUEST_BYTES) {
    request.resume();
    throw new RequestError("Request is too large.", 413);
  }
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    request.resume();
    throw new RequestError("Request content must be JSON.", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      request.resume();
      throw new RequestError("Request is too large.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Malformed JSON request.", 400);
  }
}

export function createManager(options = {}) {
  const port = options.port === 0 ? 0 : Number(options.port) || DEFAULT_PORT;
  const dataRoot = resolve(options.dataRoot || defaultDataRoot());
  const token = options.token || randomBytes(32).toString("base64url");
  let connectedSourcePath = String(options.sourcePath || "");
  let connectedWallpaperPath = String(options.wallpaperPath || "");
  const locateRuntime = preferred => locateWallpaper(preferred, options.standaloneRuntimePath);
  const server = createServer(async (request, response) => {
    const origin = String(request.headers.origin || "");
    if (request.method === "OPTIONS") {
      if (!isAllowedCorsOrigin(origin)) {
        json(response, 403, { error: "cors-origin-not-allowed" });
        return;
      }
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-RetroSignal-Token",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { name: `${APPLICATION_IDENTITY.name} Manager`, version: 1 });
      return;
    }
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": `retrosignal_token=${token}; Path=/; HttpOnly; SameSite=Strict`,
        "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      // The browser app authenticates with its HttpOnly loopback cookie. The
      // wallpaper receives the token from manager.json instead, so do not
      // embed a usable bearer token in an unauthenticated HTML response.
      const page = renderManagerPage({ dataRoot, appName: APPLICATION_IDENTITY.name, sourcePath: connectedSourcePath, wallpaperPath: connectedWallpaperPath });
      response.end(options.pageExtension ? options.pageExtension(page) : page);
      return;
    }
    if (request.method === "GET" && url.pathname === "/assets/retro-manager-banner.png") {
      try {
        const bytes = await readFile(join(PROJECT_ROOT, "manager", "assets", "retro-manager-banner.png"));
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
        response.end(bytes);
      } catch {
        json(response, 404, { error: "asset-not-found" });
      }
      return;
    }
    if (requestToken(request) !== token) {
      json(response, 401, { error: "unauthorized" }, origin);
      return;
    }

    if (request.method === "GET" && ['binding-state.js', 'component.js', 'layouts.js', 'illustrations.js', 'materials.js', 'art-nintendo.js', 'art-n64-layered.js', 'art-layered.js', 'art-sega.js', 'art-other.js', 'system-panel.js', 'controller-layouts.css', 'integration.js'].some(file => url.pathname === `/controller-layouts/${file}`)) {
      try {
        const bytes = await readFile(url.pathname.endsWith("/integration.js") ? join(PROJECT_ROOT, "manager", "controller-mapper-integration.js") : join(PROJECT_ROOT, "manager", "controller-layouts", basename(url.pathname)));
        response.writeHead(200, { "Content-Type": url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        response.end(bytes);
      } catch { json(response, 404, { error: "asset-not-found" }); }
      return;
    }

    if (request.method === 'GET' && (CONTROLLER_ASSET_FILES.has(url.pathname) || /^\/controller-assets\/n64\/(shadow|shell|cable|recesses|buttons|stick|markings)\.png$/.test(url.pathname))) {
      try {
        const model = url.pathname.split('/')[2];
        const bytes = await readFile(join(PROJECT_ROOT, 'manager', 'assets', 'controllers', model, basename(url.pathname)));
        response.writeHead(200, { 'Content-Type':'image/png', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
        response.end(bytes);
      } catch { json(response, 404, { error:'asset-not-found' }); }
      return;
    }

    if (options.requestExtension && await options.requestExtension({ request, response, url })) return;

    if (request.method === "GET" && url.pathname === "/api/v1/library") {
      const report = readJsonIfPresent(join(dataRoot, IMPORT_REPORT_FILE), null);
      const manifest = await readInstalledLibraryManifest(connectedWallpaperPath);
      const controls = readKeyboardControlConfig(connectedWallpaperPath);
      const frame = await readFile(join(connectedWallpaperPath || "", "js", "emulator-frame.js"), "utf8").catch(() => "");
      const keyboardMapping = frame.includes("loadKeyboardControls") && frame.includes("keyboard-controls.json");
      json(response, 200, { manifest, report, controls, capabilities: { keyboardMapping } }, origin);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/controls") {
      try {
        const payload = await readJson(request);
        const systemId = String(payload?.systemId || "");
        if (!SYSTEMS.some((system) => system.id === systemId)) throw new RequestError("Unknown game system.", 400);
        const wallpaperRoot = await locateRuntime(connectedWallpaperPath);
        connectedWallpaperPath = wallpaperRoot;
        const configPath = await safeWallpaperTarget(wallpaperRoot, KEYBOARD_CONTROLS_FILE);
        const config = readJsonIfPresent(configPath, defaultKeyboardControlConfig());
        getLayout(systemId, payload?.variantId); // Validate the preview variant; this does not change a core device.
        config[systemId] = normalizeKeyboardBindings(payload?.bindings, config[systemId]);
        await atomicWrite(configPath, Buffer.from(`${JSON.stringify(config, null, 2)}\n`));
        json(response, 200, { systemId, bindings: config[systemId] }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "controls-save-failed" }, origin);
      }
      return;
    }

    const match = url.pathname.match(/^\/api\/v1\/saves\/([^/]+)$/);
    if (request.method === "POST" && url.pathname === "/api/v1/pair") {
      try {
        const payload = await readJson(request);
        const endpoint = `http://127.0.0.1:${server.address()?.port || port}`;
        const wallpaperRoot = await locateRuntime(payload.wallpaperPath || connectedWallpaperPath);
        connectedWallpaperPath = wallpaperRoot;
        await pairWallpaper(wallpaperRoot, endpoint, token);
        const sourcePath = String(payload.sourcePath || "").trim();
        const result = await importRomSource(sourcePath, wallpaperRoot);
        connectedSourcePath = result.sourceRoot;
        await persistImportReport(dataRoot, result);
        await atomicWrite(join(dataRoot, "rom-source.json"), Buffer.from(`${JSON.stringify({ sourcePath: connectedSourcePath }, null, 2)}\n`));
        await atomicWrite(join(dataRoot, "paired-wallpaper.json"), Buffer.from(`${JSON.stringify({ wallpaperPath: wallpaperRoot }, null, 2)}\n`));
        const games = SYSTEMS.reduce((total, system) => total + result.manifest[system.id].length, 0);
        const imported = result.imported.length;
        const biosImported = result.imported.filter((entry) => entry.kind === "bios").length;
        const renamed = Array.isArray(result.renamed) ? result.renamed.length : 0;
        const alreadyImported = Array.isArray(result.alreadyImported) ? result.alreadyImported.length : 0;
        const failed = Array.isArray(result.failed) ? result.failed.length : 0;
        const unsupported = Array.isArray(result.unsupported) ? result.unsupported.length : 0;
        const ambiguous = Array.isArray(result.ambiguous) ? result.ambiguous.length : 0;
        const invalid = Array.isArray(result.invalid) ? result.invalid.length : 0;
        json(response, 200, {
          manifestPath: result.manifestPath,
          manifest: result.manifest,
          games,
          imported,
          renamed,
          alreadyImported,
          failed,
          unsupported,
          ambiguous,
          invalid,
          errors: result.errors || [],
          report: {
            imported: result.imported || [],
            renamed: result.renamed || [],
            alreadyImported: result.alreadyImported || [],
            failed: result.failed || [],
            unsupported: result.unsupported || [],
            ambiguous: result.ambiguous || [],
            invalid: result.invalid || [],
          },
          biosImported,
          sourceRoot: result.sourceRoot,
          message: `ROM scan complete. ${imported} new file${imported === 1 ? "" : "s"} placed in configured emulator folders${renamed ? `; ${renamed} renamed to avoid overwriting existing files` : ""}.`,
        }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "pairing-failed" }, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/rescan") {
      try {
        if (!connectedSourcePath) throw new RequestError(`Open ${APPLICATION_IDENTITY.name} Manager and choose your ROM and BIOS folder once.`);
        const endpoint = `http://127.0.0.1:${server.address()?.port || port}`;
        const wallpaperRoot = await locateRuntime(connectedWallpaperPath);
        connectedWallpaperPath = wallpaperRoot;
        await pairWallpaper(wallpaperRoot, endpoint, token);
        const result = await importRomSource(connectedSourcePath, wallpaperRoot);
        connectedSourcePath = result.sourceRoot;
        await persistImportReport(dataRoot, result);
        await atomicWrite(join(dataRoot, "rom-source.json"), Buffer.from(`${JSON.stringify({ sourcePath: connectedSourcePath }, null, 2)}\n`));
        await atomicWrite(join(dataRoot, "paired-wallpaper.json"), Buffer.from(`${JSON.stringify({ wallpaperPath: wallpaperRoot }, null, 2)}\n`));
        const games = SYSTEMS.reduce((total, system) => total + result.manifest[system.id].length, 0);
        json(response, 200, {
          manifest: result.manifest,
          games,
          imported: result.imported.length,
          biosImported: result.imported.filter((entry) => entry.kind === "bios").length,
          alreadyImported: result.alreadyImported.length,
          failed: result.failed.length,
          unsupported: result.unsupported.length,
          ambiguous: result.ambiguous.length,
          invalid: result.invalid.length,
        }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "rescan-failed" }, origin);
      }
      return;
    }
    let namespace;
    try {
      namespace = safeNamespace(match ? decodeURIComponent(match[1]) : "");
    } catch {
      json(response, 400, { error: "invalid-save-namespace" }, origin);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/open-lively") {
      try {
        await readJson(request);
        if (typeof options.openLively !== "function") throw new RequestError("Open Lively is available in the desktop Manager app.", 501);
        json(response, 200, await options.openLively(), origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "lively-open-failed" }, origin);
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/display-settings") {
      const saved = readJsonIfPresent(join(dataRoot, DISPLAY_SETTINGS_FILE), null);
      json(response, 200, { saved: Boolean(saved), settings: normalizePlayerSettings(saved || {}) }, origin);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/player-settings") {
      try {
        const payload = normalizePlayerSettings(await readJson(request));
        if (typeof options.updatePlayerSettings !== "function") throw new RequestError("Live player settings are unavailable.", 501);
        await atomicWrite(join(dataRoot, DISPLAY_SETTINGS_FILE), Buffer.from(`${JSON.stringify(payload, null, 2)}\n`));
        json(response, 200, { updated: Boolean(await options.updatePlayerSettings(payload)) }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "player-settings-failed" }, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/player") {
      try {
        if (typeof options.openPlayer !== "function") throw new RequestError("The standalone player is available in the desktop Manager app.", 501);
        const payload = await readJson(request);
        const wallpaperRoot = await locateRuntime(payload.wallpaperPath || connectedWallpaperPath);
        connectedWallpaperPath = wallpaperRoot;
        await options.openPlayer({ ...payload, wallpaperPath: wallpaperRoot });
        json(response, 200, { opened: true }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "player-open-failed" }, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/wallpaper-play-state") {
      try {
        const payload = await readJson(request);
        if (Object.keys(payload).some(key => !['active', 'sessionId', 'sequence'].includes(key)) ||
            typeof payload.active !== 'boolean' || !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.sessionId || '') ||
            !Number.isSafeInteger(payload.sequence) || payload.sequence < 1) throw new RequestError('Invalid wallpaper running-session observation.', 400);
        if (typeof options.wallpaperPlayState !== 'function') throw new RequestError('Wallpaper play credit is unavailable.', 503);
        const accepted = await options.wallpaperPlayState(payload);
        json(response, 200, { accepted }, origin);
      } catch (error) { json(response, error?.status || 400, { error: error.message || 'play-state-failed' }, origin); }
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/player-status") {
      const open = typeof options.isPlayerOpen === "function" && Boolean(options.isPlayerOpen());
      try {
        const credit = typeof options.playerCreditStatus === "function" ? await options.playerCreditStatus() : { active: false, credits: [] };
        json(response, 200, { open, ...credit }, origin);
      } catch {
        json(response, 503, { error: "Running-session credit checkpoint is temporarily unavailable." }, origin);
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/player-credit-ack") {
      try {
        const payload = await readJson(request);
        if (typeof payload.transactionId !== "string" || payload.transactionId.length > 160) throw new RequestError("Invalid credit acknowledgement.", 400);
        await options.acknowledgePlayerCredit?.(payload.transactionId);
        json(response, 200, { acknowledged: true }, origin);
      } catch (error) {
        json(response, error?.status || 400, { error: error.message || "credit-ack-failed" }, origin);
      }
      return;
    }
    if (!namespace) {
      json(response, 404, { error: "not-found" }, origin);
      return;
    }
    try {
      if (request.method === "GET") {
        const files = await withNamespaceLock(namespace, () => readSave(dataRoot, namespace));
        if (files.length === 0) json(response, 404, { error: "save-not-found" }, origin);
        else json(response, 200, { namespace, files }, origin);
        return;
      }
      if (request.method === "PUT") {
        const payload = await readJson(request);
        if (!Array.isArray(payload.files) || payload.files.length > MAX_FILES_PER_SAVE) {
          json(response, 400, { error: "invalid-save-payload" }, origin);
          return;
        }
        const manifest = await withNamespaceLock(namespace, () => writeSave(dataRoot, namespace, payload.files));
        json(response, 200, manifest, origin);
        return;
      }
    } catch (error) {
      json(response, error?.status || 400, { error: error.message || "save-operation-failed" }, origin);
      return;
    }
    json(response, 405, { error: "method-not-allowed" }, origin);
  });
  server.maxConnections = 16;
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return { server, port, dataRoot, token };
}

async function persistentManagerToken(dataRoot, tokenOverride) {
  const tokenPath = join(dataRoot, "manager-token.txt");
  if (tokenOverride) return { token: tokenOverride, tokenPath };
  await mkdir(dirname(tokenPath), { recursive: true });
  try {
    return { token: (await readFile(tokenPath, "utf8")).trim(), tokenPath };
  } catch {
    const token = randomBytes(32).toString("base64url");
    await atomicWrite(tokenPath, Buffer.from(`${token}\n`));
    return { token, tokenPath };
  }
}

export async function startManager(options = {}) {
  const dataRoot = resolve(options.dataRoot || defaultDataRoot());
  const { token, tokenPath } = await persistentManagerToken(dataRoot, options.token);
  const sourceConfig = readJsonIfPresent(join(dataRoot, "rom-source.json"), {});
  const savedSourcePath = typeof sourceConfig.sourcePath === "string" ? sourceConfig.sourcePath : "";
  const wallpaperConfig = readJsonIfPresent(join(dataRoot, "paired-wallpaper.json"), {});
  const savedWallpaperPath = typeof wallpaperConfig.wallpaperPath === "string" ? wallpaperConfig.wallpaperPath : "";
  let wallpaperPath = options.wallpaperPath || savedWallpaperPath;
  if (options.discoverWallpaper !== false) {
    try {
      wallpaperPath = await locateWallpaper(wallpaperPath, options.standaloneRuntimePath);
    } catch {
      wallpaperPath = "";
    }
  }
  if (!wallpaperPath && options.standaloneRuntimePath) wallpaperPath = await resolveWallpaperRoot(options.standaloneRuntimePath);
  const manager = createManager({
    dataRoot,
    port: options.port,
    token,
    sourcePath: options.sourcePath || savedSourcePath,
    wallpaperPath,
    standaloneRuntimePath: options.standaloneRuntimePath,
    openLively: options.openLively,
    openPlayer: options.openPlayer,
    updatePlayerSettings: options.updatePlayerSettings,
    isPlayerOpen: options.isPlayerOpen,
      wallpaperPlayState: options.wallpaperPlayState,
      playerCreditStatus: options.playerCreditStatus,
    acknowledgePlayerCredit: options.acknowledgePlayerCredit,
    pageExtension: options.pageExtension,
    requestExtension: options.requestExtension,
  });
  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      manager.server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      manager.server.off("error", onError);
      resolveListen();
    };
    manager.server.once("error", onError);
    manager.server.once("listening", onListening);
    manager.server.listen(manager.port, "127.0.0.1");
  });
  const address = manager.server.address();
  const port = typeof address === "object" && address ? address.port : manager.port;
  const endpoint = `http://127.0.0.1:${port}`;
  if (wallpaperPath) {
    await pairWallpaper(wallpaperPath, endpoint, manager.token);
    await atomicWrite(join(dataRoot, "paired-wallpaper.json"), Buffer.from(`${JSON.stringify({ wallpaperPath }, null, 2)}\n`));
  }
  return { ...manager, endpoint, port, tokenPath };
}

export async function pairWallpaper(wallpaperPath, endpoint, token) {
  const root = await resolveWallpaperRoot(wallpaperPath);
  const config = { endpoint, token };
  const configPath = await safeWallpaperTarget(root, "manager.json");
  await assertSafeFileTarget(configPath);
  await atomicWrite(configPath, Buffer.from(`${JSON.stringify(config, null, 2)}\n`));
  return join(root, "manager.json");
}

async function copyManagedFile(source, target) {
  if (await assertSafeFileTarget(target)) {
    const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
    if (sha256(sourceBytes) !== sha256(targetBytes)) {
      throw new Error(`Refusing to overwrite an existing wallpaper file: ${basename(target)}`);
    }
    return false;
  }
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  await copyFile(source, temporary);
  const handle = await open(temporary, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  return true;
}

async function supportedFiles(directory, extensions) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !extensions.includes(fileExtension(entry.name))) continue;
    files.push(join(directory, entry.name));
  }
  return files.sort((left, right) => basename(left).localeCompare(basename(right)));
}

function normalizeSystemHint(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function systemHints(system) {
  const destinationFolder = basename(system.folder);
  return new Set([
    system.id,
    destinationFolder === "roms" ? "" : destinationFolder,
    system.shortName,
    system.name,
  ].map(normalizeSystemHint).filter(Boolean));
}

function sourceDirectories(relativePath, sourceRoot) {
  const parts = String(relativePath).replaceAll("\\", "/").split("/");
  return [basename(sourceRoot), ...parts.slice(0, -1)].map(normalizeSystemHint).filter(Boolean);
}

function runArchiveList(path) {
  return new Promise((resolveList, rejectList) => {
    execFile("tar", ["-tf", path], {
      windowsHide: true,
      timeout: ARCHIVE_INSPECTION_TIMEOUT_MS,
      maxBuffer: MAX_ARCHIVE_LIST_BYTES,
      encoding: "utf8",
    }, (error, stdout) => {
      if (error) {
        rejectList(new Error("The compressed file could not be inspected. It may be damaged or use an unsupported archive format."));
        return;
      }
      resolveList(String(stdout || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
    });
  });
}

function archiveContentExtensions(system) {
  return new Set([
    ...system.extensions.filter((extension) => !ARCHIVE_EXTENSIONS.has(extension)),
    ...(system.archiveContentExtensions || []),
  ]);
}

const DISC_SIGNATURES = Object.freeze([
  { systemId: "sega32x", patterns: ["SEGA 32X"] },
  { systemId: "genesis", patterns: ["SEGA GENESIS", "SEGA MEGA DRIVE"] },
  { systemId: "psx", patterns: ["PLAYSTATION", "SONY COMPUTER ENTERTAINMENT", "BOOT = CDROM", "BOOT=CDROM"] },
  { systemId: "saturn", patterns: ["SEGA SEGASATURN"] },
  { systemId: "segacd", patterns: ["SEGADISCSYSTEM"] },
]);

export function classifyArchiveEntries(entries, probeText = "") {
  const memberExtensions = new Set(entries.map(fileExtension).filter((extension) => extension && !ARCHIVE_EXTENSIONS.has(extension)));
  const matches = SYSTEMS.map((system) => {
    const accepted = archiveContentExtensions(system);
    const matched = [...memberExtensions].filter((extension) => accepted.has(extension));
    return { system, matched };
  }).filter((entry) => entry.matched.length > 0);
  if (matches.length === 0) {
    return { kind: "unsupported", reason: "The archive does not contain a ROM format accepted by a configured emulator." };
  }

  const normalizedProbe = String(probeText || "").toUpperCase();
  for (const signature of DISC_SIGNATURES) {
    if (signature.patterns.some((pattern) => normalizedProbe.includes(pattern))) {
      const match = matches.find((entry) => entry.system.id === signature.systemId);
      if (match) return { kind: "importable", system: match.system, reason: "archive-console-signature" };
    }
  }

  const highestScore = Math.max(...matches.map((entry) => entry.matched.length));
  const strongest = matches.filter((entry) => entry.matched.length === highestScore);
  if (strongest.length === 1) {
    return { kind: "importable", system: strongest[0].system, reason: "archive-content-format" };
  }
  return {
    kind: "ambiguous",
    candidates: strongest.map((entry) => entry.system.id),
    reason: "The archive contents match multiple configured systems; place this file below a system-named folder.",
  };
}

function readArchiveProbe(path, member) {
  return new Promise((resolveProbe) => {
    const child = spawn("tar", ["-xOf", path, "--", member], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill();
      resolveProbe(Buffer.concat(chunks, bytes).toString("latin1"));
    };
    const timer = setTimeout(finish, ARCHIVE_INSPECTION_TIMEOUT_MS);
    child.on("error", finish);
    child.stdout.on("data", (chunk) => {
      const remaining = MAX_ARCHIVE_PROBE_BYTES - bytes;
      if (remaining <= 0) {
        finish();
        return;
      }
      const part = chunk.subarray(0, remaining);
      chunks.push(part);
      bytes += part.length;
      const recent = Buffer.concat(chunks, bytes).toString("latin1").toUpperCase();
      if (DISC_SIGNATURES.some((signature) => signature.patterns.some((pattern) => recent.includes(pattern)))
        || bytes >= MAX_ARCHIVE_PROBE_BYTES) finish();
    });
    child.on("close", finish);
  });
}

async function classifyArchiveSourceFile(path) {
  let entries;
  try {
    entries = await runArchiveList(path);
  } catch (error) {
    return { kind: "invalid", reason: error.message };
  }
  const initial = classifyArchiveEntries(entries);
  if (initial.kind !== "ambiguous") return initial;
  const probeMember = entries.find((entry) => ["bin", "img", "iso", "md", "smd", "gen", "32x"].includes(fileExtension(entry)));
  if (!probeMember) return initial;
  const probe = await readArchiveProbe(path, probeMember);
  return classifyArchiveEntries(entries, probe);
}

async function expandArchiveSourceFile(entry) {
  const members = await runArchiveList(entry.path);
  const unsafeMember = members.find((member) => !safeRelativePath(member.replace(/\/$/, "")));
  if (unsafeMember) throw new Error("The archive contains an unsafe file path.");
  const directory = await mkdtemp(join(tmpdir(), "retrosignal-archive-"));
  try {
    await new Promise((resolveExtract, rejectExtract) => {
      execFile("tar", ["-xf", entry.path, "-C", directory], {
        windowsHide: true,
        timeout: ARCHIVE_EXPANSION_TIMEOUT_MS,
        maxBuffer: MAX_ARCHIVE_LIST_BYTES,
      }, (error) => error ? rejectExtract(new Error("The archive could not be expanded for fast launching.")) : resolveExtract());
    });
    const files = (await walkSourceFiles(directory)).files;
    return {
      directory,
      files: files.map((path) => ({
        ...entry,
        path,
        relativePath: `${entry.relativePath}/${relative(directory, path).split(sep).join("/")}`,
        expandedFrom: entry.path,
      })),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function classifyBiosSourceFile(relativePath, sourceRoot) {
  const directories = sourceDirectories(relativePath, sourceRoot);
  if (!directories.includes("bios")) return null;
  const extension = fileExtension(relativePath);
  const name = basename(relativePath).toLowerCase();
  const candidates = SYSTEMS.filter((system) => (
    system.biosRequired
    && system.biosExtensions.includes(extension)
    && (!Array.isArray(system.biosFileNames) || system.biosFileNames.includes(name))
  ));
  if (candidates.length === 0) return null;
  const hinted = candidates.filter((system) => {
    const hints = systemHints(system);
    return directories.some((part) => hints.has(part));
  });
  if (hinted.length === 1) return { kind: "bios", system: hinted[0], extension, reason: "bios-system-folder" };
  if (hinted.length > 1) {
    return {
      kind: "ambiguous",
      extension,
      candidates: hinted.map((system) => system.id),
      reason: "Multiple configured systems match the BIOS folder hint.",
    };
  }
  if (candidates.length === 1) return { kind: "bios", system: candidates[0], extension, reason: "unique-bios-format" };
  return {
    kind: "ambiguous",
    extension,
    candidates: candidates.map((system) => system.id),
    reason: "The BIOS format is shared by multiple systems; place it below bios/<system-id>.",
  };
}

function classifyLooseBiosSourceFile(relativePath, details) {
  const extension = fileExtension(relativePath);
  const normalizedName = basename(relativePath, `.${extension}`).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const candidates = SYSTEMS.filter((system) => (
    system.biosRequired
    && system.biosExtensions.includes(extension)
    && Array.isArray(system.biosNamePatterns)
    && system.biosNamePatterns.some((pattern) => normalizedName.includes(pattern))
  ));
  if (candidates.length === 1) {
    return { kind: "bios", system: candidates[0], extension, reason: "recognized-bios-name" };
  }
  return null;
}

async function classifySourceFile(path, relativePath, sourceRoot) {
  const biosClassification = classifyBiosSourceFile(relativePath, sourceRoot);
  if (biosClassification) return biosClassification;
  const extension = fileExtension(relativePath);
  const candidates = SYSTEMS.filter((system) => system.extensions.includes(extension));
  if (candidates.length === 0) {
    return { kind: "unsupported", extension, reason: "No configured emulator accepts this extension." };
  }

  const directories = sourceDirectories(relativePath, sourceRoot);
  const hinted = candidates.filter((system) => {
    const hints = systemHints(system);
    return directories.some((part) => hints.has(part));
  });
  if (hinted.length === 1) return { kind: "importable", system: hinted[0], extension, reason: "system-folder-hint" };
  if (hinted.length > 1) {
    return {
      kind: "ambiguous",
      extension,
      candidates: hinted.map((system) => system.id),
      reason: "Multiple configured systems match the folder hint.",
    };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { ...await classifyArchiveSourceFile(path), extension };
  }
  if (candidates.length === 1) return { kind: "importable", system: candidates[0], extension, reason: "unique-extension" };
  return {
    kind: "ambiguous",
    extension,
    candidates: candidates.map((system) => system.id),
    reason: "The extension is shared by multiple configured systems; place it below a system-named folder.",
  };
}

async function ensureSourceRoot(sourcePath) {
  const value = String(sourcePath || "").trim();
  if (!value) throw new Error("Choose a ROM source folder.");
  const requested = resolve(value);
  try {
    const details = await lstat(requested);
    if (!details.isDirectory()) throw new Error("The ROM source path is not a folder.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(requested, { recursive: true });
  }
  return realpath(requested);
}

async function walkSourceFiles(root, current = root, files = [], errors = []) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    errors.push({ path: current, reason: error?.message || "The folder could not be read." });
    return { files, errors };
  }
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await walkSourceFiles(root, path, files, errors);
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink()) errors.push({ path, reason: "Symbolic links are skipped for safety." });
  }
  return { files, errors };
}

export async function scanRomSource(sourcePath) {
  const sourceRoot = await ensureSourceRoot(sourcePath);
  const walked = await walkSourceFiles(sourceRoot);
  const result = {
    sourceRoot,
    files: [],
    bios: [],
    unsupported: [],
    ambiguous: [],
    invalid: [],
    errors: walked.errors,
  };
  for (const path of walked.files) {
    const relativePath = relative(sourceRoot, path).split(sep).join("/");
    let details;
    try {
      details = await lstat(path);
      if (!details.isFile() || details.size <= 0) {
        result.invalid.push({ path, relativePath, reason: "The file is empty or is not a regular file." });
        continue;
      }
    } catch (error) {
      result.invalid.push({ path, relativePath, reason: error?.message || "The file could not be inspected." });
      continue;
    }
    const classification = classifyLooseBiosSourceFile(relativePath, details)
      || await classifySourceFile(path, relativePath, sourceRoot);
    if (classification.kind === "bios" && Array.isArray(classification.system.biosExpectedSizes)
      && !classification.system.biosExpectedSizes.includes(details.size)) {
      result.invalid.push({
        path,
        relativePath,
        reason: `${classification.system.shortName} BIOS must be one of: ${classification.system.biosExpectedSizes.join(", ")} bytes.`,
      });
      continue;
    }
    if (classification.kind === "importable") {
      result.files.push({ path, relativePath, ...classification });
    } else {
      result[classification.kind].push({ path, relativePath, ...classification });
    }
  }
  result.files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return result;
}

function appendUniqueFiles(current, additions) {
  const files = [];
  const known = new Set();
  for (const value of [...current, ...additions]) {
    const key = value.toLowerCase();
    if (!known.has(key)) {
      known.add(key);
      files.push(value);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function collisionName(filename, attempt) {
  const extension = fileExtension(filename);
  const suffix = extension ? `.${extension}` : "";
  const stem = suffix ? filename.slice(0, -(suffix.length)) : filename;
  return `${stem} (${attempt})${suffix}`;
}

function canonicalBiosFilename(system, filename) {
  if (system.id !== "psx") return filename;
  const normalized = filename.toLowerCase();
  const model = normalized.match(/scph[-_ ]?(\d{4})/)?.[1] || "";
  if (model.endsWith("0")) return "scph5500.bin";
  if (model.endsWith("2")) return "scph5502.bin";
  return "scph5501.bin";
}

function isSystemFilePath(value, system) {
  const path = safeRelativePath(value);
  return Boolean(
    path
    && path.startsWith(`${system.folder}/`)
    && !path.slice(system.folder.length + 1).includes("/")
    && system.extensions.includes(fileExtension(path)),
  );
}

function isBiosFilePath(value, system) {
  const path = safeRelativePath(value);
  const name = basename(path).toLowerCase();
  return Boolean(
    path
    && system.biosRequired
    && path.startsWith(`${system.biosFolder}/`)
    && !path.slice(system.biosFolder.length + 1).includes("/")
    && system.biosExtensions.includes(fileExtension(path))
    && (!Array.isArray(system.biosFileNames) || system.biosFileNames.includes(name)),
  );
}

async function mergedLibraryManifest(manifestPath, incoming, removed = new Set()) {
  let existing = { bios: {} };
  if (await assertSafeFileTarget(manifestPath)) {
    try {
      existing = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      throw new Error("Existing library manifest is malformed; refusing to overwrite it.");
    }
  }
  const merged = { bios: {} };
  for (const system of SYSTEMS) {
    const current = Array.isArray(existing?.[system.id])
      ? existing[system.id].filter((path) => isSystemFilePath(path, system) && !removed.has(path))
      : [];
    merged[system.id] = appendUniqueFiles(current, incoming[system.id]);
    if (!system.biosRequired) continue;
    const key = biosKey(system);
    const existingBios = existing?.bios?.[key];
    if (isBiosFilePath(incoming.bios[key], system)) merged.bios[key] = incoming.bios[key];
    else if (isBiosFilePath(existingBios, system)) merged.bios[key] = existingBios;
  }
  return merged;
}

export async function importRomSource(sourcePath, wallpaperPath) {
  const scan = await scanRomSource(sourcePath);
  const wallpaperRoot = await realpath(resolve(wallpaperPath));
  if (pathIsInside(wallpaperRoot, scan.sourceRoot) || pathIsInside(scan.sourceRoot, wallpaperRoot)) {
    throw new Error("The ROM source and installed wallpaper folders must be separate.");
  }
  const incoming = { bios: {} };
  const imported = [];
  const renamed = [];
  const alreadyImported = [];
  const failed = [];
  const expandedArchiveDirectories = [];
  const removedArchivePaths = new Set();
  const existingHashes = new Map();
  const existingBiosHashes = new Map();
  for (const system of SYSTEMS) {
    incoming[system.id] = [];
    const destinationFiles = await supportedFiles(join(wallpaperRoot, ...system.folder.split("/")), system.extensions);
    const hashes = new Map();
    for (const destination of destinationFiles) {
      try {
        hashes.set(sha256(await readFile(destination)), `${system.folder}/${basename(destination)}`);
      } catch {
        // A file that disappears during a scan is handled as a normal import failure below.
      }
    }
    existingHashes.set(system.id, hashes);
    if (system.biosRequired) {
      const biosHashes = new Map();
      const biosDirectory = join(wallpaperRoot, ...system.biosFolder.split("/"));
      for (const destination of await supportedFiles(biosDirectory, system.biosExtensions)) {
        const destinationRelative = `${system.biosFolder}/${basename(destination)}`;
        if (!isBiosFilePath(destinationRelative, system)) continue;
        try {
          biosHashes.set(sha256(await readFile(destination)), destinationRelative);
        } catch {
          // A file that disappears during a scan is handled as a normal import failure below.
        }
      }
      existingBiosHashes.set(biosKey(system), biosHashes);
    }
  }

  const importEntries = [];
  for (const entry of scan.files) {
    if (ARCHIVE_EXTENSIONS.has(fileExtension(entry.path))) {
      try {
        const expanded = await expandArchiveSourceFile(entry);
        const rawEntries = expanded.files.filter((candidate) => entry.system.extensions.includes(fileExtension(candidate.path))
          || (entry.system.archiveContentExtensions || []).includes(fileExtension(candidate.path)));
        if (rawEntries.length > 0) {
          importEntries.push(...rawEntries);
          expandedArchiveDirectories.push(expanded.directory);
          removedArchivePaths.add(`${entry.system.folder}/${basename(entry.path)}`);
          continue;
        }
        await rm(expanded.directory, { recursive: true, force: true });
      } catch (error) {
        failed.push({ ...entry, reason: error.message });
      }
    }
    importEntries.push(entry);
  }
  importEntries.push(...scan.bios);

  for (const entry of importEntries) {
    const system = entry.system;
    const isBios = entry.kind === "bios";
    const destinationKey = isBios ? biosKey(system) : system.id;
    const hashes = isBios ? existingBiosHashes.get(destinationKey) : existingHashes.get(destinationKey);
    const addManifestEntry = (path) => {
      if (isBios) incoming.bios[destinationKey] = path;
      else incoming[system.id].push(path);
    };
    const destinationFilename = isBios
      ? canonicalBiosFilename(system, basename(entry.path))
      : basename(entry.path);
    let destinationRelative = `${isBios ? system.biosFolder : system.folder}/${destinationFilename}`;
    try {
      const sourceBytes = await readFile(entry.path);
      if (sourceBytes.byteLength === 0) {
        scan.invalid.push({ path: entry.path, relativePath: entry.relativePath, reason: "The file is empty." });
        continue;
      }
      const hash = sha256(sourceBytes);
      const knownPath = hashes.get(hash);
      if (knownPath) {
        if (isBios && knownPath !== destinationRelative) {
          const canonicalTarget = await safeWallpaperTarget(wallpaperRoot, destinationRelative);
          const canonicalExists = await assertSafeFileTarget(canonicalTarget);
          if (canonicalExists && sha256(await readFile(canonicalTarget)) !== hash) {
            failed.push({ ...entry, destination: destinationRelative, reason: `The canonical BIOS destination for ${system.shortName} contains a different file.` });
            continue;
          }
          if (!canonicalExists) await copyManagedFile(entry.path, canonicalTarget);
          hashes.set(hash, destinationRelative);
          renamed.push({
            ...entry,
            destination: destinationRelative,
            reason: "The BIOS filename was normalized for emulator compatibility.",
          });
          addManifestEntry(destinationRelative);
          continue;
        }
        alreadyImported.push({ ...entry, destination: knownPath, reason: "The same file is already imported under another name." });
        addManifestEntry(knownPath);
        continue;
      }
      if (isBios && hashes.size > 0) {
        failed.push({ ...entry, destination: destinationRelative, reason: `A BIOS for ${system.shortName} is already present; remove it before importing a different dump.` });
        continue;
      }
      let target = await safeWallpaperTarget(wallpaperRoot, destinationRelative);
      let targetExists = await assertSafeFileTarget(target);
      if (targetExists) {
        const targetHash = sha256(await readFile(target));
        if (targetHash === hash) {
          alreadyImported.push({ ...entry, destination: destinationRelative, reason: "The same file is already in the emulator ROM folder." });
          addManifestEntry(destinationRelative);
          continue;
        }
        let attempt = 2;
        do {
          destinationRelative = `${isBios ? system.biosFolder : system.folder}/${collisionName(destinationFilename, attempt)}`;
          target = await safeWallpaperTarget(wallpaperRoot, destinationRelative);
          targetExists = await assertSafeFileTarget(target);
          attempt += 1;
        } while (targetExists);
        renamed.push({
          ...entry,
          destination: destinationRelative,
          reason: "A different file already used the original destination name.",
        });
      }
      await copyManagedFile(entry.path, target);
      hashes.set(hash, destinationRelative);
      imported.push({ ...entry, destination: destinationRelative });
      addManifestEntry(destinationRelative);
    } catch (error) {
      failed.push({ ...entry, destination: destinationRelative, reason: error?.message || "The file could not be imported." });
    }
  }

  for (const directory of expandedArchiveDirectories) {
    await rm(directory, { recursive: true, force: true });
  }

  const manifestPath = await safeWallpaperTarget(wallpaperRoot, "roms/library.local.json");
  const mergedManifest = await mergedLibraryManifest(manifestPath, incoming, removedArchivePaths);
  await atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(mergedManifest, null, 2)}\n`));
  const scriptManifestPath = await safeWallpaperTarget(wallpaperRoot, "roms/library.local.js");
  await atomicWrite(
    scriptManifestPath,
    Buffer.from(`globalThis.RETROSIGNAL_LIBRARY_MANIFEST = ${JSON.stringify(mergedManifest, null, 2)};\n`),
  );
  return {
    sourceRoot: scan.sourceRoot,
    manifestPath,
    scriptManifestPath,
    manifest: mergedManifest,
    imported,
    renamed,
    alreadyImported,
    failed,
    unsupported: scan.unsupported,
    ambiguous: scan.ambiguous,
    invalid: scan.invalid,
    errors: scan.errors,
  };
}

export const managerInternals = Object.freeze({
  applicationIdentity: APPLICATION_IDENTITY,
  defaultDataRoot,
  safeNamespace,
  safeRelativePath,
  sha256,
  classifySourceFile,
});
