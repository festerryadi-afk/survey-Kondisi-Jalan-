import { DefectItem, SurveyVideo } from '../types';
import { drawWatermark, formatSTA } from './geo';

export interface StoredVideoEntry {
  blob: Blob;
  blobUrl: string;
  mimeType: string;
  extension: string;
}

function resolveVideoExtension(mimeType: string, filenameHint?: string): string {
  const lowerHint = (filenameHint || '').toLowerCase();
  if (lowerHint.endsWith('.mp4')) return 'mp4';
  if (lowerHint.endsWith('.webm')) return 'webm';
  if (lowerHint.endsWith('.mov')) return 'mov';
  if (lowerHint.endsWith('.mpeg') || lowerHint.endsWith('.mpg')) return 'mpeg';

  const lowerMime = (mimeType || '').toLowerCase();
  if (lowerMime.includes('mp4')) return 'mp4';
  if (lowerMime.includes('quicktime')) return 'mov';
  if (lowerMime.includes('mpeg')) return 'mpeg';
  return 'webm';
}

const videoMemoryCache = new Map<string, StoredVideoEntry>();
const DB_NAME = 'mentawai_survey_videos_db';
const DB_VERSION = 2;
const STORE_NAME = 'videos';
const META_STORE_NAME = 'video_meta';
const META_LIST_KEY = 'survey_videos_list';

function openVideoDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(META_STORE_NAME)) {
          db.createObjectStore(META_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function createCompactVideoThumbnail(sourceCanvas: HTMLCanvasElement): string {
  try {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 480;
    thumbCanvas.height = 270;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.imageSmoothingEnabled = true;
      thumbCtx.imageSmoothingQuality = 'high';
      thumbCtx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.72);
      thumbCanvas.width = 0;
      thumbCanvas.height = 0;
      return dataUrl;
    }
    thumbCanvas.width = 0;
    thumbCanvas.height = 0;
  } catch {
    // ignore compact thumbnail fallback error
  }
  try {
    return sourceCanvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}

export async function saveVideoMetadataList(videos: SurveyVideo[]): Promise<void> {
  const db = await openVideoDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(META_STORE_NAME, 'readwrite');
      tx.objectStore(META_STORE_NAME).put(videos, META_LIST_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IndexedDB errors
  } finally {
    db.close();
  }
}

export async function loadVideoMetadataList(): Promise<SurveyVideo[] | null> {
  const db = await openVideoDB();
  if (!db) return null;
  try {
    const result = await new Promise<unknown>((resolve) => {
      const tx = db.transaction(META_STORE_NAME, 'readonly');
      const req = tx.objectStore(META_STORE_NAME).get(META_LIST_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return Array.isArray(result) ? (result as SurveyVideo[]) : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function saveVideoBlobToStorage(
  videoId: string,
  blob: Blob,
  mimeType: string,
  filenameHint?: string
): Promise<StoredVideoEntry> {
  const cleanMime = mimeType || blob.type || 'video/webm';
  const extension = resolveVideoExtension(cleanMime, filenameHint);
  const blobUrl = URL.createObjectURL(blob);
  const entry: StoredVideoEntry = { blob, blobUrl, mimeType: cleanMime, extension };
  videoMemoryCache.set(videoId, entry);

  const db = await openVideoDB();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ blob, mimeType: cleanMime, extension }, videoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore IndexedDB quota errors
    } finally {
      db.close();
    }
  }

  return entry;
}

export async function deleteVideoBlobFromStorage(videoId: string): Promise<void> {
  const cached = videoMemoryCache.get(videoId);
  if (cached) {
    try {
      URL.revokeObjectURL(cached.blobUrl);
    } catch {
      // ignore
    }
    videoMemoryCache.delete(videoId);
  }

  const db = await openVideoDB();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(videoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    } finally {
      db.close();
    }
  }
}

export async function getStoredVideoEntry(videoId: string): Promise<StoredVideoEntry | null> {
  const cached = videoMemoryCache.get(videoId);
  if (cached && cached.blob.size > 0) return cached;

  const db = await openVideoDB();
  if (!db) return null;

  try {
    const record = await new Promise<{ blob: Blob; mimeType?: string; extension?: string } | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(videoId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (record && record.blob instanceof Blob && record.blob.size > 0) {
      const mimeType = record.mimeType || record.blob.type || 'video/webm';
      const extension = record.extension || resolveVideoExtension(mimeType);
      const blobUrl = URL.createObjectURL(record.blob);
      const entry: StoredVideoEntry = { blob: record.blob, blobUrl, mimeType, extension };
      videoMemoryCache.set(videoId, entry);
      return entry;
    }
  } catch {
    // ignore
  } finally {
    db.close();
  }

  return null;
}

export function getBestSupportedVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // Prioritaskan WebM VP8/VP9 di Chromium/Android agar encoding real-time kanvas mulus 30fps tanpa frame drop,
  // sementara Safari/iOS otomatis menggunakan MP4/H.264 native.
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch {
      // continue
    }
  }
  return '';
}

function drawVideoSourceCoverFast(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number,
  stabilizeCrop = false
) {
  const srcWidth = source.videoWidth || 1280;
  const srcHeight = source.videoHeight || 720;
  if (srcWidth === 0 || srcHeight === 0) return;

  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;
  const zoomScale = stabilizeCrop ? 1.06 : 1;

  let drawW = targetWidth * zoomScale;
  let drawH = targetHeight * zoomScale;

  if (srcRatio > targetRatio) {
    drawH = targetHeight * zoomScale;
    drawW = drawH * srcRatio;
  } else {
    drawW = targetWidth * zoomScale;
    drawH = drawW / srcRatio;
  }

  const offsetX = (targetWidth - drawW) / 2;
  const offsetY = (targetHeight - drawH) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

/**
 * Cache latar belakang statis jalan (langit, perbukitan, aspal, bahu jalan) agar tidak
 * membuat ulang gradient dan bezier path setiap frame.
 */
const roadBackdropCache = new Map<string, HTMLCanvasElement>();

function getOrCreateRoadBackdrop(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${w}x${h}`;
  const cached = roadBackdropCache.get(key);
  if (cached) return cached;

  const bg = document.createElement('canvas');
  bg.width = w;
  bg.height = h;
  const bCtx = bg.getContext('2d', { alpha: false });
  if (!bCtx) return null;

  // Sky
  const skyGrad = bCtx.createLinearGradient(0, 0, 0, h * 0.45);
  skyGrad.addColorStop(0, '#0369a1');
  skyGrad.addColorStop(1, '#7dd3fc');
  bCtx.fillStyle = skyGrad;
  bCtx.fillRect(0, 0, w, h * 0.45);

  // Tropical hills (Mentawai)
  bCtx.fillStyle = '#15803d';
  bCtx.beginPath();
  bCtx.moveTo(0, h * 0.45);
  bCtx.bezierCurveTo(w * 0.25, h * 0.38, w * 0.4, h * 0.42, w * 0.6, h * 0.37);
  bCtx.bezierCurveTo(w * 0.8, h * 0.43, w * 0.9, h * 0.39, w, h * 0.45);
  bCtx.lineTo(w, h);
  bCtx.lineTo(0, h);
  bCtx.fill();

  // Road asphalt surface
  bCtx.fillStyle = '#334155';
  bCtx.beginPath();
  bCtx.moveTo(w * 0.38, h * 0.45);
  bCtx.lineTo(w * 0.62, h * 0.45);
  bCtx.lineTo(w * 0.96, h);
  bCtx.lineTo(w * 0.04, h);
  bCtx.closePath();
  bCtx.fill();

  // Road shoulders
  bCtx.strokeStyle = '#ca8a04';
  bCtx.lineWidth = 5;
  bCtx.beginPath();
  bCtx.moveTo(w * 0.38, h * 0.45);
  bCtx.lineTo(w * 0.04, h);
  bCtx.stroke();

  bCtx.beginPath();
  bCtx.moveTo(w * 0.62, h * 0.45);
  bCtx.lineTo(w * 0.96, h);
  bCtx.stroke();

  roadBackdropCache.set(key, bg);
  return bg;
}

/**
 * Cache strip watermark offscreen agar shadowBlur/strokeText hanya dihitung ulang
 * saat teks koordinat/STA berubah (bukan di setiap frame video 30fps).
 */
class WatermarkStripCache {
  private stripCanvas: HTMLCanvasElement | null = null;
  private stripCtx: CanvasRenderingContext2D | null = null;
  private lastKey = '';
  private stripHeight = 0;

  draw(
    targetCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    metadata: {
      nomorRuas: string;
      namaRuas: string;
      staText: string;
      lat: number;
      lng: number;
    }
  ) {
    const stripHeight = Math.max(120, Math.round(h * 0.22));
    const key = `${w}x${h}|${metadata.nomorRuas}|${metadata.namaRuas}|${metadata.staText}|${metadata.lat.toFixed(6)}|${metadata.lng.toFixed(6)}`;

    if (!this.stripCanvas || this.stripCanvas.width !== w || this.stripHeight !== stripHeight) {
      this.stripCanvas = document.createElement('canvas');
      this.stripCanvas.width = w;
      this.stripCanvas.height = stripHeight;
      this.stripCtx = this.stripCanvas.getContext('2d');
      this.stripHeight = stripHeight;
      this.lastKey = '';
    }

    if (this.stripCtx && this.lastKey !== key) {
      this.stripCtx.clearRect(0, 0, w, stripHeight);
      this.stripCtx.save();
      this.stripCtx.translate(0, -(h - stripHeight));
      drawWatermark(this.stripCtx, w, h, metadata);
      this.stripCtx.restore();
      this.lastKey = key;
    }

    if (this.stripCanvas) {
      targetCtx.drawImage(this.stripCanvas, 0, h - stripHeight);
    }
  }

  dispose() {
    if (this.stripCanvas) {
      this.stripCanvas.width = 0;
      this.stripCanvas.height = 0;
      this.stripCanvas = null;
      this.stripCtx = null;
    }
    this.lastKey = '';
  }
}

export function drawRoadSimulationVideoFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  phase: number,
  defects: DefectItem[],
  drawDefectBoxes = false
) {
  const bg = getOrCreateRoadBackdrop(w, h);
  if (bg) {
    ctx.drawImage(bg, 0, 0);
  } else {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, w, h);
  }

  // Garis marka putus-putus perspektif kontinu (phase 0..1) tanpa lompatan saat modulo wrap
  const normPhase = ((phase % 1) + 1) % 1;
  const horizonY = h * 0.455;
  const roadSpan = h - horizonY;
  const numDashes = 7;

  ctx.strokeStyle = '#f8fafc';
  ctx.lineCap = 'round';
  for (let i = 0; i < numDashes; i++) {
    const t0 = (i + normPhase) / numDashes;
    const t1 = Math.min(1.06, (i + normPhase + 0.46) / numDashes);
    if (t0 >= 1) continue;
    const y0 = horizonY + roadSpan * Math.pow(t0, 1.85);
    const y1 = horizonY + roadSpan * Math.pow(t1, 1.85);
    if (y1 - y0 < 1.5) continue;

    ctx.lineWidth = 2.5 + 5.5 * Math.pow(t0, 1.4);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, y0);
    ctx.lineTo(w * 0.5, Math.min(h + 12, y1));
    ctx.stroke();
  }

  for (const d of defects) {
    if (d.type.includes('Lubang')) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(w * 0.48, h * 0.68, 65, 35, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = d.severity === 'Berat' ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();

      if (drawDefectBoxes) {
        ctx.lineWidth = 2.5;
        ctx.strokeRect(w * 0.4, h * 0.62, 130, 70);
      }
    } else if (d.type.includes('Retak')) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.64);
      ctx.lineTo(w * 0.52, h * 0.68);
      ctx.lineTo(w * 0.46, h * 0.74);
      ctx.lineTo(w * 0.58, h * 0.76);
      ctx.stroke();

      if (drawDefectBoxes) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(w * 0.38, h * 0.61, 150, 75);
      }
    }
  }
}

export interface LiveTelemetrySnapshot {
  nomorRuas: string;
  namaRuas: string;
  sta: number;
  lat: number;
  lng: number;
  speedKmh: number;
  defects: DefectItem[];
}

export class RoadSurveyRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private rawCanvas: HTMLCanvasElement;
  private rawCtx: CanvasRenderingContext2D | null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = 'video/webm';
  private rafId: number | null = null;
  private fallbackTimerId: ReturnType<typeof setInterval> | null = null;
  private captureTrack: (MediaStreamTrack & { requestFrame?: () => void }) | null = null;
  private running = false;
  private paused = false;
  private phase = 0;
  private lastDrawMs = 0;
  private lastAnimMs = 0;
  private thumbnailUrl = '';
  private watermarkCache = new WatermarkStripCache();
  private getSnapshot: () => LiveTelemetrySnapshot;
  private getVideoEl: () => HTMLVideoElement | null;
  private isCameraActive: () => boolean;
  private getStabilizeCrop: () => boolean;
  private readonly targetFps: number;
  private readonly targetFrameIntervalMs: number;
  private readonly videoBitsPerSecond: number;

  constructor(options: {
    getSnapshot: () => LiveTelemetrySnapshot;
    getVideoEl: () => HTMLVideoElement | null;
    isCameraActive: () => boolean;
    getStabilizeCrop?: () => boolean;
    width?: number;
    height?: number;
    targetFps?: number;
    videoBitsPerSecond?: number;
  }) {
    const w = options.width ?? 1280;
    const h = options.height ?? 720;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx =
      this.canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
      this.canvas.getContext('2d', { alpha: false }) ||
      this.canvas.getContext('2d');
    this.rawCanvas = document.createElement('canvas');
    this.rawCanvas.width = w;
    this.rawCanvas.height = h;
    this.rawCtx =
      this.rawCanvas.getContext('2d', { alpha: false, desynchronized: true }) ||
      this.rawCanvas.getContext('2d', { alpha: false }) ||
      this.rawCanvas.getContext('2d');
    this.getSnapshot = options.getSnapshot;
    this.getVideoEl = options.getVideoEl;
    this.isCameraActive = options.isCameraActive;
    this.getStabilizeCrop = options.getStabilizeCrop ?? (() => false);
    this.targetFps = options.targetFps ?? 30;
    this.targetFrameIntervalMs = 1000 / this.targetFps;
    this.videoBitsPerSecond = options.videoBitsPerSecond ?? 3_000_000;
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.pause();
      } catch {
        // ignore if browser does not support MediaRecorder.pause()
      }
    }
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastAnimMs = performance.now();
    this.lastDrawMs = 0;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
      } catch {
        // ignore if browser does not support MediaRecorder.resume()
      }
    }
    this.renderOneFrame(performance.now());
  }

  /**
   * Mengambil salinan frame bersih (tanpa watermark) langsung dari buffer kanvas 2D perekaman
   * sehingga tidak menyentuh dekoder <video> maupun shutter hardware Camera2 Android.
   */
  async grabCleanRawBitmap(): Promise<ImageBitmap | null> {
    if (!this.running || !this.rawCanvas || this.rawCanvas.width === 0) return null;
    if (typeof createImageBitmap !== 'function') return null;
    try {
      return await createImageBitmap(this.rawCanvas);
    } catch {
      return null;
    }
  }

  private renderOneFrame(nowMs: number) {
    if (!this.running || this.paused || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dtSec = this.lastAnimMs > 0 ? Math.min(0.1, Math.max(0.001, (nowMs - this.lastAnimMs) / 1000)) : 1 / this.targetFps;
    this.lastAnimMs = nowMs;
    this.lastDrawMs = nowMs;

    const snap = this.getSnapshot();
    const videoEl = this.getVideoEl();
    const drawTarget = this.rawCtx || this.ctx;

    if (videoEl && this.isCameraActive() && videoEl.readyState >= 2) {
      drawVideoSourceCoverFast(drawTarget, videoEl, w, h, this.getStabilizeCrop());
    } else {
      const stepSpeed = snap.speedKmh > 0 ? Math.max(3, snap.speedKmh) : 0;
      if (stepSpeed > 0) {
        // Skala kecepatan halus berbasis delta-time (phase/detik)
        this.phase = (this.phase + (stepSpeed / 40) * 0.65 * dtSec) % 1;
      }
      drawRoadSimulationVideoFrame(drawTarget, w, h, this.phase, snap.defects);
    }

    if (this.rawCtx) {
      this.ctx.drawImage(this.rawCanvas, 0, 0);
    }

    // Watermark di kiri bawah tanpa frame (di-cache agar tidak memicu shadowBlur per frame)
    this.watermarkCache.draw(this.ctx, w, h, {
      nomorRuas: snap.nomorRuas,
      namaRuas: snap.namaRuas,
      staText: formatSTA(snap.sta),
      lat: snap.lat,
      lng: snap.lng,
    });

    if (!this.thumbnailUrl) {
      this.thumbnailUrl = createCompactVideoThumbnail(this.canvas);
    }

    if (this.captureTrack && typeof this.captureTrack.requestFrame === 'function') {
      try {
        this.captureTrack.requestFrame();
      } catch {
        // ignore requestFrame error
      }
    }
  }

  private drawLoop = (nowMs: number) => {
    if (!this.running) return;
    if (!this.paused && nowMs - this.lastDrawMs >= this.targetFrameIntervalMs - 2) {
      this.renderOneFrame(nowMs);
    }
    this.rafId = requestAnimationFrame(this.drawLoop);
  };

  private stopLoops() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.fallbackTimerId !== null) {
      clearInterval(this.fallbackTimerId);
      this.fallbackTimerId = null;
    }
  }

  start(): boolean {
    if (!this.ctx || typeof MediaRecorder === 'undefined') {
      return false;
    }

    this.chunks = [];
    this.thumbnailUrl = '';
    this.lastDrawMs = 0;
    this.lastAnimMs = 0;
    this.paused = false;
    this.running = true;

    const canvasAny = this.canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
      mozCaptureStream?: (fps?: number) => MediaStream;
    };

    // Gunakan captureStream(0) + requestFrame() jika didukung agar tiap frame terkirim presisi 30fps
    // tanpa tearing/duplikasi, fallback ke captureStream(30).
    let stream: MediaStream | null = null;
    if (canvasAny.captureStream) {
      try {
        const probeStream = canvasAny.captureStream(0);
        const probeTrack = probeStream.getVideoTracks()[0] as
          | (MediaStreamTrack & { requestFrame?: () => void })
          | undefined;
        if (probeTrack && typeof probeTrack.requestFrame === 'function') {
          stream = probeStream;
          this.captureTrack = probeTrack;
        } else {
          probeStream.getTracks().forEach((t) => t.stop());
          stream = canvasAny.captureStream(this.targetFps);
          this.captureTrack = null;
        }
      } catch {
        stream = canvasAny.captureStream(this.targetFps);
        this.captureTrack = null;
      }
    } else if (canvasAny.mozCaptureStream) {
      stream = canvasAny.mozCaptureStream(this.targetFps);
      this.captureTrack = null;
    }

    if (!stream) {
      this.running = false;
      this.stopLoops();
      return false;
    }

    this.renderOneFrame(performance.now());

    const bestMime = getBestSupportedVideoMimeType();
    this.mimeType = bestMime || 'video/webm';

    try {
      this.mediaRecorder = bestMime
        ? new MediaRecorder(stream, {
            mimeType: bestMime,
            videoBitsPerSecond: this.videoBitsPerSecond,
          })
        : new MediaRecorder(stream, {
            videoBitsPerSecond: this.videoBitsPerSecond,
          });
    } catch {
      try {
        this.mediaRecorder = new MediaRecorder(stream);
        this.mimeType = this.mediaRecorder.mimeType || 'video/webm';
      } catch {
        this.running = false;
        this.stopLoops();
        this.captureTrack = null;
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    try {
      // Timeslice 1000ms mengurangi beban flush muxer agar encoding tetap mulus
      this.mediaRecorder.start(1000);
    } catch {
      this.running = false;
      this.mediaRecorder = null;
      this.stopLoops();
      this.captureTrack = null;
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      return false;
    }

    this.rafId = requestAnimationFrame(this.drawLoop);
    // Penjaga bila tab sempat ter-throttle agar frame stream tetap mengalir konsisten 30fps
    this.fallbackTimerId = setInterval(() => {
      if (!this.running || this.paused) return;
      const now = performance.now();
      if (now - this.lastDrawMs >= this.targetFrameIntervalMs * 1.4) {
        this.renderOneFrame(now);
      }
    }, 34);

    return true;
  }

  async stop(videoId: string): Promise<{
    entry: StoredVideoEntry | null;
    thumbnailUrl: string;
  }> {
    this.running = false;
    this.paused = false;
    this.stopLoops();
    this.captureTrack = null;

    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;

    if (!recorder || recorder.state === 'inactive') {
      this.watermarkCache.dispose();
      return { entry: null, thumbnailUrl: this.thumbnailUrl };
    }

    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      recorder.onstop = done;
      recorder.onerror = done;
      try {
        if (recorder.state === 'recording' && typeof recorder.requestData === 'function') {
          recorder.requestData();
        }
      } catch {
        // ignore requestData error
      }
      try {
        recorder.stop();
      } catch {
        done();
      }
      setTimeout(done, 1500);
    });

    try {
      recorder.stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    this.watermarkCache.dispose();
    this.rawCanvas.width = 0;
    this.rawCanvas.height = 0;

    const actualType =
      this.chunks[0]?.type || recorder.mimeType || this.mimeType || 'video/webm';
    const blob = new Blob(this.chunks, { type: actualType });
    this.chunks = [];

    if (blob.size === 0) {
      return { entry: null, thumbnailUrl: this.thumbnailUrl };
    }

    const entry = await saveVideoBlobToStorage(videoId, blob, actualType);
    return { entry, thumbnailUrl: this.thumbnailUrl };
  }
}

/**
 * Membuat klip video jalan survei lokal (fallback bila video lama/eksternal tidak bisa dimuat)
 */
export async function generateFallbackRoadVideoEntry(video: {
  id: string;
  nomorRuas: string;
  ruasNama: string;
  startSta: number;
  endSta: number;
  thumbnailUrl?: string;
}): Promise<StoredVideoEntry | null> {
  const existing = await getStoredVideoEntry(video.id);
  if (existing) return existing;

  if (typeof MediaRecorder === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx =
    canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
    canvas.getContext('2d', { alpha: false }) ||
    canvas.getContext('2d');
  if (!ctx) return null;

  const canvasAny = canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (!canvasAny.captureStream) return null;

  let stream: MediaStream;
  let track: (MediaStreamTrack & { requestFrame?: () => void }) | null = null;
  try {
    const probeStream = canvasAny.captureStream(0);
    const probeTrack = probeStream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    if (probeTrack && typeof probeTrack.requestFrame === 'function') {
      stream = probeStream;
      track = probeTrack;
    } else {
      probeStream.getTracks().forEach((t) => t.stop());
      stream = canvasAny.captureStream(30);
    }
  } catch {
    try {
      stream = canvasAny.captureStream(30);
    } catch {
      return null;
    }
  }

  const bestMime = getBestSupportedVideoMimeType();
  const mimeType = bestMime || 'video/webm';
  let recorder: MediaRecorder;

  try {
    recorder = bestMime
      ? new MediaRecorder(stream, { mimeType: bestMime, videoBitsPerSecond: 2_200_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 2_200_000 });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      return null;
    }
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const watermarkCache = new WatermarkStripCache();
  let phase = 0;
  let frame = 0;
  const totalFrames = 90; // 3 detik mulus pada 30fps
  const frameIntervalMs = 1000 / 30;

  try {
    recorder.start(1000);
  } catch {
    watermarkCache.dispose();
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    return null;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    let rafId: number | null = null;
    let lastMs = 0;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resolve();
    };
    const safetyTimeout = setTimeout(finish, 6000);

    const step = (nowMs: number) => {
      if (resolved) return;
      if (lastMs === 0 || nowMs - lastMs >= frameIntervalMs - 2) {
        const dtSec = lastMs > 0 ? Math.min(0.08, (nowMs - lastMs) / 1000) : 1 / 30;
        lastMs = nowMs;

        phase = (phase + 0.6 * dtSec) % 1;
        const progress = frame / totalFrames;
        const sta = Math.round(video.startSta + (video.endSta - video.startSta) * progress);
        drawRoadSimulationVideoFrame(ctx, canvas.width, canvas.height, phase, []);
        watermarkCache.draw(ctx, canvas.width, canvas.height, {
          nomorRuas: video.nomorRuas,
          namaRuas: video.ruasNama,
          staText: formatSTA(sta),
          lat: -2.045,
          lng: 99.598,
        });

        if (track && typeof track.requestFrame === 'function') {
          try {
            track.requestFrame();
          } catch {
            // ignore
          }
        }

        frame++;
        if (frame >= totalFrames) {
          recorder.onstop = () => {
            clearTimeout(safetyTimeout);
            finish();
          };
          recorder.onerror = () => {
            clearTimeout(safetyTimeout);
            finish();
          };
          try {
            if (recorder.state === 'recording' && typeof recorder.requestData === 'function') {
              recorder.requestData();
            }
            recorder.stop();
          } catch {
            clearTimeout(safetyTimeout);
            finish();
          }
          return;
        }
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });

  watermarkCache.dispose();
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }

  const actualType = chunks[0]?.type || recorder.mimeType || mimeType;
  const blob = new Blob(chunks, { type: actualType });
  if (blob.size === 0) return null;

  return saveVideoBlobToStorage(video.id, blob, actualType);
}

/**
 * Mengambil URL video yang pasti bisa diputar di <video controls> (IndexedDB -> URL asli -> fallback klip lokal)
 */
export async function resolvePlayableVideoUrl(video: {
  id: string;
  videoUrl: string;
  nomorRuas: string;
  ruasNama: string;
  startSta: number;
  endSta: number;
  thumbnailUrl?: string;
}): Promise<string> {
  const stored = await getStoredVideoEntry(video.id);
  if (stored) return stored.blobUrl;

  if (video.videoUrl && video.videoUrl.startsWith('data:video/')) {
    return video.videoUrl;
  }

  // Untuk URL blob: yang kadaluwarsa atau URL eksternal, coba buat klip lokal bila perlu
  if (video.videoUrl && video.videoUrl.startsWith('http')) {
    return video.videoUrl;
  }

  const fallback = await generateFallbackRoadVideoEntry(video);
  return fallback ? fallback.blobUrl : video.videoUrl;
}

/**
 * Mengunduh file video secara aman (menghindari blokir cross-origin <a download> & menyesuaikan ekstensi kontainer)
 */
export async function downloadSurveyVideo(video: {
  id: string;
  videoUrl: string;
  nomorRuas: string;
  ruasNama: string;
  startSta: number;
  endSta: number;
  thumbnailUrl?: string;
}): Promise<{ filename: string }> {
  let entry = await getStoredVideoEntry(video.id);

  if (!entry && video.videoUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(video.videoUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const fetchedBlob = await res.blob();
        if (fetchedBlob.size > 0) {
          const mime = fetchedBlob.type || (video.videoUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4');
          entry = await saveVideoBlobToStorage(video.id, fetchedBlob, mime);
        }
      }
    } catch {
      // Cross-origin CORS / offline -> buat atau ambil klip lokal
    }
  }

  if (!entry) {
    entry = await generateFallbackRoadVideoEntry(video);
  }

  const safeRuas = (video.nomorRuas || '001').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (entry) {
    const filename = `DPUPR_MENTAWAI_Video_Ruas${safeRuas}_STA${video.startSta}-${video.endSta}.${entry.extension}`;
    const link = document.createElement('a');
    link.href = entry.blobUrl;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }, 150);
    return { filename };
  }

  throw new Error('Berkas video tidak tersedia untuk diunduh.');
}
