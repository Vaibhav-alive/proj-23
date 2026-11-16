const E_PENT = [0, 2, 4, 7, 9];
const E3 = 164.81;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const semis = (base, n) => base * Math.pow(2, n / 12);

// Bigger boxes -> lower notes; further right -> higher degree of the scale.
export function pitchFor(areaFrac, xFrac) {
  const octave = areaFrac > 0.3 ? 0 : areaFrac > 0.03 ? 1 : areaFrac > 0.004 ? 2 : 3;
  const degree = clamp(Math.floor(clamp(xFrac, 0, 0.999) * E_PENT.length), 0, E_PENT.length - 1);
  return semis(E3, E_PENT[degree] + 12 * octave);
}

export function createSwarmAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  let ctx;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i += 1) nd[i] = Math.random() * 2 - 1;

  const outFor = (pan) => {
    if (!ctx.createStereoPanner) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(master);
    return p;
  };

  const noise = ({ t, dur, type, freq, q = 1, gain, pan = 0, sweepTo }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(outFor(pan));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  };

  const tone = ({ t, freq, endFreq, type = 'sine', gain, decay, attack = 0.003, pan = 0 }) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(outFor(pan));
    o.start(t);
    o.stop(t + decay + 0.05);
  };

  // glass-piano-ish bell: fundamental + a couple of quiet partials
  const bell = (freq, t, vol, pan, len = 1.4) => {
    [[1, 1, 1], [2, 0.3, 0.6], [3.01, 0.09, 0.35]].forEach(([mult, amp, dec]) => {
      tone({ t, freq: freq * mult, gain: 0.16 * vol * amp, decay: len * dec, attack: 0.005, pan });
    });
  };

  let lastNoteT = 0;
  const GRID = 0.3; // eighth note at 100 bpm

  return {
    state: () => ctx.state,
    onState: (fn) => { ctx.onstatechange = fn; },
    resume: () => (ctx.state === 'suspended' ? ctx.resume().catch(() => {}) : Promise.resolve()),

    setMuted(m) {
      master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
    },

    press(pan = 0) {
      const t = ctx.currentTime;
      noise({ t, dur: 0.02, type: 'bandpass', freq: 3200, q: 1.2, gain: 0.2, pan });
      tone({ t, freq: 2200, endFreq: 1200, gain: 0.05, decay: 0.014, pan });
    },

    release(pan = 0) {
      const t = ctx.currentTime;
      noise({ t, dur: 0.016, type: 'bandpass', freq: 2300, q: 1.2, gain: 0.1, pan });
    },

    key(pan = 0, space = false) {
      const t = ctx.currentTime;
      const jitter = 0.94 + Math.random() * 0.12;
      noise({ t, dur: 0.012, type: 'highpass', freq: 1800, gain: space ? 0.12 : 0.15, pan });
      tone({
        t,
        freq: (space ? 120 : 200) * jitter,
        endFreq: space ? 55 : 90,
        type: 'triangle',
        gain: space ? 0.3 : 0.2,
        decay: space ? 0.11 : 0.075,
        pan,
      });
    },

    // sparse, quantised to an eighth-note grid
    note(freq, pan = 0, vol = 1) {
      let t = Math.ceil((ctx.currentTime + 0.01) / GRID) * GRID;
      if (t - lastNoteT < GRID * 0.9) t = lastNoteT + GRID;
      if (t - ctx.currentTime > 0.9) return; // too backed up: stay sparse
      lastNoteT = t;
      bell(freq, t, vol, pan);
    },

    swell(dur = 1.4) {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2800, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.05);
    },

    arpeggio() {
      const t = ctx.currentTime + 0.02;
      [0, 4, 7, 12, 16].forEach((n, i) => {
        bell(semis(E3 * 2, n), t + i * 0.075, 0.8, (i - 2) * 0.25, 1.1);
      });
    },

    chord() {
      const t = ctx.currentTime + 0.02;
      [0, 7, 12, 16, 19].forEach((n, i) => {
        bell(semis(E3, n), t + i * 0.03, 0.55, (i - 2) * 0.2, 2.6);
      });
    },

    fall() {
      const t = ctx.currentTime;
      tone({ t, freq: 900, endFreq: 180, gain: 0.12, decay: 0.5, attack: 0.01 });
    },

    dispose(fade = 0.5) {
      try {
        master.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
      } catch { /* context already closed */ }
      window.setTimeout(() => ctx.close().catch(() => {}), fade * 1000 + 200);
    },
  };
}