import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './SwarmTransition.css';
import { createSwarmAudio, pitchFor } from './swarmaudio';

/* ------------------------------------------------------------------
   Swarm "rebuild" transition
   - Starts fully black on the very first frame (no flash of the final page)
   - Builder agents draw a selection box around each REAL element
   - Text elements are TYPED character by character (I-beam + caret);
     big headings start small and step up in size while typing
   - Shapes (logo, button) pop in when their box finishes
   - Last, the background wipes in top-to-bottom, then a "Rebuilt by…" toast
   ------------------------------------------------------------------ */

const AGENT_COLORS = [
  '#67d8ff', '#ff795f', '#a47aff', '#ffd45c', '#52e2b2', '#69caff',
  '#ff8b67', '#d48aff', '#ffe05c', '#5bdcb2', '#ff7b78', '#69d5ff',
  '#ffd45c', '#b48aff', '#55dfb4', '#ff8264', '#69d5ff', '#d48aff',
];

const BUILDERS = [
  { letter: 'L', color: '#a47aff' },
  { letter: 'E', color: '#ff795f' },
  { letter: 'A', color: '#52e2b2' },
  { letter: 'M', color: '#ff7b78' },
  { letter: 'K', color: '#ffd45c' },
  { letter: 'S', color: '#67d8ff' },
];

// Real elements of the live page that get rebuilt, in build order.
const DEFAULT_TARGETS = [
  { sel: '.header-cd-circle', kind: 'shape' },
  { sel: '.header-brand-title', kind: 'text' },
  { sel: '.header-tagline-text', kind: 'text' },
  { sel: '.mobile-date-pill', kind: 'text' },
  { sel: '.main-display-heading', kind: 'text' },
  { sel: '.main-paragraph', kind: 'text' },
  { sel: '.slide-commit-track', kind: 'shape' },
];

const HEADING_SCALES = [0.42, 0.62, 0.82, 1];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- DOM helpers ---------- */
function collectTargets(rootSelector, targets) {
  const root = document.querySelector(rootSelector) || document;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const found = [];
  targets.forEach(({ sel, kind, fill }) => {
    root.querySelectorAll(sel).forEach((el) => {
      let r;
      if (kind === 'text') {
        const range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect(); // tight box around the glyphs
      } else {
        r = el.getBoundingClientRect();
      }
      if (r.width < 4 || r.height < 4) return;
      // skip anything outside the viewport (middle page scrolls)
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
      found.push({
        el,
        kind,
        fill,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      });
    });
  });
  return found;
}

// Swap every text node for: [typed text][caret][invisible remainder].
// The invisible remainder keeps the final layout, so nothing jumps while typing.
function prepareTyping(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.data.trim()) nodes.push(walker.currentNode);
  }
  return nodes.map((node) => {
    const text = node.data;
    const wrap = document.createElement('span');
    wrap.className = 'swarm-type';
    const shown = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'swarm-caret';
    const hidden = document.createElement('span');
    hidden.className = 'swarm-type-hidden';
    hidden.textContent = text;
    wrap.append(shown, caret, hidden);
    node.replaceWith(wrap);
    return { node, text, wrap, shown, caret, hidden };
  });
}

function restoreTyping(parts) {
  (parts || []).forEach((p) => {
    if (p.wrap.isConnected) p.wrap.replaceWith(p.node);
  });
}

/* ---------- icons ---------- */
function ArrowIcon() {
  return (
    <svg viewBox="0 0 18 18" focusable="false">
      <path d="M2.5 2.5 15 9 2.5 15.5 5.2 9Z" />
    </svg>
  );
}

function CrossIcon({ color }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" focusable="false">
      <path
        d="M9 0.8 10.6 7.4 17.2 9 10.6 10.6 9 17.2 7.4 10.6 0.8 9 7.4 7.4Z"
        fill={color}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BeamIcon({ color }) {
  return (
    <svg viewBox="0 0 14 22" width="14" height="22" focusable="false">
      <path
        d="M3.5 2.5h7M7 2.5v17M3.5 19.5h7"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const HANDLES = [
  [0, 0], [50, 0], [100, 0], [0, 50], [100, 50], [0, 100], [50, 100], [100, 100],
];

/* ---------- animated selection box (+ optional gray placeholder fill) ---------- */
function DrawBox({ box, registerCursor }) {
  const { id, rect, duration, fill, kind, color, leaving, fadeFill, el } = box;
  const boxRef = useRef(null);
  const fillRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    let raf;
    let start = null;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      const w = rect.width * e;
      const h = rect.height * e;
      if (boxRef.current) {
        boxRef.current.style.width = `${w}px`;
        boxRef.current.style.height = `${h}px`;
      }
      if (fillRef.current) {
        fillRef.current.style.width = `${w}px`;
        fillRef.current.style.height = `${h}px`;
      }
      if (labelRef.current) {
        labelRef.current.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rect, duration]);

  const pos = { left: rect.left, top: rect.top };

  // fill === 'clone': the placeholder copies the real element's own background,
  // so it "builds" the actual colour/gradient while growing (e.g. the page frame).
  let fillStyle = pos;
  if (fill === 'clone' && el) {
    const cs = window.getComputedStyle(el);
    fillStyle = {
      ...pos,
      boxSizing: 'border-box',
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      border: `1px solid ${cs.borderTopColor}`,
    };
  }

  return (
    <>
      {fill && (
        <div
          ref={fillRef}
          className={`swarm-fill ${fadeFill ? 'is-fading' : ''} ${
            leaving && !fadeFill ? 'is-leaving' : ''
          } ${fill === 'clone' ? 'swarm-fill--clone' : ''}`}
          style={fillStyle}
          aria-hidden="true"
        >
          <svg className="swarm-fill-icon" viewBox="0 0 24 24" width="22" height="22">
            <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="10" r="1.6" fill="currentColor" />
            <path d="m4 18 5.5-5.5 4 4 2.5-2.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
      <div
        ref={boxRef}
        className={`swarm-box ${leaving ? 'is-leaving' : ''} ${kind === 'image' ? 'is-full' : ''}`}
        style={pos}
        aria-hidden="true"
      >
        {HANDLES.map(([x, y]) => (
          <span key={`${x}-${y}`} className="swarm-handle" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        <span ref={labelRef} className="swarm-box-label" />
        <span ref={(el) => registerCursor(id, el)} className="swarm-box-cursor">
          {kind === 'text' ? <BeamIcon color={color} /> : <CrossIcon color={color} />}
        </span>
      </div>
    </>
  );
}

/* ---------- status bar bits ---------- */
function Track({ pct }) {
  return (
    <span className="swarm-status-track" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/* ================================================================== */
export default function SwarmTransition({
  onComplete,
  onReveal,
  rootSelector = '.cinematic-overlay-root',
  targets: targetList = DEFAULT_TARGETS,
  includeImage = true,
  includeFrame = true,
}) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Starts at 'scan' => black from the very first painted frame.
  const [stage, setStage] = useState('scan'); // scan | ready | build | reveal | done
  const [boxes, setBoxes] = useState([]);
  const [layers, setLayers] = useState(0);
  const [total, setTotal] = useState(12);
  const [recent, setRecent] = useState([0, 1, 2, 3, 4]);
  const [elapsed, setElapsed] = useState('0.0');
  const [finishing, setFinishing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [locked, setLocked] = useState(false);
  const audioRef = useRef(null);

  const fieldRef = useRef(null);
  const modeRef = useRef('scan');
  const skipRef = useRef(() => {});
  const cursorsRef = useRef({});
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const optsRef = useRef({});
  optsRef.current = { rootSelector, targets: targetList, includeImage, includeFrame };

  const registerCursor = useCallback((id, el) => {
    if (el) cursorsRef.current[id] = el;
    else delete cursorsRef.current[id];
  }, []);

  const toggleSound = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const unlockSound = useCallback(() => {
    audioRef.current?.resume();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'm' || e.key === 'M') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSound]);

  /* ---------- orchestration (layout effect => runs BEFORE first paint) ---------- */
  useLayoutEffect(() => {
    if (reduced) {
      const t = window.setTimeout(() => onCompleteRef.current?.(), 200);
      return () => window.clearTimeout(t);
    }

    let aborted = false;
    const timers = [];
    const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));
    const sleep = (ms) => new Promise((res) => later(res, ms));

    /* sound */
    const audio = createSwarmAudio();
    audioRef.current = audio;
    let unlockHandler = null;
    if (audio) {
      audio.onState(() => setLocked(audio.state() !== 'running'));
      audio.resume();
      later(() => setLocked(audio.state() !== 'running'), 400);
      unlockHandler = () => audio.resume();
      window.addEventListener('pointerdown', unlockHandler);
      window.addEventListener('keydown', unlockHandler);
      audio.swell(1.6); // page dissolves
    }

    /* 1. measure, then hide every real element immediately */
    const targets = collectTargets(optsRef.current.rootSelector, optsRef.current.targets);
    targets.forEach((t) => {
      if (t.kind === 'text') {
        t.parts = prepareTyping(t.el); // text stays invisible, layout preserved
        t.chars = t.parts.reduce((n, p) => n + p.text.length, 0);
        t.big = parseFloat(window.getComputedStyle(t.el).fontSize) >= 40;
        t.el.style.transformOrigin = 'left bottom';
        if (t.big) {
          t.el.style.transition = 'transform 160ms ease';
          t.el.style.transform = `scale(${HEADING_SCALES[0]})`;
        }
      } else {
        t.el.style.transition = 'opacity 240ms ease';
        t.el.style.opacity = '0';
        t.el.style.visibility = 'hidden';
      }
    });

    const restoreAll = () =>
      targets.forEach((t) => {
        restoreTyping(t.parts);
        t.el.style.opacity = '';
        t.el.style.visibility = '';
        t.el.style.transform = '';
        t.el.style.transformOrigin = '';
        t.el.style.transition = '';
      });

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const frameRect = { left: 0, top: 0, width: vw, height: Math.max(220, vh - 96) };
    const imageRect = { left: 0, top: 0, width: vw, height: vh }; // full screen

    const steps = [
      ...targets.map((t) => ({
        ...t,
        duration: clamp(260 + Math.hypot(t.rect.width, t.rect.height) * 0.5, 300, 520),
      })),
      ...(optsRef.current.includeFrame
        ? [{ kind: 'frame', rect: frameRect, duration: 700 }]
        : []),
      ...(optsRef.current.includeImage
        ? [{ kind: 'image', rect: imageRect, duration: 850, fill: true }]
        : []),
    ];
    setTotal(steps.length);

    skipRef.current = () => {
      if (aborted) return;
      aborted = true;
      timers.forEach(window.clearTimeout);
      audio?.fall();
      restoreAll();
      modeRef.current = 'exit';
      setStage('reveal');
      onRevealRef.current?.();
      setFinishing(true);
      window.setTimeout(() => onCompleteRef.current?.(), 380);
    };

    /* 2. typing */
    const moveCursor = (id, rect, caret) => {
      const c = cursorsRef.current[id];
      if (!c) return;
      const r = caret.getBoundingClientRect();
      c.style.right = 'auto';
      c.style.bottom = 'auto';
      c.style.left = `${r.left - rect.left + 10}px`;
      c.style.top = `${r.top - rect.top + r.height / 2}px`;
      c.style.transform = 'translate(0, -50%)';
    };

    const typeText = async (s, id, pan) => {
      const per = clamp(900 / Math.max(s.chars, 1), 28, 70);
      let done = 0;
      s.parts.forEach((p) => { p.caret.dataset.on = '1'; });

      for (const p of s.parts) {
        for (let i = 1; i <= p.text.length; i += 1) {
          p.shown.data = p.text.slice(0, i);
          p.hidden.textContent = p.text.slice(i);
          done += 1;
          if (s.big) {
            const idx = Math.min(HEADING_SCALES.length - 1, Math.floor((done / s.chars) * HEADING_SCALES.length));
            s.el.style.transform = `scale(${HEADING_SCALES[idx]})`;
          }
          moveCursor(id, s.rect, p.caret);
          const ch = p.text[i - 1];
          audio?.key(pan, ch === ' ');
          await sleep(per * (ch === ' ' ? 1.8 : 1) * (0.7 + Math.random() * 0.6));
          if (aborted) return;
        }
      }
      await sleep(240); // let the caret blink once at the end
      if (aborted) return;
      restoreTyping(s.parts);
      s.el.style.transform = '';
      s.el.style.transition = '';
      s.el.style.transformOrigin = '';
    };

    /* 3. one build step */
    const runStep = async (s, id, builder) => {
      const cx = s.rect.left + s.rect.width / 2;
      const pan = clamp((cx / vw) * 2 - 1, -1, 1) * 0.8;
      const areaFrac = (s.rect.width * s.rect.height) / (vw * vh);

      setBoxes((b) => [...b, { ...s, id, color: BUILDERS[builder].color }]);
      setRecent((r) => [builder, ...r.filter((x) => x !== builder)].slice(0, 3));
      if (s.kind === 'image') modeRef.current = 'flock';
      audio?.press(pan); // mouse down

      await sleep(s.duration);
      if (aborted) return;
      audio?.release(pan); // mouse up

      if (s.kind === 'text') {
        await typeText(s, id, pan);
      } else {
        if (s.kind === 'shape') {
          s.el.style.visibility = '';
          s.el.style.opacity = '1';
        }
        audio?.note(pitchFor(areaFrac, cx / vw), pan);
      }
      if (aborted) return;

      setLayers((n) => n + 1);

      if (s.el) {
        await sleep(320);
        if (aborted) return;
        setBoxes((b) => b.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
        await sleep(240);
        if (aborted) return;
        setBoxes((b) => b.filter((x) => x.id !== id));
      }
    };

    /* 4. the show */
    const run = async () => {
      await sleep(1000);               // scanning
      if (aborted) return;
      modeRef.current = 'ready';
      setStage('ready');
      await sleep(850);
      if (aborted) return;

      modeRef.current = 'wander';
      setStage('build');
      audio?.arpeggio(); // swarm fans out
      const t0 = performance.now();
      await sleep(350);

      const running = [];
      for (let i = 0; i < steps.length; i += 1) {
        if (aborted) return;
        const s = steps[i];
        running.push(runStep(s, i, i % BUILDERS.length));
        if (s.kind === 'image') await sleep(s.duration + 280);
        else if (s.kind === 'frame') await sleep(460);
        else await sleep(340);
      }
      await Promise.all(running);      // every box finished (incl. typing)
      if (aborted) return;

      modeRef.current = 'exit';
      setStage('reveal');              // wipe the real scene in, top to bottom
      onRevealRef.current?.();
      audio?.swell(1.1);
      setBoxes((b) => b.map((x) => ({ ...x, leaving: true, fadeFill: true })));
      setElapsed(((performance.now() - t0) / 1000).toFixed(1));
      await sleep(1000);
      if (aborted) return;

      setBoxes([]);
      setStage('done');
      audio?.chord(); // soft E major: finished
      await sleep(1500);
      if (aborted) return;

      setFinishing(true);
      audio?.fall();
      await sleep(380);
      if (aborted) return;
      onCompleteRef.current?.();
    };

    run();

    return () => {
      aborted = true;
      timers.forEach(window.clearTimeout);
      restoreAll();
      if (unlockHandler) {
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
      }
      audio?.dispose();
      audioRef.current = null;
    };
  }, [reduced]);

  /* ---------- roaming agent cursors ---------- */
  useEffect(() => {
    if (reduced) return undefined;
    const field = fieldRef.current;
    if (!field) return undefined;

    const els = Array.from(field.querySelectorAll('.swarm-agent'));
    let W = window.innerWidth;
    let H = window.innerHeight;
    const onResize = () => { W = window.innerWidth; H = window.innerHeight; };
    window.addEventListener('resize', onResize, { passive: true });

    const rnd = (a, b) => a + Math.random() * (b - a);
    const S = els.map((_, i) => ({
      x: i % 2 ? rnd(W * 0.1, W * 0.3) : rnd(W * 0.65, W * 0.85),
      y: rnd(H * 0.35, H * 0.65),
      tx: 0, ty: 0, next: 0,
      ang: rnd(0, 360),
      ease: rnd(1.1, 2.3),
    }));

    const pick = (s, i, mode, now) => {
      if (mode === 'scan') {
        const left = i % 2 === 1;
        s.tx = (left ? W * 0.22 : W * 0.74) + rnd(-80, 80);
        s.ty = (left ? H * 0.54 : H * 0.48) + rnd(-80, 80);
      } else if (mode === 'ready') {
        const g = i % 3;
        s.tx = [W * 0.36, W * 0.64, W * 0.5][g] + rnd(-45, 45);
        s.ty = [H * 0.52, H * 0.42, H * 0.6][g] + rnd(-45, 45);
      } else if (mode === 'flock') {
        s.tx = W * 0.62 + rnd(-75, 75);
        s.ty = H * 0.3 + rnd(-75, 75);
      } else if (mode === 'exit') {
        const side = i % 4;
        if (side === 0) { s.tx = -50; s.ty = rnd(0, H); }
        else if (side === 1) { s.tx = W + 50; s.ty = rnd(0, H); }
        else if (side === 2) { s.tx = rnd(0, W); s.ty = -50; }
        else { s.tx = rnd(0, W); s.ty = H + 50; }
      } else {
        s.tx = rnd(W * 0.05, W * 0.95);
        s.ty = rnd(H * 0.08, H * 0.82);
      }
      s.next = now + rnd(900, 1800);
    };

    let raf;
    let last = performance.now();
    let prevMode = null;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mode = modeRef.current;
      const changed = mode !== prevMode;
      prevMode = mode;

      S.forEach((s, i) => {
        if (changed) { pick(s, i, mode, now); s.next = now + rnd(300, 900); }
        else if (now > s.next) pick(s, i, mode, now);

        const k = 1 - Math.exp(-dt * s.ease);
        const dx = s.tx - s.x;
        const dy = s.ty - s.y;
        s.x += dx * k;
        s.y += dy * k;
        if (Math.hypot(dx, dy) > 6) {
          const target = (Math.atan2(dy, dx) * 180) / Math.PI;
          const d = ((target - s.ang + 540) % 360) - 180;
          s.ang += d * Math.min(1, dt * 4);
        }
        els[i].style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.ang}deg)`;
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [reduced]);

  if (reduced) return null;

  const pct = total ? Math.round((layers / total) * 100) : 0;

  return (
    <>
      <div className="swarm-layer swarm-backdrop" data-stage={stage} />

      {boxes.map((b) => (
        <DrawBox key={b.id} box={b} registerCursor={registerCursor} />
      ))}

      <div ref={fieldRef} className="swarm-layer swarm-agent-field" data-stage={stage} aria-hidden="true">
        {AGENT_COLORS.map((color, i) => (
          <span
            key={i}
            className="swarm-agent"
            style={{ '--agent-color': color, '--in-delay': `${(i % 6) * 90}ms` }}
          >
            <ArrowIcon />
          </span>
        ))}
      </div>

      <div className="swarm-status" data-stage={stage} data-finishing={finishing} role="status" aria-live="polite">
        {stage === 'scan' && (
          <>
            <span className="swarm-status-text">Scanning page…</span>
            <Track pct={0} />
          </>
        )}
        {stage === 'ready' && (
          <>
            <span className="swarm-status-text"><b>18</b> agents ready</span>
            <span className="swarm-status-sep" />
            <span className="swarm-status-text"><b>{total}</b> layers</span>
            <Track pct={0} />
          </>
        )}
        {(stage === 'build' || stage === 'reveal') && (
          <>
            <span className="swarm-avatars" aria-hidden="true">
              {recent.map((idx) => (
                <span key={idx} className="swarm-avatar" style={{ background: BUILDERS[idx].color }}>
                  {BUILDERS[idx].letter}
                </span>
              ))}
            </span>
            <span className="swarm-status-text"><b>6</b> agents</span>
            <span className="swarm-status-sep" />
            <span className="swarm-status-text"><b>{layers}</b> / {total} layers</span>
            <Track pct={pct} />
          </>
        )}
        {stage === 'done' && (
          <>
            <span className="swarm-status-text">
              Rebuilt by <b>6</b> agents in <b>{elapsed}s</b>
            </span>
            <Track pct={100} />
          </>
        )}
        {stage !== 'done' && (
          <>
            <span className="swarm-chip" aria-hidden="true">Tour</span>
            <span className="swarm-chip" aria-hidden="true">1×</span>
            {locked ? (
              <button type="button" className="swarm-chip swarm-skip" onClick={unlockSound}>
                Tap for sound
              </button>
            ) : (
              <button
                type="button"
                className="swarm-chip swarm-chip--icon swarm-skip"
                aria-label={muted ? 'Unmute sound' : 'Mute sound'}
                onClick={toggleSound}
              >
                {muted ? <MutedIcon /> : <SpeakerIcon />}
              </button>
            )}
          </>
        )}
        <button type="button" className="swarm-chip swarm-chip--icon swarm-skip" aria-label="Skip intro" onClick={() => skipRef.current()}>
          <CloseIcon />
        </button>
      </div>
    </>
  );
}