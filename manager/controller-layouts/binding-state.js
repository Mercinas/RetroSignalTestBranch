import { effectiveBindings } from "./layouts.js";

// Input-index arrays stay input-index arrays. Dirty IDs win over late hydration.
export function createBindingState(initial = []) {
  let values = effectiveBindings(initial);
  const dirty = new Set();
  return {
    snapshot: () => values.slice(),
    edit(inputIndex, key) {
      if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= 32) throw new RangeError("Invalid EmulatorJS input index");
      if (typeof key !== "string") throw new TypeError("Binding must be a string");
      values[inputIndex] = key; dirty.add(inputIndex);
    },
    hydrate(saved) {
      if (!Array.isArray(saved)) throw new TypeError("Saved controls must be an input-index array");
      const next = effectiveBindings(saved);
      for (const index of dirty) next[index] = values[index];
      values = next;
      return values.slice();
    },
    replace(next) { values = effectiveBindings(next); dirty.clear(); },
  };
}
