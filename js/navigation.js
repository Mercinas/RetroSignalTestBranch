export const SELECTOR_LEVELS = Object.freeze({
  systems: "systems",
  games: "games",
});

export function wrapIndex(index, delta, count) {
  const size = Number(count);
  if (!Number.isInteger(size) || size <= 0) return 0;
  const current = Number.isInteger(index) ? index : 0;
  return ((current + delta) % size + size) % size;
}

export function backTargetForSelector(level) {
  return level === SELECTOR_LEVELS.games ? SELECTOR_LEVELS.systems : "off";
}
