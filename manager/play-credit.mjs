import { randomUUID } from "node:crypto";

// Only the desktop host observes emulator state. Garden receives no frame or game metadata.
export const PLAYER_ACTIVITY_SCRIPT = `(() => {
  try {
    const frame = document.querySelector('iframe[id^="emulator-frame-"]');
    const emulator = frame?.contentWindow?.EJS_emulator;
    return { sessionId: frame?.id || "", active: !document.hidden &&
      emulator?.started === true && emulator?.paused === false && !emulator.failedToStart };
  } catch { return { sessionId: "", active: false }; }
})()`;

export class PlayCreditTracker {
  constructor({ id = randomUUID(), maximumGapMs = 2500, maximumPendingBatches = 32 } = {}) {
    this.id = id;
    this.maximumGapMs = maximumGapMs;
    this.maximumPendingBatches = maximumPendingBatches;
    this.previous = null;
    this.pendingMilliseconds = 0;
    this.batches = [];
    this.sequence = 0;
  }

  toJSON() {
    return { formatVersion: 1, id: this.id, sequence: this.sequence, pendingMilliseconds: this.pendingMilliseconds, batches: this.batches.map(batch => ({ ...batch })) };
  }

  static restore(saved) {
    if (saved?.formatVersion !== 1 || !/^[a-zA-Z0-9-]{1,100}$/.test(saved.id || "") || !Number.isSafeInteger(saved.sequence) || saved.sequence < 0 || !Number.isFinite(saved.pendingMilliseconds) || saved.pendingMilliseconds < 0 || saved.pendingMilliseconds > Number.MAX_SAFE_INTEGER || !Array.isArray(saved.batches) || saved.batches.length > 32) throw new Error("Invalid garden credit checkpoint.");
    const tracker = new PlayCreditTracker({ id: saved.id });
    let previousSequence = 0;
    for (const batch of saved.batches) {
      const prefix = "desktop-play-" + saved.id + "-";
      const sequence = Number(batch?.transactionId?.slice(prefix.length));
      if (!batch?.transactionId?.startsWith(prefix) || !Number.isSafeInteger(sequence) || sequence <= previousSequence || sequence > saved.sequence || !Number.isSafeInteger(batch.creditedSeconds) || batch.creditedSeconds < 1) throw new Error("Invalid garden credit batch.");
      previousSequence = sequence;
    }
    tracker.sequence = saved.sequence;
    tracker.pendingMilliseconds = saved.pendingMilliseconds;
    tracker.batches = saved.batches.map(batch => ({ ...batch }));
    // Previous observations are deliberately not restored: closed-app time earns no credit.
    return tracker;
  }

  sample({ active = false, sessionId = "" } = {}, sampledAt) {
    const next = { active: active === true && Boolean(sessionId), sessionId, sampledAt };
    const elapsed = sampledAt - (this.previous?.sampledAt ?? sampledAt);
    // Reject sleep, missing observations, clock rollback, loading, pauses and session switches.
    if (Number.isFinite(sampledAt) && this.previous?.active && next.active &&
        next.sessionId === this.previous.sessionId && elapsed > 0 && elapsed <= this.maximumGapMs) {
      this.pendingMilliseconds += elapsed;
    }
    this.previous = Number.isFinite(sampledAt) ? next : null;
  }

  snapshot() {
    const creditedSeconds = Math.floor(this.pendingMilliseconds / 1000);
    if (creditedSeconds > 0) {
      this.pendingMilliseconds -= creditedSeconds * 1000;
      this.batches.push({ creditedSeconds, transactionId: `desktop-play-${this.id}-${++this.sequence}` });
      this.batches = this.batches.slice(-this.maximumPendingBatches);
    }
    return { active: Boolean(this.previous?.active), credits: this.batches.map(batch => ({ ...batch })) };
  }

  acknowledge(transactionId) {
    const index = this.batches.findIndex(batch => batch.transactionId === transactionId);
    if (index >= 0) this.batches.splice(0, index + 1);
  }
}

// A stalled standalone renderer must not stop wallpaper interval settlement.
export async function observePlayerWithTimeout(readActivity, timeoutMs = 2000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(readActivity),
      new Promise(resolve => { timer = setTimeout(() => resolve({ active: false }), timeoutMs); }),
    ]);
  } catch { return { active: false }; }
  finally { clearTimeout(timer); }
}
