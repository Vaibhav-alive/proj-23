import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import ScrollCanvas from './components/ScrollCanvas';
import CinematicOverlay from './components/CinematicOverlay';
import ProfileSelector, { PROFILE_PRELOAD_ASSETS } from './components/ProfileSelector';
import SwarmTransition from './components/SwarmTransition';
import Mid, { MIDDLE_PRELOAD_ASSETS } from './components/Middle';
import end from './assets/stickers/last.png'
import {
  FrameSequenceManager,
  TOTAL_FRAMES,
} from './utils/frameLoader';
import './App.css';

const INITIAL_ASSETS = [
  ...PROFILE_PRELOAD_ASSETS,
  ...MIDDLE_PRELOAD_ASSETS,
];
const TOTAL_INITIAL_ASSETS = TOTAL_FRAMES + INITIAL_ASSETS.length + 1;

function preloadAsset({ src, type, label }) {
  if (type === 'image') {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = async () => {
        try {
          await image.decode();
          resolve();
        } catch {
          reject(new Error(`Could not decode "${label}".`));
        }
      };
      image.onerror = () => reject(new Error(`Could not load "${label}".`));
      image.src = src;
    });
  }

  return (async () => {
    let response;
    try {
      response = await fetch(src, { cache: 'force-cache' });
    } catch {
      throw new Error(`Could not load "${label}".`);
    }

    if (!response.ok) {
      throw new Error(`Could not load "${label}" (HTTP ${response.status}).`);
    }

    try {
      if (!response.body) {
        await response.arrayBuffer();
        return;
      }

      const reader = response.body.getReader();
      while (!(await reader.read()).done) {
        // Consume full media files without retaining them in memory.
      }
    } catch {
      throw new Error(`Could not finish loading "${label}".`);
    }
  })();
}

async function preloadInitialAssets(onAssetLoaded) {
  const pending = INITIAL_ASSETS;
  const failures = [];
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const asset = pending[next++];
      try {
        await preloadAsset(asset);
        onAssetLoaded();
      } catch (error) {
        failures.push(error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  if (failures.length) throw failures[0];
}

// Order matters: a shape must come BEFORE the text inside it.
const MIDDLE_SWARM_TARGETS = [
  { sel: '.frame', kind: 'shape', fill: 'clone' },          // builds the real cream page
  { sel: '.middle-continue-button', kind: 'shape' },
  { sel: '.topbar .micro', kind: 'text' },
  { sel: '.m-main', kind: 'text' },
  { sel: '.m-script', kind: 'text' },
  { sel: '.m-desc', kind: 'text' },
  { sel: '.m-dummy-t', kind: 'text' },
  { sel: '.m-dummy-s', kind: 'text' },
  { sel: '.m-sticky', kind: 'shape', fill: true },          // 4 coloured notes
  { sel: '.m-sticky .sh', kind: 'text' },
  { sel: '.m-note', kind: 'shape', fill: true },            // big note
  { sel: '.m-note-micro', kind: 'text' },
  { sel: '.m-paper h2', kind: 'text' },
  { sel: '.m-paper p', kind: 'text' },
  { sel: '.m-closing', kind: 'text' },
  { sel: '.m-char', kind: 'shape', fill: true },            // sticker characters
  { sel: '.m-made', kind: 'text' },
  { sel: '.m-footer-note', kind: 'text' },
];

export default function App() {
  const [frameManager] = useState(() => new FrameSequenceManager(TOTAL_FRAMES));
  const [initialLoadState, setInitialLoadState] = useState('loading');
  const [initialLoadProgress, setInitialLoadProgress] = useState(0);
  const [initialLoadError, setInitialLoadError] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasSelectedProfile, setHasSelectedProfile] = useState(false);
  const [showSwarmTransition, setShowSwarmTransition] = useState(false);
  const [showMiddleSwarm, setShowMiddleSwarm] = useState(false);
  const [middleSwarmStage, setMiddleSwarmStage] = useState('idle'); // idle | building | done
  const middleSwarmPlayedRef = useRef(false);

  // Phases:
  // 'loading'
  // 'scene-cake' (Frame 1)
  // 'animating-1-83'
  // 'scene-candy-mid' (Frame 83)
  // 'animating-83-102'
  // 'animating-83-1'
  // 'middle'
  // 'animating-102-end'
  // 'finale'
  const [phase, setPhase] = useState('loading');
  const [playbackRequest, setPlaybackRequest] = useState(null);
  const [showBlackVeil, setShowBlackVeil] = useState(false);

  useEffect(() => {
    if (phase !== 'finale') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    confetti({
      particleCount: 90,
      spread: 78,
      startVelocity: 42,
      origin: { x: 0.5, y: 0.65 },
      colors: ['#f2a3ad', '#f7c8d0', '#f4c95d', '#fff1f4', '#cdb4db'],
      disableForReducedMotion: true,
    });
    return () => {
      confetti.reset();
    };
  }, [phase]);

  const phaseRef = useRef('loading');
  const isTransitioningRef = useRef(false);
  const sequenceIdRef = useRef(0);
  const middleContainerRef = useRef(null);
  const finaleContainerRef = useRef(null);

  const updatePhase = useCallback((newPhase) => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }, []);

  const requestPlayback = useCallback((from, to) => {
    setPlaybackRequest({ id: ++sequenceIdRef.current, from, to });
  }, []);

  const handleProfileSelect = useCallback(() => {
    setHasSelectedProfile(true);
    setShowSwarmTransition(true);
  }, []);

  const handleSwarmTransitionComplete = useCallback(() => {
    setShowSwarmTransition(false);
  }, []);

  // Preload every asset used by the experience before revealing the first screen.
  const preloadInitialFrames = useCallback(() => {
    let loadedFrames = 0;
    let loadedAssets = 0;
    const updateProgress = () => setInitialLoadProgress(
      (loadedFrames + loadedAssets) / TOTAL_INITIAL_ASSETS,
    );

    const preloadFrames = frameManager.preloadAllFrames({
      concurrency: 6,
      onProgress: (loaded) => {
        loadedFrames = loaded;
        updateProgress();
      },
    });

    const preloadAssets = preloadInitialAssets(() => {
      loadedAssets += 1;
      updateProgress();
    });
    const preloadFonts = document.fonts.ready.then(() => {
      loadedAssets += 1;
      updateProgress();
    });

    Promise.all([preloadFrames, preloadAssets, preloadFonts])
      .then(async () => {
        const frame1 = await frameManager.loadFrame(1);
        if (!frame1) throw new Error('Could not decode first frame.');

        setInitialLoadState('ready');
        updatePhase('scene-cake');
        requestPlayback(1, 1);
      })
      .catch((error) => {
        console.error('Initial preload error:', error);
        setInitialLoadError(
          error instanceof Error ? error.message : 'Some assets could not be loaded.',
        );
        setInitialLoadState('error');
      });
  }, [frameManager, requestPlayback, updatePhase]);

  const handleRetryPreload = useCallback(() => {
    setInitialLoadState('loading');
    setInitialLoadProgress(0);
    setInitialLoadError('');
    preloadInitialFrames();
  }, [preloadInitialFrames]);

  useEffect(() => {
    preloadInitialFrames();
  }, [preloadInitialFrames]);

  // Forward actions (Triggered ONLY via SlideButton)
  const advanceFromCake = useCallback(() => {
    if (phaseRef.current !== 'scene-cake' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    updatePhase('animating-1-83');
    requestPlayback(1, 83);
  }, [requestPlayback, updatePhase]);

  const advanceFromCandyMid = useCallback(() => {
    if (phaseRef.current !== 'scene-candy-mid' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    updatePhase('animating-83-102');
    requestPlayback(83, 102);
  }, [requestPlayback, updatePhase]);

  const advanceFromMiddle = useCallback(() => {
    if (phaseRef.current !== 'middle' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    updatePhase('animating-102-end');
    requestPlayback(102, TOTAL_FRAMES);
  }, [requestPlayback, updatePhase]);

  // Backward actions (Scroll Back)
  const backFromCandyMid = useCallback(() => {
    if (phaseRef.current !== 'scene-candy-mid' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    updatePhase('animating-83-1');
    requestPlayback(83, 1);
  }, [requestPlayback, updatePhase]);

  const backFromMiddle = useCallback(() => {
    if (phaseRef.current !== 'middle' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    setShowBlackVeil(true);

    window.setTimeout(() => {
      requestPlayback(83, 83);
      updatePhase('scene-candy-mid');
      setShowBlackVeil(false);
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }, 450);
  }, [requestPlayback, updatePhase]);

  const backFromFinale = useCallback(() => {
    if (phaseRef.current !== 'finale' || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    setShowBlackVeil(true);

    window.setTimeout(() => {
      updatePhase('middle');
      if (middleContainerRef.current) {
        middleContainerRef.current.scrollTop = middleContainerRef.current.scrollHeight;
      }
      setShowBlackVeil(false);
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }, 450);
  }, [updatePhase]);

  // Sequence completion handler
  const handleSequenceComplete = useCallback(() => {
    const current = phaseRef.current;

    if (current === 'animating-83-102') {
      setShowBlackVeil(true);
      window.setTimeout(() => {
        if (!middleSwarmPlayedRef.current) {
          middleSwarmPlayedRef.current = true;
          setMiddleSwarmStage('building');
          setShowMiddleSwarm(true);
        }
        updatePhase('middle');
        if (middleContainerRef.current) {
          middleContainerRef.current.scrollTop = 0;
        }
        setShowBlackVeil(false);
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      }, 450);
      return;
    }

    if (current === 'animating-102-end') {
      updatePhase('finale');
      if (finaleContainerRef.current) {
        finaleContainerRef.current.scrollTop = 0;
      }
      isTransitioningRef.current = false;
      setIsTransitioning(false);
      return;
    }

    isTransitioningRef.current = false;
    setIsTransitioning(false);

    if (current === 'animating-1-83') {
      updatePhase('scene-candy-mid');
    } else if (current === 'animating-83-1') {
      updatePhase('scene-cake');
    }
  }, [updatePhase]);

  const handleSequenceError = useCallback((frame) => {
    console.error(`Playback error on frame ${frame}`);
    isTransitioningRef.current = false;
    setIsTransitioning(false);
  }, []);

  // Global Wheel, Touch, and Keyboard navigation
  // Note: Forward scrolling is strictly triggered via SlideButton.
  // While any scroll/animation is running, all user scroll inputs are completely blocked.
  useEffect(() => {
    let touchStartY = 0;

    const handleWheel = (event) => {
      // While scroll/animation is triggered, no scroll input is received from user
      if (isTransitioningRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const p = phaseRef.current;
      if (p === 'middle' || p === 'finale' || p === 'loading') return;

      const movingUp = event.deltaY < -15;
      // Forward scene changes are only triggered by the slider.
      if (event.deltaY > 0) {
        event.preventDefault();
        return;
      }

      // Backward scroll (scrolling up)
      if (movingUp) {
        event.preventDefault();
        if (p === 'scene-candy-mid') backFromCandyMid();
      }
    };

    const handleTouchStart = (event) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (event) => {
      if (isTransitioningRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.target instanceof Element && event.target.closest('.slide-commit-orb')) return;

      const p = phaseRef.current;
      if (p === 'middle' || p === 'finale' || p === 'loading') return;

      const touchY = event.touches[0]?.clientY ?? touchStartY;
      const diffY = touchStartY - touchY;
      const movingUp = diffY < -30; // user swiped down to scroll up
      // Forward scene changes are only triggered by the slider.
      if (diffY > 0) {
        event.preventDefault();
        return;
      }

      if (movingUp) {
        event.preventDefault();
        if (p === 'scene-candy-mid') backFromCandyMid();
      }
    };

    const handleKeyDown = (event) => {
      if (isTransitioningRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const p = phaseRef.current;
      if (p === 'middle' || p === 'finale' || p === 'loading') return;

      if (event.target instanceof Element && event.target.closest('.slide-commit-track')) return;

      const forwardKeys = ['ArrowDown', 'PageDown', ' '];
      const backwardKeys = ['ArrowUp', 'PageUp'];

      if (forwardKeys.includes(event.key)) {
        // Forward scroll is strictly triggered by the slider button
        event.preventDefault();
        return;
      }

      if (backwardKeys.includes(event.key)) {
        event.preventDefault();
        if (p === 'scene-candy-mid') backFromCandyMid();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('wheel', handleWheel, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
      window.removeEventListener('touchmove', handleTouchMove, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    backFromCandyMid,
  ]);

  // Handler for Middle container wheel/touch (boundary detection for scroll-back)
  const handleMiddleWheel = (e) => {
    if (isTransitioningRef.current || showMiddleSwarm) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const el = middleContainerRef.current;
    if (!el) return;

    const atTop = el.scrollTop <= 5;
    if (atTop && e.deltaY < -20) {
      e.preventDefault();
      backFromMiddle();
    }
  };

  // Handler for Finale container wheel (boundary detection for scroll-back)
  const handleFinaleWheel = (e) => {
    if (isTransitioningRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const el = finaleContainerRef.current;
    if (!el) return;

    const atTop = el.scrollTop <= 5;
    if (atTop && e.deltaY < -20) {
      e.preventDefault();
      backFromFinale();
    }
  };

  // Determine active overlay scene
  let activeOverlayScene = null;
  if (phase === 'scene-cake') activeOverlayScene = 'cake';
  else if (phase === 'scene-candy-mid') activeOverlayScene = 'candy-mid';

  const overlayNextHandler = () => {
    if (phase === 'scene-cake') advanceFromCake();
    else if (phase === 'scene-candy-mid') advanceFromCandyMid();
  };

  return (
    <div className={`app-container phase-${phase}`}>
      {/* ==================================================================
          PRELOAD SCREEN
         ================================================================== */}
      {initialLoadState !== 'ready' && (
        <div className="frame-loading-screen" role="status" aria-live="polite">
          <div className="frame-loading-card">
            <span className="frame-loading-eyebrow">dummy-desc</span>
            <h1>dumy-heading</h1>
            <p>
              {initialLoadError
                ? `${initialLoadError} dummy-desc`
                : 'dummy-desc'}
            </p>
            {!initialLoadError && (
              <>
                <div
                  className="frame-loading-track"
                  role="progressbar"
                  aria-label="Loading all experience assets"
                  aria-valuemin={0}
                  aria-valuemax={TOTAL_INITIAL_ASSETS}
                  aria-valuenow={Math.round(initialLoadProgress * TOTAL_INITIAL_ASSETS)}
                >
                  <span style={{ width: `${initialLoadProgress * 100}%` }} />
                </div>
                <span className="frame-loading-count">
                  {Math.round(initialLoadProgress * TOTAL_INITIAL_ASSETS)} of {TOTAL_INITIAL_ASSETS} assets ready ({Math.round(initialLoadProgress * 100)}%)
                </span>
              </>
            )}
            {initialLoadError && (
              <button type="button" className="story-button" onClick={handleRetryPreload}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {initialLoadState === 'ready' && !hasSelectedProfile && (
        <ProfileSelector onSelect={handleProfileSelect} />
      )}

      {showSwarmTransition && (
        <SwarmTransition onComplete={handleSwarmTransitionComplete} />
      )}

      {showMiddleSwarm && (
        <SwarmTransition
          rootSelector=".middle-page-container"
          targets={MIDDLE_SWARM_TARGETS}
          includeImage={false}
          includeFrame={false}
          onReveal={() => setMiddleSwarmStage('done')}
          onComplete={() => {
            setShowMiddleSwarm(false);
            setMiddleSwarmStage('done');
          }}
        />
      )}

      {/* ==================================================================
          CANVAS FULLSCREEN ANIMATION LAYER
         ================================================================== */}
      <section
        className="hero-scroll-area"
        aria-label="3D Animation Canvas"
        inert={showSwarmTransition}
      >
        <ScrollCanvas
          manager={frameManager}
          visible={initialLoadState === 'ready' && hasSelectedProfile}
          playbackRequest={playbackRequest}
          onSequenceComplete={handleSequenceComplete}
          onSequenceError={handleSequenceError}
        />
      </section>

      {/* ==================================================================
          CINEMATIC OVERLAY (Opening scenes)
         ================================================================== */}
      <CinematicOverlay
        activeScene={activeOverlayScene}
        visible={hasSelectedProfile && activeOverlayScene !== null && !showBlackVeil}
        disabled={isTransitioning}
        inert={showSwarmTransition}
        onNext={overlayNextHandler}
      />

      {/* ==================================================================
          BLACK SCREEN TRANSITION VEIL
         ================================================================== */}
      <div
        className={`black-transition-veil ${showBlackVeil ? 'is-active' : ''}`}
        aria-hidden="true"
      />

      {/* ==================================================================
          MIDDLE SECTION (middle.jsx)
         ================================================================== */}
      <section
        ref={middleContainerRef}
        className={`middle-page-container ${phase === 'middle' ? 'is-active' : ''} ${
          middleSwarmStage === 'building' ? 'swarm-building' : ''
        } ${middleSwarmStage === 'done' ? 'swarm-done' : ''}`}
        inert={showSwarmTransition || showMiddleSwarm}
        onWheel={handleMiddleWheel}
        aria-label="Birthday Message and Memories"
      >
        <Mid />
        <div className="middle-scroll-prompt">
          <button
            type="button"
            className="middle-continue-button"
            disabled={isTransitioning}
            onClick={advanceFromMiddle}
          >
            Continue <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      {/* ==================================================================
          FINALE CONTENT
         ================================================================== */}
      <section
        ref={finaleContainerRef}
        className={`finale-page-container ${phase === 'finale' ? 'is-active' : ''}`}
        inert={showSwarmTransition}
        onWheel={handleFinaleWheel}
        aria-label="Birthday Finale Celebration"
      >
        <header className="finale-header">
          <div className="finale-brand">
            <span className="finale-brand-mark">CD</span>
            <span className="finale-brand-name">NAME OF WEB</span>
          </div>
          <span className="finale-tagline">EK LINE MEI KUCH BHI CHALEGA</span>
        </header>
        <h1 className="finale-heading">
          <span>MAIN</span>
          <span>HEADING</span>
        </h1>
        <div className="finale-character-placeholder">
          <img
            src={end}
            alt="Sanrio birthday character illustration"
            draggable="false"
          />
        </div>
      </section>

    </div>
  );
}