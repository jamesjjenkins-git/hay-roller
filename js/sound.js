// Tiny synthesized sound effects — no audio files needed.
(function (root) {
  const MUTE_KEY = 'farmCasino.muted';
  let ctx = null;
  let muted = false;
  try {
    muted = root.localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    // Storage blocked; default to sound on.
  }

  function audio() {
    if (muted) return null;
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.15, slideTo = null, delay = 0 } = {}) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const voices = {
    chicken: () => { tone(900, 0.08, { type: 'square', gain: 0.05, slideTo: 1400 }); tone(1300, 0.1, { type: 'square', gain: 0.05, slideTo: 700, delay: 0.09 }); },
    duck: () => tone(500, 0.18, { type: 'sawtooth', gain: 0.05, slideTo: 380 }),
    sheep: () => tone(420, 0.35, { type: 'sawtooth', gain: 0.04, slideTo: 380 }),
    pig: () => tone(220, 0.2, { type: 'sawtooth', gain: 0.06, slideTo: 140 }),
    cow: () => tone(130, 0.55, { type: 'sawtooth', gain: 0.07, slideTo: 95 }),
  };

  // Continuous engine note whose pitch follows speed.
  let engine = null;
  function engineStart() {
    const a = audio();
    if (!a || engine) return;
    const osc = a.createOscillator();
    const osc2 = a.createOscillator();
    const filter = a.createBiquadFilter();
    const g = a.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.035, a.currentTime + 0.3);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(a.destination);
    osc.start();
    osc2.start();
    engine = { osc, osc2, g, filter, a };
    engineSet(0, false);
  }
  function engineSet(frac, boost) {
    if (!engine) return;
    const f = 45 + Math.max(0, Math.min(1.6, frac)) * 70 + (boost ? 25 : 0);
    const t = engine.a.currentTime;
    engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    engine.filter.frequency.setTargetAtTime(boost ? 1400 : 500 + frac * 400, t, 0.1);
  }
  function engineStop() {
    if (!engine) return;
    const { osc, osc2, g, a } = engine;
    g.gain.setTargetAtTime(0.0001, a.currentTime, 0.05);
    osc.stop(a.currentTime + 0.3);
    osc2.stop(a.currentTime + 0.3);
    engine = null;
  }

  root.FarmSound = {
    engineStart,
    engineSet,
    engineStop,
    thud: () => tone(110, 0.15, { type: 'triangle', gain: 0.2, slideTo: 60 }),
    whoosh: () => tone(200, 0.6, { type: 'sawtooth', gain: 0.06, slideTo: 900 }),
    boing: () => tone(300, 0.25, { type: 'sine', gain: 0.12, slideTo: 700 }),
    get muted() {
      return muted;
    },
    setMuted(v) {
      muted = !!v;
      if (muted) engineStop();
      try {
        root.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch (e) {
        // Ignore.
      }
    },
    click: () => tone(660, 0.05, { type: 'triangle', gain: 0.08 }),
    chip: () => { tone(1800, 0.04, { type: 'square', gain: 0.03 }); tone(2400, 0.05, { type: 'square', gain: 0.02, delay: 0.03 }); },
    beep: (high) => tone(high ? 880 : 520, high ? 0.4 : 0.15, { type: 'square', gain: 0.06 }),
    bonk: () => tone(240, 0.12, { type: 'triangle', gain: 0.18, slideTo: 90 }),
    pop: () => { tone(1400, 0.05, { type: 'square', gain: 0.06, slideTo: 300 }); tone(700, 0.08, { type: 'triangle', gain: 0.08, slideTo: 1600, delay: 0.02 }); },
    animal: (kind) => voices[kind] && voices[kind](),
    coins: () => [0, 0.08, 0.16, 0.24].forEach((d, i) => tone(1200 + i * 300, 0.12, { type: 'square', gain: 0.04, delay: d })),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.15, { type: 'triangle', gain: 0.12, delay: i * 0.13 })),
    womp: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.25, { type: 'triangle', gain: 0.1, delay: i * 0.25 })),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
