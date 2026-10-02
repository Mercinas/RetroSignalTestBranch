import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

await import("../emulatorjs/src/nativezip.js");

const { extract } = globalThis.EJS_NATIVE_ZIP;
globalThis.window = globalThis;
await import("../emulatorjs/src/compression.js");

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[i] = value >>> 0;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = entry.nameBytes ? Buffer.from(entry.nameBytes) : Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content || []);
    const method = entry.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const checksum = entry.crc ?? crc32(content);
    const flags = entry.flags ?? 0x0800;
    const declaredSize = entry.uncompressedSize ?? content.length;
    const localExtra = Buffer.from(entry.localExtra || []);
    const centralExtra = Buffer.from(entry.centralExtra || []);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(declaredSize, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(localExtra.length, 28);
    localParts.push(localHeader, name, localExtra, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(declaredSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(centralExtra.length, 30);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name, centralExtra);

    localOffset += localHeader.length + name.length + localExtra.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return new Uint8Array(Buffer.concat([...localParts, centralDirectory, end]));
}

function unicodePathExtra(rawName, unicodeName) {
  const encodedName = Buffer.from(unicodeName, "utf8");
  const extra = Buffer.alloc(4 + 5 + encodedName.length);
  extra.writeUInt16LE(0x7075, 0);
  extra.writeUInt16LE(5 + encodedName.length, 2);
  extra[4] = 1;
  extra.writeUInt32LE(crc32(rawName), 5);
  encodedName.copy(extra, 9);
  return extra;
}

test("native ZIP extraction handles stored and DEFLATE game files", async () => {
  const archive = makeZip([
    { name: "Super Mario 64 (USA).z64", content: [0x80, 0x37, 0x12, 0x40], method: 8 },
    { name: "docs/readme.txt", content: Buffer.from("ready"), method: 0 },
  ]);
  const progress = [];
  const files = await extract(archive, {
    onProgress(current, total, name) {
      progress.push({ current, total, name });
    },
  });

  assert.deepEqual([...files["Super Mario 64 (USA).z64"]], [0x80, 0x37, 0x12, 0x40]);
  assert.equal(new TextDecoder().decode(files["docs/readme.txt"]), "ready");
  assert.deepEqual(progress, [
    { current: 1, total: 2, name: "Super Mario 64 (USA).z64" },
    { current: 2, total: 2, name: "docs/readme.txt" },
  ]);
});

test("native ZIP callback mode streams each extracted entry to EmulatorJS", async () => {
  const archive = makeZip([
    { name: "disc/game.cue", content: Buffer.from("FILE game.bin BINARY"), method: 8 },
    { name: "disc/game.bin", content: [1, 2, 3, 4], method: 8 },
  ]);
  const received = [];
  const result = await extract(archive, {
    onFile(name, data) {
      received.push([name, data.byteLength]);
    },
  });

  assert.deepEqual(received, [["disc/game.cue", 20], ["disc/game.bin", 4]]);
  assert.equal(result["disc/game.cue"], true);
  assert.equal(result["disc/game.bin"], true);
});

test("native ZIP extraction decodes CP437 names and valid Unicode Path overrides", async () => {
  const cp437Name = Buffer.from([
    ...Buffer.from("disc/caf", "ascii"),
    0x82,
    ...Buffer.from(".cue", "ascii"),
  ]);
  const legacyName = Buffer.from("disc/legacy.bin", "ascii");
  const unicodeName = "disc/Pokémon.bin";
  const archive = makeZip([
    { nameBytes: cp437Name, flags: 0, content: Buffer.from("FILE café.bin BINARY"), method: 0 },
    {
      nameBytes: legacyName,
      flags: 0,
      centralExtra: unicodePathExtra(legacyName, unicodeName),
      content: [1, 2, 3],
      method: 8,
    },
  ]);

  const files = await extract(archive);
  assert.equal(new TextDecoder().decode(files["disc/café.cue"]), "FILE café.bin BINARY");
  assert.deepEqual([...files[unicodeName]], [1, 2, 3]);
});

test("native ZIP inflation stops when output exceeds the declared size", async () => {
  const archive = makeZip([{
    name: "bomb.bin",
    content: Buffer.alloc(2 * 1024 * 1024, 0x41),
    uncompressedSize: 4,
    method: 8,
  }]);

  await assert.rejects(() => extract(archive), error => {
    assert.equal(error.code, "size-mismatch");
    assert.match(error.message, /size check failed/);
    return true;
  });

  const source = readFileSync("emulatorjs/src/nativezip.js", "utf8");
  assert.doesNotMatch(source, /Response\(stream\)\.arrayBuffer/);
  assert.match(source, /nextLength > expectedSize[\s\S]*?reader\.cancel/);
});

test("EmulatorJS compression routes ZIP files through the native extractor", async () => {
  const archive = makeZip([{ name: "game.z64", content: [0x80, 0x37, 0x12, 0x40], method: 8 }]);
  const received = [];
  const progress = [];
  const failures = [];
  const compression = new globalThis.EJS_COMPRESSION({
    downloadFile() {
      throw new Error("ZIP extraction must not download or start the legacy worker");
    },
    startGameError(message) {
      failures.push(message);
    },
  });

  const result = await compression.decompress(
    archive,
    (message) => progress.push(message),
    (name, data) => received.push([name, [...data]]),
  );

  assert.deepEqual(received, [["game.z64", [0x80, 0x37, 0x12, 0x40]]]);
  assert.equal(result["game.z64"], true);
  assert.deepEqual(progress, [" 100%"]);
  assert.deepEqual(failures, []);
});

test("EmulatorJS uses the native ZIP worker and transfers an ArrayBuffer", async () => {
  const originalWorker = globalThis.Worker;
  const originalWorkerUrl = globalThis.EJS_NATIVE_ZIP_WORKER_URL;
  const workerCalls = [];

  class FakeWorker {
    constructor(url) {
      this.url = url;
      workerCalls.push(this);
    }

    postMessage(message, transfers) {
      this.message = message;
      this.transfers = transfers;
      queueMicrotask(() => {
        this.onmessage({ data: { t: 2, file: "game.z64", data: new Uint8Array([0x80, 0x37, 0x12, 0x40]) } });
        this.onmessage({ data: { t: 4, current: 1, total: 1, name: "game.z64" } });
        this.onmessage({ data: { t: 1 } });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  globalThis.Worker = FakeWorker;
  globalThis.EJS_NATIVE_ZIP_WORKER_URL = "nativezip-worker.js";
  try {
    const compression = new globalThis.EJS_COMPRESSION({});
    const archive = makeZip([{ name: "game.z64", content: [1], method: 8 }]).buffer;
    const received = [];
    const result = await compression.decompressZip(archive, null, (name, data) => received.push([name, [...data]]));

    assert.equal(workerCalls.length, 1);
    assert.equal(workerCalls[0].url, "nativezip-worker.js");
    assert.equal(workerCalls[0].message.archive, archive);
    assert.deepEqual(workerCalls[0].transfers, [archive]);
    assert.equal(workerCalls[0].terminated, true);
    assert.deepEqual(received, [["game.z64", [0x80, 0x37, 0x12, 0x40]]]);
    assert.equal(result["game.z64"], true);
  } finally {
    globalThis.Worker = originalWorker;
    globalThis.EJS_NATIVE_ZIP_WORKER_URL = originalWorkerUrl;
  }
});

test("EmulatorJS retries native ZIP extraction without a worker when setup fails", async () => {
  const originalWorker = globalThis.Worker;
  const originalWorkerUrl = globalThis.EJS_NATIVE_ZIP_WORKER_URL;
  const originalWarn = console.warn;
  class FailingWorker {
    constructor() {
      throw new Error("worker unavailable");
    }
  }
  globalThis.Worker = FailingWorker;
  globalThis.EJS_NATIVE_ZIP_WORKER_URL = "nativezip-worker.js";
  console.warn = () => {};
  try {
    const compression = new globalThis.EJS_COMPRESSION({});
    const archive = makeZip([{ name: "retry.z64", content: [4, 5, 6], method: 8 }]);
    const result = await compression.decompressZip(archive);
    assert.deepEqual([...result["retry.z64"]], [4, 5, 6]);
  } finally {
    globalThis.Worker = originalWorker;
    globalThis.EJS_NATIVE_ZIP_WORKER_URL = originalWorkerUrl;
    console.warn = originalWarn;
  }
});

test("EmulatorJS falls back to the bundled ZIP worker without deflate-raw support", async () => {
  const originalDecompressionStream = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    const compression = new globalThis.EJS_COMPRESSION({});
    const calls = [];
    compression.decompressFile = async (method, data, updateMsg, fileCbFunc) => {
      calls.push({ method, data, updateMsg, fileCbFunc });
      return { "fallback.bin": new Uint8Array([1]) };
    };
    const archive = makeZip([{ name: "fallback.bin", content: [1], method: 8 }]);
    const result = await compression.decompressZip(archive, "progress", "file");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "zip");
    assert.equal(calls[0].data, archive);
    assert.equal(result["fallback.bin"][0], 1);
  } finally {
    globalThis.DecompressionStream = originalDecompressionStream;
  }
});

test("native ZIP extraction surfaces integrity and unsafe-path failures", async () => {
  const badCrc = makeZip([{ name: "game.z64", content: [1, 2, 3], method: 8, crc: 0 }]);
  await assert.rejects(() => extract(badCrc), error => {
    assert.equal(error.code, "crc-mismatch");
    assert.match(error.message, /integrity check failed/);
    return true;
  });

  const traversal = makeZip([{ name: "../game.z64", content: [1], method: 0 }]);
  await assert.rejects(() => extract(traversal), error => {
    assert.equal(error.code, "unsafe-entry-name");
    assert.match(error.message, /unsafe parent path/);
    return true;
  });

  const oversized = makeZip([{
    name: "oversized.bin",
    content: [1],
    uncompressedSize: 769 * 1024 * 1024,
    method: 0,
  }]);
  await assert.rejects(() => extract(oversized), error => {
    assert.equal(error.code, "archive-limit");
    assert.match(error.message, /768 MB safety limit/);
    return true;
  });
});
