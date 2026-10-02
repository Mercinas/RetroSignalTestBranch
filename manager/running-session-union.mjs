// Completed observations only: no heartbeat lease grants credit after a crash.
export class RunningSessionUnion {
  constructor({ maximumGapMs = 2500, maximumSources = 32 } = {}) {
    this.maximumGapMs = maximumGapMs; this.maximumSources = maximumSources;
    this.sources = new Map(); this.intervals = []; this.settledThrough = -Infinity;
  }
  observe(source, { active, sessionId, sequence }, now) {
    if (!Number.isFinite(now) || typeof active !== 'boolean' || !/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId || '') ||
        !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid running-session observation.');
    const key = source + ':' + sessionId;
    const previous = this.sources.get(key);
    if (previous && sequence <= previous.sequence) return false;
    if (!previous && this.sources.size >= this.maximumSources) {
      for (const [id, value] of this.sources) if (now - value.now > this.maximumGapMs) this.sources.delete(id);
      if (this.sources.size >= this.maximumSources) throw new Error('Too many running sessions.');
    }
    if (previous?.active && active && sequence === previous.sequence + 1 && now > previous.now && now - previous.now <= this.maximumGapMs) {
      const start = Math.max(previous.now, this.settledThrough);
      if (now > start) this.intervals.push([start, now]);
    }
    this.sources.set(key, { active, sequence, now });
    return true;
  }
  settle(now) {
    if (!Number.isFinite(now)) return 0;
    const boundary = now - this.maximumGapMs;
    if (boundary <= this.settledThrough) return 0;
    const intervals = this.intervals.sort((a,b) => a[0]-b[0]);
    let end = this.settledThrough, milliseconds = 0;
    const remaining = [];
    for (const [start, stop] of intervals) {
      const capped = Math.min(stop, boundary);
      if (capped > Math.max(start,end)) milliseconds += capped - Math.max(start,end);
      end = Math.max(end,capped);
      if (stop > boundary) remaining.push([Math.max(start,boundary),stop]);
    }
    this.intervals = remaining; this.settledThrough = boundary;
    return milliseconds;
  }
  active(now) {
    return [...this.sources.values()].some(value => value.active && now >= value.now && now - value.now <= this.maximumGapMs);
  }
}
