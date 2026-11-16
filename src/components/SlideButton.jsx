import { useCallback, useEffect, useRef, useState } from 'react';
import './SlideButton.css';

export default function SlideButton({
  label = 'SLIDE TO CONTINUE',
  onCommit,
  className = '',
  disabled = false,
  variant = 'default',
}) {
  const [orbOffset, setOrbOffset] = useState(0);
  const [maxOrbOffset, setMaxOrbOffset] = useState(140);
  const [isCommitted, setIsCommitted] = useState(false);

  const trackRef = useRef(null);
  const orbRef = useRef(null);
  const maxOrbOffsetRef = useRef(140);
  const orbOffsetRef = useRef(0);
  const dragRef = useRef(null);
  const committedRef = useRef(false);
  const commitTimerRef = useRef(null);

  const setOffset = useCallback((offset) => {
    const nextOffset = Math.max(0, Math.min(offset, maxOrbOffsetRef.current));
    orbOffsetRef.current = nextOffset;
    setOrbOffset(nextOffset);
  }, []);

  const updateMeasurements = useCallback(() => {
    const track = trackRef.current;
    const orb = orbRef.current;
    if (!track || !orb) return null;

    const max = Math.max(0, track.clientWidth - orb.clientWidth - 12);
    maxOrbOffsetRef.current = max;
    setMaxOrbOffset(max);
    if (orbOffsetRef.current > max) setOffset(max);
    return max;
  }, [setOffset]);

  useEffect(() => {
    updateMeasurements();
    window.addEventListener('resize', updateMeasurements, { passive: true });
    return () => window.removeEventListener('resize', updateMeasurements);
  }, [updateMeasurements]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
    }
  }, []);

  const commit = useCallback((max) => {
    if (disabled || committedRef.current || max <= 0) return;

    committedRef.current = true;
    dragRef.current = null;
    setOffset(max);
    setIsCommitted(true);
    commitTimerRef.current = window.setTimeout(() => onCommit?.(), 400);
  }, [disabled, onCommit, setOffset]);

  const handlePointerDown = (event) => {
    if (disabled || committedRef.current || !event.isPrimary || event.button !== 0) return;

    const max = updateMeasurements() ?? maxOrbOffsetRef.current;
    if (max <= 0) return;

    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: orbOffsetRef.current,
      max,
    };
    trackRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    setOffset(drag.startOffset + event.clientX - drag.startX);
  };

  const finishDrag = (event, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    const commitThreshold = drag.max - Math.max(2, drag.max * 0.04);
    if (!cancelled && orbOffsetRef.current >= commitThreshold) {
      commit(drag.max);
    } else {
      setOffset(0);
    }
  };

  const handleKeyDown = (event) => {
    if (disabled || committedRef.current) return;

    const max = updateMeasurements() ?? maxOrbOffsetRef.current;
    const step = Math.max(1, max / 10);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const nextOffset = Math.min(max, orbOffsetRef.current + step);
      if (nextOffset >= max) commit(max);
      else setOffset(nextOffset);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      setOffset(orbOffsetRef.current - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      setOffset(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      commit(max);
    }
  };

  const progress = maxOrbOffset > 0 ? orbOffset / maxOrbOffset : 0;
  const value = Math.round(progress * 100);
  const activeCommitted = isCommitted;

  return (
    <div
      ref={trackRef}
      className={`slide-commit-track ${variant === 'frost' ? 'slide-commit-track--frost' : ''} ${
        activeCommitted ? 'is-committed' : ''
      } ${
        disabled ? 'is-disabled' : ''
      } ${className}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={activeCommitted ? 100 : value}
      aria-valuetext={activeCommitted ? `${label}: complete` : `${label}: ${value}%`}
      aria-disabled={disabled || activeCommitted}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onLostPointerCapture={(event) => finishDrag(event, true)}
    >
      <span
        className="slide-commit-fill"
        style={{
          width: `${orbOffset + 28}px`,
          opacity: Math.min(1, progress * 1.3),
        }}
      />

      <span
        ref={orbRef}
        className="slide-commit-orb"
        style={{
          transform: `translate3d(${orbOffset}px, 0, 0)`,
          transition: dragRef.current
            ? 'none'
            : 'transform 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25)',
        }}
        onPointerDown={handlePointerDown}
      >
        {activeCommitted ? (
          <svg
            className="slide-commit-check"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="slide-commit-arrow" aria-hidden="true">→</span>
        )}
      </span>

      <span
        className="slide-commit-label"
        style={{
          opacity: activeCommitted ? 0 : Math.max(0, 1 - progress * 1.55),
          transform: `translateX(${progress * 12}px)`,
        }}
      >
        {activeCommitted ? 'STARTING…' : label}
      </span>
    </div>
  );
}
