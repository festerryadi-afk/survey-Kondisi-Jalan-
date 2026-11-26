import React, { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Layers,
  Image as ImageIcon,
  Video as VideoIcon,
  Map as MapIcon,
  Link2,
  Smartphone,
  Sparkles,
  FileJson,
} from 'lucide-react';
import {
  ImportedKmlLayer,
  MapConditionColors,
  NotificationPush,
  RuasJalan,
  SurveyPhoto,
  SurveyVideo,
} from '../types';
import {
  buildCompactShareUrl,
  createFullAppPublishPackage,
  downloadPublishPackageJson,
  importFullAppPublishPackage,
  RestoredPublishState,
} from '../utils/publishPackage';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PublishDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruasList: RuasJalan[];
  kmlLayers: ImportedKmlLayer[];
  conditionColors: MapConditionColors;
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  notifications: NotificationPush[];
  onRestorePublishState: (state: RestoredPublishState) => void;
}

export const PublishDataModal: React.FC<PublishDataModalProps> = ({
  isOpen,
  onClose,
  ruasList,
  kmlLayers,
  conditionColors,
  photos,
  videos,
  notifications,
  onRestorePublishState,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const totalStaSegments = ruasList.reduce(
    (sum, r) => sum + (r.staSegments?.length || 0),
    0
  );
  const totalKmlObjects = kmlLayers.reduce((sum, l) => sum + l.features.length, 0);
  const cleanUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';

  const handleCopyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    } catch {
      setStatusMessage({
        type: 'warning',
        text: 'Tidak dapat menyalin otomatis. Silakan salin alamat URL dari kolom di atas.',
      });
    }
  };

  const handleExportFullPackage = async () => {
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const { snapshot, skippedLargeVideos } = await createFullAppPublishPackage({
        ruasList,
        kmlLayers,
        conditionColors,
        photos,
        videos,
        notifications,
      });
      const filename = downloadPublishPackageJson(snapshot);
      setStatusMessage({
        type: skippedLargeVideos > 0 ? 'warning' : 'success',
        text:
          skippedLargeVideos > 0
            ? `Paket data "${filename}" berhasil diunduh (${ruasList.length} ruas, ${kmlLayers.length} layer KML/KMZ, ${photos.length} foto). ${skippedLargeVideos} video >45MB dilewati agar file tetap stabil.`
            : `Paket data lengkap "${filename}" berhasil diunduh (${ruasList.length} ruas, ${totalStaSegments} segmen STA, ${kmlLayers.length} layer KML/KMZ, ${photos.length} foto, ${videos.length} video).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat paket data publish.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setStatusMessage(null);
    try {
      const restored = await importFullAppPublishPackage(file);
      onRestorePublishState(restored);
      setStatusMessage({
        type: 'success',
        text: `Berhasil memulihkan ${restored.ruasList.length} ruas jalan, ${restored.kmlLayers.length} layer KML/KMZ, ${restored.photos.length} foto, dan ${restored.videos.length} video (${restored.restoredVideoBlobCount} file video offline).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file paket data.',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyShareDataUrl = async () => {
    setStatusMessage(null);
    const { url, tooLarge } = buildCompactShareUrl(cleanUrl, {
      ruasList,
      kmlLayers,
      conditionColors,
    });
    if (tooLarge) {
      setStatusMessage({
        type: 'warning',
        text: 'Ukuran data Ruas/KML terlalu besar untuk tautan URL (>60 KB). Gunakan "Ekspor Seluruh Data (*.json)" di atas agar semua data terbawa utuh.',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 3000);
      setStatusMessage({
        type: 'success',
        text: 'Tautan Publish + data Ruas, STA, KML/KMZ & warna layer berhasil disalin. Untuk membawa foto & video, gunakan juga paket (*.json).',
      });
    } catch {
      setStatusMessage({
        type: 'warning',
        text: 'Gagal menyalin tautan ke clipboard. Gunakan tombol Ekspor (*.json) sebagai gantinya.',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/pwa-192x192.png"
              alt="Ikon Aplikasi Survey Jalan Kab. Mentawai"
              className="w-12 h-12 rounded-xl border border-slate-700 shadow-md object-cover bg-slate-900 shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base sm:text-lg">
                  Publish Aplikasi &amp; Paket Data
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Siap Publish
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ikon aplikasi sudah identik dengan logo header Mentawai • Kelola transfer data saat publish
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Tutup modal publish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-xs text-slate-300">
          {/* App Icon Preview + PWA Install */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <img
                  src="/pwa-192x192.png"
                  alt="Preview Icon Launcher"
                  className="w-14 h-14 rounded-2xl border border-amber-500/40 shadow-lg object-cover"
                />
                <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-[9px]">
                  ICON
                </span>
              </div>
              <div>
                <div className="font-bold text-white text-sm">
                  Survey Kondisi Jalan Kabupaten
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Favicon, Apple Touch Icon (180×180), dan Icon APK/PWA (192×192 &amp; 512×512) menggunakan lambang resmi Kabupaten Kepulauan Mentawai dari header aplikasi.
                </p>
              </div>
            </div>

            {isInstallable ? (
              <button
                onClick={() => void install()}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Instal Aplikasi (PWA)</span>
              </button>
            ) : isInstalled ? (
              <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Terpasang</span>
              </div>
            ) : isIOS ? (
              <div className="shrink-0 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Safari: Bagikan → Tambah ke Layar Utama</span>
              </div>
            ) : null}
          </div>

          {/* Data Summary */}
          <div>
            <div className="font-bold text-white text-xs mb-2.5 flex items-center gap-1.5">
              <Rocket className="w-4 h-4 text-amber-400" />
              <span>Ringkasan Data Tersimpan Saat Ini</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ruas Jalan</span>
                </div>
                <div className="text-lg font-extrabold text-white">{ruasList.length}</div>
                <div className="text-[10px] text-slate-400">{totalStaSegments} segmen STA</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-sky-400 font-semibold mb-1">
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>Layer KML/KMZ</span>
                </div>
                <div className="text-lg font-extrabold text-white">{kmlLayers.length}</div>
                <div className="text-[10px] text-slate-400">{totalKmlObjects} objek peta</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Foto Survei</span>
                </div>
                <div className="text-lg font-extrabold text-white">{photos.length}</div>
                <div className="text-[10px] text-slate-400">Watermark HD</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1">
                  <VideoIcon className="w-3.5 h-3.5" />
                  <span>Video Survei</span>
                </div>
                <div className="text-lg font-extrabold text-white">{videos.length}</div>
                <div className="text-[10px] text-slate-400">Rekam &amp; Impor</div>
              </div>
            </div>
          </div>

          {/* Full Bundle Export / Import */}
          <div className="bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950 border border-amber-500/30 rounded-2xl p-4 space-y-3">
            <div>
              <div className="font-bold text-white text-xs flex items-center gap-2">
                <FileJson className="w-4 h-4 text-amber-400" />
                <span>Paket Data Lengkap untuk Publish (Semua Ruas, STA, KML, Warna, Foto &amp; Video)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Karena data yang Anda input tersimpan di penyimpanan lokal browser pada domain saat ini, unduh paket data di bawah lalu muat kembali pada tautan hasil Publish agar seluruh data ikut terbawa 100%.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleExportFullPackage}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? 'Mengemas Data...' : 'Ekspor Seluruh Data (*.json)'}</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{isImporting ? 'Memulihkan...' : 'Muat Data Publish (*.json)'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Status message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                  : statusMessage.type === 'warning'
                    ? 'bg-amber-950/80 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Shareable Link & Publish Guide */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="font-bold text-white text-xs flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-sky-400" />
              <span>Tautan Aplikasi &amp; Langkah Publish</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cleanUrl}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 font-mono truncate"
              />
              <button
                onClick={handleCopyCurrentUrl}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedOrigin ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedOrigin ? 'Tersalin' : 'Salin URL'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-400">
                Salin tautan bawa data Ruas, STA, KML/KMZ &amp; Warna (tanpa media besar):
              </span>
              <button
                onClick={handleCopyShareDataUrl}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedShareLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                <span>{copiedShareLink ? 'Tautan + Data Tersalin' : 'Salin Tautan + Data Peta'}</span>
              </button>
            </div>

            <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              <li>
                Klik tombol <strong className="text-slate-200">Ekspor Seluruh Data (*.json)</strong> di atas untuk mengamankan semua ruas, segmen STA, layer KML/KMZ, warna peta, foto, dan video.
              </li>
              <li>
                Publish / bagikan aplikasi melalui menu <strong className="text-slate-200">Share / Deploy</strong> AI Studio ke URL publik Anda.
              </li>
              <li>
                Buka URL hasil Publish tersebut, klik <strong className="text-slate-200">Publish &amp; Data</strong> di header, lalu pilih <strong className="text-slate-200">Muat Data Publish (*.json)</strong>.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            DPUPR Kab. Kepulauan Mentawai • PWA &amp; Offline Ready
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
