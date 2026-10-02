import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import { inspectResource } from "../js/emulator-host.js";

test("resource inspection falls back from HEAD to an ordinary GET", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let bodyCancelled = false;
  globalThis.fetch = async (_path, options) => {
    calls.push(options);
    if (options.method === "HEAD") {
      return { ok: false, status: 405, headers: { get: () => null } };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-length" ? "6100244" : null) },
      body: { cancel: async () => { bodyCancelled = true; } },
    };
  };

  try {
    assert.deepEqual(await inspectResource("roms/Super Mario 64 (USA).zip"), {
      exists: true,
      size: 6100244,
    });
    assert.deepEqual(calls.map((options) => options.method), ["HEAD", "GET"]);
    assert.equal(calls[1].headers, undefined);
    assert.equal(bodyCancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resource inspection reports unknown size when Lively omits size headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
  });
  try {
    assert.deepEqual(await inspectResource("bios/psx/scph5501.bin"), {
      exists: true,
      size: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function loadEmulatorPrototype() {
  const source = readFileSync("emulatorjs/src/emulator.js", "utf8");
  const context = vm.createContext({
    ArrayBuffer,
    Blob,
    console,
    File: class File {},
    TextDecoder,
    Uint8Array,
    URL,
    window: {},
  });
  vm.runInContext(`${source}\nthis.EmulatorJSForTest = EmulatorJS;`, context);
  return context.EmulatorJSForTest.prototype;
}

test("EmulatorJS uses ordinary GETs when ROM and asset HEAD requests fail", async () => {
  const prototype = loadEmulatorPrototype();

  const assetMethods = [];
  const assetWrites = [];
  const assetEmulator = Object.assign(Object.create(prototype), {
    config: { cacheLimit: 0, dontExtractBIOS: true },
    debug: false,
    downloadFile: async (_path, _progress, _withoutPath, options) => {
      assetMethods.push(options.method);
      if (options.method === "HEAD") return -1;
      return { data: new Uint8Array([1, 2, 3]).buffer, headers: { "content-length": "3" } };
    },
    gameManager: { FS: { writeFile: (...args) => assetWrites.push(args) } },
    saveInBrowserSupported: () => false,
    storage: { rom: { get: async () => assert.fail("cache lookup requires usable HEAD metadata") } },
    textElem: { innerText: "" },
  });

  await assetEmulator.downloadGameFile("bios/psx/scph5501.bin", "bios", "download", "decompress");
  assert.deepEqual(assetMethods, ["HEAD", "GET"]);
  assert.equal(assetWrites.length, 1);

  const romMethods = [];
  const romWrites = [];
  const romEmulator = Object.assign(Object.create(prototype), {
    checkCompression: async (data, _message, onFile) => {
      onFile("!!notCompressedData", data);
    },
    config: { cacheLimit: 0, disableCue: true, gameUrl: "roms/game.z64" },
    debug: false,
    downloadFile: async (_path, _progress, _withoutPath, options) => {
      romMethods.push(options.method);
      if (options.method === "HEAD") return -1;
      return { data: new Uint8Array([4, 5, 6]).buffer, headers: { "content-length": "3" } };
    },
    extensions: ["z64"],
    gameManager: {
      FS: {
        analyzePath: () => ({ exists: true }),
        mkdir: () => {},
        writeFile: (...args) => romWrites.push(args),
      },
    },
    getBaseFileName: () => "game.z64",
    getCore: (generic) => (generic ? "n64" : "mupen64plus_next"),
    localization: (message) => message,
    saveInBrowserSupported: () => false,
    storage: { rom: { get: async () => assert.fail("cache lookup requires usable HEAD metadata") } },
    textElem: { innerText: "" },
  });

  await romEmulator.downloadRom();
  assert.deepEqual(romMethods, ["HEAD", "GET"]);
  assert.equal(romWrites.length, 1);
});
