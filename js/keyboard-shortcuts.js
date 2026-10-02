export const KEYBOARD_ACTIONS = Object.freeze({
  toggleMode: "toggle-mode",
  previousSystem: "previous-system",
  nextSystem: "next-system",
  previousGame: "previous-game",
  nextGame: "next-game",
  start: "start",
  back: "back",
  rescan: "rescan",
});

export const RESCAN_SHORTCUTS = Object.freeze([
  Object.freeze({ label: "Numpad *", code: "NumpadMultiply" }),
  Object.freeze({ label: "F6", key: "F6" }),
  Object.freeze({ label: "F7", key: "F7" }),
  Object.freeze({ label: "F9", key: "F9" }),
  Object.freeze({ label: "R", code: "KeyR" }),
  Object.freeze({ label: "Disabled" }),
]);

export const KEYBOARD_SHORTCUTS = Object.freeze({
  F8: KEYBOARD_ACTIONS.toggleMode,
  "`": KEYBOARD_ACTIONS.toggleMode,
  Backquote: KEYBOARD_ACTIONS.toggleMode,
  ArrowLeft: KEYBOARD_ACTIONS.previousSystem,
  ArrowRight: KEYBOARD_ACTIONS.nextSystem,
  ArrowUp: KEYBOARD_ACTIONS.previousGame,
  ArrowDown: KEYBOARD_ACTIONS.nextGame,
  Enter: KEYBOARD_ACTIONS.start,
  Tab: KEYBOARD_ACTIONS.start,
  Escape: KEYBOARD_ACTIONS.back,
});

export const KEYBOARD_DUPLICATE_WINDOW_MS = 120;

export function keyboardActionFor(event) {
  if (!event || event.repeat) return "";
  return KEYBOARD_SHORTCUTS[event.key] || "";
}

export function isRescanShortcut(event, shortcutIndex = 0) {
  if (!event || event.repeat) return false;
  const shortcut = RESCAN_SHORTCUTS[Number(shortcutIndex)] || RESCAN_SHORTCUTS[0];
  if (!shortcut.code && !shortcut.key) return false;
  return (shortcut.code && event.code === shortcut.code) || (shortcut.key && event.key === shortcut.key);
}

export class KeyboardShortcutGate {
  constructor(duplicateWindowMs = KEYBOARD_DUPLICATE_WINDOW_MS) {
    this.duplicateWindowMs = duplicateWindowMs;
    this.lastAcceptedAt = new Map();
  }

  accept(action, timestamp) {
    if (!action) return false;
    const now = Number.isFinite(timestamp) ? timestamp : 0;
    const previous = this.lastAcceptedAt.get(action);
    if (Number.isFinite(previous) && now >= previous && now - previous < this.duplicateWindowMs) return false;
    this.lastAcceptedAt.set(action, now);
    return true;
  }

  clear() {
    this.lastAcceptedAt.clear();
  }
}
