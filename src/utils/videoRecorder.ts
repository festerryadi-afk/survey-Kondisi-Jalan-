import { DefectItem, SurveyVideo } from '../types';
import { drawWatermark, formatSTA } from './geo';
import { triggerBlobDownloadAsync } from './nativeDownload';

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
      const blobStored = await new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({ blob, mimeType: cleanMime, extension }, videoId);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });

      // Fallback untuk Android 8.1 WebView lama yang menolak penyimpanan objek Blob langsung ke IndexedDB
      if (!blobStored) {
        const buffer = await blob.arrayBuffer();
        await new Promise<void>((resolve) => {
          try {
            const tx2 = db.transaction(STORE_NAME, 'readwrite');
            tx2.objectStore(STORE_NAME).put({ buffer, mimeType: cleanMime, extension }, videoId);
            tx2.oncomplete = () => resolve();
            tx2.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      }
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
    const record = await new Promise<{
      blob?: Blob;
      buffer?: ArrayBuffer;
      mimeType?: string;
      extension?: string;
    } | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(videoId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (record) {
      const mimeType = record.mimeType || (record.blob && record.blob.type) || 'video/webm';
      const extension = record.extension || resolveVideoExtension(mimeType);
      let resolvedBlob: Blob | null = null;
      if (record.blob instanceof Blob && record.blob.size > 0) {
        resolvedBlob = record.blob;
      } else if (record.buffer instanceof ArrayBuffer && record.buffer.byteLength > 0) {
        resolvedBlob = new Blob([record.buffer], { type: mimeType });
      }
      if (resolvedBlob && resolvedBlob.size > 0) {
        const blobUrl = URL.createObjectURL(resolvedBlob);
        const entry: StoredVideoEntry = { blob: resolvedBlob, blobUrl, mimeType, extension };
        videoMemoryCache.set(videoId, entry);
        return entry;
      }
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
  // Prioritaskan WebM VP8 (hardware MediaCodec paling stabil & mulus untuk canvas.captureStream
  // realtime di Android WebView & desktop), baru MP4 H.264 (untuk iOS/Safari), lalu VP9/H264 fallback.
  const candidates = [
    'video/webm;codecs=vp8',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=h264',
    'video/webm',
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
  options: {
    stabilizeCrop?: boolean;
    enhanceLighting?: boolean;
    enhanceSharpness?: boolean;
  } = {}
) {
  const srcWidth = source.videoWidth || 1280;
  const srcHeight = source.videoHeight || 720;
  if (srcWidth === 0 || srcHeight === 0) return;

  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;
  const zoomScale = options.stabilizeCrop ? 1.04 : 1;

  let drawW = targetWidth * zoomScale;
  let drawH = targetHeight * zoomScale;

  if (srcRatio > targetRatio) {
    drawH = targetHeight * zoomScale;
    drawW = drawH * srcRatio;
  } else {
    drawW = targetWidth * zoomScale;
    drawH = drawW / srcRatio;
  }

  const intDrawW = Math.round(drawW);
  const intDrawH = Math.round(drawH);
  const offsetX = Math.round((targetWidth - intDrawW) / 2);
  const offsetY = Math.round((targetHeight - intDrawH) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const applyLight = options.enhanceLighting !== false;
  const applySharpContrast = options.enhanceSharpness !== false;
  const supportsFilter = 'filter' in ctx;

  if (supportsFilter && (applyLight || applySharpContrast)) {
    const parts: string[] = [];
    if (applyLight) parts.push('brightness(1.06)', 'saturate(1.06)');
    if (applySharpContrast) parts.push('contrast(1.09)');
    ctx.filter = parts.join(' ');
    ctx.drawImage(source, offsetX, offsetY, intDrawW, intDrawH);
    ctx.filter = 'none';
  } else {
    ctx.drawImage(source, offsetX, offsetY, intDrawW, intDrawH);
  }
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
    const stripHeight = Math.max(84, Math.round(h * 0.24));
    const key = `${w}x${h}|${metadata.nomorRuas}|${metadata.namaRuas}|${metadata.staText}|${metadata.lat.toFixed(5)}|${metadata.lng.toFixed(5)}`;

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
      drawWatermark(this.stripCtx, w, h, metadata, { fastNoBlur: true });
      this.stripCtx.restore();
      this.lastKey = key;
    }

    if (this.stripCanvas) {
      const prevSmooth = targetCtx.imageSmoothingEnabled;
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.drawImage(this.stripCanvas, 0, h - stripHeight);
      targetCtx.imageSmoothingEnabled = prevSmooth;
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
  private cleanSnapCanvas: HTMLCanvasElement | null = null;
  private cleanSnapCtx: CanvasRenderingContext2D | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = 'video/webm';
  private rafId: number | null = null;
  private vfcId: number | null = null;
  private vfcVideo: (HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number) => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  }) | null = null;
  private captureTrack: (MediaStreamTrack & { requestFrame?: () => void }) | null = null;
  private supportsManualRequestFrame = false;
  private backgroundTimerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private phase = 0;
  private lastDrawMs = 0;
  private lastAnimMs = 0;
  private renderedFrameCount = 0;
  private thumbnailUrl = '';
  private watermarkCache = new WatermarkStripCache();
  private getSnapshot: () => LiveTelemetrySnapshot;
  private getVideoEl: () => HTMLVideoElement | null;
  private isCameraActive: () => boolean;
  private getStabilizeCrop: () => boolean;
  private getEnhanceVideo: () => { lighting: boolean; sharpness: boolean };
  private readonly targetFps: number;
  private readonly rafMinGapMs: number;
  private readonly videoBitsPerSecond: number;

  constructor(options: {
    getSnapshot: () => LiveTelemetrySnapshot;
    getVideoEl: () => HTMLVideoElement | null;
    isCameraActive: () => boolean;
    getStabilizeCrop?: () => boolean;
    getEnhanceVideo?: () => { lighting: boolean; sharpness: boolean };
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
    // JANGAN pakai desynchronized:true di kanvas offscreen captureStream karena memotong barrier sinkronisasi encoder WebView
    this.ctx =
      this.canvas.getContext('2d', { alpha: false }) ||
      this.canvas.getContext('2d');
    this.getSnapshot = options.getSnapshot;
    this.getVideoEl = options.getVideoEl;
    this.isCameraActive = options.isCameraActive;
    this.getStabilizeCrop = options.getStabilizeCrop ?? (() => false);
    this.getEnhanceVideo = options.getEnhanceVideo ?? (() => ({ lighting: true, sharpness: true }));
    const rawFps = options.targetFps ?? 30;
    // Selaraskan FPS ke pembagi 60Hz (30fps atau 20fps) agar bebas judder 2:3 pulldown di rAF
    this.targetFps = rawFps <= 20 ? 20 : 30;
    this.rafMinGapMs = this.targetFps <= 20 ? 44 : 27;
    this.videoBitsPerSecond = options.videoBitsPerSecond ?? 2_000_000;
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
   * Mengambil salinan frame bersih (tanpa watermark) secara malas (lazy/on-demand) hanya saat
   * dibutuhkan (tiap 100m atau pindai AI) sehingga tidak menggandakan salinan kanvas setiap frame.
   */
  async grabCleanRawBitmap(): Promise<ImageBitmap | null> {
    if (!this.running || typeof createImageBitmap !== 'function') return null;
    const videoEl = this.getVideoEl();
    if (videoEl && this.isCameraActive() && videoEl.readyState >= 2) {
      try {
        return await createImageBitmap(videoEl);
      } catch {
        // lanjut fallback kanvas bersih sementara
      }
    }
    try {
      const w = this.canvas.width || 640;
      const h = this.canvas.height || 360;
      if (!this.cleanSnapCanvas || this.cleanSnapCanvas.width !== w || this.cleanSnapCanvas.height !== h) {
        this.cleanSnapCanvas = document.createElement('canvas');
        this.cleanSnapCanvas.width = w;
        this.cleanSnapCanvas.height = h;
        this.cleanSnapCtx = this.cleanSnapCanvas.getContext('2d', { alpha: false });
      }
      if (!this.cleanSnapCtx) return null;
      const snap = this.getSnapshot();
      drawRoadSimulationVideoFrame(this.cleanSnapCtx, w, h, this.phase, snap.defects);
      return await createImageBitmap(this.cleanSnapCanvas);
    } catch {
      return null;
    }
  }

  private renderOneFrame(nowMs: number) {
    if (!this.running || this.paused || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dtSec =
      this.lastAnimMs > 0
        ? Math.min(0.25, Math.max(0.001, (nowMs - this.lastAnimMs) / 1000))
        : 1 / this.targetFps;
    this.lastAnimMs = nowMs;
    this.lastDrawMs = nowMs;
    this.renderedFrameCount++;

    const snap = this.getSnapshot();
    const videoEl = this.getVideoEl();

    if (videoEl && this.isCameraActive() && videoEl.readyState >= 2) {
      const enhance = this.getEnhanceVideo();
      drawVideoSourceCoverFast(this.ctx, videoEl, w, h, {
        stabilizeCrop: this.getStabilizeCrop(),
        enhanceLighting: enhance.lighting,
        enhanceSharpness: enhance.sharpness,
      });
    } else {
      const stepSpeed = snap.speedKmh > 0 ? Math.max(3, snap.speedKmh) : 0;
      if (stepSpeed > 0) {
        // Skala kecepatan halus berbasis delta-time (phase/detik) agar sinkron realtime 1:1
        this.phase = (this.phase + (stepSpeed / 40) * 0.65 * dtSec) % 1;
      }
      drawRoadSimulationVideoFrame(this.ctx, w, h, this.phase, snap.defects);
    }

    // Watermark di kiri bawah tanpa frame (di-cache & fastNoBlur agar tidak ada beban CPU per frame)
    this.watermarkCache.draw(this.ctx, w, h, {
      nomorRuas: snap.nomorRuas,
      namaRuas: snap.namaRuas,
      staText: formatSTA(snap.sta),
      lat: snap.lat,
      lng: snap.lng,
    });

    // Dorong frame tepat setelah kanvas selesai digambar (1 frame draw = 1 frame MediaRecorder realtime)
    if (this.supportsManualRequestFrame && this.captureTrack?.requestFrame) {
      try {
        this.captureTrack.requestFrame();
      } catch {
        // ignore if track stopped
      }
    }

    // Tunda pembuatan thumbnail JPEG beberapa frame setelah start agar header muxer mulus
    if (!this.thumbnailUrl && this.renderedFrameCount >= 18) {
      this.thumbnailUrl = createCompactVideoThumbnail(this.canvas);
    }
  }

  private scheduleNextRender() {
    if (!this.running) return;
    const videoEl = this.getVideoEl() as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: (now: number) => void) => number;
        })
      | null;

    if (
      videoEl &&
      this.isCameraActive() &&
      typeof videoEl.requestVideoFrameCallback === 'function'
    ) {
      this.vfcVideo = videoEl;
      this.vfcId = videoEl.requestVideoFrameCallback((nowMs) => {
        this.vfcId = null;
        if (!this.running) return;
        // Selalu gambar setiap frame baru dari kamera (24fps atau 30fps); hanya batasi >40fps
        const minCameraGapMs = this.targetFps <= 20 ? 44 : 22;
        if (!this.paused && (this.lastDrawMs === 0 || nowMs - this.lastDrawMs >= minCameraGapMs)) {
          this.renderOneFrame(nowMs);
        }
        this.scheduleNextRender();
      });
      return;
    }

    this.rafId = requestAnimationFrame(this.drawLoop);
  }

  private drawLoop = (nowMs: number) => {
    if (!this.running) return;
    if (!this.paused && (this.lastDrawMs === 0 || nowMs - this.lastDrawMs >= this.rafMinGapMs)) {
      this.renderOneFrame(nowMs);
    }
    this.scheduleNextRender();
  };

  private stopLoops() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (
      this.vfcId !== null &&
      this.vfcVideo &&
      typeof this.vfcVideo.cancelVideoFrameCallback === 'function'
    ) {
      try {
        this.vfcVideo.cancelVideoFrameCallback(this.vfcId);
      } catch {
        // ignore
      }
    }
    this.vfcId = null;
    this.vfcVideo = null;
    if (this.backgroundTimerId !== null) {
      clearInterval(this.backgroundTimerId);
      this.backgroundTimerId = null;
    }
  }

  start(): boolean {
    if (!this.ctx || typeof MediaRecorder === 'undefined') {
      return false;
    }

    this.chunks = [];
    this.thumbnailUrl = '';
    this.renderedFrameCount = 0;
    this.lastDrawMs = 0;
    this.lastAnimMs = 0;
    this.paused = false;
    this.running = true;

    const canvasAny = this.canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
      mozCaptureStream?: (fps?: number) => MediaStream;
    };

    let stream: MediaStream | null = null;
    this.captureTrack = null;
    this.supportsManualRequestFrame = false;
    try {
      if (canvasAny.captureStream) {
        // Mode push frame manual (0) + requestFrame() memastikan 1 frame gambar = 1 frame video realtime
        // tanpa polling ganda atau frame duplikat/tersendat di Android WebView
        const testStream = canvasAny.captureStream(0);
        const track = testStream.getVideoTracks()[0] as
          | (MediaStreamTrack & { requestFrame?: () => void })
          | undefined;
        if (track && typeof track.requestFrame === 'function') {
          stream = testStream;
          this.captureTrack = track;
          this.supportsManualRequestFrame = true;
        } else {
          try {
            testStream.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
          stream = canvasAny.captureStream(this.targetFps);
        }
      } else if (canvasAny.mozCaptureStream) {
        stream = canvasAny.mozCaptureStream(this.targetFps);
      }
    } catch {
      stream = null;
    }

    if (!stream) {
      this.running = false;
      this.stopLoops();
      return false;
    }

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
        this.supportsManualRequestFrame = false;
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

    this.mediaRecorder.onerror = () => {
      // Abaikan error minor codec tanpa menjatuhkan UI; chunks yang sudah ada tetap aman
    };

    try {
      // Timeslice 500ms menjaga flush ring-buffer encoder tetap ringan & stabil di HP Android RAM 3GB
      this.mediaRecorder.start(500);
    } catch {
      this.running = false;
      this.mediaRecorder = null;
      this.stopLoops();
      this.captureTrack = null;
      this.supportsManualRequestFrame = false;
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      return false;
    }

    // Gambar & dorong frame pertama SETELAH MediaRecorder.start() agar timestamp frame 0 sinkron
    this.renderOneFrame(performance.now());
    this.scheduleNextRender();

    // Penjaga stall (baik saat background maupun bila callback kamera sempat tertahan >250ms)
    this.backgroundTimerId = setInterval(() => {
      if (!this.running || this.paused) return;
      const now = performance.now();
      const stallThresholdMs = typeof document !== 'undefined' && document.hidden ? 150 : 280;
      if (now - this.lastDrawMs >= stallThresholdMs) {
        this.renderOneFrame(now);
      }
    }, 200);

    return true;
  }

  async stop(videoId: string): Promise<{
    entry: StoredVideoEntry | null;
    thumbnailUrl: string;
  }> {
    if (!this.thumbnailUrl && this.canvas.width > 0) {
      this.thumbnailUrl = createCompactVideoThumbnail(this.canvas);
    }
    this.running = false;
    this.paused = false;
    this.stopLoops();
    this.captureTrack = null;
    this.supportsManualRequestFrame = false;

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
    if (this.cleanSnapCanvas) {
      this.cleanSnapCanvas.width = 0;
      this.cleanSnapCanvas.height = 0;
      this.cleanSnapCanvas = null;
      this.cleanSnapCtx = null;
    }

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
  canvas.width = 854;
  canvas.height = 480;
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
  try {
    stream = canvasAny.captureStream(30);
  } catch {
    return null;
  }

  const bestMime = getBestSupportedVideoMimeType();
  const mimeType = bestMime || 'video/webm';
  let recorder: MediaRecorder;

  try {
    recorder = bestMime
      ? new MediaRecorder(stream, { mimeType: bestMime, videoBitsPerSecond: 1_500_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 1_500_000 });
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
  const totalFrames = 90; // 3 detik mulus pada 30fps (1-in-2 vsync)
  const minGapMs = 27;

  try {
    recorder.start(500);
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
      if (lastMs === 0 || nowMs - lastMs >= minGapMs) {
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
}): Promise<{ filename: string; location?: string }> {
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
    const result = await triggerBlobDownloadAsync(entry.blob, filename);
    if (!result.ok) {
      throw new Error(result.error || 'Gagal menyimpan berkas video ke penyimpanan perangkat.');
    }
    return { filename, location: result.location };
  }

  throw new Error('Berkas video tidak tersedia untuk diunduh.');
}
