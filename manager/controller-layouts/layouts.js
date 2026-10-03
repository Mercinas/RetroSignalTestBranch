// EJS input indices, NOT the label-slot order in systems.keyboardControlSlots.
import { controllerArt } from './illustrations.js';
// Positions are normalized to a 600x340 original, unbranded illustration.
const control = (id, label, x, y, kind = "button", extra = {}) => ({ id: String(id), inputIndex: id, label, x, y, kind, ...extra });
const dpad = (x = 115, y = 170, prefix = "") => [control(4, `${prefix}Up`, x, y - 30, "direction"), control(5, `${prefix}Down`, x, y + 30, "direction"), control(6, `${prefix}Left`, x - 30, y, "direction"), control(7, `${prefix}Right`, x + 30, y, "direction")];
const stick = (x, y, right = false, prefix = "Stick") => [control(right ? 23 : 19, `${prefix} up`, x, y - 28, "axis", { digitalKey: true }), control(right ? 22 : 18, `${prefix} down`, x, y + 28, "axis", { digitalKey: true }), control(right ? 21 : 17, `${prefix} left`, x - 28, y, "axis", { digitalKey: true }), control(right ? 20 : 16, `${prefix} right`, x + 28, y, "axis", { digitalKey: true })];
const middle = (select = "Select", start = "Start") => [control(2, select, 265, 185), control(3, start, 330, 185)];
const two = (a = "A", b = "B") => [control(8, a, 490, 160), control(0, b, 435, 185)];
const shoulder = (left = 10, right = 11) => [control(left, "L", 115, 68, "shoulder"), control(right, "R", 485, 68, "shoulder")];
const diamond = () => [control(8, "A", 495, 170), control(0, "B", 450, 210), control(9, "X", 450, 130), control(1, "Y", 405, 170)];
const six = (saturn = false) => [control(1, "A", 405, 205), control(0, "B", 450, 185), control(8, "C", 495, 165), control(saturn ? 9 : 10, "X", 405, 145), control(saturn ? 10 : 9, "Y", 450, 125), control(11, "Z", 495, 105)];
const basic = () => [...dpad(), ...middle(), ...two()];
const defs = {
  n64: ["three-prong", [...dpad(110, 140), ...stick(285, 245), control(0, "A", 445, 225), control(1, "B", 410, 195), control(3, "Start", 285, 145), ...shoulder(), control(12, "Z (rear trigger)", 285, 300, "rear"), ...stick(495, 155, true, "C")], "Analog stick and C buttons use EJS directional indices; keyboard directions are digital, not variable analog pressure."],
  gb: ["portrait-handheld", [...dpad(225, 220), control(8, "A", 385, 205), control(0, "B", 345, 230), control(2, "Select", 275, 285), control(3, "Start", 335, 285)]],
  gba: ["wide-handheld", [...basic(), ...shoulder()]],
  atari2600: ["joystick", [...dpad(300, 160), control(0, "Fire", 150, 240), control(2, "Select (console)", 435, 120, "console"), control(3, "Reset (console)", 435, 180, "console")], "Console switches are shown beside the joystick. Paddle input is a separate peripheral and is not implemented here."],
  atari5200: ["keypad-stick", [...dpad(300, 120), control(8, "Fire 1", 175, 160), control(0, "Fire 2", 425, 160), control(3, "Start", 300, 180)], "Keypad and analog controller require core-specific routing verification; unverified keypad keys are decorative only."],
  nes: ["rectangle-pad", basic()],
  mastersystem: ["rectangle-pad", [...dpad(), control(0, "1 / Start", 425, 170), control(8, "2", 485, 170), control(2, "Pause (console)", 300, 95, "console")], "Pause belongs to the console, not the original controller; core binding requires runtime verification."],
  atari7800: ["joystick", [...dpad(300, 160), control(0, "Fire 1", 150, 240), control(8, "Fire 2", 450, 240), control(2, "Select (console)", 175, 75, "console"), control(3, "Pause (console)", 300, 75, "console"), control(9, "Reset (console)", 425, 75, "console")]],
  tg16: ["rectangle-pad", [...dpad(), ...middle("Select", "Run"), ...two("I", "II")], "Two-button pad. Six-button and mouse devices require separately verified device selection."],
  genesis: ["rounded-pad", [...dpad(), control(3, "Start", 285, 125), control(2, "Mode", 535, 75, "shoulder"), ...six()]],
  tgcd: ["rectangle-pad", [...dpad(), ...middle("Select", "Run"), ...two("I", "II")]],
  snes: ["rounded-pad", [...dpad(), ...middle(), ...diamond(), ...shoulder()]],
  cdi: ["remote", [], "CD-i has multiple pointing/remote devices. The current arcade scheme does not verify their input identities; mapping is intentionally unavailable."],
  segacd: ["rounded-pad", [...dpad(), control(3, "Start", 285, 125), control(2, "Mode", 535, 75, "shoulder"), ...six()]],
  jaguar: ["keypad-pad", [...dpad(135, 135), control(8, "A", 420, 155), control(0, "B", 460, 130), control(1, "C", 500, 105), control(2, "Pause", 270, 110), control(3, "Option", 330, 110)], "Jaguar keypad routing is not verified against this bundled runtime. Decorative keypad keys cannot be assigned."],
  sega32x: ["rounded-pad", [...dpad(), control(3, "Start", 285, 125), control(2, "Mode", 535, 75, "shoulder"), ...six()]],
  saturn: ["rounded-pad", [...dpad(), control(3, "Start", 285, 175), ...six(true), ...shoulder(12, 13)]],
  psx: ["dual-grip", [...dpad(), ...middle(), control(0, "Cross", 450, 215), control(8, "Circle", 495, 170), control(1, "Square", 405, 170), control(9, "Triangle", 450, 125), ...shoulder().map(c => ({ ...c, label: `${c.label}1` })), control(12, "L2", 115, 30, "rear"), control(13, "R2", 485, 30, "rear")], "Digital pad is the default variant. Dual analog inputs require runtime controller-device confirmation."],
  lynx: ["wide-handheld", [...dpad(), ...two(), control(3, "Pause", 365, 230), control(10, "Option 1", 440, 245), control(11, "Option 2", 510, 245)]],
  gamegear: ["wide-handheld", [...dpad(), control(0, "1", 435, 185), control(8, "2", 490, 160), control(3, "Start", 520, 100)]],
  virtualboy: ["dual-grip", [...dpad(115, 165, "Left D-pad "), ...stick(470, 165, false, "Right D-pad"), control(8, "A", 365, 235), control(0, "B", 320, 255), control(2, "Select", 215, 235), control(3, "Start", 260, 255), ...shoulder()], "The right D-pad uses EJS indices 16–19. It is not a second analog stick."],
};

const variant = (id, label, controls, requires = null) => ({ id, label, controls, requires });
export const CONTROLLER_LAYOUTS = Object.freeze(Object.fromEntries(Object.entries(defs).map(([systemId, [shape, controls, note = ""]]) => {
  const variants = [variant("standard", systemId === "psx" ? "Digital pad" : "Standard controller", controls)];
  if (["genesis", "segacd", "sega32x"].includes(systemId)) variants.unshift(variant("three-button", "Three-button pad", controls.filter(c => ![2, 9, 10, 11].includes(c.inputIndex))));
  if (systemId === "psx") variants.push(variant("dual-analog", "Dual analog pad", [...controls, ...stick(210, 265), ...stick(390, 265, true, "Right stick"), control(14, "L3", 210, 265), control(15, "R3", 390, 265)], "analogDevice"));
  if (systemId === "saturn") variants.push(variant("analog", "3D Control Pad", [...controls, ...stick(215, 260)], "analogDevice"));
  return [systemId, Object.freeze({ systemId, shape, note, coordinateSpace: [600, 340], variants })];
})));
export function getLayout(systemId, variantId) {
  const layout = CONTROLLER_LAYOUTS[systemId];
  if (!layout) throw new RangeError(`No verified layout for ${systemId}`);
  const selected = variantId ? layout.variants.find(v => v.id === variantId) : layout.variants[0];
  if (!selected) throw new RangeError(`Unknown controller variant ${variantId}`);
  const resolved={ ...layout, variant:selected, controls:selected.controls };
  const art=controllerArt(resolved);
  return {...resolved, illustrationName:art.name, controls:selected.controls.map(control=>{
    const geometry=art.controls[control.inputIndex];
    if(!geometry)throw new RangeError(`Missing physical control geometry: ${systemId}/${selected.id}/${control.inputIndex}`);
    return {...control,...geometry};
  })};
}

export const DEFAULT_BINDINGS = Object.freeze(["x", "s", "v", "enter", "up arrow", "down arrow", "left arrow", "right arrow", "z", "a", "q", "e", "tab", "r", "", "", "h", "f", "g", "t", "l", "j", "k", "i", "1", "2", "3", "", "", ""]);
export function effectiveBindings(overrides = []) { return Array.from({ length: Math.max(DEFAULT_BINDINGS.length, Math.min(32, overrides.length)) }, (_, i) => typeof overrides[i] === "string" ? overrides[i] : DEFAULT_BINDINGS[i] || ""); }
export const normalizeBindingKey = value => String(value || "").trim().toLowerCase();
export function bindingConflicts(bindings, controls = bindings.map((_, inputIndex) => ({ inputIndex }))) {
  const groups = new Map();
  for (const c of controls) {
    const key = normalizeBindingKey(bindings[c.inputIndex]);
    if (key) groups.set(key, [...(groups.get(key) || []), c.inputIndex]);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).map(([key, inputs]) => ({ key, inputs }));
}
export function keyFromEvent(event) {
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
  const named = { ArrowUp: "up arrow", ArrowDown: "down arrow", ArrowLeft: "left arrow", ArrowRight: "right arrow", " ": "space", Enter: "enter", Tab: "tab", Backspace: "backspace", Delete: "delete", Home: "home", End: "end", PageUp: "page up", PageDown: "page down" };
  if (["Escape", "F8", "F10", "F11", "`"].includes(event.key)) return null; // Host navigation; Escape cancels capture.
  return named[event.key] || (event.key?.length === 1 ? event.key.toLowerCase() : /^F(?:[1-7]|9|1[0-2])$/.test(event.key) ? event.key.toLowerCase() : null);
}
