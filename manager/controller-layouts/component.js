import { getLayout, bindingConflicts, keyFromEvent, normalizeBindingKey, DEFAULT_BINDINGS } from "./layouts.js";
import { controllerSvg } from "./illustrations.js";
import { createBindingState } from "./binding-state.js";

export const KEYBOARD_ROWS = [
  ["escape", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"],
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "backspace"],
  ["tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
  ["space", "home", "end", "page up", "page down", "delete", "left arrow", "up arrow", "down arrow", "right arrow"],
];
const displayKey = key => ({ "up arrow": "Up", "down arrow": "Down", "left arrow": "Left", "right arrow": "Right", " ": "Space", backspace:"Backspace", escape:"Esc", "page up":"PgUp", "page down":"PgDn" }[key] || key.toUpperCase());

/** Does not fetch, save, subscribe to hardware, or change the emulator.
 * onChange({systemId, variantId, bindings, conflicts}) is a local edit notification.
 * capabilities defaults to read-only; integrator must explicitly confirm runtime.
 */
export function mountControllerMapper(container, { systemId, bindings = [], capabilities = {}, onChange = () => {} } = {}) {
  if (!container?.ownerDocument) throw new TypeError("A DOM container is required");
  const doc = container.ownerDocument;
  const state = createBindingState(bindings);
  let layout = getLayout(systemId), values = state.snapshot(), selected = layout.controls[0]?.inputIndex ?? null;
  const pressed = new Set();
  let capture = false;
  let rendering = false;
  let renderedVariant = null;
  const containingPanel = container.closest?.('.system-details');
  const loadDeferredImages = () => {
    for (const image of stage.querySelectorAll('[data-deferred-src]')) {
      image.setAttribute('href', image.getAttribute('data-deferred-src'));
      image.removeAttribute('data-deferred-src');
    }
  };
  const root = doc.createElement("section"); root.className = "cl-mapper"; root.setAttribute("aria-label", `${systemId} keyboard mapping`);
  const make = (tag, text, parent = root) => { const el = doc.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
  make("h3", "Controller studio");
  const note = make("p"); note.className = "cl-note";
  const variants = make("select"); variants.setAttribute("aria-label", "Controller variant");
  for (const v of layout.variants) { const option = make("option", v.label, variants); option.value = v.id; option.disabled = Boolean(v.requires && capabilities[v.requires] !== true); }
  const stage = make("div"); stage.className = "cl-controller";
  const controllerName=make('p');controllerName.className='cl-controller-name';
  const list = make("div"); list.className = "cl-control-list";
  const instructions = make("p", "Select a control above, then choose a key below. Use Capture key to press a key directly; Escape cancels."); instructions.className = "cl-instructions";
  const selectedLabel = make("p"); selectedLabel.className = "cl-selection";
  const actions = make("div"); actions.className = "cl-actions";
  const captureButton = make("button", "Capture key", actions); captureButton.type = "button";
  const clearButton = make("button", "Clear binding", actions); clearButton.type = "button";
  const resetButton = make("button", "Reset controller keys", actions); resetButton.type = "button";
  const keyboard = make("div"); keyboard.className = "cl-keyboard"; keyboard.setAttribute("aria-label", "Keyboard keys");
  const status = make("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const hiddenKeys = make("p");
  const advanced = make("details"); advanced.className = "cl-advanced";
  const advancedSummary = make("summary", "Advanced bindings", advanced);
  make("p", "Hotkeys and other stored inputs outside this diagram. Clear an individual binding only if you want to remove it.", advanced);
  const preserved = make("div", "", advanced); preserved.className = "cl-preserved";
  container.append(root);
  const enabled = () => capabilities.keyboardMapping === true && selected !== null;
  const inputLabel = index => layout.controls.find(c => c.inputIndex === index)?.label || ({ 24: "Quick save", 25: "Quick load", 26: "State slot", 27: "Fast forward", 28: "Rewind", 29: "Slow motion" }[index]) || `Other preserved input ${index}`;
  const emit = () => onChange({ systemId, variantId: layout.variant.id, bindings: values.slice(), conflicts: bindingConflicts(values) });
  const assign = key => {
    if (!enabled()) return;
    const duplicate = key ? values.findIndex((value, index) => index !== selected && normalizeBindingKey(value) === normalizeBindingKey(key)) : -1;
    if (duplicate >= 0) { if (!layout.controls.some(c => c.inputIndex === duplicate)) advanced.open = true; status.textContent = `${displayKey(key)} is already assigned to ${layout.controls.find(c => c.inputIndex === duplicate)?.label || `input ${duplicate}`}. Clear that binding first.`; return; }
    state.edit(selected, key); values = state.snapshot(); capture = false; render(); emit(); captureButton.focus();
  };
  const select = id => { selected = id; capture = false; render(); };
  function buttonFor(c, parent, overlay = false, alias = '') {
    const button = make("button", overlay ? "" : c.label, parent); button.type = "button";
    button.dataset.inputIndex = String(c.inputIndex); button.setAttribute("aria-pressed", String(c.inputIndex === selected));
    button.dataset.focusId = `${overlay ? "diagram" : "control"}-${c.inputIndex}${alias}`;
    button.setAttribute("aria-label", `${c.label}: ${values[c.inputIndex] || "Unbound"}${c.kind === "axis" ? ", digital keyboard direction" : ""}`);
    button.addEventListener("click", () => select(c.inputIndex));
    if (overlay) { button.className = `cl-hotspot cl-${c.kind}`; button.style.left = `${c.x / 6}%`; button.style.top = `${c.y / 3.4}%`; button.style.width=`${(c.width || 24)/6}%`;button.style.height=`${(c.height || 24)/3.4}%`;button.title=button.getAttribute?.('aria-label') || c.label; button.tabIndex = -1; }
    else { const key = make("small", values[c.inputIndex] || "Unbound", button); key.className = "cl-binding"; }
  }
  function render() {
    const active = doc.activeElement;
    const focusId = root.contains(active) ? active.dataset?.focusId : null;
    rendering = true;
    note.textContent = layout.note || "Choose a control to edit its keyboard binding.";
    if (capabilities.keyboardMapping !== true) note.textContent += " Runtime mapping support has not been confirmed. This preview is read-only.";
    // Pinned EJS keyLookup lowercases but does not trim; normal Manager saves trim.
    if (values.some(value => value !== value.trim())) note.textContent += " Saved keys with surrounding whitespace are normalized for this preview only. Clear and reassign them before use; the pinned runtime does not trim keys.";
    if (renderedVariant !== layout.variant.id) {
      const svg = controllerSvg(layout);
      stage.innerHTML = containingPanel?.hidden ? svg.replace(/ href="/g, ' data-deferred-src="') : svg;
      renderedVariant = layout.variant.id;
    } else {
      for (const button of stage.querySelectorAll('.cl-hotspot')) button.remove();
    }
    list.replaceChildren(); keyboard.replaceChildren();
    controllerName.textContent=layout.illustrationName;
    for (const c of layout.controls) {
      buttonFor(c, stage, true); buttonFor(c, list);
      for (const [index, geometry] of (c.aliases || []).entries()) buttonFor({...c,...geometry}, stage, true, `-alias-${index}`);
    }
    const current = layout.controls.find(c => c.inputIndex === selected);
    selectedLabel.textContent = current ? `${current.label} — ${values[selected] || "Unbound"}${capture ? " — Press a key now" : ""}` : "No verified assignable controls for this device.";
    captureButton.disabled = clearButton.disabled = resetButton.disabled = !enabled(); captureButton.setAttribute("aria-pressed", String(capture));
    const conflicts = bindingConflicts(values);
    const conflictKeys = new Set(conflicts.map(c => c.key));
    const used = new Map();
    for (const c of layout.controls) { const key = normalizeBindingKey(values[c.inputIndex]); if (key) used.set(key, [...(used.get(key) || []), c.label]); }
    for (const keys of KEYBOARD_ROWS) {
      const row = make("div", "", keyboard); row.className = "cl-key-row";
      for (const key of keys) {
        const button = make("button", "", row); button.type = "button";
        const labels = used.get(key) || [];
        make('span',displayKey(key),button).className='cl-key-legend';
        const assignments=make('span','',button);assignments.className='cl-key-assignments';
        for(const label of labels)make('small',label,assignments).className='cl-key-action';
        if(!labels.length)make('small','—',assignments).className='cl-key-unassigned';
        button.className = `cl-key${labels.length ? " cl-mapped" : ""}${conflictKeys.has(key) ? " cl-conflict" : ""}${normalizeBindingKey(values[selected]) === key ? " cl-selected" : ""}`;
        button.dataset.key = key;
        button.dataset.focusId = `key-${key}`;
        button.disabled = !enabled() || ["escape", "f8", "f10", "f11", "`"].includes(key);
        button.setAttribute("aria-label", `${displayKey(key)}${labels.length ? `: ${labels.join(", ")}` : ": unassigned"}${conflictKeys.has(key) ? ", duplicate binding" : ""}`);
        button.addEventListener("click", () => assign(key));
      }
    }
    status.textContent = conflicts.length ? `Duplicate bindings: ${conflicts.map(c => `${c.key} (${c.inputs.map(inputLabel).join(", ")})`).join("; ")}. Change or clear a control or preserved binding to resolve.` : "All bindings are unique.";
    const shown = new Set(KEYBOARD_ROWS.flat());
    hiddenKeys.textContent = [...used.keys()].filter(k => !shown.has(k)).length ? `Other saved keys: ${[...used.keys()].filter(k => !shown.has(k)).join(", ")}.` : "";
    preserved.replaceChildren();
    const visibleIds = new Set(layout.controls.map(c => c.inputIndex));
    const others = values.map((value, index) => ({ value, index })).filter(({ value, index }) => normalizeBindingKey(value) && !visibleIds.has(index));
    advanced.hidden = !others.length;
    advancedSummary.textContent = `Advanced bindings · ${others.length} stored`;
    if (others.some(({ index }) => conflicts.some(conflict => conflict.inputs.includes(index)))) advanced.open = true;
    if (others.length) {
      for (const { value, index } of others) {
        const row = make("div", "", preserved);
        make("span", inputLabel(index).replace('Other preserved input ', 'Input '), row);
        make("kbd", displayKey(value), row);
        const clear = make("button", `Clear ${inputLabel(index)}`, row); clear.type = "button";
        clear.setAttribute('aria-label', `Clear ${inputLabel(index)}: ${displayKey(value)}`);
        clear.className = 'cl-clear-preserved';
        clear.dataset.focusId = `preserved-${index}`; clear.dataset.clearInput = String(index);
        clear.disabled = capabilities.keyboardMapping !== true;
        clear.addEventListener("click", () => { if (capabilities.keyboardMapping !== true) return; state.edit(index, ""); values = state.snapshot(); render(); emit(); });
      }
    }
    highlight();
    rendering = false;
    if (focusId) { const replacement = [...root.querySelectorAll("[data-focus-id]")].find(el => el.dataset.focusId === focusId); (replacement || captureButton).focus(); }
  }
  function highlight() {
    for (const el of root.querySelectorAll("[data-key]")) el.classList.toggle("cl-held", pressed.has(el.dataset.key));
    for (const el of root.querySelectorAll("[data-input-index]")) el.classList.toggle("cl-held", pressed.has(normalizeBindingKey(values[Number(el.dataset.inputIndex)])));
  }
  const inactive = () => !root.isConnected || Boolean(root.closest?.('[hidden], [aria-hidden="true"]')) || (typeof root.getClientRects === "function" && root.getClientRects().length === 0);
  const keyDown = event => { if (capture || event.repeat || inactive()) return; const key = keyFromEvent(event); if (key) { pressed.add(key); highlight(); } };
  const keyUp = event => { const key = keyFromEvent({ ...event, key: event.key, repeat: false }); if (key) { pressed.delete(key); highlight(); } };
  const release = () => { capture = false; captureButton.setAttribute("aria-pressed", "false"); selectedLabel.textContent = selectedLabel.textContent.replace(" - Press a key now", ""); pressed.clear(); highlight(); };
  doc.addEventListener("keydown", keyDown); doc.addEventListener("keyup", keyUp); doc.defaultView?.addEventListener("blur", release);
  variants.addEventListener("change", () => { release(); layout = getLayout(systemId, variants.value); selected = layout.controls[0]?.inputIndex ?? null; capture = false; render(); });
  captureButton.addEventListener("click", () => { capture = !capture; render(); captureButton.focus(); });
  clearButton.addEventListener("click", () => assign(""));
  resetButton.addEventListener('click',()=>{if(!enabled())return;for(const control of layout.controls)state.edit(control.inputIndex,DEFAULT_BINDINGS[control.inputIndex] || '');values=state.snapshot();release();render();emit();});
  root.addEventListener("keydown", event => {
    if (!capture || !enabled()) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); capture = false; render(); captureButton.focus(); return; }
    const key = keyFromEvent(event);
    // Tab continues normal accessible traversal rather than being trapped.
    if (key === "tab") return;
    event.preventDefault(); event.stopPropagation();
    if (key) { assign(key); captureButton.focus(); } else status.textContent = "Choose a single key without modifiers. Escape, F8 and backquote are reserved.";
  });
  root.addEventListener("focusout", event => { if (!rendering && !root.contains(event.relatedTarget)) release(); });
  containingPanel?.addEventListener('controller-panel-open', loadDeferredImages);
  render();
  return { getBindings: () => state.snapshot(), hydrate(next) { values = state.hydrate(next); render(); }, setBindings(next) { state.replace(next); values = state.snapshot(); capture = false; release(); render(); }, releaseHighlights: release, destroy() { containingPanel?.removeEventListener('controller-panel-open', loadDeferredImages); doc.removeEventListener("keydown", keyDown); doc.removeEventListener("keyup", keyUp); doc.defaultView?.removeEventListener("blur", release); release(); root.remove(); }, element: root };
}
