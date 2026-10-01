export function strokeWindow(bpm) {
  return Math.min(0.08, 60 / bpm / 4 * 0.42);
}

export class StrokeScore {
  constructor(hits = 0, total = 0) {
    this.hits = hits;
    this.total = total;
    this.pending = [];
  }

  expect(time, bpm) {
    this.pending.push({ time, window: strokeWindow(bpm), matched: false });
  }

  hit(time) {
    let closest;
    let distance = Infinity;
    for (const note of this.pending) {
      const offset = Math.abs(note.time - time);
      if (!note.matched && offset <= note.window && offset < distance) {
        closest = note;
        distance = offset;
      }
    }
    if (!closest) return false;
    closest.matched = true;
    return true;
  }

  flush(now) {
    while (this.pending.length && this.pending[0].time + this.pending[0].window <= now) {
      if (this.pending.shift().matched) this.hits++;
      this.total++;
    }
  }

  discardPending(now) {
    this.flush(now);
    for (const note of this.pending) {
      if (note.time <= now) {
        this.total++;
        if (note.matched) this.hits++;
      }
    }
    this.pending = [];
  }

  get percentage() {
    return this.total ? Math.round(this.hits / this.total * 100) : null;
  }
}

export function createOnsetDetector() {
  let floor = 0.004;
  let previous = 0;
  let lastHit = -Infinity;
  return {
    sample(samples, time) {
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      const transient = rms > Math.max(0.015, floor * 3.5) &&
        rms > previous * 1.45 && time - lastHit >= 0.065;
      if (transient) lastHit = time;
      else floor = Math.min(0.08, floor * 0.995 + rms * 0.005);
      previous = rms;
      return transient;
    },
    reset() {
      previous = 0;
      lastHit = -Infinity;
    },
  };
}
