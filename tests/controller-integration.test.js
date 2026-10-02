import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness(fetcher) {
  const host = { dataset: { systemId: 'nes' }, children: [], replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); } };
  const document = { querySelectorAll: () => [host], createElement: () => ({ events: {}, setAttribute() {}, addEventListener(name, callback) { this.events[name] = callback; } }) };
  let mounted;
  const context = { document, fetch: fetcher, bindingConflicts: () => [], getLayout: () => ({ variant: { id: 'standard' }, controls: [{ inputIndex: 8 }] }), effectiveBindings: saved => Array.from({ length: 32 }, (_, id) => saved[id] || '') };
  context.mountControllerMapper = (_, options) => {
    mounted = { options, values: options.bindings.slice(), getBindings() { return this.values.slice(); }, edit(id, key) { this.values[id] = key; options.onChange({ variantId: 'standard', conflicts: [] }); } };
    return mounted;
  };
  const source = readFileSync('manager/controller-mapper-integration.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function').replace('void initializeControllerMappers(document);', 'globalThis.initialize = initializeControllerMappers;');
  runInNewContext(source, context);
  return { context, host, mounted: () => mounted, initialize: () => context.initialize(document, fetcher) };
}
test('whole-profile hydration gates edits; sparse saves preserve hidden IDs and edits during saving', async () => {
  let hydrate; let acknowledge; const requests = [];
  const h = harness((url, options) => {
    if (!options) return new Promise(resolve => { hydrate = resolve; });
    requests.push(JSON.parse(options.body));
    return new Promise(resolve => { acknowledge = resolve; });
  });
  const initialization = h.initialize();
  assert.equal(h.mounted(), undefined);
  const prior = []; prior[8] = 'z'; prior[23] = 'p';
  hydrate({ ok: true, json: async () => ({ controls: { nes: prior }, capabilities: { keyboardMapping: true } }) });
  await initialization;
  assert.equal(h.mounted().values[23], 'p');
  h.mounted().edit(8, 'o');
  const save = h.host.children[0]; const saving = save.events.click();
  assert.deepEqual(requests[0].bindings, { 8: 'o' });
  h.mounted().edit(8, 'm'); assert.equal(save.disabled, true);
  acknowledge({ ok: true, json: async () => ({ bindings: prior }) }); await saving;
  assert.equal(h.mounted().values[8], 'm');
  assert.match(h.host.children[1].textContent, /New edits are still unsaved/);
  const next = save.events.click(); assert.deepEqual(requests[1].bindings, { 8: 'm' });
  acknowledge({ ok: true, json: async () => ({}) }); await next;
});
test('failed hydration creates no editor or save action', async () => {
  const h = harness(async () => { throw new Error('offline'); }); await h.initialize();
  assert.equal(h.mounted(), undefined); assert.equal(h.host.children.length, 0);
  assert.match(h.host.textContent, /offline.*Nothing was changed/);
});
test('old paired runtimes expose a read-only preview and cannot save', async () => {
  let requests = 0;
  const h = harness(async () => { requests++; return { ok: true, json: async () => ({ controls: { nes: [] }, capabilities: { keyboardMapping: false } }) }; });
  await h.initialize(); assert.equal(h.mounted().options.capabilities.keyboardMapping, false);
  assert.equal(h.host.children[0].disabled, true); await h.host.children[0].events.click(); assert.equal(requests, 1);
});
