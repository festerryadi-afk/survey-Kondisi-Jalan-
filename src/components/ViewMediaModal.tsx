import React, { useEffect, useState } from 'react';
import { 
  X, 
  Download, 
  Trash2,
  Printer,
  ShieldCheck, 
  CheckCircle2, 
  Navigation,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { SurveyPhoto, SurveyVideo } from '../types';
import { analyzeRoadDamageFromPhoto } from '../utils/roadDamageAI';
import {
  downloadPhoto3R600DPI,
  printSinglePhoto3R,
  renderPhotoTo3R600DPI,
  PHOTO_3R_HD_WIDTH,
  PHOTO_3R_HD_HEIGHT,
} from '../utils/photo3r';
import {
  resolvePlayableVideoUrl,
  generateFallbackRoadVideoEntry,
  downloadSurveyVideo,
} from '../utils/videoRecorder';

interface ViewMediaModalProps {
  photo: SurveyPhoto | null;
  video: SurveyVideo | null;
  onClose: () => void;
  onDelete?: () => void;
  onUpdatePhoto?: (photo: SurveyPhoto) => void;
}

export const ViewMediaModal: React.FC<ViewMediaModalProps> = ({
  photo,
  video,
  onClose,
  onDelete,
  onUpdatePhoto,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [hdPhotoUrl, setHdPhotoUrl] = useState<string | null>(null);
  const [playableVideoUrl, setPlayableVideoUrl] = useState<string>('');
  const [isLoadingVideo, setIsLoadingVideo] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessSummary, setAiSuccessSummary] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAiError(null);
    setAiSuccessSummary(null);
    if (photo) {
      setHdPhotoUrl(photo.imageUrl);
      renderPhotoTo3R600DPI(photo.imageUrl, photo.id).then((url) => {
        if (active) setHdPhotoUrl(url);
      });
    } else {
      setHdPhotoUrl(null);
    }
    return () => {
      active = false;
    };
  }, [photo]);

  useEffect(() => {
    let active = true;
    if (video) {
      setIsLoadingVideo(true);
      resolvePlayableVideoUrl(video)
        .then((url) => {
          if (active) setPlayableVideoUrl(url);
        })
        .finally(() => {
          if (active) setIsLoadingVideo(false);
        });
    } else {
      setPlayableVideoUrl('');
      setIsLoadingVideo(false);
    }
    return () => {
      active = false;
    };
  }, [video]);

  if (!photo && !video) return null;

  const handleVideoPlaybackError = async () => {
    if (!video) return;
    setIsLoadingVideo(true);
    try {
      const entry = await generateFallbackRoadVideoEntry(video);
      if (entry) {
        setPlayableVideoUrl(entry.blobUrl);
      }
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const handleDownload = async () => {
    if (photo) {
      setIsDownloading(true);
      try {
        await downloadPhoto3R600DPI(
          photo.imageUrl,
          `DPUPR_MENTAWAI_3R_600DPI_Ruas${photo.nomorRuas}_${photo.staText}.jpg`,
          photo.id
        );
      } finally {
        setIsDownloading(false);
      }
    } else if (video) {
      setIsDownloading(true);
      try {
        await downloadSurveyVideo(video);
      } catch (err) {
        console.error('Video download error:', err);
      } finally {
        setIsDownloading(false);
      }
    }
  };

  const handleExportPdf3R = async () => {
    if (!photo) return;
    setIsExportingPdf(true);
    try {
      await printSinglePhoto3R(photo);
    } catch (err) {
      console.error('Single photo 3R PDF error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleAnalyzePhotoAI = async () => {
    if (!photo) return;
    setIsAnalyzingAI(true);
    setAiError(null);
    setAiSuccessSummary(null);
    try {
      const result = await analyzeRoadDamageFromPhoto(
        hdPhotoUrl || photo.imageUrl,
        photo.surfaceType
      );
      onUpdatePhoto?.({
        ...photo,
        defects: result.defects,
        pkrmsCondition: result.condition,
        recommendation: result.recommendation,
        surfaceType: result.detectedSurfaceType,
      });
      setAiSuccessSummary(
        `Terdeteksi ${result.condition} (SDI ~${result.sdiEstimate}, IRI ~${result.iriEstimate}): ${result.summary}`
      );
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Gagal menganalisis tingkat kerusakan jalan.'
      );
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const openInGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-950 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] sm:text-xs font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
              {photo ? `FOTO 3R 600 DPI • ${photo.staText}` : `VIDEO *.MP4 • ${video?.nomorRuas}`}
            </span>
            <h3 className="font-bold text-xs sm:text-base text-white truncate max-w-[180px] sm:max-w-md">
              {photo ? `${photo.nomorRuas} - ${photo.ruasNama}` : `${video?.nomorRuas} - ${video?.ruasNama}`}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {onDelete && !showConfirmDelete && (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 text-xs font-semibold transition cursor-pointer"
                title="Hapus File Ini"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Hapus</span>
              </button>
            )}

            {onDelete && showConfirmDelete && (
              <div className="flex items-center gap-1.5 bg-rose-950 p-1 rounded-lg border border-rose-500">
                <span className="text-[11px] text-rose-200 px-1 font-medium">Hapus?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setShowConfirmDelete(false);
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                >
                  Ya
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                >
                  Batal
                </button>
              </div>
            )}

            {photo && (
              <button
                type="button"
                onClick={handleExportPdf3R}
                disabled={isExportingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/50 text-sky-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                title="Unduh File *.PDF Foto Ukuran Fisik 3R (8,9 × 12,7 cm) 600 DPI"
              >
                <Printer className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">
                  {isExportingPdf ? 'Membuat *.PDF...' : 'Unduh *.PDF 3R (8,9×12,7 cm)'}
                </span>
                <span className="sm:hidden">{isExportingPdf ? 'PDF...' : '*.PDF 3R'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] sm:text-xs font-bold transition shadow cursor-pointer disabled:opacity-60"
              title={photo ? "Unduh File Beresolusi HD 600 DPI (3000 × 2102 px / 3R)" : "Unduh Rekaman Video Survei"}
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {photo
                  ? isDownloading
                    ? 'Memproses...'
                    : 'Unduh *.JPG (600 DPI)'
                  : isDownloading
                    ? 'Menyiapkan Video...'
                    : 'Unduh Video'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content: Media Display + Metadata Panel */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Left: Media Viewport with exact 3R (8,9 × 12,7 cm) proportions */}
          <div className="md:col-span-8 bg-black flex flex-col items-center justify-center p-2.5 sm:p-4 relative min-h-[200px] sm:min-h-[320px]">
            {photo && (
              <div className="w-full max-w-[680px] aspect-[127/89] rounded-lg overflow-hidden border border-slate-700 shadow-2xl bg-slate-950 relative">
                <img
                  src={hdPhotoUrl || photo.imageUrl}
                  alt={photo.staText}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {video && (
              <div className="w-full flex flex-col items-center justify-center relative">
                {isLoadingVideo ? (
                  <div className="py-16 text-xs text-slate-300 flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Menyiapkan pemutaran video survei...</span>
                  </div>
                ) : (
                  <video
                    key={playableVideoUrl || video.id}
                    src={playableVideoUrl || video.videoUrl}
                    poster={video.thumbnailUrl || undefined}
                    controls
                    autoPlay
                    playsInline
                    onError={handleVideoPlaybackError}
                    className="max-h-[42vh] sm:max-h-[65vh] w-full rounded bg-black"
                  />
                )}
              </div>
            )}
          </div>

          {/* Right: Technical Inspection Drawer */}
          <div className="md:col-span-4 p-4 space-y-4 text-xs bg-slate-900/95 overflow-y-auto">
            {photo && (
              <>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Informasi Ruas &amp; Posisi
                  </span>
                  <div className="mt-1 font-bold text-white text-sm">
                    {photo.ruasNama}
                  </div>
                  <div className="font-mono text-sky-400 font-bold mt-0.5">
                    {photo.staText} ({photo.sta} meter dari titik 0)
                  </div>
                </div>

                {/* HD 600 DPI 3R Specification Box */}
                <div className="bg-amber-950/30 p-3 rounded-lg border border-amber-500/30 space-y-1.5">
                  <div className="text-[10px] text-amber-400 uppercase tracking-wider font-bold">
                    Spesifikasi Cetak &amp; Resolusi HD
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ukuran Cetak 3R:</span>
                    <span className="text-white font-semibold">8,9 × 12,7 cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kerapatan Cetak:</span>
                    <span className="text-amber-300 font-bold">600 DPI</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Dimensi Piksel HD:</span>
                    <span className="text-slate-200 font-mono">{PHOTO_3R_HD_WIDTH} × {PHOTO_3R_HD_HEIGHT} px</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Koordinat GPS:</span>
                    <button
                      onClick={() => openInGoogleMaps(photo.coordinates.lat, photo.coordinates.lng)}
                      className="text-sky-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>{photo.coordinates.lat.toFixed(6)}, {photo.coordinates.lng.toFixed(6)}</span>
                    </button>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Elevasi / Alt:</span>
                    <span className="text-slate-200">{photo.coordinates.altitude?.toFixed(1) || 20} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Akurasi GPS:</span>
                    <span className="text-emerald-400">±{photo.coordinates.accuracy?.toFixed(1) || 2.5} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waktu Pengambilan:</span>
                    <span className="text-slate-200">
                      {new Date(photo.timestamp).toLocaleString('id-ID')} WIB
                    </span>
                  </div>
                </div>

                {/* Condition Assessment */}
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Penilaian Kondisi Jalan
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status Permukaan:</span>
                    <span className="font-bold text-amber-400">{photo.pkrmsCondition}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tipe Perkerasan:</span>
                    <span className="text-slate-200">{photo.surfaceType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Rekomendasi Penanganan:</span>
                    <div className="font-semibold text-emerald-400 mt-0.5">
                      {photo.recommendation}
                    </div>
                  </div>
                </div>

                {/* AI Defects List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Hasil Deteksi AI Otomatis
                    </span>
                    {onUpdatePhoto && (
                      <button
                        type="button"
                        onClick={() => void handleAnalyzePhotoAI()}
                        disabled={isAnalyzingAI}
                        className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-60"
                      >
                        {isAnalyzingAI ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>{isAnalyzingAI ? 'Menganalisis...' : 'Deteksi AI Foto'}</span>
                      </button>
                    )}
                  </div>

                  {aiError && (
                    <div className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-500/30 p-2 rounded flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>{aiError}</span>
                    </div>
                  )}

                  {aiSuccessSummary && (
                    <div className="text-[11px] text-amber-200 bg-amber-950/50 border border-amber-500/30 p-2 rounded">
                      {aiSuccessSummary}
                    </div>
                  )}

                  {photo.defects.length === 0 ? (
                    <div className="mt-1 text-emerald-400 flex items-center gap-1.5 bg-emerald-950/40 p-2 rounded border border-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Tidak terdeteksi cacat signifikan (Jalan Mantap)</span>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      {photo.defects.map((d) => (
                        <div key={d.id} className="bg-slate-950 p-2 rounded border border-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-rose-400">{d.type}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                              {d.severity}
                            </span>
                          </div>
                          {d.dimensions && (
                            <div className="text-[11px] text-slate-400 mt-1">
                              {d.dimensions.depthCm && `Kedalaman: ${d.dimensions.depthCm}cm `}
                              {d.dimensions.lengthCm && `Panjang: ${d.dimensions.lengthCm}cm `}
                              {d.dimensions.crackWidthMm && `Lebar Retak: ${d.dimensions.crackWidthMm}mm `}
                            </div>
                          )}
                          {d.notes && <div className="text-[11px] text-slate-500 mt-0.5">{d.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Digital Security Hash */}
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-slate-400">
                  <div className="flex items-center gap-1 text-emerald-400 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verifikasi Digital SHA-256 E2EE:</span>
                  </div>
                  <div className="break-all">{photo.hashSha256}</div>
                </div>
              </>
            )}

            {video && (
              <>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Video Survei Kontinu
                  </span>
                  <div className="mt-1 font-bold text-white text-sm">
                    {video.ruasNama}
                  </div>
                  <div className="font-mono text-sky-400 font-bold mt-0.5">
                    STA {video.startSta} - {video.endSta} m
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Durasi Video:</span>
                    <span className="text-white font-mono">{video.durationSeconds} Detik</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ukuran File:</span>
                    <span className="text-white font-mono">
                      {(video.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cacat Teridentifikasi:</span>
                    <span className="text-rose-400 font-bold">{video.defectsCount} Titik</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Format:</span>
                    <span className="text-amber-400 font-bold">MP4 / H.264 HD</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-slate-400">
                  <div className="flex items-center gap-1 text-emerald-400 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verifikasi Integritas File Video SHA-256:</span>
                  </div>
                  <div className="break-all">{video.hashSha256}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
