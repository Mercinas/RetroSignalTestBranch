import { readManagerConfig } from './save-bridge.js';

// Host state only. Never send game identifiers, paths, inputs or credentials in payloads.
export class WallpaperPlayReporter {
  constructor(observe, environment = globalThis) {
    this.observe = observe; this.environment = environment;
    this.sessionId = environment.crypto.randomUUID(); this.sequence = 0;
    this.busy = false; this.stopped = false; this.config = null;
  }
  async tick(forceInactive = false) {
    if (this.busy || (this.stopped && !forceInactive)) return;
    this.busy = true;
    const controller = new this.environment.AbortController();
    const timeout = this.environment.setTimeout(() => controller.abort(), 2000);
    try {
      const config = this.config || await readManagerConfig(this.environment, undefined, controller.signal);
      this.config = config;
      const active = !forceInactive && this.observe() === true;
      const response = await this.environment.fetch(config.endpoint + '/api/v1/wallpaper-play-state', {
        method: 'POST', headers: { 'X-RetroSignal-Token': config.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, sequence: ++this.sequence, active }),
        signal: controller.signal, keepalive: forceInactive,
      });
      if (!response.ok) this.config = null;
    } catch { this.config = null; } // Unpaired/offline Manager never interferes with gameplay.
    finally { this.environment.clearTimeout(timeout); this.busy = false; }
  }
  start() { this.timer = this.environment.setInterval(() => void this.tick(), 1000); }
  stop() { this.stopped = true; this.environment.clearInterval(this.timer); void this.tick(true); }
}
