import { buildKeyboardControls } from '../js/systems.js';

const namedKeys = new Set(['enter', 'tab', 'backspace', 'space', 'page up', 'page down', 'end', 'home', 'insert', 'delete', 'left arrow', 'up arrow', 'right arrow', 'down arrow', 'pause/break', 'caps lock', 'shift', 'ctrl', 'alt', 'multiply', 'add', 'subtract', 'decimal point', 'divide']);
export function normalizeKeyboardBindings(value, existing = [], inputIds = null) {
  if (!value || typeof value !== 'object') throw new Error('Provide bindings by emulator input ID.');
  const defaults = buildKeyboardControls()[0];
  const result = Array.from({ length: 32 }, (_, id) => typeof existing?.[id] === 'string' ? existing[id] : defaults[id]?.value || '');
  for (const [index, raw] of Object.entries(value)) {
    if (!/^(?:[0-9]|[12][0-9]|3[01])$/.test(index) || typeof raw !== 'string') throw new Error('Invalid emulator input ID or key.');
    const key = raw.trim().toLowerCase();
    if (['escape', 'f8', 'f10', 'f11', '`'].includes(key)) throw new Error('That key is reserved for player navigation.');
    if (key && !/^[a-z0-9\-=[\]\\;',./]$/.test(key) && !/^f(?:[1-7]|9|12)$/.test(key) && !/^numpad [0-9]$/.test(key) && !namedKeys.has(key)) throw new Error('Unsupported keyboard key.');
    result[Number(index)] = key;
  }
  const seen = new Set();
  for (const id of inputIds || result.keys()) {
    const key = result[id]?.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) throw new Error(`Duplicate binding: ${key}. Change or clear a control before saving.`);
    seen.add(key);
  }
  return result;
}
