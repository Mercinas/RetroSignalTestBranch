import { fileExtension, gameIdentity } from "./systems.js";

const START_TIMEOUT_MS = 45000;
const ARCHIVE_START_TIMEOUT_MS = 180000;
const SHUTDOWN_TIMEOUT_MS = 3000;

function startTimeoutFor(romPath) {
  const extension = fileExtension(romPath);
  return ["zip", "7z"].includes(extension) ? ARCHIVE_START_TIMEOUT_MS : START_TIMEOUT_MS;
}

function withTimeout(promise, timeoutMs) {
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(resolve, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  });
}

function responseSize(response) {
  const contentRange = response.headers?.get?.("content-range") || "";
  const rangeMatch = contentRange.match(/\/(\d+)$/);
  if (rangeMatch) return Number(rangeMatch[1]);
  const contentLengthHeader = response.headers?.get?.("content-length");
  if (contentLengthHeader === null || contentLengthHeader === undefined || String(contentLengthHeader).trim() === "") return null;
  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
}

export async function inspectResource(path) {
  try {
    const head = await fetch(path, { method: "HEAD", cache: "no-store" });
    if (head.ok) return { exists: true, size: responseSize(head) };
  } catch (error) {
    // Some local hosts do not implement HEAD. Confirm with an ordinary GET below.
  }

  try {
    const response = await fetch(path, { method: "GET", cache: "no-store" });
    const result = { exists: response.ok, size: response.ok ? responseSize(response) : null };
    await response.body?.cancel?.();
    return result;
  } catch (error) {
    return { exists: false, size: null };
  }
}

export async function resourceExists(path) {
  return (await inspectResource(path)).exists;
}

export async function inspectSystemBios(system, biosPath) {
  const label = system?.biosLabel || `${system?.shortName || "System"} BIOS`;
  if (!biosPath) {
    return { ok: false, code: "missing-bios", message: `Add your own ${label} with RetroSignal Manager.` };
  }
  if (!system?.biosExtensions?.includes(fileExtension(biosPath))) {
    return {
      ok: false,
      code: "unsupported-bios",
      message: `${label} must end in ${system?.biosExtensions?.map((extension) => `.${extension}`).join(" or ") || "a supported format"}.`,
    };
  }
  const biosFileNames = Array.isArray(system?.biosFileNames) ? system.biosFileNames : [];
  const biosName = String(biosPath).replaceAll("\\", "/").split("/").pop().toLowerCase();
  if (biosFileNames.length > 0 && !biosFileNames.includes(biosName)) {
    return {
      ok: false,
      code: "invalid-bios-name",
      message: `${label} must be named ${biosFileNames.join(" or ")}.`,
    };
  }
  const resource = await inspectResource(biosPath);
  if (!resource.exists) {
    return { ok: false, code: "missing-bios", message: `The selected ${label} could not be found.` };
  }
  const expectedSizes = Array.isArray(system?.biosExpectedSizes) ? system.biosExpectedSizes : [];
  if (resource.size !== null && expectedSizes.length > 0 && !expectedSizes.includes(resource.size)) {
    const size = resource.size < 1024 ? `${resource.size} bytes` : `${Math.round(resource.size / 1024)} KiB`;
    return {
      ok: false,
      code: "invalid-bios-size",
      message: `That ${label} is ${size}; expected ${expectedSizes.map((value) => `${Math.round(value / 1024)} KiB`).join(" or ")}.`,
      size: resource.size,
    };
  }
  return {
    ok: true,
    code: expectedSizes.length > 0 && expectedSizes.includes(resource.size) ? "bios-size-ok" : "bios-found",
    message: `${label} found. A real game boot is still required to verify compatibility.`,
    size: resource.size,
  };
}

export function inspectPsxBios(system, biosPath) {
  return inspectSystemBios(system, biosPath);
}

export async function validateLaunch(system, romPath, biosPath = "") {
  if (!romPath) {
    return { ok: false, code: "missing-rom", message: `Add a ${system.shortName} game in Customize.` };
  }
  if (!system.extensions.includes(fileExtension(romPath))) {
    return { ok: false, code: "unsupported-file", message: `That file is not supported for ${system.shortName}.` };
  }
  if (system.biosRequired && !biosPath) {
    return {
      ok: false,
      code: "missing-bios",
      message: `Add your own ${system.biosLabel || `${system.shortName} BIOS`} with RetroSignal Manager.`,
    };
  }

  const coreFiles = [
    `emulatorjs/cores/${system.core}-wasm.data`,
    `emulatorjs/cores/${system.core}-legacy-wasm.data`,
  ];
  const [romExists, biosInspection, coreResults] = await Promise.all([
    resourceExists(romPath),
    system.biosRequired ? inspectSystemBios(system, biosPath) : { ok: true },
    Promise.all(coreFiles.map(resourceExists)),
  ]);

  if (!romExists) {
    return { ok: false, code: "missing-rom", message: "The selected game file could not be found." };
  }
  if (!biosInspection.ok) return biosInspection;
  if (!coreResults.some(Boolean)) {
    return { ok: false, code: "missing-core", message: `${system.shortName} core files are missing.` };
  }
  return { ok: true, bios: system.biosRequired ? biosInspection : null };
}

export class EmulatorHost {
  constructor(container, onEvent = () => {}, options = {}) {
    this.container = container;
    this.onEvent = onEvent;
    this.frame = null;
    this.instanceId = 0;
    this.operationId = 0;
    this.startTimer = null;
    this.current = null;
    this.framesCreated = 0;
    this.framesRemoved = 0;
    this.listenerRegistered = true;
    this.lifecycleOnly = Boolean(options.lifecycleOnly);
    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener("message", this.handleMessage);
  }

  get emulatorWindow() {
    return this.frame?.contentWindow || null;
  }

  get emulator() {
    return this.emulatorWindow?.EJS_emulator || null;
  }

  get canvas() {
    return this.emulator?.canvas || this.emulatorWindow?.document?.querySelector?.("#game canvas") || null;
  }

  async start(system, romPath, biosPath, volume) {
    const operationId = ++this.operationId;
    await this.stopCurrent("switch");
    if (operationId !== this.operationId) return null;

    const identity = gameIdentity(system, romPath);
    const instanceId = ++this.instanceId;
    const params = new URLSearchParams({
      instance: String(instanceId),
      system: system.id,
      rom: romPath,
      bios: biosPath || "",
      gameId: String(identity.gameId),
      gameName: identity.gameName,
      saveNamespace: identity.saveNamespace,
      volume: String(volume),
      lifecycle: this.lifecycleOnly ? "1" : "0",
    });

    const frame = document.createElement("iframe");
    frame.id = `emulator-frame-${instanceId}`;
    frame.title = `${system.shortName} emulator`;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.src = `emulator-frame.html?release=5&${params}`;

    this.frame = frame;
    this.framesCreated += 1;
    this.current = { system, romPath, biosPath, volume, identity, instanceId };
    this.container.replaceChildren(frame);
    this.startTimer = window.setTimeout(() => {
      if (this.current?.instanceId !== instanceId) return;
      this.onEvent({ type: "error", code: "start-timeout", message: `${system.shortName} took too long to start.` });
    }, startTimeoutFor(romPath));

    this.onEvent({ type: "loading", system, romPath });
    return this.current;
  }

  handleMessage(event) {
    const data = event.data;
    if (!data || data.source !== "retrosignal-emulator") return;
    if (!this.current || data.instance !== this.current.instanceId) return;
    if (event.source !== this.frame?.contentWindow) return;

    if (["started", "error", "exit"].includes(data.type)) this.clearStartTimer();
    this.onEvent({ ...data, system: this.current.system, romPath: this.current.romPath });
  }

  clearStartTimer() {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  async suspend() {
    const api = this.emulatorWindow?.RetroSignalFrame;
    if (!api?.suspend) return;
    await withTimeout(api.suspend(), SHUTDOWN_TIMEOUT_MS);
  }

  resume(volume) {
    this.current && (this.current.volume = volume);
    this.emulatorWindow?.RetroSignalFrame?.resume?.(volume);
  }

  activate(volume) {
    this.current && (this.current.volume = volume);
    this.emulatorWindow?.RetroSignalFrame?.activate?.(volume);
  }

  setVolume(volume) {
    this.current && (this.current.volume = volume);
    this.emulatorWindow?.RetroSignalFrame?.setVolume?.(volume);
  }

  async stop(reason = "stop") {
    ++this.operationId;
    await this.stopCurrent(reason);
  }

  async stopCurrent(reason) {
    this.clearStartTimer();
    const frame = this.frame;
    if (!frame) {
      this.current = null;
      return;
    }

    this.frame = null;
    const current = this.current;
    this.current = null;
    try {
      const api = frame.contentWindow?.RetroSignalFrame;
      if (api?.shutdown) {
        const result = await withTimeout(api.shutdown(reason), SHUTDOWN_TIMEOUT_MS);
        // The active frame identity is cleared before shutdown. Its postMessage
        // warnings are intentionally ignored, so report the awaited result here.
        for (const message of result?.warnings || []) {
          if (typeof message === "string") this.onEvent({ type: "save-warning", message });
        }
      }
    } catch (error) {
      this.onEvent({ type: "cleanup-warning", message: "The previous emulator required a forced cleanup." });
    }

    try {
      frame.src = "about:blank";
    } catch (error) {
      // Removing the browsing context below is the final cleanup boundary.
    }
    frame.remove();
    this.framesRemoved += 1;
    this.onEvent({ type: "stopped", reason, previous: current });
  }

  diagnostics() {
    const canvas = this.canvas;
    let preserveDrawingBuffer = null;
    let nonBlackPixelSamples = null;
    let coreFrameNumber = null;
    try {
      const context = canvas?.getContext?.("webgl2") || canvas?.getContext?.("webgl");
      preserveDrawingBuffer = context?.getContextAttributes?.().preserveDrawingBuffer ?? null;
      if (context && canvas.width && canvas.height) {
        const width = Math.min(16, canvas.width);
        const height = Math.min(16, canvas.height);
        const pixels = new Uint8Array(width * height * 4);
        const x = Math.max(0, Math.floor((canvas.width - width) / 2));
        const y = Math.max(0, Math.floor((canvas.height - height) / 2));
        context.readPixels(x, y, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
        nonBlackPixelSamples = pixels.reduce(
          (count, value, index) => count + (index % 4 !== 3 && value > 8 ? 1 : 0),
          0,
        );
      }
    } catch (error) {
      preserveDrawingBuffer = null;
      nonBlackPixelSamples = null;
    }
    try {
      coreFrameNumber = this.emulator?.gameManager?.getFrameNum?.() ?? null;
    } catch (error) {
      coreFrameNumber = null;
    }
    const sources = this.emulator?.Module?.AL?.currentCtx?.sources;
    const sourceList = Array.isArray(sources)
      ? sources
      : sources instanceof Map || sources instanceof Set
        ? Array.from(sources.values())
        : sources && typeof sources === "object"
          ? Object.values(sources)
          : [];
    const audioContexts = new Set(
      sourceList.map((source) => source?.gain?.context).filter((context) => Boolean(context)),
    );
    return {
      frameCount: this.container.querySelectorAll("iframe").length,
      framesCreated: this.framesCreated,
      framesRemoved: this.framesRemoved,
      pendingStartTimers: this.startTimer === null ? 0 : 1,
      messageListeners: this.listenerRegistered ? 1 : 0,
      audioContextCount: audioContexts.size,
      audioSourceCount: sourceList.length,
      frameApiAvailable: Boolean(this.emulatorWindow?.RetroSignalFrame?.resume),
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      preserveDrawingBuffer,
      nonBlackPixelSamples,
      coreFrameNumber,
    };
  }

  async destroy() {
    window.removeEventListener("message", this.handleMessage);
    this.listenerRegistered = false;
    await this.stop("destroy");
    this.onEvent = () => {};
  }
}
