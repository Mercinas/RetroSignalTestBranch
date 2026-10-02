const DEFAULT_CONFIG_PATH = "manager.json";
const MAX_SAVE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SAVE_SNAPSHOT_BYTES = 32 * 1024 * 1024;

function isLoopbackEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch (error) {
    return false;
  }
}

export async function readManagerConfig(environment = globalThis, configPath = DEFAULT_CONFIG_PATH, signal) {
  const response = await environment.fetch(configPath, { cache: "no-store", ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error("RetroSignal Manager is not connected.");
  const config = await response.json();
  if (!isLoopbackEndpoint(config.endpoint) || !/^[A-Za-z0-9_-]{32,128}$/.test(String(config.token || ""))) {
    throw new Error("RetroSignal Manager connection is invalid.");
  }
  return config;
}

export async function requestManagerLibraryRescan(environment = globalThis, configPath = DEFAULT_CONFIG_PATH) {
  const config = await readManagerConfig(environment, configPath);
  const response = await environment.fetch(`${String(config.endpoint).replace(/\/+$/, "")}/api/v1/rescan`, {
    method: "POST",
    headers: { "X-RetroSignal-Token": config.token },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Manager rescan failed (${response.status}).`);
  return payload;
}

function normalizeRelativePath(value) {
  const path = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return path;
}

function joinFsPath(root, relative) {
  return `${String(root || "").replace(/\/+$/, "")}/${relative}`;
}

function ensureDirectory(fileSystem, path) {
  let current = "";
  for (const part of String(path).split("/")) {
    if (!part) continue;
    current += `/${part}`;
    if (!fileSystem.analyzePath(current).exists) fileSystem.mkdir(current);
  }
}

function bytesToBase64(bytes, environment = globalThis) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return environment.btoa(binary);
}

function base64ToBytes(value, environment = globalThis) {
  const binary = environment.atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function collectSaveFiles(fileSystem, root, environment = globalThis) {
  const files = [];
  let totalBytes = 0;
  const visit = (directory, prefix = "") => {
    for (const name of fileSystem.readdir(directory)) {
      if (name === "." || name === "..") continue;
      const relative = prefix ? `${prefix}/${name}` : name;
      const path = joinFsPath(root, relative);
      const stat = fileSystem.stat(path);
      if (fileSystem.isDir(stat.mode)) {
        visit(path, relative);
        continue;
      }
      const bytes = fileSystem.readFile(path);
      if (bytes.byteLength > MAX_SAVE_FILE_BYTES) continue;
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_SAVE_SNAPSHOT_BYTES) {
        throw new Error("The save snapshot exceeds the 32 MB manager limit.");
      }
      files.push({ path: relative, data: bytesToBase64(bytes, environment) });
    }
  };
  if (fileSystem.analyzePath(root).exists) visit(root);
  return files;
}

export function restoreSaveFiles(fileSystem, root, files, environment = globalThis) {
  let restored = 0;
  let totalBytes = 0;
  for (const entry of Array.isArray(files) ? files : []) {
    const relative = normalizeRelativePath(entry?.path);
    if (!relative || typeof entry?.data !== "string") continue;
    let bytes;
    try {
      bytes = base64ToBytes(entry.data, environment);
    } catch (error) {
      continue;
    }
    if (bytes.byteLength > MAX_SAVE_FILE_BYTES) continue;
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SAVE_SNAPSHOT_BYTES) break;
    const path = joinFsPath(root, relative);
    ensureDirectory(fileSystem, path.split("/").slice(0, -1).join("/"));
    fileSystem.writeFile(path, bytes);
    restored += 1;
  }
  return restored;
}

export class ManagerSaveBridge {
  constructor(config, environment = globalThis) {
    this.endpoint = String(config.endpoint).replace(/\/+$/, "");
    this.token = config.token;
    this.namespace = config.namespace;
    this.environment = environment;
    this.fetch = environment.fetch.bind(environment);
    this.lastFailure = "";
  }

  reportFailure(operation, error) {
    const detail = error?.message || String(error || "Unknown error");
    const message = `${operation}: ${detail}`;
    if (message === this.lastFailure) return;
    this.lastFailure = message;
    const CustomEventType = this.environment.CustomEvent;
    if (typeof this.environment.dispatchEvent === "function" && typeof CustomEventType === "function") {
      this.environment.dispatchEvent(new CustomEventType("retrosignal-save-warning", { detail: message }));
    }
  }

  clearFailure() {
    this.lastFailure = "";
  }

  static async connect(namespace, environment = globalThis, configPath = DEFAULT_CONFIG_PATH) {
    try {
      const config = await readManagerConfig(environment, configPath);
      if (!/^[a-z0-9_-]{3,96}$/i.test(String(namespace || ""))) return null;
      return new ManagerSaveBridge({ ...config, namespace }, environment);
    } catch (error) {
      return null;
    }
  }

  request(path, options = {}) {
    return this.fetch(`${this.endpoint}${path}`, {
      ...options,
      headers: {
        "X-RetroSignal-Token": this.token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
  }

  async restore(fileSystem, root) {
    try {
      const response = await this.request(`/api/v1/saves/${encodeURIComponent(this.namespace)}`);
      if (response.status === 404) return 0;
      if (!response.ok) throw new Error(`Manager restore failed (${response.status}).`);
      const payload = await response.json();
      const restored = restoreSaveFiles(fileSystem, root, payload.files, this.environment);
      this.clearFailure();
      return restored;
    } catch (error) {
      this.reportFailure("Manager save restore failed", error);
      return 0;
    }
  }

  async backup(fileSystem, root) {
    this.lastBackupFailure = "";
    try {
      const files = collectSaveFiles(fileSystem, root, this.environment);
      if (files.length === 0) return false;
      const response = await this.request(`/api/v1/saves/${encodeURIComponent(this.namespace)}`, {
        method: "PUT",
        body: JSON.stringify({ files }),
      });
      if (!response.ok) throw new Error(`Manager save backup failed (${response.status}).`);
      this.clearFailure();
      return true;
    } catch (error) {
      this.lastBackupFailure = error?.message || String(error);
      this.reportFailure("Manager save backup failed", error);
      return false;
    }
  }
}

export const saveBridgeInternals = Object.freeze({ isLoopbackEndpoint, normalizeRelativePath });
