import test from 'node:test';
import assert from 'node:assert/strict';
import { flushSaveFileSystem } from '../js/save-flush.js';

for (const mode of ['callback', 'throw']) test(`local flush ${mode} failure warns despite successful recovery backup`, async () => {
  const warnings = []; let backedUp = false;
  const FS = { syncfs(populate, callback) {
    assert.equal(populate, false);
    if (mode === 'throw') throw new Error('IndexedDB failed');
    callback(new Error('IndexedDB failed'));
  } };
  const result = await flushSaveFileSystem(FS, { warn: message => warnings.push(message), backup: async () => { backedUp = true; } });
  assert.equal(result.localFlushed, false); assert.equal(backedUp, true);
  assert.match(warnings[0], /Local save persistence failed: IndexedDB failed/);
});
test('backup exceptions settle and warn without invalidating a successful local flush', async () => {
  const warnings = [];
  const result = await flushSaveFileSystem({ syncfs: (_, cb) => cb(null) }, { backup: async () => { throw new Error('offline'); }, warn: value => warnings.push(value) });
  assert.equal(result.localFlushed, true); assert.match(warnings[0], /Save backup failed: offline/);
});
test('missing filesystem is explicit and does not attempt backup', async () => {
  assert.deepEqual(await flushSaveFileSystem(null, { backup: () => assert.fail('unexpected backup') }), { localFlushed: false, unavailable: true });
});
test('a stalled flush and backup warn and settle, and a subsequent flush succeeds', async () => {
  const warnings = [];
  const stalled = await flushSaveFileSystem({ syncfs() {} }, { backup: () => new Promise(() => {}), warn: message => warnings.push(message), timeoutMs: 5 });
  assert.equal(stalled.localFlushed, false); assert.equal(warnings.length, 2);
  assert.match(warnings[0], /timed out/); assert.match(warnings[1], /timed out/);
  assert.equal((await flushSaveFileSystem({ syncfs: (_, cb) => cb() })).localFlushed, true);
});
