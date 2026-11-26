import React, { useEffect, useState } from 'react';
import {
  X,
  Upload,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  ScanSearch,
} from 'lucide-react';
import {
  RuasJalan,
  SurveyPhoto,
  DefectItem,
  DefectType,
  PKRMSSeverity,
} from '../types';
import { formatSTA, drawWatermark, interpolateCoordAlongRuas } from '../utils/geo';
import {
  evaluatePKRMSCondition,
  getConditionColor,
  getSurfaceAndConditionAtSTA,
} from '../utils/pkrms';
import { generateSHA256 } from '../utils/crypto';
import {
  PHOTO_3R_HD_WIDTH,
  PHOTO_3R_HD_HEIGHT,
  PHOTO_3R_STORAGE_WIDTH,
  PHOTO_3R_STORAGE_HEIGHT,
  drawImageCover3R,
  patchJpegDpi600,
  cacheHd600DpiPhoto,
} from '../utils/photo3r';
import {
  analyzeRoadDamageFromPhoto,
  RoadDamageAnalysisResult,
} from '../utils/roadDamageAI';

interface ImportPhotoModalProps {
  ruas: RuasJalan | null;
  initialStaMeters?: number;
  isOnline: boolean;
  onClose: () => void;
  onImportPhoto: (photo: SurveyPhoto) => void;
}

function buildImportPhotoStaSchedule(
  startSta: number,
  maxStaMeters: number,
  fileCount: number
): number[] {
  if (fileCount <= 0) return [];
  const safeMax = Math.max(0, Math.round(maxStaMeters));
  const clampedStart = Math.max(0, Math.min(Math.round(startSta), safeMax));
  const schedule: number[] = [];

  for (let i = 0; i < fileCount; i++) {
    if (i === 0) {
      schedule.push(clampedStart);
      if (clampedStart >= safeMax) break;
      continue;
    }
    const prevSta = schedule[schedule.length - 1];
    if (prevSta >= safeMax) {
      break;
    }
    const nextSta = prevSta + 100;
    if (nextSta >= safeMax) {
      schedule.push(safeMax);
      break;
    }
    schedule.push(nextSta);
  }

  return schedule;
}

export const ImportPhotoModal: React.FC<ImportPhotoModalProps> = ({
  ruas,
  initialStaMeters,
  isOnline,
  onClose,
  onImportPhoto,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [staMeters, setStaMeters] = useState<number>(0);
  const [endStaMeters, setEndStaMeters] = useState<number>(0);
  const [lat, setLat] = useState<number>(-2.0234);
  const [lng, setLng] = useState<number>(99.5912);
  const [autoCoordFromRoute, setAutoCoordFromRoute] = useState<boolean>(true);
  const [autoDetectAI, setAutoDetectAI] = useState<boolean>(true);
  const [hasDefect, setHasDefect] = useState<boolean>(false);
  const [defectType, setDefectType] = useState<DefectType>('Lubang (Pothole)');
  const [severity, setSeverity] = useState<PKRMSSeverity>('Sedang');
  const [notes, setNotes] = useState<string>('Dokumentasi impor foto lapangan DPUPR Mentawai.');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzingPreview, setIsAnalyzingPreview] = useState<boolean>(false);
  const [aiAnalysisMap, setAiAnalysisMap] = useState<Record<number, RoadDamageAnalysisResult>>({});
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ruas) {
      const autoEndSta = Math.max(0, Math.round((ruas.panjangKm || 0) * 1000));
      const startSta = Math.max(0, Math.min(autoEndSta, Math.round(initialStaMeters ?? 0)));
      const [initLat, initLng] = interpolateCoordAlongRuas(ruas, startSta);
      setSelectedFiles([]);
      setStaMeters(startSta);
      setEndStaMeters(autoEndSta);
      setAutoCoordFromRoute(true);
      setAutoDetectAI(true);
      setLat(initLat);
      setLng(initLng);
      setHasDefect(false);
      setDefectType('Lubang (Pothole)');
      setSeverity('Sedang');
      setNotes('Dokumentasi impor foto lapangan DPUPR Mentawai.');
      setPreviewUrl(null);
      setIsAnalyzingPreview(false);
      setAiAnalysisMap({});
      setAiPreviewError(null);
      setProgressText('');
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [ruas, initialStaMeters]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!ruas) return null;

  const roadMaxStaMeters = Math.max(0, Math.round((ruas.panjangKm || 0) * 1000));
  const maxStaMeters = Math.max(
    staMeters,
    Math.min(roadMaxStaMeters, Math.round(endStaMeters))
  );
  const staSchedule = buildImportPhotoStaSchedule(staMeters, maxStaMeters, selectedFiles.length);
  const skippedCount = Math.max(0, selectedFiles.length - staSchedule.length);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Gagal membaca file foto ${file.name}`));
      reader.readAsDataURL(file);
    });

  const runPreviewAnalysis = async (file: File, targetSta: number) => {
    if (!isOnline) {
      setAiPreviewError('Perangkat sedang offline. Sambungkan internet untuk deteksi AI otomatis.');
      return;
    }
    setIsAnalyzingPreview(true);
    setAiPreviewError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const staInfo = getSurfaceAndConditionAtSTA(ruas, targetSta);
      const result = await analyzeRoadDamageFromPhoto(dataUrl, staInfo.tipePermukaan);
      setAiAnalysisMap((prev) => ({ ...prev, 0: result }));
    } catch (err) {
      setAiPreviewError(
        err instanceof Error ? err.message : 'Gagal menganalisis kerusakan jalan dari foto.'
      );
    } finally {
      setIsAnalyzingPreview(false);
    }
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []) as File[];
    if (fileList.length === 0) return;
    setErrorMsg(null);
    setAiAnalysisMap({});
    setAiPreviewError(null);
    setSelectedFiles(fileList);

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(fileList[0]));

    if (autoDetectAI && !hasDefect) {
      void runPreviewAnalysis(fileList[0], staMeters);
    }
  };

  const processSinglePhotoFile = async (
    file: File,
    indexOffset: number,
    photoSta: number,
    totalToImport: number,
    targetRuas: RuasJalan
  ): Promise<SurveyPhoto> => {
    const fileDataUrl = await readFileAsDataUrl(file);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Format gambar ${file.name} tidak didukung.`));
      el.src = fileDataUrl;
    });

    const [routeLat, routeLng] = interpolateCoordAlongRuas(targetRuas, photoSta);
    const photoLat = autoCoordFromRoute ? routeLat : lat;
    const photoLng = autoCoordFromRoute ? routeLng : lng;
    const photoId = `photo-import-${Date.now()}-${indexOffset}`;
    const staInfo = getSurfaceAndConditionAtSTA(targetRuas, photoSta);

    // Analisis otomatis tingkat kerusakan dari foto asli (sebelum diberi watermark)
    let aiResult: RoadDamageAnalysisResult | null = aiAnalysisMap[indexOffset] || null;
    if (autoDetectAI && !hasDefect && !aiResult) {
      if (!isOnline) {
        throw new Error('Deteksi AI memerlukan koneksi internet aktif.');
      }
      setProgressText(`Menganalisis AI foto ${indexOffset + 1}/${totalToImport}...`);
      aiResult = await analyzeRoadDamageFromPhoto(fileDataUrl, staInfo.tipePermukaan);
      setAiAnalysisMap((prev) => ({ ...prev, [indexOffset]: aiResult! }));
    }

    setProgressText(`Memproses 3R 600 DPI (${indexOffset + 1}/${totalToImport})...`);

    const hdCanvas = document.createElement('canvas');
    hdCanvas.width = PHOTO_3R_HD_WIDTH;
    hdCanvas.height = PHOTO_3R_HD_HEIGHT;
    const hdCtx = hdCanvas.getContext('2d');
    if (!hdCtx) throw new Error('Gagal menyiapkan kanvas HD 600 DPI.');

    hdCtx.fillStyle = '#0f172a';
    hdCtx.fillRect(0, 0, PHOTO_3R_HD_WIDTH, PHOTO_3R_HD_HEIGHT);
    drawImageCover3R(hdCtx, img, PHOTO_3R_HD_WIDTH, PHOTO_3R_HD_HEIGHT);

    // Watermark di kiri bawah tanpa frame: Nomor Ruas, Nama Ruas Jalan, Koordinat, STA
    drawWatermark(hdCtx, PHOTO_3R_HD_WIDTH, PHOTO_3R_HD_HEIGHT, {
      nomorRuas: targetRuas.nomorRuas,
      namaRuas: targetRuas.namaRuas,
      staText: formatSTA(photoSta),
      lat: photoLat,
      lng: photoLng,
    });

    const hd600DataUrl = patchJpegDpi600(hdCanvas.toDataURL('image/jpeg', 0.94), 600);
    cacheHd600DpiPhoto(photoId, hd600DataUrl);

    const storageCanvas = document.createElement('canvas');
    storageCanvas.width = PHOTO_3R_STORAGE_WIDTH;
    storageCanvas.height = PHOTO_3R_STORAGE_HEIGHT;
    const storageCtx = storageCanvas.getContext('2d');
    let finalDataUrl = hd600DataUrl;
    if (storageCtx) {
      storageCtx.imageSmoothingEnabled = true;
      storageCtx.imageSmoothingQuality = 'high';
      storageCtx.drawImage(hdCanvas, 0, 0, PHOTO_3R_STORAGE_WIDTH, PHOTO_3R_STORAGE_HEIGHT);
      finalDataUrl = patchJpegDpi600(storageCanvas.toDataURL('image/jpeg', 0.9), 600);
    }

    hdCanvas.width = 0;
    hdCanvas.height = 0;
    storageCanvas.width = 0;
    storageCanvas.height = 0;

    let finalDefects: DefectItem[] = [];
    let finalSurface = staInfo.tipePermukaan;
    let finalCondition = staInfo.kondisiJalan;
    let finalRecommendation = evaluatePKRMSCondition([]).recommendation;

    if (hasDefect) {
      finalDefects = [
        {
          id: `imp-defect-${Date.now()}-${indexOffset}`,
          type: defectType,
          severity,
          confidence: 1.0,
          notes,
        },
      ];
      const pkrms = evaluatePKRMSCondition(finalDefects);
      finalCondition = pkrms.condition;
      finalRecommendation = pkrms.recommendation;
    } else if (aiResult) {
      finalDefects = aiResult.defects;
      finalSurface = aiResult.detectedSurfaceType;
      finalCondition = aiResult.condition;
      finalRecommendation = aiResult.recommendation;
    }

    const timestampIso = new Date().toISOString();
    const hashSha256 = await generateSHA256(
      `${targetRuas.nomorRuas}-${formatSTA(photoSta)}-${photoLat}-${photoLng}-${timestampIso}-${file.name}`
    );

    return {
      id: photoId,
      ruasId: targetRuas.id,
      ruasNama: targetRuas.namaRuas,
      nomorRuas: targetRuas.nomorRuas,
      sta: photoSta,
      staText: formatSTA(photoSta),
      coordinates: {
        lat: photoLat,
        lng: photoLng,
        altitude: 18.0,
        accuracy: 2.5,
      },
      timestamp: timestampIso,
      capturedBy: aiResult && !hasDefect ? `Impor Foto + AI (${file.name})` : `Impor Foto (${file.name})`,
      imageUrl: finalDataUrl,
      defects: finalDefects,
      surfaceType: finalSurface,
      pkrmsCondition: finalCondition,
      recommendation: finalRecommendation,
      speedKmh: 0,
      syncStatus: isOnline ? 'synced' : 'pending',
      hashSha256,
      isAutoCapture: false,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setErrorMsg('Pilih minimal 1 file foto (*.JPG, *.PNG, *.WEBP) terlebih dahulu.');
      return;
    }

    const activeSchedule = buildImportPhotoStaSchedule(
      staMeters,
      maxStaMeters,
      selectedFiles.length
    );
    if (activeSchedule.length === 0) {
      setErrorMsg(`Posisi STA sudah mencapai akhir panjang ruas (${formatSTA(maxStaMeters)}).`);
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      for (let i = 0; i < activeSchedule.length; i++) {
        const newPhoto = await processSinglePhotoFile(
          selectedFiles[i],
          i,
          activeSchedule[i],
          activeSchedule.length,
          ruas
        );
        onImportPhoto(newPhoto);
      }
      onClose();
    } catch (err) {
      console.error('Import photo error:', err);
      setErrorMsg(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengimpor berkas foto.'
      );
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const firstAiResult = aiAnalysisMap[0];
  const firstCondColors = firstAiResult ? getConditionColor(firstAiResult.condition) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-sky-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
              <ImagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Impor Foto ke Ruas Jalan
              </h3>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                Ruas {ruas.nomorRuas} - {ruas.namaRuas} ({ruas.panjangKm} km • STA Akhir: {formatSTA(maxStaMeters)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/40 text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Pilih File Foto (*.JPG, *.PNG — mendukung banyak foto)
            </label>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/jpg,image/webp"
              onChange={handleFilesChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-500 file:text-slate-950 hover:file:bg-sky-400 cursor-pointer"
            />
            {selectedFiles.length > 0 && (
              <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {selectedFiles.length} foto dipilih ({selectedFiles.map((f) => f.name).join(', ')})
                </span>
              </div>
            )}

            {previewUrl && (
              <div className="mt-2">
                <img
                  src={previewUrl}
                  alt="Pratinjau Foto"
                  className="w-full h-36 object-cover rounded-lg border border-slate-700"
                />
              </div>
            )}
          </div>

          {/* Deteksi Otomatis Kerusakan Jalan dari Foto (AI) */}
          <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDetectAI}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoDetectAI(checked);
                    if (checked) {
                      setHasDefect(false);
                      if (selectedFiles[0] && !aiAnalysisMap[0]) {
                        void runPreviewAnalysis(selectedFiles[0], staMeters);
                      }
                    }
                  }}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <span className="text-amber-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Deteksi Otomatis Tingkat Kerusakan Jalan (AI)</span>
                </span>
              </label>

              {selectedFiles.length > 0 && autoDetectAI && !hasDefect && (
                <button
                  type="button"
                  onClick={() => void runPreviewAnalysis(selectedFiles[0], staMeters)}
                  disabled={isAnalyzingPreview}
                  className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <ScanSearch className="w-3 h-3" />
                  <span>Analisis Ulang</span>
                </button>
              )}
            </div>

            {autoDetectAI && !hasDefect && (
              <>
                {isAnalyzingPreview && (
                  <div className="flex items-center gap-2 text-[11px] text-sky-300 bg-sky-950/50 border border-sky-500/30 rounded-lg px-2.5 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Menganalisis jenis permukaan &amp; tingkat kerusakan jalan dari foto...</span>
                  </div>
                )}

                {aiPreviewError && (
                  <div className="text-[11px] text-rose-300 bg-rose-950/50 border border-rose-500/30 rounded-lg px-2.5 py-2 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{aiPreviewError}</span>
                  </div>
                )}

                {!isAnalyzingPreview && firstAiResult && firstCondColors && (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Tingkat Kerusakan PKRMS:</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${firstCondColors.badgeBg}`}
                      >
                        {firstAiResult.condition} (SDI ~{firstAiResult.sdiEstimate}, IRI ~{firstAiResult.iriEstimate})
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Perkerasan Terdeteksi:</span>
                      <span className="text-slate-200 font-semibold">{firstAiResult.detectedSurfaceType}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Rekomendasi:</span>
                      <span className="text-emerald-400 font-semibold">{firstAiResult.recommendation}</span>
                    </div>
                    {firstAiResult.defects.length > 0 ? (
                      <div className="pt-1 border-t border-slate-800 space-y-1">
                        <div className="text-[10px] text-rose-300 font-semibold">
                          Cacat Terdeteksi ({firstAiResult.defects.length}):
                        </div>
                        {firstAiResult.defects.map((d) => (
                          <div key={d.id} className="text-[10px] text-slate-300 flex items-center justify-between gap-2">
                            <span>• {d.type}</span>
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                              {d.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="pt-1 border-t border-slate-800 text-[10px] text-emerald-400">
                        • Tidak ditemukan lubang/retak signifikan pada foto ini.
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 italic pt-0.5">{firstAiResult.summary}</p>
                    {staSchedule.length > 1 && (
                      <p className="text-[10px] text-sky-400">
                        Foto ke-2 s.d. ke-{staSchedule.length} akan dianalisis otomatis satu per satu saat disimpan.
                      </p>
                    )}
                  </div>
                )}

                {!isAnalyzingPreview && !firstAiResult && !aiPreviewError && selectedFiles.length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    Pilih foto jalan, lalu sistem AI akan otomatis mendeteksi jenis kerusakan (lubang, retak, amblas) dan tingkat kondisinya (Baik, Sedang, Rusak Ringan, Rusak Berat).
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">STA Awal (Meter)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max={maxStaMeters}
                  value={staMeters}
                  onChange={(e) => {
                    const nextSta = Math.max(
                      0,
                      Math.min(maxStaMeters, Math.round(Number(e.target.value) || 0))
                    );
                    setStaMeters(nextSta);
                    if (autoCoordFromRoute) {
                      const [nextLat, nextLng] = interpolateCoordAlongRuas(ruas, nextSta);
                      setLat(nextLat);
                      setLng(nextLng);
                    }
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono"
                />
                <span className="text-[10px] text-sky-400 font-mono mt-1 block">
                  {formatSTA(staMeters)} (+100m/foto)
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400">STA Akhir (Meter)</label>
                  {maxStaMeters !== roadMaxStaMeters ? (
                    <button
                      type="button"
                      onClick={() => setEndStaMeters(roadMaxStaMeters)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                    >
                      Reset ({roadMaxStaMeters} m)
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      Otomatis Panjang Ruas
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="1"
                  min={staMeters}
                  max={roadMaxStaMeters}
                  value={endStaMeters}
                  onChange={(e) => {
                    const raw = Math.round(Number(e.target.value) || 0);
                    setEndStaMeters(Math.max(0, Math.min(roadMaxStaMeters, raw)));
                  }}
                  onBlur={() => setEndStaMeters(maxStaMeters)}
                  className="w-full bg-slate-800 border border-emerald-500/40 rounded-lg p-2.5 text-emerald-300 font-mono font-semibold"
                />
                <span className="text-[10px] text-emerald-400 font-mono mt-1 block">
                  {formatSTA(maxStaMeters)} (Panjang: {ruas.panjangKm} km)
                </span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-slate-400">Koordinat GPS Awal (Lat / Lng)</label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-emerald-300">
                  <input
                    type="checkbox"
                    checked={autoCoordFromRoute}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAutoCoordFromRoute(checked);
                      if (checked) {
                        const [calcLat, calcLng] = interpolateCoordAlongRuas(ruas, staMeters);
                        setLat(calcLat);
                        setLng(calcLng);
                      }
                    }}
                    className="w-3.5 h-3.5 accent-emerald-500 rounded"
                  />
                  <span>Otomatis ikuti rute peta per 100m</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.000001"
                  value={lat}
                  onChange={(e) => {
                    setAutoCoordFromRoute(false);
                    setLat(Number(e.target.value));
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono text-[11px]"
                />
                <input
                  type="number"
                  step="0.000001"
                  value={lng}
                  onChange={(e) => {
                    setAutoCoordFromRoute(false);
                    setLng(Number(e.target.value));
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono text-[11px]"
                />
              </div>
            </div>

            {selectedFiles.length > 0 && skippedCount > 0 && (
              <div className="bg-amber-950/60 border border-amber-500/40 rounded-lg px-2.5 py-2 text-[11px] text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Panjang ruas jalan berhenti di <b>{formatSTA(maxStaMeters)}</b> ({ruas.panjangKm} km).
                  Sebanyak <b>{staSchedule.length} foto</b> akan diimpor per 100m dan berhenti di akhir ruas;{' '}
                  <b>{skippedCount} foto</b> berikutnya dilewati.
                </span>
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div className="bg-slate-950/70 border border-emerald-500/30 rounded-lg p-2.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-300">
                  Jadwal Impor per 100m ({staSchedule.length}/{selectedFiles.length} Foto, Berhenti di {formatSTA(maxStaMeters)}):
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1 font-mono text-[10px] text-slate-300">
                  {selectedFiles.map((f, idx) => {
                    const pSta = staSchedule[idx];
                    if (pSta === undefined) {
                      return (
                        <div
                          key={`${f.name}-${idx}`}
                          className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-0.5 last:border-b-0 opacity-55"
                        >
                          <span className="text-rose-400 shrink-0">Dilewati</span>
                          <span className="truncate text-slate-500">{f.name}</span>
                          <span className="text-slate-500 shrink-0">&gt; {formatSTA(maxStaMeters)}</span>
                        </div>
                      );
                    }
                    const [pLat, pLng] = autoCoordFromRoute
                      ? interpolateCoordAlongRuas(ruas, pSta)
                      : [lat, lng];
                    const isEnd = pSta === maxStaMeters;
                    return (
                      <div
                        key={`${f.name}-${idx}`}
                        className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-0.5 last:border-b-0"
                      >
                        <span className="text-sky-400 shrink-0">
                          {formatSTA(pSta)}
                          {isEnd ? ' (Akhir)' : ''}
                        </span>
                        <span className="truncate text-slate-400">{f.name}</span>
                        <span className="text-emerald-300 shrink-0">
                          {pLat.toFixed(6)}, {pLng.toFixed(6)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDefect}
                onChange={(e) => setHasDefect(e.target.checked)}
                className="w-4 h-4 accent-sky-500 rounded"
              />
              <span className="text-slate-200 font-semibold">
                Override Manual Catatan Kerusakan / Cacat Jalan
              </span>
            </label>

            {hasDefect && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Jenis Cacat Permukaan</label>
                    <select
                      value={defectType}
                      onChange={(e) => setDefectType(e.target.value as DefectType)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="Lubang (Pothole)">Lubang (Pothole)</option>
                      <option value="Retak Buaya (Alligator Cracking)">
                        Retak Buaya (Alligator Cracking)
                      </option>
                      <option value="Retak Memanjang / Melintang">
                        Retak Memanjang / Melintang
                      </option>
                      <option value="Retak Tepi (Edge Crack)">Retak Tepi (Edge Crack)</option>
                      <option value="Amblas / Alur (Rutting/Depression)">
                        Amblas / Alur (Rutting/Depression)
                      </option>
                      <option value="Kerusakan Tepi (Edge Damage)">
                        Kerusakan Tepi (Edge Damage)
                      </option>
                      <option value="Permukaan Aus / Lepas (Ravelling)">
                        Permukaan Aus / Lepas (Ravelling)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Tingkat Keparahan</label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as PKRMSSeverity)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="Ringan">Ringan</option>
                      <option value="Sedang">Sedang</option>
                      <option value="Berat">Berat</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Catatan Lapangan</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>
                {isProcessing
                  ? progressText || 'Mengimpor Foto...'
                  : staSchedule.length > 0
                    ? `Impor & Simpan (${staSchedule.length} Foto)`
                    : 'Impor & Simpan Foto'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
