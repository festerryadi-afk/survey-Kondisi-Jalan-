import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const VALID_SURFACE_TYPES = new Set([
  'Aspal (AC-WC/HRS)',
  'Penetrasi Macadam (Lapen)',
  'Kerikil / Sirtu',
  'Beton (Rigid)',
  'Tanah',
]);

const VALID_CONDITIONS = new Set([
  'Baik',
  'Sedang',
  'Rusak Ringan',
  'Rusak Berat',
]);

const VALID_RECOMMENDATIONS = new Set([
  'Pemeliharaan Rutin',
  'Pemeliharaan Berkala',
  'Rehabilitasi Jalan',
  'Rekonstruksi / Peningkatan',
]);

const VALID_DEFECT_TYPES = new Set([
  'Lubang (Pothole)',
  'Retak Buaya (Alligator Cracking)',
  'Retak Memanjang / Melintang',
  'Retak Tepi (Edge Crack)',
  'Amblas / Alur (Rutting/Depression)',
  'Kerusakan Tepi (Edge Damage)',
  'Permukaan Aus / Lepas (Ravelling)',
]);

const VALID_SEVERITIES = new Set(['Ringan', 'Sedang', 'Berat']);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

function parseDataUrlImage(dataUrl: string): { mimeType: string; base64Data: string } {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) {
    throw new Error('Format gambar tidak valid. Kirimkan Data URL base64 (*.JPG, *.PNG, atau *.WEBP).');
  }

  const rawMime = match[1].toLowerCase();
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  if (!ALLOWED_MIME_TYPES.has(rawMime)) {
    throw new Error(`Tipe gambar ${rawMime} tidak didukung. Gunakan JPEG, PNG, atau WEBP.`);
  }

  const base64Data = match[2];
  const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
  if (estimatedBytes === 0 || estimatedBytes > MAX_IMAGE_BYTES) {
    throw new Error('Ukuran gambar melebihi batas maksimum 10 MB.');
  }

  return { mimeType, base64Data };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada server. Silakan atur di panel Settings > Secrets.'
    ) as Error & { statusCode?: number };
    err.statusCode = 500;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/analyze-road-photo', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        imageDataUrl?: unknown;
        surfaceTypeHint?: unknown;
      };

      if (!body || typeof body.imageDataUrl !== 'string') {
        return res.status(400).json({
          error: 'Parameter imageDataUrl wajib dikirimkan sebagai string Data URL.',
        });
      }

      const { mimeType, base64Data } = parseDataUrlImage(body.imageDataUrl);
      const surfaceHint =
        typeof body.surfaceTypeHint === 'string' && VALID_SURFACE_TYPES.has(body.surfaceTypeHint)
          ? body.surfaceTypeHint
          : undefined;

      const ai = getGeminiClient();

      const promptText = [
        'Anda adalah inspektur teknik jalan raya bersertifikat Bina Marga & PKRMS (Provincial and Kabupaten Road Management System) Kementerian PUPR Indonesia.',
        'Analisis foto permukaan jalan ini secara objektif dan akurat.',
        surfaceHint
          ? `Catatan tipe perkerasan ruas saat ini (boleh dikoreksi bila foto jelas berbeda): ${surfaceHint}.`
          : '',
        'Tugas Anda:',
        '1. Identifikasi jenis perkerasan jalan yang tampak pada foto.',
        '2. Deteksi semua jenis kerusakan permukaan jalan yang benar-benar terlihat pada foto (Lubang/Pothole, Retak Buaya, Retak Memanjang/Melintang, Retak Tepi, Amblas/Alur, Kerusakan Tepi, atau Permukaan Aus/Ravelling). Jika jalan mulus/baik tanpa cacat nyata, kembalikan array defects kosong [].',
        '3. Tentukan tingkat keparahan masing-masing kerusakan (Ringan, Sedang, atau Berat) serta perkiraan dimensi realistis.',
        '4. Klasifikasikan tingkat kerusakan jalan keseluruhan sesuai standar PKRMS: "Baik", "Sedang", "Rusak Ringan", atau "Rusak Berat".',
        '5. Berikan rekomendasi penanganan PKRMS: "Pemeliharaan Rutin", "Pemeliharaan Berkala", "Rehabilitasi Jalan", atau "Rekonstruksi / Peningkatan".',
        '6. Berikan ringkasan teknis singkat (1-2 kalimat) dalam bahasa Indonesia yang jelas.',
      ]
        .filter(Boolean)
        .join('\n');

      const analysisSchema = {
        type: Type.OBJECT,
        properties: {
          detectedSurfaceType: {
            type: Type.STRING,
            enum: [
              'Aspal (AC-WC/HRS)',
              'Penetrasi Macadam (Lapen)',
              'Kerikil / Sirtu',
              'Beton (Rigid)',
              'Tanah',
            ],
            description: 'Jenis perkerasan jalan yang terlihat pada foto.',
          },
          condition: {
            type: Type.STRING,
            enum: ['Baik', 'Sedang', 'Rusak Ringan', 'Rusak Berat'],
            description: 'Klasifikasi kondisi jalan standar PKRMS.',
          },
          recommendation: {
            type: Type.STRING,
            enum: [
              'Pemeliharaan Rutin',
              'Pemeliharaan Berkala',
              'Rehabilitasi Jalan',
              'Rekonstruksi / Peningkatan',
            ],
            description: 'Rekomendasi penanganan teknis jalan.',
          },
          sdiEstimate: {
            type: Type.INTEGER,
            description: 'Perkiraan nilai Surface Distress Index (0-200).',
          },
          iriEstimate: {
            type: Type.NUMBER,
            description: 'Perkiraan nilai International Roughness Index (m/km), antara 1.5 - 18.0.',
          },
          summary: {
            type: Type.STRING,
            description: 'Ringkasan teknis singkat kondisi permukaan & kerusakan jalan dalam Bahasa Indonesia.',
          },
          defects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  enum: [
                    'Lubang (Pothole)',
                    'Retak Buaya (Alligator Cracking)',
                    'Retak Memanjang / Melintang',
                    'Retak Tepi (Edge Crack)',
                    'Amblas / Alur (Rutting/Depression)',
                    'Kerusakan Tepi (Edge Damage)',
                    'Permukaan Aus / Lepas (Ravelling)',
                  ],
                },
                severity: {
                  type: Type.STRING,
                  enum: ['Ringan', 'Sedang', 'Berat'],
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Tingkat keyakinan deteksi antara 0.0 sampai 1.0.',
                },
                notes: {
                  type: Type.STRING,
                  description: 'Deskripsi singkat lokasi/kondisi kerusakan pada foto.',
                },
                lengthCm: { type: Type.NUMBER },
                widthCm: { type: Type.NUMBER },
                depthCm: { type: Type.NUMBER },
                crackWidthMm: { type: Type.NUMBER },
                areaSqM: { type: Type.NUMBER },
              },
              required: ['type', 'severity', 'confidence', 'notes'],
            },
          },
        },
        required: [
          'detectedSurfaceType',
          'condition',
          'recommendation',
          'sdiEstimate',
          'iriEstimate',
          'summary',
          'defects',
        ],
      };

      const callModel = async (model: string) =>
        ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: analysisSchema,
          },
        });

      const isRetryableError = (err: unknown): boolean => {
        const e = err as { status?: number; statusCode?: number; message?: string };
        const msg = String(e?.message || '');
        return (
          e?.status === 429 ||
          e?.statusCode === 429 ||
          e?.status === 503 ||
          e?.statusCode === 503 ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('"code":429') ||
          msg.includes('UNAVAILABLE')
        );
      };

      let response;
      const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
      let lastErr: unknown;

      for (let i = 0; i < modelsToTry.length; i++) {
        try {
          response = await callModel(modelsToTry[i]);
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          if (!isRetryableError(err) || i === modelsToTry.length - 1) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (!response) {
        throw lastErr || new Error('Model AI tidak tersedia.');
      }

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({
          error: 'Model AI tidak mengembalikan hasil analisis untuk foto ini.',
        });
      }

      const parsed = JSON.parse(rawText) as {
        detectedSurfaceType?: string;
        condition?: string;
        recommendation?: string;
        sdiEstimate?: number;
        iriEstimate?: number;
        summary?: string;
        defects?: Array<{
          type?: string;
          severity?: string;
          confidence?: number;
          notes?: string;
          lengthCm?: number;
          widthCm?: number;
          depthCm?: number;
          crackWidthMm?: number;
          areaSqM?: number;
        }>;
      };

      const detectedSurfaceType = VALID_SURFACE_TYPES.has(parsed.detectedSurfaceType ?? '')
        ? parsed.detectedSurfaceType!
        : surfaceHint || 'Aspal (AC-WC/HRS)';

      const condition = VALID_CONDITIONS.has(parsed.condition ?? '')
        ? parsed.condition!
        : 'Baik';

      const recommendation = VALID_RECOMMENDATIONS.has(parsed.recommendation ?? '')
        ? parsed.recommendation!
        : 'Pemeliharaan Rutin';

      const defects = Array.isArray(parsed.defects)
        ? parsed.defects
            .filter(
              (d) =>
                d &&
                VALID_DEFECT_TYPES.has(d.type ?? '') &&
                VALID_SEVERITIES.has(d.severity ?? '')
            )
            .map((d, idx) => {
              const dimensions: Record<string, number> = {};
              if (typeof d.lengthCm === 'number' && Number.isFinite(d.lengthCm) && d.lengthCm > 0) {
                dimensions.lengthCm = Number(d.lengthCm.toFixed(1));
              }
              if (typeof d.widthCm === 'number' && Number.isFinite(d.widthCm) && d.widthCm > 0) {
                dimensions.widthCm = Number(d.widthCm.toFixed(1));
              }
              if (typeof d.depthCm === 'number' && Number.isFinite(d.depthCm) && d.depthCm > 0) {
                dimensions.depthCm = Number(d.depthCm.toFixed(1));
              }
              if (
                typeof d.crackWidthMm === 'number' &&
                Number.isFinite(d.crackWidthMm) &&
                d.crackWidthMm > 0
              ) {
                dimensions.crackWidthMm = Number(d.crackWidthMm.toFixed(1));
              }
              if (typeof d.areaSqM === 'number' && Number.isFinite(d.areaSqM) && d.areaSqM > 0) {
                dimensions.areaSqM = Number(d.areaSqM.toFixed(2));
              }

              return {
                id: `ai-photo-defect-${Date.now()}-${idx}`,
                type: d.type!,
                severity: d.severity!,
                confidence:
                  typeof d.confidence === 'number' && Number.isFinite(d.confidence)
                    ? Math.max(0.1, Math.min(1, Number(d.confidence.toFixed(2))))
                    : 0.88,
                dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
                notes:
                  typeof d.notes === 'string' && d.notes.trim()
                    ? d.notes.trim()
                    : 'Terdeteksi otomatis oleh AI dari foto lapangan.',
              };
            })
        : [];

      return res.json({
        detectedSurfaceType,
        condition,
        recommendation,
        sdiEstimate:
          typeof parsed.sdiEstimate === 'number' && Number.isFinite(parsed.sdiEstimate)
            ? Math.max(0, Math.min(200, Math.round(parsed.sdiEstimate)))
            : 25,
        iriEstimate:
          typeof parsed.iriEstimate === 'number' && Number.isFinite(parsed.iriEstimate)
            ? Number(Math.max(1.5, Math.min(18, parsed.iriEstimate)).toFixed(1))
            : 3.2,
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : 'Analisis kondisi permukaan jalan selesai.',
        defects,
      });
    } catch (err) {
      const errorObj = err as Error & { status?: number; statusCode?: number };
      const rawMessage = String(errorObj?.message || '');
      const status = errorObj.statusCode || errorObj.status || 500;

      if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('"code":429')) {
        console.warn('Analyze road photo skipped: Gemini API free-tier quota exceeded (429).');
        return res.status(429).json({
          code: 'QUOTA_EXHAUSTED',
          retryAfterSeconds: 120,
          error:
            'Kuota Gemini API (Free Tier) sementara telah habis. Silakan coba lagi nanti atau pilih API key berbayar di panel Settings > Secrets untuk kuota yang lebih besar.',
        });
      }

      if (
        status === 403 ||
        rawMessage.includes('PERMISSION_DENIED') ||
        rawMessage.includes('API_KEY_INVALID')
      ) {
        console.warn('Analyze road photo error: invalid or unauthorized Gemini API key.');
        return res.status(status === 403 ? 403 : 400).json({
          code: 'API_KEY_INVALID',
          error:
            'API key Gemini tidak valid atau belum memiliki izin. Periksa API key pada panel Settings > Secrets.',
        });
      }

      console.error('Analyze road photo error:', rawMessage || errorObj);
      const msg = rawMessage || 'Gagal menganalisis tingkat kerusakan jalan dari foto.';
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
    }
  });

  const distDir = path.resolve(__dirname, 'dist');
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan pada http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
