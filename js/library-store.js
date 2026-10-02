import { emptyLibrary, mergeLibraryEntries, SYSTEMS } from "./systems.js";

const DATABASE_NAME = "retrosignal";
const DATABASE_VERSION = 1;
const RECORDS_STORE = "records";
const SESSION_KEY = "retrosignal-session-id";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("Browser storage request failed.")), {
      once: true,
    });
  });
}

function transactionFinished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("Browser storage was aborted.")), {
      once: true,
    });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("Browser storage failed.")), {
      once: true,
    });
  });
}

function randomId(environment) {
  try {
    if (environment.crypto?.randomUUID) return environment.crypto.randomUUID();
  } catch (error) {
    // Fall through to a non-cryptographic instance marker.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sessionIdentity(environment) {
  try {
    let value = environment.sessionStorage?.getItem(SESSION_KEY) || "";
    if (!value) {
      value = randomId(environment);
      environment.sessionStorage?.setItem(SESSION_KEY, value);
    }
    return { id: value, reliable: Boolean(environment.sessionStorage) };
  } catch (error) {
    return { id: randomId(environment), reliable: false };
  }
}

export function sanitizeCatalog(source) {
  const catalog = emptyLibrary();
  for (const system of SYSTEMS) mergeLibraryEntries(catalog, system, source?.[system.id]);
  return catalog;
}

export function catalogEntryCount(catalog) {
  return SYSTEMS.reduce((total, system) => total + (catalog?.[system.id]?.length || 0), 0);
}

export function withoutCatalogEntries(catalog, paths) {
  const blocked = paths instanceof Set ? paths : new Set(paths || []);
  const next = emptyLibrary();
  for (const system of SYSTEMS) {
    mergeLibraryEntries(
      next,
      system,
      (catalog?.[system.id] || []).filter((path) => !blocked.has(path)),
    );
  }
  return next;
}

export class LibraryStore {
  constructor(environment = globalThis, options = {}) {
    this.environment = environment;
    this.databaseName = options.databaseName || DATABASE_NAME;
    this.database = null;
    this.openPromise = null;
    this.writeQueue = Promise.resolve();
  }

  async open() {
    if (this.database) return this.database;
    if (this.openPromise) return this.openPromise;
    if (!this.environment.indexedDB) throw new Error("IndexedDB is unavailable in this web player.");
    const request = this.environment.indexedDB.open(this.databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(RECORDS_STORE)) {
        request.result.createObjectStore(RECORDS_STORE);
      }
    });
    this.openPromise = requestResult(request);
    try {
      this.database = await this.openPromise;
    } catch (error) {
      this.openPromise = null;
      throw error;
    }
    return this.database;
  }

  async read(key) {
    const database = await this.open();
    const transaction = database.transaction(RECORDS_STORE, "readonly");
    return requestResult(transaction.objectStore(RECORDS_STORE).get(key));
  }

  write(key, value) {
    const operation = async () => {
      const database = await this.open();
      const transaction = database.transaction(RECORDS_STORE, "readwrite");
      transaction.objectStore(RECORDS_STORE).put(value, key);
      await transactionFinished(transaction);
      return value;
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async initialize() {
    const identity = sessionIdentity(this.environment);
    const instanceId = randomId(this.environment);
    const [storedCatalog, storedPreferences, previousProbe] = await Promise.all([
      this.read("catalog"),
      this.read("preferences"),
      this.read("storage-probe"),
    ]);
    const catalog = sanitizeCatalog(storedCatalog);
    const preferences = {
      setupComplete: false,
      bios: {},
      selection: { systemId: "n64", games: {} },
      ...(storedPreferences || {}),
      bios: { ...(storedPreferences?.bios || {}) },
      selection: { systemId: "n64", games: {}, ...(storedPreferences?.selection || {}) },
    };

    let browserPersisted = null;
    let usage = null;
    let quota = null;
    try {
      if (this.environment.navigator?.storage?.persisted) {
        browserPersisted = await this.environment.navigator.storage.persisted();
      }
      if (this.environment.navigator?.storage?.estimate) {
        const estimate = await this.environment.navigator.storage.estimate();
        usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
        quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
      }
    } catch (error) {
      // Storage estimates are optional and do not affect catalog operation.
    }

    const probe = {
      sessionId: identity.id,
      instanceId,
      savedAt: new Date().toISOString(),
      loads: Math.max(0, Number(previousProbe?.loads) || 0) + 1,
    };
    await this.write("storage-probe", probe);

    return {
      catalog,
      preferences,
      diagnostic: {
        available: true,
        readWriteVerifiedThisLoad: true,
        foundEarlierLoad: Boolean(previousProbe?.savedAt),
        foundEarlierWebView: Boolean(
          identity.reliable && previousProbe?.sessionId && previousProbe.sessionId !== identity.id
        ),
        sessionIdentityReliable: identity.reliable,
        browserPersisted,
        usage,
        quota,
        previousSavedAt: previousProbe?.savedAt || "",
        loads: probe.loads,
      },
    };
  }

  saveCatalog(catalog) {
    return this.write("catalog", sanitizeCatalog(catalog));
  }

  savePreferences(preferences) {
    return this.write("preferences", preferences);
  }

  close() {
    this.database?.close?.();
    this.database = null;
    this.openPromise = null;
  }
}
