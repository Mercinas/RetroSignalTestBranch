import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PLAYER_ACTIVITY_SCRIPT, PlayCreditTracker } from "../manager/play-credit.mjs";

test("desktop observation grants only started, unpaused, visible, non-failed emulator activity", () => {
  for (const [emulator, hidden, expected] of [
    [undefined, false, false], [{ started: false, paused: false }, false, false],
    [{ started: true, paused: true }, false, false],
    [{ started: true, paused: false }, true, false],
    [{ started: true, paused: false, failedToStart: true }, false, false],
    [{ started: true, paused: false }, false, true],
  ]) {
    const result = runInNewContext(PLAYER_ACTIVITY_SCRIPT, { document: { hidden,
      querySelector: () => ({ id: "emulator-frame-1", contentWindow: { EJS_emulator: emulator } }) } });
    assert.equal(result.active, expected);
  }
  assert.equal(runInNewContext(PLAYER_ACTIVITY_SCRIPT, { document: {
    querySelector() { throw new Error("unavailable frame"); } } }).active, false);
});

test("play intervals reject pauses, loading, session switches, rollback and delayed observations", () => {
  const tracker = new PlayCreditTracker({ id: "test" });
  const active = { active: true, sessionId: "one" };
  tracker.sample({ active: false }, 0);
  tracker.sample(active, 1000);
  tracker.sample(active, 2000); // one second
  tracker.sample({ active: false }, 3000);
  tracker.sample(active, 4000);
  tracker.sample({ ...active, sessionId: "two" }, 5000);
  tracker.sample({ ...active, sessionId: "two" }, 6000); // one second
  tracker.sample(active, 20000);
  tracker.sample(active, 19000);
  tracker.sample(active, NaN);
  tracker.sample(active, 21000);
  assert.equal(tracker.snapshot().credits[0].creditedSeconds, 2);
});

test("credit delivery preserves fractions and retries identical batches until acknowledged", () => {
  const tracker = new PlayCreditTracker({ id: "retry" });
  const active = { active: true, sessionId: "one" };
  tracker.sample(active, 0);
  tracker.sample(active, 1500);
  const first = tracker.snapshot().credits;
  assert.equal(first[0].creditedSeconds, 1);
  assert.deepEqual(tracker.snapshot().credits, first);
  first[0].creditedSeconds = 999;
  assert.equal(tracker.snapshot().credits[0].creditedSeconds, 1);
  tracker.sample(active, 2000);
  const batches = tracker.snapshot().credits;
  assert.equal(batches.length, 2);
  tracker.acknowledge(batches[0].transactionId);
  assert.deepEqual(tracker.snapshot().credits, [batches[1]]);
  tracker.acknowledge("unknown");
  tracker.acknowledge(batches[1].transactionId);
  assert.deepEqual(tracker.snapshot().credits, []);
});

test("pending delivery remains bounded across a disconnected garden", () => {
  const tracker = new PlayCreditTracker({ id: "bounded", maximumPendingBatches: 2 });
  for (let i = 0; i < 5; i++) {
    tracker.sample({ active: true, sessionId: "one" }, i * 1000);
    tracker.snapshot();
  }
  assert.equal(tracker.snapshot().credits.length, 2);
});

test("durable host credit reopens pending deliveries without crediting closed-app time", async () => {
  const { mkdtemp, readFile, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { PlayCreditStore } = await import("../manager/play-credit-store.mjs");
  const file = join(await mkdtemp(join(tmpdir(), "garden-credit-reopen-")), "credit.json");
  let store = await PlayCreditStore.open(file);
  const active = { active: true, sessionId: "one" };
  store.tracker.sample(active, 0); store.tracker.sample(active, 1500);
  const credits = store.tracker.snapshot().credits;
  await store.save();
  store = await PlayCreditStore.open(file);
  assert.deepEqual(store.tracker.snapshot().credits, credits);
  store.tracker.sample(active, 1_000_000);
  assert.deepEqual(store.tracker.snapshot().credits, credits);
  store.tracker.acknowledge(credits[0].transactionId); await store.save();
  store = await PlayCreditStore.open(file);
  assert.deepEqual(store.tracker.snapshot().credits, []);
  store.tracker.sample(active, 0); store.tracker.sample(active, 1000);
  assert.equal(store.tracker.snapshot().credits[0].creditedSeconds, 1);
  await Promise.all([store.save(), store.save()]);
  assert.equal(JSON.parse(await readFile(file, "utf8")).sequence, 2);
  await writeFile(file, "corrupt checkpoint");
  await assert.rejects(PlayCreditStore.open(file));
});

test("desktop Manager startup forwards durable credit status and acknowledgement callbacks", async context => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { startManager } = await import("../manager/server.js");
  const tracker = new PlayCreditTracker({ id: "desktop-host" });
  tracker.sample({ active: true, sessionId: "one" }, 0);
  tracker.sample({ active: true, sessionId: "one" }, 2000);
  const manager = await startManager({ dataRoot: await mkdtemp(join(tmpdir(), "garden-credit-startup-")), port: 0,
    discoverWallpaper: false, token: "s".repeat(43), gardenEnabled: true,
    playerCreditStatus: async () => tracker.snapshot(), acknowledgePlayerCredit: async id => tracker.acknowledge(id) });
  context.after(() => new Promise(resolve => manager.server.close(resolve)));
  const headers = { "X-RetroSignal-Token": manager.token, "Content-Type": "application/json" };
  const status = await (await fetch(manager.endpoint + "/api/v1/player-status", { headers })).json();
  assert.equal(status.credits[0].creditedSeconds, 2);
  const ack = await fetch(manager.endpoint + "/api/v1/player-credit-ack", {
    method: "POST", headers, body: JSON.stringify({ transactionId: status.credits[0].transactionId }) });
  assert.equal(ack.status, 200);
  assert.deepEqual((await (await fetch(manager.endpoint + "/api/v1/player-status", { headers })).json()).credits, []);
});
