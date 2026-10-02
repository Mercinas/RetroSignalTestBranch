import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKeyboardBindings } from '../manager/keyboard-bindings.mjs';
import { buildKeyboardControls } from '../js/systems.js';
test('sparse patches preserve actual N64 input IDs and untouched custom bindings', () => {
  const prior = []; prior[12] = 'b'; prior[23] = 'p';
  const saved = normalizeKeyboardBindings({23: 'o', 0: 'c'}, prior, [0, 12, 23]);
  assert.equal(saved[23], 'o'); assert.equal(saved[12], 'b'); assert.equal(saved[0], 'c');
  assert.equal(buildKeyboardControls(saved)[0][23].value, 'o');
  assert.equal(saved[4], 'up arrow');
});
test('legacy input-index arrays, explicit unbinding and named keys remain supported', () => {
  const values = []; values[8] = 'page up'; values[12] = '';
  const saved = normalizeKeyboardBindings(values);
  assert.equal(saved[8], 'page up'); assert.equal(saved[12], '');
});
test('conflicts and reserved or unsupported keys fail without mutating prior config', () => {
  const old = ['x'];
  assert.throws(() => normalizeKeyboardBindings({0:'z'}, old, [0, 8]), /Duplicate/);
  for (const key of ['f8','f10','f11','escape','`','pageup','garbage']) assert.throws(() => normalizeKeyboardBindings({0:key}), /reserved|Unsupported/);
  assert.deepEqual(old, ['x']);
});
