import type { DefectItem } from '../types';

export interface PhotoEncodeWorkerRequest {
  id: string;
  bitmap?: ImageBitmap;
  useSimulation?: boolean;
  defects?: DefectItem[];
  hdWidth: number;
  hdHeight: number;
  storageWidth: number;
  storageHeight: number;
  watermark: {
    nomorRuas: string;
    namaRuas: string;
    staText: string;
    lat: number;
    lng: number;
  };
}

export interface PhotoEncodeWorkerResponse {
  id: string;
  hd600DpiDataUrl?: string;
  storageDataUrl?: string;
  error?: string;
}

function patchJpegBytesDpi600(bytes: Uint8Array, dpi = 600): Uint8Array {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes;
  }

  const dpiHi = (dpi >> 8) & 0xff;
  const dpiLo = dpi & 0xff;

  // Cek apakah sudah ada header JFIF APP0
  if (
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes[6] === 0x4a &&
    bytes[7] === 0x46 &&
    bytes[8] === 0x49 &&
    bytes[9] === 0x46 &&
    bytes[10] === 0x00
  ) {
    bytes[13] = 0x01;
    bytes[14] = dpiHi;
    bytes[15] = dpiLo;
    bytes[16] = dpiHi;
    bytes[17] = dpiLo;
    return bytes;
  }

  const jfifHeader = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01,
    0x01,
    dpiHi, dpiLo,
    dpiHi, dpiLo,
    0x00, 0x00,
  ]);
  const out = new Uint8Array(bytes.length + jfifHeader.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(jfifHeader, 2);
  out.set(bytes.subarray(2), 2 + jfifHeader.length);
  return out;
}

async function blobToDpi600DataUrl(blob: Blob, dpi = 600): Promise<string> {
  const buf = await blob.arrayBuffer();
  const patched = patchJpegBytesDpi600(new Uint8Array(buf), dpi);
  const patchedCopy = new Uint8Array(patched.byteLength);
  patchedCopy.set(patched);
  const outBlob = new Blob([patchedCopy.buffer], { type: 'image/jpeg' });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal mengonversi JPEG ke DataURL'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca blob JPEG'));
    reader.readAsDataURL(outBlob);
  });
}

function drawBitmapCover(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number
) {
  const srcWidth = bitmap.width || 1280;
  const srcHeight = bitmap.height || 720;
  if (srcWidth === 0 || srcHeight === 0) return;

  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;

  let drawW = targetWidth;
  let drawH = targetHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (srcRatio > targetRatio) {
    drawH = targetHeight;
    drawW = targetHeight * srcRatio;
    offsetX = (targetWidth - drawW) / 2;
  } else {
    drawW = targetWidth;
    drawH = targetWidth / srcRatio;
    offsetY = (targetHeight - drawH) / 2;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, offsetX, offsetY, drawW, drawH);
}

function drawSimulatedRoadOnOffscreen(
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  defects: DefectItem[]
) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  skyGrad.addColorStop(0, '#0284c7');
  skyGrad.addColorStop(1, '#bae6fd');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.45);

  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.45);
  ctx.lineTo(w * 0.35, h * 0.4);
  ctx.lineTo(w * 0.65, h * 0.4);
  ctx.lineTo(w, h * 0.45);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.42);
  ctx.lineTo(w * 0.62, h * 0.42);
  ctx.lineTo(w * 0.95, h);
  ctx.lineTo(w * 0.05, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.42);
  ctx.lineTo(w * 0.05, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w * 0.62, h * 0.42);
  ctx.lineTo(w * 0.95, h);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.setLineDash([40, 30]);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const defect of defects) {
    if (defect.type.includes('Lubang')) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(w * 0.46, h * 0.65, 80, 40, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (defect.type.includes('Retak')) {
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.6);
      ctx.lineTo(w * 0.55, h * 0.66);
      ctx.lineTo(w * 0.48, h * 0.72);
      ctx.lineTo(w * 0.62, h * 0.75);
      ctx.stroke();
    }
  }
}

function drawWatermarkOffscreen(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  metadata: PhotoEncodeWorkerRequest['watermark']
) {
  const baseFontSize = Math.max(14, Math.round(width * 0.022));
  const paddingX = Math.max(16, Math.round(width * 0.025));
  const paddingBottom = Math.max(20, Math.round(height * 0.035));

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.fillStyle = '#FFFFFF';

  const line2Y = height - paddingBottom;
  ctx.font = `600 ${baseFontSize}px 'Inter', sans-serif, Arial`;
  const line2Text = `Koordinat: ${metadata.lat.toFixed(6)}°, ${metadata.lng.toFixed(6)}°  |  ${metadata.staText}`;
  ctx.strokeText(line2Text, paddingX, line2Y);
  ctx.fillText(line2Text, paddingX, line2Y);

  const line1Y = line2Y - baseFontSize * 1.35;
  ctx.font = `bold ${baseFontSize + 2}px 'Inter', sans-serif, Arial`;
  const line1Text = `Ruas ${metadata.nomorRuas} - ${metadata.namaRuas}`;
  ctx.strokeText(line1Text, paddingX, line1Y);
  ctx.fillText(line1Text, paddingX, line1Y);

  ctx.restore();
}

self.onmessage = async (event: MessageEvent<PhotoEncodeWorkerRequest>) => {
  const req = event.data;
  const { id, bitmap, useSimulation, defects, hdWidth, hdHeight, storageWidth, storageHeight, watermark } = req;

  let hdCanvas: OffscreenCanvas | null = null;
  let storageCanvas: OffscreenCanvas | null = null;

  try {
    hdCanvas = new OffscreenCanvas(hdWidth, hdHeight);
    const hdCtx = hdCanvas.getContext('2d', { alpha: false });
    if (!hdCtx) {
      throw new Error('OffscreenCanvas 2D tidak tersedia');
    }

    if (bitmap && !useSimulation) {
      drawBitmapCover(hdCtx, bitmap, hdWidth, hdHeight);
      bitmap.close();
    } else {
      drawSimulatedRoadOnOffscreen(hdCtx, hdWidth, hdHeight, defects || []);
    }

    drawWatermarkOffscreen(hdCtx, hdWidth, hdHeight, watermark);

    const hdBlob = await hdCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    const hd600DpiDataUrl = await blobToDpi600DataUrl(hdBlob, 600);

    storageCanvas = new OffscreenCanvas(storageWidth, storageHeight);
    const storageCtx = storageCanvas.getContext('2d', { alpha: false });
    let storageDataUrl = hd600DpiDataUrl;
    if (storageCtx) {
      storageCtx.imageSmoothingEnabled = true;
      storageCtx.imageSmoothingQuality = 'high';
      storageCtx.drawImage(hdCanvas, 0, 0, storageWidth, storageHeight);
      const storageBlob = await storageCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      storageDataUrl = await blobToDpi600DataUrl(storageBlob, 600);
    }

    const res: PhotoEncodeWorkerResponse = {
      id,
      hd600DpiDataUrl,
      storageDataUrl,
    };
    self.postMessage(res);
  } catch (err) {
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // ignore
      }
    }
    const res: PhotoEncodeWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : 'Worker encode gagal',
    };
    self.postMessage(res);
  } finally {
    if (hdCanvas) {
      hdCanvas.width = 0;
      hdCanvas.height = 0;
    }
    if (storageCanvas) {
      storageCanvas.width = 0;
      storageCanvas.height = 0;
    }
  }
};
