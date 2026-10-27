// Runs inside the game page (addInitScript). Replaces every time source the game can see
// (Date, performance.now, setTimeout/setInterval, requestAnimationFrame, CSS animations and
// HTMLMediaElement playback) with one virtual clock.
//
// 'auto' mode: the virtual clock follows real time, so the page loads normally.
// 'manual' mode: time only moves when the renderer calls __clk.step(ticks). The renderer steps the
// game 1/60 s at a time and takes a screenshot per output frame, so the footage is exactly as smooth
// as on a fast computer no matter how slow the machine rendering it is.
export function installVirtualClock() {
  if (window.__clk) return;
  const nativeST = window.setTimeout.bind(window);
  const nativeSI = window.setInterval.bind(window);
  const nativePerf = performance.now.bind(performance);
  const NativeDate = Date;
  const dateBase = NativeDate.now();
  const vt0 = nativePerf();
  const TICK = 1000 / 60;

  let vt = vt0;
  let manual = false;
  let nextId = 1;
  let lastNative = nativePerf();
  let lastRaf = vt;
  const timers = new Map();
  let rafList = [];
  const anims = new WeakMap();

  const addTimer = (fn, delay, args, interval) => {
    const id = nextId++;
    const d = Math.max(1, Number(delay) || 0);
    timers.set(id, { id, fn: typeof fn === 'function' ? fn : () => {}, args, at: vt + d, iv: interval ? d : null });
    return id;
  };

  window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, args, true);
  window.clearTimeout = (id) => { timers.delete(id); };
  window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    rafList.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => { rafList = rafList.filter((r) => r.id !== id); };
  performance.now = () => vt;

  class VirtualDate extends NativeDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(dateBase + (vt - vt0));
    }
    static now() { return dateBase + (vt - vt0); }
  }
  window.Date = VirtualDate;

  const throwLater = (e) => nativeST(() => { throw e; }, 0);

  const flushRaf = () => {
    const list = rafList;
    rafList = [];
    lastRaf = vt;
    for (const r of list) {
      try { r.cb(vt); } catch (e) { throwLater(e); }
    }
  };

  const advance = (dt) => {
    const target = vt + dt;
    for (;;) {
      let best = null;
      for (const t of timers.values()) {
        if (t.at <= target && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
      }
      if (!best) break;
      if (best.at > vt) vt = best.at;
      if (best.iv !== null) best.at += best.iv;
      else timers.delete(best.id);
      try { best.fn.apply(window, best.args); } catch (e) { throwLater(e); }
    }
    vt = target;
  };

  // CSS animations/transitions run on the browser's real clock; pin them to the virtual one.
  const syncAnimations = () => {
    let list = [];
    try { list = document.getAnimations(); } catch { return; }
    for (const a of list) {
      let s = anims.get(a);
      if (!s) {
        s = { t0: vt - (Number(a.currentTime) || 0) };
        anims.set(a, s);
        try { a.pause(); } catch {}
      }
      try { a.currentTime = vt - s.t0; } catch {}
    }
  };

  nativeSI(() => {
    const n = nativePerf();
    const dt = n - lastNative;
    lastNative = n;
    if (manual) return;
    advance(dt);
    if (vt - lastRaf >= TICK) flushRaf();
  }, 4);

  // Media never really plays (real playback would run at real speed, not virtual speed).
  // The element reports the position and the 'ended' event the virtual clock would give it.
  const P = HTMLMediaElement.prototype;
  const ctDesc = Object.getOwnPropertyDescriptor(P, 'currentTime');
  const state = new WeakMap();
  const stateOf = (el) => {
    let s = state.get(el);
    if (!s) { s = { playing: false, ended: false, start: 0, off: 0, timer: 0, sched: null }; state.set(el, s); }
    return s;
  };
  const position = (el, s) => {
    let c = s.off + ((vt - s.start) / 1000) * (el.playbackRate || 1);
    const d = el.duration;
    if (isFinite(d) && d > 0) c = el.loop ? c % d : Math.min(c, d);
    return c;
  };
  Object.defineProperty(P, 'currentTime', {
    configurable: true,
    get() {
      const s = state.get(this);
      return s && s.playing ? position(this, s) : ctDesc.get.call(this);
    },
    set(v) {
      ctDesc.set.call(this, v);
      const s = state.get(this);
      if (s && s.playing) { s.off = Number(v) || 0; s.start = vt; if (s.sched) s.sched(); }
    },
  });
  Object.defineProperty(P, 'paused', { configurable: true, get() { const s = state.get(this); return !(s && s.playing); } });
  Object.defineProperty(P, 'ended', { configurable: true, get() { const s = state.get(this); return !!(s && s.ended); } });

  window.__clk = {
    now: () => vt,
    stateOf,
    position,
    setManual(on) {
      manual = !!on;
      lastNative = nativePerf();
      return dateBase + (vt - vt0);
    },
    // Advance n ticks of 1/60 s (animation frames flushed after each tick), then pin CSS animations.
    step(n) {
      for (let i = 0; i < n; i++) {
        advance(TICK);
        flushRaf();
      }
      syncAnimations();
      return dateBase + (vt - vt0);
    },
  };
}
