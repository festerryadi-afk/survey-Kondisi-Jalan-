import {
  DefectItem,
  RoadConditionPKRMS,
  SurfaceType,
  TreatmentRecommendation,
} from '../types';

export interface RoadDamageAnalysisResult {
  detectedSurfaceType: SurfaceType;
  condition: RoadConditionPKRMS;
  recommendation: TreatmentRecommendation;
  sdiEstimate: number;
  iriEstimate: number;
  summary: string;
  defects: DefectItem[];
}

/**
 * Mengompresi gambar ke ukuran optimal (maksimal lebar 1024px JPEG) sebelum dikirim ke API deteksi AI.
 */
async function prepareAnalysisImageDataUrl(sourceUrl: string): Promise<string> {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    throw new Error('Sumber foto tidak valid.');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!sourceUrl.startsWith('data:') && !sourceUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const maxDim = 1024;
        const srcW = img.naturalWidth || img.width || 800;
        const srcH = img.naturalHeight || img.height || 600;
        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const targetW = Math.max(64, Math.round(srcW * scale));
        const targetH = Math.max(64, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          canvas.width = 0;
          canvas.height = 0;
          reject(new Error('Gagal menyiapkan kanvas analisis foto.'));
          return;
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const finalizeCleanup = () => {
          canvas.width = 0;
          canvas.height = 0;
        };

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(
            (blob) => {
              finalizeCleanup();
              if (!blob) {
                reject(new Error('Gagal memproses blob foto untuk analisis AI.'));
                return;
              }
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                  resolve(reader.result);
                } else {
                  reject(new Error('Gagal membaca foto analisis AI.'));
                }
              };
              reader.onerror = () => reject(new Error('Gagal membaca foto analisis AI.'));
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            0.85
          );
        } else {
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          finalizeCleanup();
          resolve(compressed);
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Gagal memproses foto untuk analisis AI.'));
      }
    };

    img.onerror = () => {
      reject(new Error('Gagal memuat gambar untuk analisis kerusakan jalan.'));
    };

    img.src = sourceUrl;
  });
}

export class RoadDamageAIError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'RoadDamageAIError';
    this.status = status;
    this.code = code;
  }
}

let quotaCooldownUntilMs = 0;

export function isRoadDamageAiOnQuotaCooldown(): boolean {
  return Date.now() < quotaCooldownUntilMs;
}

/**
 * Mengirimkan foto ke endpoint server /api/analyze-road-photo untuk deteksi otomatis tingkat kerusakan jalan.
 * Mendukung deteksi otomatis runtime APK mandiri (tanpa backend lokal) agar tidak memicu error HTTP 404.
 */
export async function analyzeRoadDamageFromPhoto(
  imageSourceUrl: string,
  surfaceTypeHint?: SurfaceType,
  options?: { isBackground?: boolean }
): Promise<RoadDamageAnalysisResult> {
  if (options?.isBackground && Date.now() < quotaCooldownUntilMs) {
    throw new RoadDamageAIError(
      'Kuota Gemini API sedang jeda sementara. Gunakan tombol Pindai AI atau cek API key di Settings > Secrets.',
      429,
      'QUOTA_EXHAUSTED'
    );
  }

  const envObj = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const configuredBaseUrl = (envObj?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const isNativeApk =
    typeof window !== 'undefined' &&
    Boolean((window as Window & { MentawaiAndroidDownloader?: unknown }).MentawaiAndroidDownloader);

  if (isNativeApk && !configuredBaseUrl) {
    throw new RoadDamageAIError(
      'Mode APK Mandiri (Offline PKRMS): Penilaian kondisi jalan menggunakan standar PKRMS lokal perangkat.',
      503,
      'OFFLINE_APK_NO_SERVER'
    );
  }

  const preparedDataUrl = await prepareAnalysisImageDataUrl(imageSourceUrl);
  const endpointUrl = configuredBaseUrl
    ? `${configuredBaseUrl}/api/analyze-road-photo`
    : '/api/analyze-road-photo';

  let res: Response;
  try {
    res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: preparedDataUrl,
        surfaceTypeHint,
      }),
    });
  } catch {
    throw new RoadDamageAIError(
      'Server analisis AI tidak terjangkau. Menggunakan penilaian PKRMS lokal perangkat.',
      0,
      'OFFLINE_APK_NO_SERVER'
    );
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok && !contentType.includes('application/json')) {
    throw new RoadDamageAIError(
      'Server AI cloud tidak tersedia pada paket aplikasi ini. Penilaian beralih ke PKRMS lokal.',
      res.status,
      'OFFLINE_APK_NO_SERVER'
    );
  }

  const payload = (await res.json().catch(() => ({}))) as Partial<RoadDamageAnalysisResult> & {
    error?: string;
    code?: string;
    retryAfterSeconds?: number;
  };

  if (!res.ok) {
    if (res.status === 429 || payload.code === 'QUOTA_EXHAUSTED') {
      const cooldownSec =
        typeof payload.retryAfterSeconds === 'number' && payload.retryAfterSeconds > 0
          ? payload.retryAfterSeconds
          : 120;
      quotaCooldownUntilMs = Date.now() + cooldownSec * 1000;
    }
    throw new RoadDamageAIError(
      payload.error || `Gagal mendeteksi kerusakan jalan (HTTP ${res.status}).`,
      res.status,
      payload.code
    );
  }

  quotaCooldownUntilMs = 0;

  return {
    detectedSurfaceType: payload.detectedSurfaceType || surfaceTypeHint || 'Aspal (AC-WC/HRS)',
    condition: payload.condition || 'Baik',
    recommendation: payload.recommendation || 'Pemeliharaan Rutin',
    sdiEstimate: typeof payload.sdiEstimate === 'number' ? payload.sdiEstimate : 25,
    iriEstimate: typeof payload.iriEstimate === 'number' ? payload.iriEstimate : 3.2,
    summary: payload.summary || 'Analisis AI selesai.',
    defects: Array.isArray(payload.defects) ? payload.defects : [],
  };
}
