export const TOTAL_FRAMES = 179;
export const INITIAL_PRELOAD_END = 179;

export function getFrameUrl(frameIndex) {
  const index = Math.min(Math.max(1, Math.round(frameIndex)), TOTAL_FRAMES);
  const pad = String(index).padStart(3, '0');
  return `/frames/ezgif-frame-${pad}.png`;
}

export class FrameSequenceManager {
  constructor(totalFrames = TOTAL_FRAMES, onProgress) {
    this.totalFrames = totalFrames;
    this.onProgress = onProgress;
    // Decoded HTMLImageElement cache (sliding window of ~48 decoded bitmaps to fit in mobile RAM)
    this.images = new Map();
    // In-memory Blob URLs for instant 0ms zero-network decoding (~32.5MB total compressed RAM)
    this.blobUrls = new Map();
    this.pendingLoads = new Map();
    this.pendingImages = new Map();
    this.maxCachedFrames = 48;
  }

  hasFrame(frameIndex) {
    return this.images.has(Math.round(frameIndex));
  }

  getFrame(frameIndex) {
    return this.images.get(Math.round(frameIndex));
  }

  /**
   * Pre-decodes a window of frames around the current position so they are ready in VRAM
   */
  warmupWindow(startFrame, count = 10, step = 1) {
    const end = Math.max(1, Math.min(this.totalFrames, startFrame + count * step));
    const low = Math.min(startFrame, end);
    const high = Math.max(startFrame, end);
    for (let i = low; i <= high; i++) {
      if (!this.images.has(i) && !this.pendingLoads.has(i)) {
        this.loadFrame(i, 'low');
      }
    }
  }

  loadFrame(frameIndex, priority = 'high') {
    const index = Math.min(Math.max(1, Math.round(frameIndex)), this.totalFrames);
    if (this.images.has(index)) {
      const image = this.images.get(index);
      // Move to end of Map for LRU freshness
      this.images.delete(index);
      this.images.set(index, image);
      return Promise.resolve(image);
    }

    if (this.pendingLoads.has(index)) {
      if (priority === 'high' && this.pendingImages.has(index)) {
        this.pendingImages.get(index).fetchPriority = 'high';
      }
      return this.pendingLoads.get(index);
    }

    let image;
    const loadPromise = new Promise((resolve) => {
      image = new Image();
      image.decoding = 'async';
      image.fetchPriority = priority;

      image.onload = async () => {
        try {
          await image.decode();
          this.images.set(index, image);
          // LRU eviction: keep at most maxCachedFrames in active decoded memory
          while (this.images.size > this.maxCachedFrames) {
            const oldestKey = this.images.keys().next().value;
            this.images.delete(oldestKey);
          }
          resolve(image);
        } catch {
          resolve(image);
        }
      };

      image.onerror = () => resolve(null);
      // Use instant local blob URL if available, otherwise direct static URL
      image.src = this.blobUrls.get(index) || getFrameUrl(index);
    }).finally(() => {
      this.pendingLoads.delete(index);
      this.pendingImages.delete(index);
    });

    this.pendingLoads.set(index, loadPromise);
    this.pendingImages.set(index, image);
    return loadPromise;
  }

  /**
   * Downloads all compressed frames into in-memory Blobs (~32.5MB total).
   * Guarantees 0ms network latency during animation on live mobile devices.
   */
  async preloadAllFrames({ concurrency = 8, onProgress } = {}) {
    const total = this.totalFrames;
    let next = 1;
    let loaded = 0;
    let failedCount = 0;

    const workerCount = Math.max(1, Math.min(Math.floor(concurrency), total));

    const fetchWorker = async () => {
      while (next <= total) {
        const frame = next++;
        const url = getFrameUrl(frame);

        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          this.blobUrls.set(frame, blobUrl);
        } catch (err) {
          console.warn(`Failed to preload blob for frame ${frame}:`, err);
          failedCount++;
        }

        loaded++;
        onProgress?.(loaded, total, frame);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => fetchWorker()));

    // Warm up the very first frame into decoded bitmap memory
    await this.loadFrame(1, 'high');

    if (failedCount > 0) {
      throw new Error(`Could not load ${failedCount} of ${total} animation frames.`);
    }
  }

  // Backwards compatibility alias
  async preloadRange(from, to, options = {}) {
    return this.preloadAllFrames(options);
  }
}
