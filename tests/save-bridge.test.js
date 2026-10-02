import assert from "node:assert/strict";
import { test } from "node:test";
import { collectSaveFiles, ManagerSaveBridge, restoreSaveFiles, saveBridgeInternals } from "../js/save-bridge.js";

function memoryFileSystem() {
  const directories = new Set(["/", "/data", "/data/saves"]);
  const files = new Map();
  return {
    files,
    analyzePath(path) {
      return { exists: directories.has(path) || files.has(path) };
    },
    mkdir(path) {
      directories.add(path);
    },
    readdir(path) {
      const prefix = path === "/" ? "/" : `${path}/`;
      const children = new Set([".", ".."]);
      for (const entry of [...directories, ...files.keys()]) {
        if (!entry.startsWith(prefix) || entry === path) continue;
        const child = entry.slice(prefix.length).split("/")[0];
        if (child) children.add(child);
      }
      return [...children];
    },
    stat(path) {
      return { mode: directories.has(path) ? 0x4000 : 0x8000 };
    },
    isDir(mode) {
      return mode === 0x4000;
    },
    readFile(path) {
      return files.get(path);
    },
    writeFile(path, bytes) {
      files.set(path, new Uint8Array(bytes));
    },
  };
}

test("save bridge accepts only loopback manager endpoints", () => {
  assert.equal(saveBridgeInternals.isLoopbackEndpoint("http://127.0.0.1:41237"), true);
  assert.equal(saveBridgeInternals.isLoopbackEndpoint("http://localhost:41237"), true);
  assert.equal(saveBridgeInternals.isLoopbackEndpoint("https://example.com"), false);
  assert.equal(saveBridgeInternals.normalizeRelativePath("slot/save.srm"), "slot/save.srm");
  assert.equal(saveBridgeInternals.normalizeRelativePath("../save.srm"), "");
});

test("save bridge round-trips nested emulator files", () => {
  const source = memoryFileSystem();
  source.mkdir("/data/saves/game");
  source.writeFile("/data/saves/game/save.srm", Uint8Array.from([1, 2, 3, 255]));
  const payload = collectSaveFiles(source, "/data/saves");
  assert.deepEqual(payload.map((entry) => entry.path), ["game/save.srm"]);

  const target = memoryFileSystem();
  assert.equal(restoreSaveFiles(target, "/data/saves", payload), 1);
  assert.deepEqual([...target.readFile("/data/saves/game/save.srm")], [1, 2, 3, 255]);
});

test("backup exposes a failed recovery write but clears the failure for an empty subsequent backup", async () => {
  const source = memoryFileSystem(); source.mkdir("/data/saves/game");
  source.writeFile("/data/saves/game/save.srm", Uint8Array.from([7]));
  const bridge = new ManagerSaveBridge({ endpoint: "http://127.0.0.1:41237", token: "a".repeat(43), namespace: "nes-test" }, {
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    fetch: async () => { throw new Error("offline"); }, dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
  });
  assert.equal(await bridge.backup(source, "/data/saves"), false);
  assert.equal(bridge.lastBackupFailure, "offline");
  assert.equal(await bridge.backup(memoryFileSystem(), "/data/saves"), false);
  assert.equal(bridge.lastBackupFailure, "");
});

test("save restore ignores a malformed entry and reports a manager failure once", async () => {
  const source = memoryFileSystem();
  source.mkdir("/data/saves/game");
  source.writeFile("/data/saves/game/save.srm", Uint8Array.from([7]));
  const payload = collectSaveFiles(source, "/data/saves");
  payload.unshift({ path: "broken.srm", data: "%%%" });
  const target = memoryFileSystem();
  assert.equal(restoreSaveFiles(target, "/data/saves", payload), 1);
  assert.deepEqual([...target.readFile("/data/saves/game/save.srm")], [7]);

  const warnings = [];
  const environment = {
    fetch: async () => { throw new Error("offline"); },
    dispatchEvent(event) { warnings.push(event.detail); },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
  };
  const bridge = new ManagerSaveBridge({ endpoint: "http://127.0.0.1:41237", token: "a".repeat(43), namespace: "nes-test" }, environment);
  await bridge.restore(target, "/data/saves");
  await bridge.restore(target, "/data/saves");
  assert.deepEqual(warnings, ["Manager save restore failed: offline"]);
});
