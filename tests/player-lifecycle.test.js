import test from 'node:test';
import assert from 'node:assert/strict';
import { openPlayerWindow } from '../manager/player-lifecycle.mjs';

for (const phase of ['create', 'load', 'configure']) test(`${phase} failure destroys only the new window and releases its owned pause once`, async () => {
  let released = 0; let destroyed = false; const handlers = new Map();
  const window = { on: (name, fn) => handlers.set(name, fn), isDestroyed: () => destroyed, destroy() { destroyed = true; handlers.get('closed')?.(); } };
  const fail = () => { throw new Error(phase); };
  await assert.rejects(openPlayerWindow({
    acquirePlaybackLease: async () => ({ release: async () => { released++; } }),
    create: phase === 'create' ? fail : () => window,
    load: phase === 'load' ? fail : async () => {},
    configure: phase === 'configure' ? fail : async () => {},
    focus: () => assert.fail('failed window must not focus'),
  }), new RegExp(phase));
  assert.equal(released, 1); assert.equal(destroyed, phase !== 'create');
});
for (const state of ['stopped', 'paused', 'unknown']) test(`${state} playback without an owned lease is never started or resumed`, async () => {
  await assert.rejects(openPlayerWindow({ create: () => { throw new Error('construction'); }, load: async () => {}, configure: async () => {}, focus: () => {} }), /construction/);
});
