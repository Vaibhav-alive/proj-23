import { useEffect, useRef } from "react";
import "./middle.css";
import pic1 from '../assets/stickers/middle-1.png'
import pic2 from '../assets/stickers/middle-2.png'
import pic3 from '../assets/stickers/middle-3.png'
// helper for the staggered reveal delay (--d custom property)
const d = (v) => ({ "--d": v });

// The 4 coloured sticky notes (pink, blue, yellow, lavender).
const NOTES = [
  { id: "n1", heading: "heading-1", desc: "desc-1" },
  { id: "n2", heading: "heading-2", desc: "desc-2" },
  { id: "n3", heading: "heading-3", desc: "desc-3" },
  { id: "n4", heading: "heading-4", desc: "desc-4" },
];

const PARAGRAPHS = ["paragraph-1", "paragraph-2", "paragraph-3"];

// Preloaded by App.jsx before the first screen shows ({ src, type, label })
export const MIDDLE_PRELOAD_ASSETS = [pic1, pic2, pic3]
  .map((src, i) => ({ src, type: 'image', label: `sticker ${i + 1}` }));

function Sticker({ src, className }) {
  return <img className={`m-char ${className}`} src={src} alt="" />;
}

export default function Mid() {
  const rootRef = useRef(null);
  const frameRef = useRef(null);

  // scroll-reveal
  useEffect(() => {
    const els = rootRef.current.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((x) => {
          if (x.isIntersecting) {
            x.target.classList.add("in");
            io.unobserve(x.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  // soft cursor spotlight (mouse only)
  useEffect(() => {
    const f = frameRef.current;
    if (
      !f ||
      !window.matchMedia("(hover:hover) and (pointer:fine)").matches ||
      window.matchMedia("(prefers-reduced-motion:reduce)").matches
    )
      return;

    let tx = 0.7, ty = 0.2, cx = 0.7, cy = 0.2, raf = null;

    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      f.style.setProperty("--px", cx * 100 + "%");
      f.style.setProperty("--py", cy * 100 + "%");
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : null;
    };

    const onMove = (e) => {
      const r = f.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    f.addEventListener("pointermove", onMove);
    return () => {
      f.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="page js" ref={rootRef}>
      <main className="frame" ref={frameRef}>
        <div className="m-stage">
          {/* top bar */}
          <div className="topbar reveal" style={d(".05s")}>
            <span className="micro">top-left-text</span>
            <span className="micro">top-right-text</span>
          </div>

          {/* headline */}
          <h1 className="m-title">
            <span className="m-main reveal" style={d(".15s")}>dummy-heading</span>
            <span className="m-script reveal" style={d(".3s")}>dummy-script</span>
          </h1>

          <p className="m-desc reveal" style={d(".45s")}>description-01</p>

          <div className="m-dummy reveal" style={d(".6s")}>
            <span className="m-dummy-t">dummy-note</span>
            <span className="m-dummy-s">dummy-note-2</span>
          </div>

          <span className="m-spark" style={{ left: "60.7%", top: "41%" }} aria-hidden="true">✦</span>
          <span className="m-spark" style={{ left: "63.5%", top: "83%" }} aria-hidden="true">✦</span>

          {/* 4 sticky notes */}
          {NOTES.map((note, index) => (
            <article
              key={note.id}
              className={`m-sticky m-n${index + 1} reveal float${index % 2 ? " slow" : ""}`}
              style={d(`${0.7 + index * 0.12}s`)}
            >
              <span className="num">{`0${index + 1}`}</span>
              <span className="heart" aria-hidden="true">♡</span>
              <span className="sh">{note.heading}</span>
              <span className="sdesc">{note.desc}</span>

              {index === 0 && <Sticker src={pic2} className="m-char-kitty" />}
              {index === 1 && <Sticker src={pic1} className="m-char-cinna" />}
            </article>
          ))}

          {/* big note (right) */}
          <div className="m-note reveal float slow" style={d(".5s")}>
            <article className="m-paper">
              <span className="m-note-micro micro">dummy-micro-text</span>
              <h2>heading-1</h2>
              {PARAGRAPHS.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <span className="m-closing">closing-note</span>
            </article>
            <Sticker src={pic3} className="m-char-melody" />
          </div>

          <span className="m-made reveal" style={d("1.3s")}>closing-note-web</span>

          {/* footer */}
          <footer className="m-footer reveal" style={d("1.4s")}>
            <span className="m-footer-desc">footer-desc</span>
            <span className="m-footer-note">footer-note</span>
          </footer>
        </div>
      </main>
    </div>
  );
}