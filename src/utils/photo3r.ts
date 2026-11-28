import type { jsPDF } from 'jspdf';
import { RuasJalan, SurveyPhoto } from '../types';
import { comparePhotosByStaAsc } from './geo';
import { triggerBlobDownload } from './nativeDownload';

/**
 * Utilitas Foto HD 600 DPI ukuran cetak 3R (8,9 × 12,7 cm)
 * - Ukuran cetak 3R standar: 8,9 cm × 12,7 cm (Landscape: 12,7 cm × 8,9 cm)
 * - Konversi 600 DPI (1 inci = 2,54 cm):
 *   Lebar  = (12,7 / 2,54) × 600 = 3000 piksel
 *   Tinggi = (8,9 / 2,54) × 600  = 2102 piksel
 */

export const PHOTO_3R_DPI = 600;
export const PHOTO_3R_WIDTH_CM = 12.7;
export const PHOTO_3R_HEIGHT_CM = 8.9;
export const PHOTO_3R_HD_WIDTH = 3000;
export const PHOTO_3R_HD_HEIGHT = 2102;

// Resolusi kerja Full HD (rasio persis 3R 12.7 : 8.9) agar tampilan galeri & detail tetap tajam HD
export const PHOTO_3R_STORAGE_WIDTH = 1920;
export const PHOTO_3R_STORAGE_HEIGHT = 1345;

// Cache memori & IndexedDB untuk menyimpan versi asli HD 3000×2102 @ 600 DPI secara permanen lintas sesi
const hd600DpiMemoryCache = new Map<string, string>();
let cachedMentawaiLogoDataUrl: string | null = null;
const PHOTO_DB_NAME = 'mentawai_survey_photos_db';
const PHOTO_DB_VERSION = 1;
const HD_PHOTO_STORE = 'hd_photos';
const PHOTO_META_STORE = 'photo_meta';
const PHOTO_META_KEY = 'survey_photos_list';

function openPhotoDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HD_PHOTO_STORE)) {
          db.createObjectStore(HD_PHOTO_STORE);
        }
        if (!db.objectStoreNames.contains(PHOTO_META_STORE)) {
          db.createObjectStore(PHOTO_META_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadMentawaiLogoDataUrl(): Promise<string | null> {
  if (cachedMentawaiLogoDataUrl) return cachedMentawaiLogoDataUrl;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('/assets/aistudio/Logo_Mentawai_5ae4cefd.jpg', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (dataUrl && dataUrl.startsWith('data:image/')) {
      cachedMentawaiLogoDataUrl = dataUrl;
      return dataUrl;
    }
    return null;
  } catch {
    return null;
  }
}

export function cacheHd600DpiPhoto(photoId: string, dataUrl600Dpi: string) {
  if (!photoId || !dataUrl600Dpi) return;
  hd600DpiMemoryCache.set(photoId, dataUrl600Dpi);
  void openPhotoDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(HD_PHOTO_STORE, 'readwrite');
      tx.objectStore(HD_PHOTO_STORE).put(dataUrl600Dpi, photoId);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } catch {
      db.close();
    }
  });
}

export function getCachedHd600DpiPhoto(photoId: string): string | undefined {
  return hd600DpiMemoryCache.get(photoId);
}

export async function getHd600DpiPhotoFromStorage(photoId?: string): Promise<string | undefined> {
  if (!photoId) return undefined;
  const mem = hd600DpiMemoryCache.get(photoId);
  if (mem && mem.startsWith('data:image/') && mem.length > 200) {
    return mem;
  }

  const db = await openPhotoDB();
  if (!db) return undefined;
  try {
    const stored = await new Promise<unknown>((resolve) => {
      const tx = db.transaction(HD_PHOTO_STORE, 'readonly');
      const req = tx.objectStore(HD_PHOTO_STORE).get(photoId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (typeof stored === 'string' && stored.startsWith('data:image/') && stored.length > 200) {
      hd600DpiMemoryCache.set(photoId, stored);
      return stored;
    }
  } catch {
    // ignore IndexedDB read error
  } finally {
    db.close();
  }
  return undefined;
}

export async function deleteHd600DpiPhotoFromStorage(photoId: string): Promise<void> {
  hd600DpiMemoryCache.delete(photoId);
  const db = await openPhotoDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HD_PHOTO_STORE, 'readwrite');
      tx.objectStore(HD_PHOTO_STORE).delete(photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

export async function clearAllHdPhotosFromStorage(): Promise<void> {
  hd600DpiMemoryCache.clear();
  const db = await openPhotoDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HD_PHOTO_STORE, 'readwrite');
      tx.objectStore(HD_PHOTO_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

export async function savePhotoMetadataList(photos: SurveyPhoto[]): Promise<void> {
  const db = await openPhotoDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(PHOTO_META_STORE, 'readwrite');
      tx.objectStore(PHOTO_META_STORE).put(photos, PHOTO_META_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IndexedDB quota errors
  } finally {
    db.close();
  }
}

export async function loadPhotoMetadataList(): Promise<SurveyPhoto[] | null> {
  const db = await openPhotoDB();
  if (!db) return null;
  try {
    const result = await new Promise<unknown>((resolve) => {
      const tx = db.transaction(PHOTO_META_STORE, 'readonly');
      const req = tx.objectStore(PHOTO_META_STORE).get(PHOTO_META_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return Array.isArray(result) ? (result as SurveyPhoto[]) : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Menggambar sumber gambar/video/canvas/ImageBitmap secara proporsional (object-fit: cover) ke target ukuran 3R
 */
export function drawImageCover3R(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  targetWidth: number,
  targetHeight: number
) {
  let srcWidth = 0;
  let srcHeight = 0;

  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    srcWidth = source.videoWidth || 1280;
    srcHeight = source.videoHeight || 720;
  } else if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    srcWidth = source.naturalWidth || source.width || 1280;
    srcHeight = source.naturalHeight || source.height || 720;
  } else {
    srcWidth = source.width;
    srcHeight = source.height;
  }

  if (srcWidth === 0 || srcHeight === 0) return;

  const srcRatio = srcWidth / srcHeight;
  const targetRatio = targetWidth / targetHeight;

  let drawW = targetWidth;
  let drawH = targetHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (srcRatio > targetRatio) {
    // Sumber lebih lebar -> crop sisi kiri & kanan
    drawH = targetHeight;
    drawW = targetHeight * srcRatio;
    offsetX = (targetWidth - drawW) / 2;
  } else {
    // Sumber lebih tinggi -> crop sisi atas & bawah
    drawW = targetWidth;
    drawH = targetWidth / srcRatio;
    offsetY = (targetHeight - drawH) / 2;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

/**
 * Menyematkan metadata JFIF APP0 DPI = 600 × 600 DPI langsung ke byte biner file JPEG
 * Sehingga saat file *.JPG dibuka di komputer/percetakan, terbaca resmi 600 DPI (3000×2102 px = 12,7×8,9 cm)
 */
export function patchJpegDpi600(jpegDataUrl: string, dpi = PHOTO_3R_DPI): string {
  try {
    const commaIdx = jpegDataUrl.indexOf(',');
    if (commaIdx === -1) return jpegDataUrl;
    const prefix = jpegDataUrl.slice(0, commaIdx + 1);
    const base64 = jpegDataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Pastikan SOI marker valid: FF D8
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return jpegDataUrl;
    }

    const dpiHi = (dpi >> 8) & 0xff;
    const dpiLo = dpi & 0xff;

    let finalBytes: Uint8Array;

    // Cek apakah sudah ada APP0 JFIF header (FF E0 ... 'JFIF\0')
    if (
      bytes[2] === 0xff &&
      bytes[3] === 0xe0 &&
      bytes[6] === 0x4a && // 'J'
      bytes[7] === 0x46 && // 'F'
      bytes[8] === 0x49 && // 'I'
      bytes[9] === 0x46 && // 'F'
      bytes[10] === 0x00
    ) {
      bytes[13] = 0x01; // Density units: 1 = dots per inch (DPI)
      bytes[14] = dpiHi;
      bytes[15] = dpiLo;
      bytes[16] = dpiHi;
      bytes[17] = dpiLo;
      finalBytes = bytes;
    } else {
      // Sisipkan header JFIF APP0 (18 byte) tepat setelah FF D8
      const jfifHeader = new Uint8Array([
        0xff, 0xe0, 0x00, 0x10,
        0x4a, 0x46, 0x49, 0x46, 0x00,
        0x01, 0x01,
        0x01, // 1 = DPI
        dpiHi, dpiLo,
        dpiHi, dpiLo,
        0x00, 0x00,
      ]);
      finalBytes = new Uint8Array(bytes.length + jfifHeader.length);
      finalBytes.set(bytes.subarray(0, 2), 0);
      finalBytes.set(jfifHeader, 2);
      finalBytes.set(bytes.subarray(2), 2 + jfifHeader.length);
    }

    // Encode kembali ke base64 secara efisien per chunk
    let outBinary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < finalBytes.length; i += chunkSize) {
      const chunk = finalBytes.subarray(i, i + chunkSize);
      outBinary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return prefix + btoa(outBinary);
  } catch {
    return jpegDataUrl;
  }
}

/**
 * Mengonversi sumber foto (DataURL/image URL) menjadi foto HD 600 DPI ukuran cetak 3R (3000 × 2102 px / 12,7 × 8,9 cm)
 */
export async function renderPhotoTo3R600DPI(
  sourceUrl: string,
  photoId?: string,
  quality = 0.95
): Promise<string> {
  if (photoId && quality >= 0.9) {
    const persistedHd = await getHd600DpiPhotoFromStorage(photoId);
    if (persistedHd) {
      return persistedHd;
    }
  }

  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return '';
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish(sourceUrl);
    }, 4000);

    const img = new Image();
    if (!sourceUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      const targetSizes: Array<[number, number]> = [
        [PHOTO_3R_HD_WIDTH, PHOTO_3R_HD_HEIGHT],
        [PHOTO_3R_STORAGE_WIDTH, PHOTO_3R_STORAGE_HEIGHT],
      ];

      for (const [w, h] of targetSizes) {
        const canvas = document.createElement('canvas');
        try {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          // Latar belakang hitam netral sebelum gambar 3R
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, w, h);

          drawImageCover3R(ctx, img, w, h);

          const rawJpeg = canvas.toDataURL('image/jpeg', quality);
          if (rawJpeg && rawJpeg.startsWith('data:image/jpeg') && rawJpeg.length > 200) {
            const jpeg600Dpi = patchJpegDpi600(rawJpeg, PHOTO_3R_DPI);
            if (photoId && quality >= 0.9) {
              cacheHd600DpiPhoto(photoId, jpeg600Dpi);
            }
            finish(jpeg600Dpi);
            return;
          }
        } catch {
          // Coba ukuran fallback berikutnya jika memori canvas perangkat terbatas
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      finish(sourceUrl);
    };

    img.onerror = () => finish(sourceUrl);
    img.src = sourceUrl;
  });
}

/**
 * Mengunduh foto dalam format *.JPG HD 600 DPI (3000 × 2102 px / ukuran cetak 3R 8,9 × 12,7 cm)
 */
function dataUrlToBlobSync(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1 || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL');
  }
  const meta = dataUrl.slice(5, commaIdx);
  const mime = meta.split(';')[0] || 'application/octet-stream';
  const payload = dataUrl.slice(commaIdx + 1);
  if (!meta.includes(';base64')) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function downloadPhoto3R600DPI(
  sourceUrl: string,
  filename: string,
  photoId?: string
) {
  const hdDataUrl = await renderPhotoTo3R600DPI(sourceUrl, photoId);
  try {
    const blob = hdDataUrl.startsWith('data:')
      ? dataUrlToBlobSync(hdDataUrl)
      : await (await fetch(hdDataUrl)).blob();
    triggerBlobDownload(blob, filename);
  } catch {
    const link = document.createElement('a');
    link.href = hdDataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Sanitasi teks agar aman untuk font standar PDF (WinAnsi / Latin-1)
 */
function toPdfSafeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\xFF]/g, ' ');
}

/**
 * Mengunduh dokumen jsPDF melalui triggerBlobDownload (aman di Android APK, iframe & mobile)
 */
function savePdfDocument(doc: jsPDF, filename: string) {
  const pdfBlob = doc.output('blob');
  triggerBlobDownload(pdfBlob, filename);
}

/**
 * Mengunduh / mengekspor 1 foto tunggal ke file *.PDF dengan ukuran halaman cetak fisik persis 3R (8,9 × 12,7 cm) 600 DPI
 */
export async function printSinglePhoto3R(photo: {
  id: string;
  imageUrl: string;
  nomorRuas: string;
  ruasNama: string;
  staText: string;
  coordinates: { lat: number; lng: number };
  pkrmsCondition: string;
  timestamp: string;
}) {
  const hdDataUrl = await renderPhotoTo3R600DPI(photo.imageUrl, photo.id, 0.9);
  const { jsPDF } = await import('jspdf');

  // Buat dokumen PDF persis ukuran cetak 3R Landscape: 127 mm × 89 mm (12,7 × 8,9 cm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [127, 89],
    compress: true,
  });

  try {
    const imgFormat = hdDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    if (hdDataUrl && hdDataUrl.startsWith('data:image/')) {
      doc.addImage(hdDataUrl, imgFormat, 0, 0, 127, 89, photo.id || 'photo-3r', 'NONE');
    } else {
      throw new Error('Gambar tidak tersedia');
    }
  } catch {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 127, 89, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(toPdfSafeText(`${photo.nomorRuas || ''} - ${photo.ruasNama || ''}`), 6, 40);
    doc.text(toPdfSafeText(photo.staText || ''), 6, 48);
  }

  const safeSta = (photo.staText || 'STA').replace(/[^a-zA-Z0-9+_-]/g, '_');
  const safeRuas = (photo.nomorRuas || '001').replace(/[^a-zA-Z0-9_-]/g, '_');
  savePdfDocument(doc, `Foto_3R_8.9x12.7cm_600DPI_Ruas${safeRuas}_${safeSta}.pdf`);
}

/**
 * Mengekspor laporan dokumentasi dikelompokkan per ruas jalan ke file *.PDF
 * dengan layout A4 Portrait, maksimal 3 foto tersusun ke bawah per halaman
 * diurutkan dari STA terkecil ke STA terbesar (rasio cetak 3R 12,7 x 8,9 cm HD 600 DPI).
 */
export async function exportGroupedReportPDF(
  ruasList: RuasJalan[],
  photos: SurveyPhoto[],
  selectedRuasFilter: string
) {
  const targetRuasList =
    selectedRuasFilter === 'all'
      ? ruasList
      : ruasList.filter((r) => r.id === selectedRuasFilter);

  const targetPhotos =
    selectedRuasFilter === 'all'
      ? photos
      : photos.filter((p) => p.ruasId === selectedRuasFilter);

  // Konversi semua foto ke HD 600 DPI 3R (3000 x 2102 px, kualitas 0.85 agar hemat memori & stabil)
  const hdMap = new Map<string, string>();
  for (const p of targetPhotos) {
    try {
      const hdUrl = await renderPhotoTo3R600DPI(p.imageUrl, p.id, 0.85);
      hdMap.set(p.id, hdUrl || p.imageUrl);
    } catch {
      hdMap.set(p.id, p.imageUrl);
    }
  }

  // Muat logo resmi Pemerintah Kabupaten Kepulauan Mentawai (sama seperti header aplikasi)
  const logoDataUrl = await loadMentawaiLogoDataUrl();
  const { jsPDF } = await import('jspdf');

  // A4 Portrait: 210 x 297 mm -> tepat 3 kartu foto tersusun ke bawah per halaman
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 186 mm
  const cardWidth = contentWidth;
  const cardHeight = 72; // 3 kartu x 72 mm + 2 jarak (4 mm) = 224 mm -> pas untuk halaman 1 & selanjutnya
  const cardGap = 4;
  const photoInnerPad = 2.5;
  const photoHeight = cardHeight - photoInnerPad * 2; // 67 mm
  const photoWidth = Number((photoHeight * (PHOTO_3R_WIDTH_CM / PHOTO_3R_HEIGHT_CM)).toFixed(2)); // ~95.6 mm (persis rasio 3R 12,7:8,9)
  const footerLimitY = pageHeight - 13; // 284 mm

  let y = 12.5;
  let pageNum = 1;
  let cardsOnPage = 0;

  const drawFooter = (num: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.text(
      'Survey Kondisi Jalan Kabupaten | Pemerintah Kabupaten Kepulauan Mentawai - Dinas PUPR',
      marginX,
      pageHeight - 6
    );
    doc.text(`Halaman ${num}`, pageWidth - marginX, pageHeight - 6, { align: 'right' });
  };

  const startNewPage = () => {
    doc.addPage();
    pageNum += 1;
    y = 13;
    cardsOnPage = 0;
    drawFooter(pageNum);
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > footerLimitY) {
      startNewPage();
    }
  };

  const getConditionBadgeRgb = (
    condition: string
  ): { bg: [number, number, number]; text: [number, number, number] } => {
    switch (condition) {
      case 'Baik':
        return { bg: [209, 250, 229], text: [6, 95, 70] };
      case 'Sedang':
        return { bg: [254, 243, 199], text: [146, 64, 14] };
      case 'Rusak Ringan':
        return { bg: [255, 237, 213], text: [154, 52, 18] };
      case 'Rusak Berat':
        return { bg: [255, 228, 230], text: [159, 18, 57] };
      default:
        return { bg: [226, 232, 240], text: [51, 65, 85] };
    }
  };

  // Kop Laporan Halaman 1 (Logo Pemerintah Kabupaten Kepulauan Mentawai di kiri atas)
  if (logoDataUrl) {
    try {
      const logoFormat = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      // Rasio asli logo 279 x 320 -> 13 mm x 15 mm
      doc.addImage(logoDataUrl, logoFormat, marginX, 8, 13, 15, 'mentawai-logo', 'NONE');
    } catch {
      // Abaikan jika logo gagal disisipkan
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text('PEMERINTAH KABUPATEN KEPULAUAN MENTAWAI', pageWidth / 2 + 4, y, { align: 'center' });
  y += 5;

  doc.setFontSize(10.5);
  doc.setTextColor(180, 83, 9);
  doc.text('DINAS PEKERJAAN UMUM DAN PENATAAN RUANG', pageWidth / 2 + 4, y, { align: 'center' });
  y += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Laporan Dokumentasi Survey Kondisi Jalan', pageWidth / 2 + 4, y, { align: 'center' });
  y += 3;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.55);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 4;

  drawFooter(pageNum);

  const drawRuasHeader = (ruas: RuasJalan, isContinuation: boolean) => {
    doc.setFillColor(30, 58, 138);
    doc.roundedRect(marginX, y, contentWidth, 7.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    const titlePrefix = isContinuation ? 'Lanjutan ' : '';
    doc.text(
      toPdfSafeText(`${titlePrefix}Ruas ${ruas.nomorRuas || '-'}: ${ruas.namaRuas || '-'}`),
      marginX + 3,
      y + 5.1
    );
    y += 10;
  };

  for (const ruas of targetRuasList) {
    // Urutkan foto dari STA terkecil ke STA terbesar
    const ruasPhotos = targetPhotos
      .filter((p) => p.ruasId === ruas.id)
      .sort(comparePhotosByStaAsc);
    if (ruasPhotos.length === 0) continue;

    // Pastikan judul ruas + minimal 1 kartu foto muat di halaman yang sama dan halaman belum penuh 3 foto
    if (cardsOnPage >= 3 || y + 15 + cardHeight > footerLimitY) {
      startNewPage();
    }

    drawRuasHeader(ruas, false);

    // Susun foto 1 kolom ke bawah, maksimal 3 buah per halaman
    for (let idx = 0; idx < ruasPhotos.length; idx++) {
      const p = ruasPhotos[idx];

      if (cardsOnPage >= 3 || y + cardHeight > footerLimitY) {
        startNewPage();
        drawRuasHeader(ruas, true);
      }

      // Bingkai kartu foto Portrait full-width
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX, y, cardWidth, cardHeight, 1.2, 1.2, 'FD');

      const photoX = marginX + photoInnerPad;
      const photoY = y + photoInnerPad;

      // Gambar foto tepat rasio 3R (12,7 : 8,9)
      const imgData = hdMap.get(p.id) || p.imageUrl;
      try {
        if (
          imgData &&
          (imgData.startsWith('data:image/jpeg') ||
            imgData.startsWith('data:image/jpg') ||
            imgData.startsWith('data:image/png'))
        ) {
          const imgFormat = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(imgData, imgFormat, photoX, photoY, photoWidth, photoHeight, p.id, 'NONE');
        } else {
          doc.setFillColor(30, 41, 59);
          doc.rect(photoX, photoY, photoWidth, photoHeight, 'F');
        }
      } catch {
        doc.setFillColor(30, 41, 59);
        doc.rect(photoX, photoY, photoWidth, photoHeight, 'F');
      }

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.rect(photoX, photoY, photoWidth, photoHeight, 'S');

      // Panel detail metadata di sebelah kanan foto
      const metaX = photoX + photoWidth + 4;
      const metaWidth = marginX + cardWidth - metaX - 3;
      let metaY = y + 6;

      // Nomor urut + STA + Badge Kondisi
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(toPdfSafeText(`${idx + 1}. ${p.staText || 'STA -'}`), metaX, metaY);

      const condLabel = toPdfSafeText(p.pkrmsCondition || 'Baik');
      const badgeStyle = getConditionBadgeRgb(p.pkrmsCondition || '');
      doc.setFontSize(7.5);
      const badgeW = Math.min(34, Math.max(18, doc.getTextWidth(condLabel) + 6));
      const badgeX = marginX + cardWidth - 3 - badgeW;
      doc.setFillColor(badgeStyle.bg[0], badgeStyle.bg[1], badgeStyle.bg[2]);
      doc.roundedRect(badgeX, metaY - 4.1, badgeW, 5.4, 1.2, 1.2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(badgeStyle.text[0], badgeStyle.text[1], badgeStyle.text[2]);
      doc.text(condLabel, badgeX + badgeW / 2, metaY - 0.5, { align: 'center' });

      metaY += 2.2;
      doc.setDrawColor(226, 232, 240);
      doc.line(metaX, metaY, marginX + cardWidth - 3, metaY);
      metaY += 4.2;

      const drawMetaRow = (label: string, value: string, maxLines = 1) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.3);
        doc.setTextColor(100, 116, 139);
        doc.text(label, metaX, metaY);
        metaY += 3.2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(30, 41, 59);
        const lines = (doc.splitTextToSize(toPdfSafeText(value), metaWidth) as string[]).slice(
          0,
          maxLines
        );
        doc.text(lines, metaX, metaY);
        metaY += lines.length * 3.4 + 1.4;
      };

      const ts = p.timestamp ? new Date(p.timestamp) : new Date();
      const waktu = Number.isNaN(ts.getTime()) ? '-' : ts.toLocaleString('id-ID');
      const latVal = Number(p.coordinates?.lat ?? 0);
      const lngVal = Number(p.coordinates?.lng ?? 0);
      const defectSummary =
        p.defects && p.defects.length > 0
          ? p.defects.map((d) => `${d.type} (${d.severity})`).join(', ')
          : 'Nihil (Permukaan Mantap)';

      drawMetaRow('Ruas Jalan', `${p.nomorRuas || ruas.nomorRuas} - ${p.ruasNama || ruas.namaRuas}`, 1);
      drawMetaRow('Waktu Pengambilan', `${waktu} WIB`, 1);
      drawMetaRow('Koordinat GPS', `${latVal.toFixed(6)}, ${lngVal.toFixed(6)}`, 1);
      drawMetaRow('Jenis Perkerasan', p.surfaceType || '-', 1);
      drawMetaRow('Temuan Kerusakan', defectSummary, 2);
      drawMetaRow('Rekomendasi', p.recommendation || '-', 1);

      y += cardHeight + cardGap;
      cardsOnPage += 1;
    }

    y += 3;
  }

  if (targetPhotos.length === 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Belum ada dokumentasi foto lapangan pada filter ruas jalan yang dipilih.',
      pageWidth / 2,
      y + 12,
      { align: 'center' }
    );
  }

  savePdfDocument(doc, `Laporan_Dokumentasi_Portrait_600DPI_Mentawai_${Date.now()}.pdf`);
}
