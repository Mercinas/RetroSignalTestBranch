import { EmulatorHost } from "../js/emulator-host.js?version=3";
import { SYSTEMS } from "../js/systems.js";

const container = document.getElementById("host");
const result = document.getElementById("result");
const events = [];
const pageErrors = [];
window.addEventListener("error", (event) => pageErrors.push(event.message || "window error"));
window.addEventListener("unhandledrejection", () => pageErrors.push("unhandled rejection"));
if (!(container instanceof HTMLElement) || !(result instanceof HTMLOutputElement)) {
  throw new Error("Lifecycle harness elements are unavailable.");
}
let maxFrames = 0;
const observer = new MutationObserver(() => {
  maxFrames = Math.max(maxFrames, container.querySelectorAll("iframe").length);
});
observer.observe(container, { childList: true });

const host = new EmulatorHost(container, (event) => events.push(event.type), { lifecycleOnly: true });
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

for (let round = 0; round < 3; round += 1) {
  for (const system of SYSTEMS) {
    const extension = system.extensions.find((value) => !["zip", "7z"].includes(value));
    await host.start(system, `tests/missing-${round}.${extension}`, "", 0);
    await wait(175);
    await host.stop("harness-switch");
  }
}

const beforeDestroy = host.diagnostics();
await host.destroy();
const afterDestroy = host.diagnostics();
observer.disconnect();
result.textContent = JSON.stringify({
  systems: SYSTEMS.length,
  cycles: SYSTEMS.length * 3,
  maxFrames,
  finalFrames: container.querySelectorAll("iframe").length,
  loadingEvents: events.filter((event) => event === "loading").length,
  stoppedEvents: events.filter((event) => event === "stopped").length,
  timeoutEvents: events.filter((event) => event === "error").length,
  framesCreated: afterDestroy.framesCreated,
  framesRemoved: afterDestroy.framesRemoved,
  pendingStartTimers: afterDestroy.pendingStartTimers,
  messageListenersBeforeDestroy: beforeDestroy.messageListeners,
  messageListenersAfterDestroy: afterDestroy.messageListeners,
  activeAudioContexts: afterDestroy.audioContextCount,
  activeAudioSources: afterDestroy.audioSourceCount,
  pageErrors,
});
