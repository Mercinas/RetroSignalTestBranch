import { LibraryStore } from "../js/library-store.js";
import { emptyLibrary, mergeLibraryEntries, SYSTEM_BY_ID } from "../js/systems.js";

const result = document.getElementById("result");

function makeSessionStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const databaseName = `retrosignal-catalog-harness-${new URLSearchParams(location.search).get("run") || "default"}`;
const firstEnvironment = { indexedDB, navigator, crypto, sessionStorage: makeSessionStorage() };
const firstStore = new LibraryStore(firstEnvironment, { databaseName });
await firstStore.initialize();
const catalog = emptyLibrary();
mergeLibraryEntries(catalog, SYSTEM_BY_ID.get("nes"), ["alpha.nes", "bravo.nes"]);
mergeLibraryEntries(catalog, SYSTEM_BY_ID.get("gb"), ["pocket.gb"]);
await firstStore.saveCatalog(catalog);
firstStore.close();

const secondEnvironment = { indexedDB, navigator, crypto, sessionStorage: makeSessionStorage() };
const secondStore = new LibraryStore(secondEnvironment, { databaseName });
const restored = await secondStore.initialize();
const restoredEntries = Object.values(restored.catalog).reduce((total, games) => total + games.length, 0);
result.textContent = JSON.stringify({
  restoredEntries,
  nes: restored.catalog.nes,
  gb: restored.catalog.gb,
  readWriteVerifiedThisLoad: restored.diagnostic.readWriteVerifiedThisLoad,
  foundEarlierLoad: restored.diagnostic.foundEarlierLoad,
  foundEarlierWebView: restored.diagnostic.foundEarlierWebView,
});
secondStore.close();
