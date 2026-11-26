import React, { useEffect, useState } from 'react';
import { X, Upload, Video as VideoIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { RuasJalan, SurveyVideo } from '../types';
import { formatSTA, drawWatermark } from '../utils/geo';
import { generateSHA256 } from '../utils/crypto';
import { drawImageCover3R } from '../utils/photo3r';
import { saveVideoBlobToStorage, createCompactVideoThumbnail } from '../utils/videoRecorder';

interface ImportVideoModalProps {
  ruas: RuasJalan | null;
  isOnline: boolean;
  onClose: () => void;
  onImportVideo: (video: SurveyVideo) => void;
}

export const ImportVideoModal: React.FC<ImportVideoModalProps> = ({
  ruas,
  isOnline,
  onClose,
  onImportVideo,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [startStaMeters, setStartStaMeters] = useState<number>(0);
  const [endStaMeters, setEndStaMeters] = useState<number>(200);
  const [defectsCount, setDefectsCount] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ruas) {
      setSelectedFiles([]);
      setStartStaMeters(0);
      setEndStaMeters(Math.min(1000, Math.round(ruas.panjangKm * 1000)));
      setDefectsCount(0);
      setPreviewUrl(null);
      setErrorMsg(null);
      setIsProcessing(false);
    }
  }, [ruas]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!ruas) return null;

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []) as File[];
    if (fileList.length === 0) return;
    setErrorMsg(null);
    setSelectedFiles(fileList);

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(fileList[0]));
  };

  const extractVideoMetadataAndThumbnail = async (
    file: File,
    targetRuas: RuasJalan,
    startSta: number
  ): Promise<{ durationSeconds: number; thumbnailUrl: string }> => {
    const tempUrl = URL.createObjectURL(file);
    try {
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.src = tempUrl;

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        videoEl.onloadeddata = finish;
        videoEl.onloadedmetadata = () => {
          if (videoEl.readyState >= 2) finish();
        };
        videoEl.onerror = finish;
        setTimeout(finish, 3000);
      });

      const durationSeconds =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0
          ? Math.max(1, Math.round(videoEl.duration))
          : 15;

      let thumbnailUrl = '';
      try {
        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = 960;
          canvas.height = 540;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawImageCover3R(ctx, videoEl, 960, 540);
            drawWatermark(ctx, 960, 540, {
              nomorRuas: targetRuas.nomorRuas,
              namaRuas: targetRuas.namaRuas,
              staText: formatSTA(startSta),
              lat: targetRuas.koordinatAwal[0],
              lng: targetRuas.koordinatAwal[1],
            });
            thumbnailUrl = createCompactVideoThumbnail(canvas);
          }
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch {
        thumbnailUrl = '';
      }

      return { durationSeconds, thumbnailUrl };
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setErrorMsg('Pilih minimal 1 file video (*.MP4, *.WEBM, *.MOV, *.MPEG) terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const roadMaxMeters = Math.max(0, Math.round(ruas.panjangKm * 1000));
      const baseStart = Number.isFinite(startStaMeters) ? Math.max(0, startStaMeters) : 0;
      const baseEnd = Number.isFinite(endStaMeters)
        ? Math.max(baseStart, endStaMeters)
        : Math.max(baseStart, roadMaxMeters);
      const safeDefectsCount = Number.isFinite(defectsCount) ? Math.max(0, Math.round(defectsCount)) : 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const videoId = `video-import-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;
        const startSta = Math.max(0, baseStart + i * 200);
        const endSta = Math.max(startSta, baseEnd + i * 200);
        const { durationSeconds, thumbnailUrl } = await extractVideoMetadataAndThumbnail(
          file,
          ruas,
          startSta
        );

        const entry = await saveVideoBlobToStorage(
          videoId,
          file,
          file.type || 'video/mp4',
          file.name
        );

        const timestampIso = new Date().toISOString();
        let hashSha256 = `sha256-${Date.now()}-${i}`;
        try {
          hashSha256 = await generateSHA256(
            `${ruas.id}-${startSta}-${endSta}-${file.name}-${file.size}-${timestampIso}`
          );
        } catch {
          // keep fallback hash
        }

        const newVideo: SurveyVideo = {
          id: videoId,
          ruasId: ruas.id,
          ruasNama: ruas.namaRuas,
          nomorRuas: ruas.nomorRuas,
          startSta,
          endSta,
          timestamp: timestampIso,
          durationSeconds,
          videoUrl: entry.blobUrl,
          fileSizeBytes: file.size,
          defectsCount: safeDefectsCount,
          syncStatus: isOnline ? 'synced' : 'pending',
          hashSha256,
          thumbnailUrl,
        };

        onImportVideo(newVideo);
      }
      onClose();
    } catch (err) {
      console.error('Import video error:', err);
      setErrorMsg(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengimpor berkas video.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <VideoIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Impor Video ke Ruas Jalan
              </h3>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                Ruas {ruas.nomorRuas} - {ruas.namaRuas} ({ruas.panjangKm} km)
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
              Pilih File Video (*.MP4, *.WEBM, *.MOV, *.MPEG — mendukung banyak video)
            </label>
            <input
              type="file"
              multiple
              accept="video/mp4,video/webm,video/quicktime,video/mpeg,video/*"
              onChange={handleFilesChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-rose-500 file:text-white hover:file:bg-rose-400 cursor-pointer"
            />
            {selectedFiles.length > 0 && (
              <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {selectedFiles.length} video dipilih ({selectedFiles.map((f) => f.name).join(', ')})
                </span>
              </div>
            )}

            {previewUrl && (
              <div className="mt-2">
                <video
                  src={previewUrl}
                  controls
                  muted
                  className="w-full max-h-44 rounded-lg border border-slate-700 bg-black"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">STA Mulai (m)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={startStaMeters}
                onChange={(e) => setStartStaMeters(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">STA Akhir (m)</label>
              <input
                type="number"
                step="1"
                min={startStaMeters}
                value={endStaMeters}
                onChange={(e) => setEndStaMeters(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Titik Cacat</label>
              <input
                type="number"
                min="0"
                value={defectsCount}
                onChange={(e) => setDefectsCount(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
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
              className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              <span>{isProcessing ? 'Mengimpor Video...' : 'Impor & Simpan Video'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
