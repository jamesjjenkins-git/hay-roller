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

  root.FarmSound = {
    get muted() {
      return muted;
    },
    setMuted(v) {
      muted = !!v;
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
    animal: (kind) => voices[kind] && voices[kind](),
    coins: () => [0, 0.08, 0.16, 0.24].forEach((d, i) => tone(1200 + i * 300, 0.12, { type: 'square', gain: 0.04, delay: d })),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.15, { type: 'triangle', gain: 0.12, delay: i * 0.13 })),
    womp: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.25, { type: 'triangle', gain: 0.1, delay: i * 0.25 })),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
