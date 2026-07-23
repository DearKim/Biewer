// Playback controller: unifies slice (manual) and auto (cine) modes over the
// shared frame index. Binds to N views → frame moves stay in sync.
import type { PlaybackController, PlaybackState, PlaybackBindable, OutputMode } from '../types';

export interface PlaybackOptions {
  mode?: OutputMode;
  speed?: number; // fps
  loop?: 'none' | 'loop';
}

export function createPlaybackController(options: PlaybackOptions = {}): PlaybackController {
  const bindables = new Map<string, PlaybackBindable>();
  const subs = new Set<(s: PlaybackState) => void>();

  let mode: OutputMode = options.mode ?? 'slice';
  let frame = 0;
  let playing = false;
  let speed = options.speed ?? 10;
  let loop: 'none' | 'loop' = options.loop ?? 'none';
  let range: [number, number] | null = null;

  let rafId = 0;
  let lastT = 0;
  let acc = 0;

  function frameCount(): number {
    let max = 1;
    for (const b of bindables.values()) max = Math.max(max, b.getFrameCount());
    return max;
  }

  function bounds(): [number, number] {
    const last = frameCount() - 1;
    if (!range) return [0, last];
    return [Math.max(0, range[0]), Math.min(last, range[1])];
  }

  function snapshot(): PlaybackState {
    return { mode, frame, frameCount: frameCount(), playing, speed, loop, range };
  }

  function notify(): void {
    const s = snapshot();
    for (const fn of subs) fn(s);
  }

  function applyFrame(next: number): void {
    const [lo, hi] = bounds();
    const clamped = next < lo ? lo : next > hi ? hi : next;
    if (clamped === frame) return;
    frame = clamped;
    for (const b of bindables.values()) b.setFrame(frame);
    notify();
  }

  function tick(t: number): void {
    if (!playing) return;
    if (!lastT) lastT = t;
    const dt = (t - lastT) / 1000;
    lastT = t;
    acc += dt * speed;
    const advance = Math.floor(acc);
    if (advance >= 1) {
      acc -= advance;
      const [lo, hi] = bounds();
      let next = frame + advance;
      if (next > hi) {
        if (loop === 'loop') {
          const span = hi - lo + 1;
          next = lo + ((next - lo) % span);
        } else {
          applyFrame(hi);
          pause();
          return;
        }
      }
      applyFrame(next);
    }
    rafId = requestAnimationFrame(tick);
  }

  function play(): void {
    if (mode !== 'auto') setModeInternal('auto');
    if (playing) return;
    playing = true;
    lastT = 0;
    acc = 0;
    rafId = requestAnimationFrame(tick);
    notify();
  }

  function pause(): void {
    if (!playing) return;
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    notify();
  }

  function stop(): void {
    pause();
    applyFrame(bounds()[0]);
  }

  function setModeInternal(m: OutputMode): void {
    if (mode === m) return;
    if (m === 'slice') pause();
    mode = m;
    notify();
  }

  const ctrl: PlaybackController = {
    get mode() {
      return mode;
    },
    setMode: setModeInternal,
    step(delta) {
      applyFrame(frame + delta);
    },
    setFrame(index) {
      applyFrame(index);
    },
    play,
    pause,
    stop,
    setSpeed(fps) {
      speed = Math.max(0.1, fps);
      notify();
    },
    setLoop(l) {
      loop = l;
      notify();
    },
    setRange(r) {
      range = r;
      applyFrame(frame); // re-clamp
      notify();
    },
    getState: snapshot,
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    _attach(viewId, view) {
      bindables.set(viewId, view);
      view.setFrame(frame);
      notify();
    },
    _detach(viewId) {
      bindables.delete(viewId);
      if (bindables.size === 0) pause();
      notify();
    },
  };

  return ctrl;
}
