import type { DefectItem } from '../types';
import {
  PHOTO_3R_HD_HEIGHT,
  PHOTO_3R_HD_WIDTH,
  PHOTO_3R_STORAGE_HEIGHT,
  PHOTO_3R_STORAGE_WIDTH,
  drawImageCover3R,
  patchJpegDpi600,
} from './photo3r';
import { drawWatermark } from './geo';
import type {
  PhotoEncodeWorkerRequest,
  PhotoEncodeWorkerResponse,
} from './photoEncodeWorker';

let workerInstance: Worker | null = null;
let workerDisabled = false;
const pendingJobs = new Map<
  string,
  {
    resolve: (value: { hd600DpiDataUrl: string; storageDataUrl: string }) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function getOrCreateWorker(): Worker | null {
  if (workerDisabled) return null;
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    workerDisabled = true;
    return null;
  }
  if (workerInstance) return workerInstance;

  try {
    const w = new Worker(new URL('./photoEncodeWorker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (event: MessageEvent<PhotoEncodeWorkerResponse>) => {
      const msg = event.data;
      const job = pendingJobs.get(msg.id);
      if (!job) return;
      clearTimeout(job.timer);
      pendingJobs.delete(msg.id);
      if (msg.error || !msg.hd600DpiDataUrl || !msg.storageDataUrl) {
        job.reject(new Error(msg.error || 'Worker encode gagal'));
      } else {
        job.resolve({
          hd600DpiDataUrl: msg.hd600DpiDataUrl,
          storageDataUrl: msg.storageDataUrl,
        });
      }
    };
    w.onerror = () => {
      workerDisabled = true;
      workerInstance = null;
      pendingJobs.forEach((job, jobId) => {
        clearTimeout(job.timer);
        job.reject(new Error('Photo worker error'));
        pendingJobs.delete(jobId);
      });
    };
    workerInstance = w;
    return w;
  } catch {
    workerDisabled = true;
    return null;
  }
}

export async function runPhotoEncodeInWorker(
  params: {
    id: string;
    bitmap?: ImageBitmap;
    useSimulation?: boolean;
    defects?: DefectItem[];
    watermark: PhotoEncodeWorkerRequest['watermark'];
  }
): Promise<{ hd600DpiDataUrl: string; storageDataUrl: string } | null> {
  const worker = getOrCreateWorker();
  if (!worker) {
    if (params.bitmap) {
      try {
        params.bitmap.close();
      } catch {
        // ignore
      }
    }
    return null;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingJobs.delete(params.id);
      resolve(null);
    }, 8000);

    pendingJobs.set(params.id, {
      resolve: (val) => resolve(val),
      reject: () => resolve(null),
      timer,
    });

    const msg: PhotoEncodeWorkerRequest = {
      id: params.id,
      bitmap: params.bitmap,
      useSimulation: params.useSimulation,
      defects: params.defects,
      hdWidth: PHOTO_3R_HD_WIDTH,
      hdHeight: PHOTO_3R_HD_HEIGHT,
      storageWidth: PHOTO_3R_STORAGE_WIDTH,
      storageHeight: PHOTO_3R_STORAGE_HEIGHT,
      watermark: params.watermark,
    };

    try {
      if (params.bitmap) {
        worker.postMessage(msg, [params.bitmap]);
      } else {
        worker.postMessage(msg);
      }
    } catch {
      clearTimeout(timer);
      pendingJobs.delete(params.id);
      if (params.bitmap) {
        try {
          params.bitmap.close();
        } catch {
          // ignore
        }
      }
      resolve(null);
    }
  });
}

function yieldNextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function canvasToBlobAsync(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    } else {
      resolve(null);
    }
  });
}

function blobToDataUrlAsync(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Gagal membaca Blob'));
    };
    reader.onerror = () => reject(new Error('FileReader gagal'));
    reader.readAsDataURL(blob);
  });
}

function yieldSmoothly(extraDelayMs = 0): Promise<void> {
  if (extraDelayMs > 0) {
    return new Promise((resolve) => setTimeout(resolve, extraDelayMs));
  }
  return yieldNextFrame();
}

/**
 * Fallback non-blocking bila OffscreenCanvas Worker tidak tersedia:
 * Memecah render antar-frame dan memakai canvas.toBlob() asinkron agar frame video tetap berjalan.
 */
export async function encodePhotoAsyncFallback(params: {
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap | null;
  drawFallbackSim: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  watermark: PhotoEncodeWorkerRequest['watermark'];
  compactFallback?: boolean;
}): Promise<{ hd600DpiDataUrl: string; storageDataUrl: string }> {
  const hdW = params.compactFallback ? 1800 : PHOTO_3R_HD_WIDTH;
  const hdH = params.compactFallback ? 1260 : PHOTO_3R_HD_HEIGHT;
  const storageW = params.compactFallback ? 1440 : PHOTO_3R_STORAGE_WIDTH;
  const storageH = params.compactFallback ? 1008 : PHOTO_3R_STORAGE_HEIGHT;
  const yieldMs = params.compactFallback ? 16 : 0;

  const hdCanvas = document.createElement('canvas');
  hdCanvas.width = hdW;
  hdCanvas.height = hdH;
  const hdCtx = hdCanvas.getContext('2d', { alpha: false });
  if (!hdCtx) {
    return { hd600DpiDataUrl: '', storageDataUrl: '' };
  }

  if (params.source) {
    drawImageCover3R(hdCtx, params.source, hdW, hdH);
  } else {
    params.drawFallbackSim(hdCtx, hdW, hdH);
  }

  await yieldSmoothly(yieldMs);

  drawWatermark(hdCtx, hdW, hdH, params.watermark);

  await yieldSmoothly(yieldMs);

  const hdBlob = await canvasToBlobAsync(hdCanvas, params.compactFallback ? 0.9 : 0.95);
  const hdRaw = hdBlob
    ? await blobToDataUrlAsync(hdBlob)
    : hdCanvas.toDataURL('image/jpeg', params.compactFallback ? 0.9 : 0.95);
  const hd600DpiDataUrl = patchJpegDpi600(hdRaw, 600);

  await yieldSmoothly(yieldMs);

  const storageCanvas = document.createElement('canvas');
  storageCanvas.width = storageW;
  storageCanvas.height = storageH;
  const storageCtx = storageCanvas.getContext('2d', { alpha: false });
  let storageDataUrl = hd600DpiDataUrl;

  if (storageCtx) {
    storageCtx.imageSmoothingEnabled = true;
    storageCtx.imageSmoothingQuality = params.compactFallback ? 'medium' : 'high';
    storageCtx.drawImage(hdCanvas, 0, 0, storageW, storageH);
    const storageBlob = await canvasToBlobAsync(storageCanvas, 0.88);
    const storageRaw = storageBlob
      ? await blobToDataUrlAsync(storageBlob)
      : storageCanvas.toDataURL('image/jpeg', 0.88);
    storageDataUrl = patchJpegDpi600(storageRaw, 600);
  }

  hdCanvas.width = 0;
  hdCanvas.height = 0;
  storageCanvas.width = 0;
  storageCanvas.height = 0;

  return { hd600DpiDataUrl, storageDataUrl };
}
