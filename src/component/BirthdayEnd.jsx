import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import "./BirthdayEnd.css";

const Letters = ({ text, start = 0 }) =>
  text.split("").map((ch, i) => (
    <span key={i} className="bh-letter" style={{ "--i": start + i }} aria-hidden="true">
      {ch}
    </span>
  ));

// tiny seeded random so the layout is stable between renders
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function makeFx(cols, rows) {
  const r = rnd(42);
  const pick = (n) => Math.round((r() * 2 - 1) * n);
  const beams = Array.from({ length: 10 }, (_, i) => {
    const horizontal = i % 2 === 0;
    return {
      horizontal,
      n: pick(horizontal ? rows : cols),
      dur: 6 + r() * 6,
      delay: -r() * 12,
      len: 16 + r() * 18,
      rev: r() > 0.5,
    };
  });
  const dots = Array.from({ length: 16 }, () => ({
    n: pick(cols), m: pick(rows), dur: 2.4 + r() * 3.2, delay: -r() * 6,
  }));
  return { beams, dots };
}

export default function BirthdayHero({
  name = "dumy-heading",
  brand = "dummy-desc",
  tagline = "dummy-desc",
  cta = "RELOAD THE EXP",
  onReload,
  active = true,
}) {
  const root = useRef(null);
  const spot = useRef(null);
  const inner = useRef(null);
  const halo = useRef(null);
  const [run, setRun] = useState(0);
  const [grid, setGrid] = useState({ c: 6, r: 4 });
  const fx = useMemo(() => makeFx(grid.c, grid.r), [grid]);

  const display = `{${name.trim().toUpperCase()}}`;
  // long names shrink so the third line never overflows the screen
  const fit = useMemo(() => Math.min(1, 8 / display.length), [display]);

  useEffect(() => {
    if (!active) return undefined;

    const end = Date.now() + 15000;
    let frameId;
    const colors = ["#ffffff", "#000000", "#999999"];
    const fire = () => {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        disableForReducedMotion: true,
      });

      if (Date.now() < end) frameId = window.requestAnimationFrame(fire);
    };

    frameId = window.requestAnimationFrame(fire);
    return () => {
      window.cancelAnimationFrame(frameId);
      confetti.reset();
    };
  }, [active]);

  useEffect(() => {
    const el = root.current, sp = spot.current, inn = inner.current, ha = halo.current;
    if (!el || !sp || !inn || !ha) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, L = 0, T = 0, S = 0, HS = 0;
    let tx = 0, ty = 0, x = 0, y = 0, last = -1e9, raf = 0;

    const measure = () => {
      const r = el.getBoundingClientRect();
      W = r.width; H = r.height; L = r.left; T = r.top;
      S = sp.offsetWidth; HS = ha.offsetWidth;
      inn.style.width = W + "px";
      inn.style.height = H + "px";
      if (!x && !y) { tx = x = W / 2; ty = y = H * 0.42; }
      // how many tiles fit, so beams and sparkles always land on screen
      const vw = window.innerWidth;
      const tile = vw <= 640 ? 88 : Math.min(150, Math.max(76, vw * 0.11));
      const c = Math.max(1, Math.floor(W / tile / 2));
      const rr = Math.max(1, Math.floor(H / tile / 2));
      setGrid((g) => (g.c === c && g.r === rr ? g : { c, r: rr }));
    };

    const move = (e) => {
      tx = e.clientX - L;
      ty = e.clientY - T;
      last = performance.now();
    };

    const frame = (t) => {
      if (!reduce && t - last > 2500) {
        tx = W * 0.5 + Math.sin(t / 2600) * W * 0.22;
        ty = H * 0.42 + Math.cos(t / 3300) * H * 0.14;
      }
      x += (tx - x) * 0.1;
      y += (ty - y) * 0.1;
      // transform-only updates: no layout, no repaint, runs on the GPU
      sp.style.transform = `translate3d(${x - S / 2}px,${y - S / 2}px,0)`;
      inn.style.transform = `translate3d(${S / 2 - x}px,${S / 2 - y}px,0)`;
      ha.style.transform = `translate3d(${x - HS / 2}px,${y - HS / 2}px,0)`;
      raf = requestAnimationFrame(frame);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      el.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <section className="bh" ref={root} style={{ "--fit": fit }}>
      {/* background */}
      <div className="bh-tiles" />
      <div className="bh-lines" />
      <div className="bh-spot" ref={spot}>
        <div className="bh-lines bh-lines--glow" ref={inner} />
      </div>
      <div className="bh-halo" ref={halo} />
      <div className="bh-orb bh-orb--a" />
      <div className="bh-orb bh-orb--b" />
      <div className="bh-orb bh-orb--c" />

      {fx.beams.map((b, i) => (
        <span
          key={"b" + i}
          className={`bh-beam ${b.horizontal ? "bh-beam--x" : "bh-beam--y"} ${b.rev ? "is-rev" : ""}`}
          style={{
            [b.horizontal ? "top" : "left"]: b.horizontal
              ? `calc(40% + var(--tile) * .1 + ${b.n} * var(--tile) + 1.5px)`
              : `calc(50% + ${b.n} * var(--tile) + 1.5px)`,
            "--len": b.len + "vmax",
            animationDuration: b.dur + "s",
            animationDelay: b.delay + "s",
          }}
        />
      ))}

      {fx.dots.map((d, i) => (
        <span
          key={"d" + i}
          className="bh-dot"
          style={{
            left: `calc(50% + ${d.n} * var(--tile) + 1.5px)`,
            top: `calc(40% + var(--tile) * .1 + ${d.m} * var(--tile) + 1.5px)`,
            animationDuration: d.dur + "s",
            animationDelay: d.delay + "s",
          }}
        />
      ))}

      <div className="bh-sweep" />
      <div className="bh-grain" />

      <header className="bh-nav">
        <div className="bh-brand">
          <span className="bh-logo">DM</span>
          <span className="bh-brand-name">{brand}</span>
        </div>
        <p className="bh-tagline">{tagline}</p>
      </header>

      <main className="bh-center">
        <h1 className="bh-title" key={run} aria-label="dumy-heading">
          <span className="bh-line"><Letters text="DUMY" /></span>
          <span className="bh-line bh-line--name"><Letters text="-HEADING" start={4} /></span>
        </h1>
      </main>

      <footer className="bh-foot">
        <button
          className="bh-btn"
          onClick={() => { setRun((n) => n + 1); onReload?.(); }}
        >
          <span className="bh-btn-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="bh-btn-text">{cta}</span>
        </button>
      </footer>
    </section>
  );
}