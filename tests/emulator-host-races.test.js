import assert from "node:assert/strict";
import { test } from "node:test";
import { EmulatorHost } from "../js/emulator-host.js";
import { SYSTEM_BY_ID } from "../js/systems.js";

test("shutdown save warnings reach the parent after active frame identity is cleared", async () => {
  await withBrowserEnvironment(async ({ container }) => {
    const events = [];
    const host = new EmulatorHost(container, event => events.push(event));
    await host.start(SYSTEM_BY_ID.get("gb"), "roms/gb/warning.gb", "", 0);
    host.frame.contentWindow.RetroSignalFrame = { shutdown: async () => ({ localFlushed: false, warnings: ["Local save persistence failed"] }) };
    await host.stop("user-stop");
    assert.ok(events.some(event => event.type === "save-warning" && event.message === "Local save persistence failed"));
    assert.equal(container.querySelectorAll("iframe").length, 0);
    await host.destroy();
  });
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createBrowserEnvironment() {
  let nextTimerId = 1;
  const timers = new Map();
  const listeners = new Map();

  const fakeWindow = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  const container = {
    children: [],
    replaceChildren(...children) {
      for (const child of this.children) child.parent = null;
      this.children = children;
      for (const child of children) child.parent = this;
    },
    querySelectorAll(selector) {
      return selector === "iframe" ? this.children.filter((child) => child.tagName === "IFRAME") : [];
    },
  };

  const fakeDocument = {
    createElement(tagName) {
      assert.equal(tagName, "iframe");
      return {
        tagName: "IFRAME",
        id: "",
        title: "",
        tabIndex: 0,
        src: "",
        parent: null,
        contentWindow: {},
        setAttribute() {},
        remove() {
          if (!this.parent) return;
          this.parent.children = this.parent.children.filter((child) => child !== this);
          this.parent = null;
        },
      };
    },
  };

  return { container, fakeDocument, fakeWindow, timers };
}

async function withBrowserEnvironment(run) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const environment = createBrowserEnvironment();
  globalThis.window = environment.fakeWindow;
  globalThis.document = environment.fakeDocument;
  try {
    await run(environment);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
}

test("an explicit stop cancels a start that is awaiting previous-frame shutdown", async () => {
  await withBrowserEnvironment(async ({ container }) => {
    const host = new EmulatorHost(container);
    const system = SYSTEM_BY_ID.get("gb");
    const shutdown = deferred();

    try {
      await host.start(system, "roms/gb/initial.gb", "", 0);
      host.frame.contentWindow.RetroSignalFrame = { shutdown: () => shutdown.promise };

      const pendingStart = host.start(system, "roms/gb/stale.gb", "", 0);
      await Promise.resolve();
      await host.stop("user-stop");
      shutdown.resolve();
      await Promise.allSettled([pendingStart]);

      assert.equal(host.frame, null);
      assert.equal(host.current, null);
      assert.equal(container.querySelectorAll("iframe").length, 0);
    } finally {
      shutdown.resolve();
      await host.destroy();
    }
  });
});

test("a newer start cannot be overwritten by an older start finishing shutdown late", async () => {
  await withBrowserEnvironment(async ({ container }) => {
    const host = new EmulatorHost(container);
    const system = SYSTEM_BY_ID.get("gb");
    const shutdown = deferred();

    try {
      await host.start(system, "roms/gb/initial.gb", "", 0);
      host.frame.contentWindow.RetroSignalFrame = { shutdown: () => shutdown.promise };

      const olderStart = host.start(system, "roms/gb/older.gb", "", 0);
      await Promise.resolve();
      const newerStart = host.start(system, "roms/gb/newer.gb", "", 0);
      await newerStart;
      assert.equal(host.current?.romPath, "roms/gb/newer.gb");

      shutdown.resolve();
      await Promise.allSettled([olderStart]);

      assert.equal(host.current?.romPath, "roms/gb/newer.gb");
      assert.equal(container.querySelectorAll("iframe").length, 1);
    } finally {
      shutdown.resolve();
      await host.destroy();
    }
  });
});
