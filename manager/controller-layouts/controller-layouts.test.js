import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEMS, buildKeyboardControls } from "../../js/systems.js";
import { CONTROLLER_LAYOUTS, getLayout, effectiveBindings, bindingConflicts, keyFromEvent } from "./layouts.js";
import { createBindingState } from "./binding-state.js";
import { controllerSvg } from "./illustrations.js";
import { mountControllerMapper } from "./component.js";

test("every configured system has a deterministic layout, valid unique input IDs and finite positions", () => {
  assert.equal(Object.keys(CONTROLLER_LAYOUTS).length, 21);
  for (const system of SYSTEMS) for (const variant of CONTROLLER_LAYOUTS[system.id].variants) {
    assert.equal(new Set(variant.controls.map(c => c.inputIndex)).size, variant.controls.length, `${system.id}/${variant.id}`);
    for (const c of variant.controls) { assert.ok(Number.isInteger(c.inputIndex) && c.inputIndex >= 0 && c.inputIndex < 24); assert.ok(c.x > 0 && c.x < 600 && c.y > 0 && c.y < 340); }
    assert.match(controllerSvg(getLayout(system.id, variant.id)), /viewBox="0 0 600 340"/);
  }
});
const ids = id => Object.fromEntries(getLayout(id).controls.map(c => [c.label, c.inputIndex]));
test("GB/NES/GBA semantic oracle uses EJS IDs, independent of existing Manager slot labels", () => {
  for (const system of ["gb", "nes", "gba"]) { const map = ids(system); assert.equal(map.A, 8); assert.equal(map.B, 0); assert.equal(map.Select, 2); assert.equal(map.Start, 3); assert.equal(map.Up, 4); }
  assert.equal(ids("gba").L, 10); assert.equal(ids("gba").R, 11);
});
test("SNES, PS1 and N64 exceptional controls match vendored input tables", () => {
  assert.equal(ids("snes").X, 9); assert.equal(ids("snes").Y, 1); assert.equal(ids("snes").L, 10);
  assert.equal(ids("psx").Cross, 0); assert.equal(ids("psx").Circle, 8); assert.equal(ids("psx").L2, 12);
  assert.equal(ids("n64")["Z (rear trigger)"], 12); assert.equal(ids("n64")["C up"], 23); assert.equal(ids("n64")["Stick left"], 17);
});
test("six-button variants and Virtual Boy retain distinct semantics", () => {
  const six = Object.fromEntries(getLayout("genesis", "standard").controls.map(c => [c.label, c.inputIndex]));
  assert.deepEqual([six.A, six.B, six.C, six.X, six.Y, six.Z], [1, 0, 8, 10, 9, 11]);
  assert.equal(ids("saturn").L, 12); assert.equal(ids("virtualboy")["Right D-pad up"], 19);
  assert.equal(getLayout("psx", "dual-analog").variant.requires, "analogDevice");
  assert.equal(getLayout("cdi").controls.length, 0);
});
test("sparse edits serialize and hydrate by input index; empty override survives", () => {
  const initial = []; initial[8] = "b"; initial[23] = "c"; initial[28] = "v"; initial[31] = "m";
  const state = createBindingState(initial);
  for (const [index, key] of [[0, "j"], [3, "k"], [4, "l"], [8, ""], [12, "u"], [23, "o"]]) state.edit(index, key);
  const serialized = JSON.parse(JSON.stringify(state.snapshot()));
  const restored = createBindingState(serialized).snapshot();
  const runtime = buildKeyboardControls(restored)[0];
  for (const [index, key] of [[0, "j"], [3, "k"], [4, "l"], [8, ""], [12, "u"], [23, "o"]]) assert.equal(runtime[index]?.value || "", key);
  assert.equal(restored[28], "v"); assert.equal(restored[31], "m");
});
test("delayed hydration preserves local edits and hydrates every untouched custom key", () => {
  const state = createBindingState(); state.edit(8, "j"); state.edit(23, "");
  const saved = []; saved[0] = "b"; saved[8] = "o"; saved[12] = "u"; saved[23] = "p";
  const result = state.hydrate(saved);
  assert.equal(result[8], "j"); assert.equal(result[23], ""); assert.equal(result[0], "b"); assert.equal(result[12], "u");
});
test("hydration before editing and malformed hydration are non-destructive", () => {
  const state = createBindingState(); const saved = []; saved[12] = "u"; state.hydrate(saved); state.edit(4, "l");
  assert.equal(state.snapshot()[12], "u"); const before = state.snapshot();
  assert.throws(() => state.hydrate(null), TypeError); assert.deepEqual(state.snapshot(), before);
  assert.throws(() => state.edit(33, "a"), RangeError);
});
test("duplicate keys normalize case, clearing removes collision, systems remain isolated", () => {
  const values = effectiveBindings(); values[8] = "J"; values[0] = " j ";
  assert.deepEqual(bindingConflicts(values, getLayout("nes").controls), [{ key: "j", inputs: [8, 0] }]);
  values[0] = ""; assert.deepEqual(bindingConflicts(values, getLayout("nes").controls), []);
  assert.deepEqual(bindingConflicts(effectiveBindings(), getLayout("nes").controls), []);
});
test("key capture follows EJS named keys and rejects host shortcuts, modifiers and repeats", () => {
  assert.equal(keyFromEvent({ key: " " }), "space"); assert.equal(keyFromEvent({ key: "PageUp" }), "page up");
  assert.equal(keyFromEvent({ key: "ArrowUp" }), "up arrow");
  for (const key of ["Escape", "F8", "F10", "F11", "`", "Shift"]) assert.equal(keyFromEvent({ key }), null);
  assert.equal(keyFromEvent({ key: "a", ctrlKey: true }), null); assert.equal(keyFromEvent({ key: "a", repeat: true }), null);
});

// Small owned DOM mock: tests real component callbacks and focus, not browser paint.
class MockElement {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = new Map(); this.className = ""; this.disabled = false; }
  append(el) { el.parentNode = this; this.children.push(el); }
  replaceChildren() { for (const el of this.children) el.parentNode = null; this.children = []; }
  set innerHTML(value) { this.replaceChildren(); this.html = value; }
  setAttribute(key, value) { this.attributes[key] = value; }
  contains(el) { return el === this || this.children.some(child => child.contains(el)); }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentNode?.isConnected); }
  addEventListener(key, handler) { this.listeners.set(key, [...(this.listeners.get(key) || []), handler]); }
  removeEventListener(key, handler) { this.listeners.set(key, (this.listeners.get(key) || []).filter(h => h !== handler)); }
  dispatch(key, event = {}) { for (const handler of this.listeners.get(key) || []) handler({ preventDefault() {}, stopPropagation() {}, ...event }); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(el => el !== this); this.parentNode = null; }
  closest() { return this.hidden || this.attributes["aria-hidden"] === "true" ? this : this.parentNode?.closest() || null; }
  querySelectorAll(selector) {
    const attr = selector.match(/^\[data-([a-z-]+)\]$/)?.[1]?.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const matches = el => attr ? Object.hasOwn(el.dataset, attr) : el.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  get classList() { return { toggle: (name, enabled) => { const classes = new Set(this.className.split(" ").filter(Boolean)); if (enabled) classes.add(name); else classes.delete(name); this.className = [...classes].join(" "); }, contains: name => this.className.split(" ").includes(name) }; }
}
function mockMapper(options = {}) {
  const doc = { createElement: tag => new MockElement(tag, doc), activeElement: null };
  doc.body = new MockElement("body", doc);
  const events = new MockElement("document", doc); doc.addEventListener = events.addEventListener.bind(events); doc.removeEventListener = events.removeEventListener.bind(events);
  doc.defaultView = new MockElement("window", doc);
  const container = new MockElement("div", doc); doc.body.append(container);
  const changes = [];
  const api = mountControllerMapper(container, { systemId: "nes", capabilities: { keyboardMapping: true }, onChange: event => changes.push(event), ...options });
  const find = id => api.element.querySelectorAll("[data-focus-id]").find(el => el.dataset.focusId === id);
  return { doc, events, container, api, changes, find };
}
test("component retains selected-control and keyboard focus across selection and delayed hydration", () => {
  const { doc, api, find } = mockMapper();
  const selected = find("control-8"); selected.focus(); selected.dispatch("click");
  assert.notEqual(doc.activeElement, selected); assert.equal(doc.activeElement.dataset.focusId, "control-8");
  api.hydrate([]); assert.equal(doc.activeElement.dataset.focusId, "control-8"); assert.equal(doc.activeElement.isConnected, true);
  find("key-j").focus(); api.hydrate([]); assert.equal(doc.activeElement.dataset.focusId, "key-j"); assert.equal(doc.activeElement.isConnected, true);
  api.destroy();
});
test("hidden default collision offers a visible clear action; reassignment preserves other slots", () => {
  const { api, changes, find } = mockMapper(); find("control-8").dispatch("click");
  find("key-j").dispatch("click"); assert.equal(changes.length, 0); assert.equal(api.getBindings()[21], "j");
  const clear = api.element.querySelectorAll("[data-clear-input]").find(el => el.dataset.clearInput === "21");
  assert.ok(clear); assert.match(clear.textContent, /Clear Other preserved input 21/);
  clear.dispatch("click"); assert.equal(api.getBindings()[21], "");
  find("key-j").dispatch("click"); assert.equal(api.getBindings()[8], "j"); assert.equal(api.getBindings()[23], "i");
  api.destroy();
});
test("loaded hidden collisions are reported in component UI and emitted validation scope", () => {
  const values = effectiveBindings(); values[8] = " J ";
  const { api, changes, find } = mockMapper({ bindings: values });
  assert.deepEqual(bindingConflicts(values), [{ key: "j", inputs: [8, 21] }]);
  assert.equal(find("key-j").classList.contains("cl-conflict"), true);
  find("control-0").dispatch("click");
  api.element.querySelectorAll("button").find(el => el.textContent === "Clear binding").dispatch("click");
  assert.deepEqual(changes.at(-1).conflicts, [{ key: "j", inputs: [8, 21] }]);
  api.destroy();
});
test("normalized legacy values highlight both diagram and keyboard without rewriting persistence", () => {
  const values = effectiveBindings(); values[8] = " J "; values[21] = "";
  const { api, events, doc, find, container } = mockMapper({ bindings: values });
  assert.ok(api.element.querySelectorAll("p").some(el => el.textContent?.includes("pinned runtime does not trim keys")));
  events.dispatch("keydown", { key: "j" });
  assert.equal(find("control-8").classList.contains("cl-held"), true); assert.equal(find("key-j").classList.contains("cl-held"), true);
  assert.equal(api.getBindings()[8], " J ");
  events.dispatch("keyup", { key: "j" }); assert.equal(find("control-8").classList.contains("cl-held"), false);
  container.hidden = true; events.dispatch("keydown", { key: "j" }); assert.equal(find("key-j").classList.contains("cl-held"), false);
  container.hidden = false; events.dispatch("keydown", { key: "j" }); doc.defaultView.dispatch("blur"); assert.equal(find("key-j").classList.contains("cl-held"), false);
  api.destroy(); assert.equal((events.listeners.get("keydown") || []).length, 0);
});
test("capture cancels when focus leaves so later keys can highlight normally", () => {
  const { api, events, find } = mockMapper();
  const capture = api.element.querySelectorAll("button").find(el => el.textContent === "Capture key"); capture.dispatch("click");
  assert.equal(capture.attributes["aria-pressed"], "true");
  api.element.dispatch("focusout", { relatedTarget: null }); assert.equal(capture.attributes["aria-pressed"], "false");
  events.dispatch("keydown", { key: "x" }); assert.equal(find("control-0").classList.contains("cl-held"), true);
  api.destroy();
});

test('keyboard shows live action labels after assignment, clear, reset and hydration, including duplicate actions',()=>{
  const h=mockMapper(),labels=key=>h.find('key-'+key).querySelectorAll('small').map(node=>node.textContent);
  assert.deepEqual(labels('z'),['A']);assert.deepEqual(labels('.'),['—']);
  h.find('control-8').dispatch('click');h.find('key-.').dispatch('click');
  assert.deepEqual(labels('.'),['A']);assert.deepEqual(labels('z'),['—']);
  h.api.element.querySelectorAll('button').find(el=>el.textContent==='Clear binding').dispatch('click');assert.deepEqual(labels('.'),['—']);
  h.api.element.querySelectorAll('button').find(el=>el.textContent==='Reset controller keys').dispatch('click');assert.deepEqual(labels('z'),['A']);
  const custom=effectiveBindings();custom[8]='p';custom[0]='p';h.api.setBindings(custom);
  assert.deepEqual(labels('p'),['A','B']);assert.ok(h.find('key-p').classList.contains('cl-conflict'));
  const fresh=mockMapper({bindings:custom});assert.deepEqual(fresh.find('key-p').querySelectorAll('small').map(node=>node.textContent),['A','B']);
  assert.equal(h.api.getBindings()[24],'1');h.api.destroy();fresh.api.destroy();
});
