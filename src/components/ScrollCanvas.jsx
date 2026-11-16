import { useEffect, useRef, useState } from 'react';
import './ScrollCanvas.css';

const FRAME_INTERVAL = 1000 / 40; // exactly 30fps = 33.333ms per frame

function drawCoverImage(ctx, canvas, image) {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) return;

  const canvasRatio = canvasWidth / canvasHeight;
  const imageRatio = imageWidth / imageHeight;
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (canvasRatio > imageRatio) {
    drawHeight = canvasWidth / imageRatio;
    offsetY = (canvasHeight - drawHeight) / 2;
  } else {
    drawWidth = canvasHeight * imageRatio;
    offsetX = (canvasWidth - drawWidth) / 2;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

export default function ScrollCanvas({
  manager,
  visible = true,
  playbackRequest,
  onSequenceComplete,
  onSequenceError,
  onFrameChange,
}) {
  const canvasRef = useRef(null);
  const currentFrameRef = useRef(1);
  const [firstFrameReady, setFirstFrameReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    manager.loadFrame(1).then((image) => {
      if (cancelled) return;
      if (image) setFirstFrameReady(true);
      else onSequenceError?.(1);
    });
    return () => {
      cancelled = true;
    };
  }, [manager, onSequenceError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx || !firstFrameReady) return undefined;

    const resizeCanvas = () => {
      const { width, height } = canvas.getBoundingClientRect();
      // Cap DPR to 1.75 to prevent mobile GPU fill-rate throttling on high-DPI screens
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const image = manager.images.get(currentFrameRef.current);
      if (image) drawCoverImage(ctx, canvas, image);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', resizeCanvas, { passive: true });
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [firstFrameReady, manager.images]);

  useEffect(() => {
    if (!playbackRequest) return undefined;

    let cancelled = false;
    let animationFrameId = null;

    const play = async () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { alpha: false });
      if (!canvas || !ctx) {
        onSequenceError?.(playbackRequest.from);
        return;
      }

      const { from, to } = playbackRequest;
      const step = from <= to ? 1 : -1;
      let currentFrame = from;

      // Warm up frames ahead in memory
      manager.warmupWindow(from, 10, step);

      // Draw initial frame immediately
      let initialImage = manager.getFrame(from);
      if (!initialImage) {
        try {
          initialImage = await manager.loadFrame(from);
        } catch {
          if (!cancelled) onSequenceError?.(from);
          return;
        }
      }

      if (cancelled) return;
      if (initialImage) {
        drawCoverImage(ctx, canvas, initialImage);
        currentFrameRef.current = from;
        onFrameChange?.(from);
      }

      if (from === to) {
        onSequenceComplete?.();
        return;
      }

      let lastFrameTime = performance.now();
      let isBusy = false;

      const tick = async (timestamp) => {
        if (cancelled) return;

        const elapsed = timestamp - lastFrameTime;
        if (elapsed >= FRAME_INTERVAL && !isBusy) {
          isBusy = true;
          currentFrame += step;
          lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

          // Continuously warm up ahead of playhead
          manager.warmupWindow(currentFrame, 8, step);

          let frameImage = manager.getFrame(currentFrame);
          if (!frameImage) {
            try {
              frameImage = await manager.loadFrame(currentFrame);
            } catch {
              if (!cancelled) onSequenceError?.(currentFrame);
              isBusy = false;
              return;
            }
          }

          if (cancelled) return;

          if (frameImage && canvas && ctx) {
            drawCoverImage(ctx, canvas, frameImage);
            currentFrameRef.current = currentFrame;
            onFrameChange?.(currentFrame);
          }

          isBusy = false;

          if (currentFrame === to) {
            if (!cancelled) onSequenceComplete?.();
            return;
          }
        }

        animationFrameId = requestAnimationFrame(tick);
      };

      animationFrameId = requestAnimationFrame(tick);
    };

    play();

    return () => {
      cancelled = true;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [manager, playbackRequest, onSequenceComplete, onSequenceError, onFrameChange]);

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className={`scroll-canvas ${visible ? 'is-visible' : ''}`}
        aria-hidden="true"
      />
      <div className="cinematic-vignette" />
    </div>
  );
}
