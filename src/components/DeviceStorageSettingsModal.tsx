import React, { useEffect, useState } from 'react';
import {
  X,
  HardDrive,
  FolderOpen,
  Download,
  Image as ImageIcon,
  Video as VideoIcon,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderCheck,
  FolderX,
  Loader2,
  Trash2,
} from 'lucide-react';
import { RuasJalan, SurveyPhoto, SurveyVideo } from '../types';
import {
  DeviceStorageEstimateInfo,
  DeviceStorageMode,
  DeviceStorageSettings,
  DirectoryHandleStatus,
  PhotoDeviceQuality,
  VideoBitratePreset,
  batchExportMediaToSavedFolder,
  clearSavedDirectoryHandle,
  formatStorageBytes,
  getDeviceStorageEstimate,
  getDirectoryHandleStatus,
  pickDeviceStorageFolder,
  requestPersistentDeviceStorage,
  requestSavedDirectoryPermission,
} from '../utils/deviceStorage';

interface DeviceStorageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DeviceStorageSettings;
  onChangeSettings: (next: DeviceStorageSettings) => void;
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  ruasList: RuasJalan[];
  onNavigateTab?: (tab: 'photos' | 'videos') => void;
  onClearAllPhotos?: () => void;
}

export const DeviceStorageSettingsModal: React.FC<DeviceStorageSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  photos,
  videos,
  ruasList,
  onNavigateTab,
  onClearAllPhotos,
}) => {
  const [estimate, setEstimate] = useState<DeviceStorageEstimateInfo | null>(null);
  const [dirStatus, setDirStatus] = useState<DirectoryHandleStatus>({
    supported: false,
    hasHandle: false,
    folderName: '',
    permission: 'unsupported',
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isRequestingPersist, setIsRequestingPersist] = useState<boolean>(false);
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(false);
  const [isBatchExporting, setIsBatchExporting] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirmClearPhotos, setConfirmClearPhotos] = useState<boolean>(false);

  const refreshStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const [est, dir] = await Promise.all([
        getDeviceStorageEstimate(),
        getDirectoryHandleStatus(),
      ]);
      setEstimate(est);
      setDirStatus(dir);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      setConfirmClearPhotos(false);
      void refreshStatus();
    }
  }, [isOpen, photos.length, videos.length]);

  if (!isOpen) return null;

  const totalVideoBytes = videos.reduce((acc, v) => acc + (v.fileSizeBytes || 0), 0);

  const handleSelectMode = (mode: DeviceStorageMode) => {
    onChangeSettings({ ...settings, storageMode: mode });
  };

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    setFeedback(null);
    try {
      const res = await pickDeviceStorageFolder();
      onChangeSettings({
        ...settings,
        storageMode: 'internal_and_folder',
        folderName: res.folderName,
      });
      await refreshStatus();
      setFeedback({
        type: 'success',
        message: `Folder "${res.folderName}" terhubung. Foto dan video survei baru dapat disimpan langsung ke folder ini.`,
      });
    } catch (err) {
      const errObj = err as Error & { name?: string };
      if (errObj?.name === 'AbortError') {
        return;
      }
      setFeedback({
        type: 'error',
        message:
          errObj instanceof Error
            ? errObj.message
            : 'Gagal memilih folder penyimpanan pada perangkat.',
      });
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleRegrantPermission = async () => {
    const perm = await requestSavedDirectoryPermission();
    await refreshStatus();
    if (perm === 'granted') {
      setFeedback({
        type: 'success',
        message: 'Izin tulis ke folder perangkat berhasil diaktifkan kembali.',
      });
    } else {
      setFeedback({
        type: 'error',
        message: 'Izin folder belum diberikan. Silakan pilih ulang folder penyimpanan.',
      });
    }
  };

  const handleDisconnectFolder = async () => {
    await clearSavedDirectoryHandle();
    onChangeSettings({
      ...settings,
      folderName: '',
      storageMode: settings.storageMode === 'internal_and_folder' ? 'internal_only' : settings.storageMode,
    });
    await refreshStatus();
    setFeedback({
      type: 'info',
      message: 'Koneksi folder perangkat dilepas. Hasil survei tetap aman di penyimpanan internal aplikasi.',
    });
  };

  const handleEnablePersistence = async () => {
    setIsRequestingPersist(true);
    try {
      const granted = await requestPersistentDeviceStorage();
      await refreshStatus();
      setFeedback({
        type: granted ? 'success' : 'info',
        message: granted
          ? 'Perlindungan Penyimpanan Permanen aktif. Foto & video survei tidak akan dihapus otomatis oleh sistem perangkat.'
          : 'Browser perangkat belum mengizinkan mode permanen otomatis, namun data tetap disimpan di IndexedDB lokal.',
      });
    } finally {
      setIsRequestingPersist(false);
    }
  };

  const handleBatchSyncToFolder = async () => {
    if (photos.length === 0 && videos.length === 0) {
      setFeedback({
        type: 'info',
        message: 'Belum ada foto atau video tersimpan untuk disalin ke folder.',
      });
      return;
    }

    setIsBatchExporting(true);
    setFeedback(null);
    setBatchProgress('Menyiapkan berkas...');
    try {
      const res = await batchExportMediaToSavedFolder({
        photos,
        videos,
        ruasList,
        settings,
        onProgress: (done, total, label) => {
          setBatchProgress(`${done}/${total} • ${label}`);
        },
      });
      setFeedback({
        type: 'success',
        message: `Berhasil menyalin ${res.exportedPhotos} foto dan ${res.exportedVideos} video ke folder "${dirStatus.folderName || settings.folderName}".${res.failed > 0 ? ` (${res.failed} file dilewati karena sumber belum tersedia)` : ''}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menyalin berkas ke folder perangkat.',
      });
    } finally {
      setIsBatchExporting(false);
      setBatchProgress('');
    }
  };

  const modeOptions: {
    id: DeviceStorageMode;
    title: string;
    desc: string;
    badge?: string;
    disabled?: boolean;
  }[] = [
    {
      id: 'internal_only',
      title: 'Penyimpanan Internal Aplikasi (IndexedDB)',
      desc: 'Aman offline, tanpa dialog pop-up saat survei. Foto 600 DPI & video dapat dilihat dan diunduh kapan saja.',
      badge: 'Stabil Offline',
    },
    {
      id: 'internal_and_folder',
      title: 'Internal + Simpan Langsung ke Folder Perangkat',
      desc: dirStatus.supported
        ? 'Menyimpan otomatis salinan file .JPG & video langsung ke folder perangkat pilihan Anda.'
        : 'Tidak didukung oleh browser/WebView ini — gunakan opsi Unduh Otomatis atau Penyimpanan Internal.',
      badge: dirStatus.supported ? 'Folder Langsung' : 'Tidak Didukung',
      disabled: !dirStatus.supported,
    },
    {
      id: 'auto_download',
      title: 'Internal + Unduh Otomatis ke Folder Download',
      desc: 'Otomatis mengunduh file foto & video ke folder Download perangkat begitu perekaman survei selesai.',
      badge: 'Universal Android',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Pengaturan Penyimpanan Foto &amp; Video Perangkat
              </h3>
              <p className="text-[11px] text-slate-400">
                Atur lokasi penyimpanan di HP/komputer, kualitas berkas, folder ruas, dan kapasitas memori
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`px-3 py-2.5 rounded-lg border flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : feedback.type === 'error'
                    ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                    : 'bg-sky-950/60 border-sky-500/40 text-sky-200'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              )}
              <span className="leading-relaxed">{feedback.message}</span>
            </div>
          )}

          {/* 1. Ringkasan Kapasitas Memori Perangkat */}
          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                <span>Status Penyimpanan Perangkat</span>
              </div>
              <div className="flex items-center gap-2">
                {estimate?.isPersisted ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    Penyimpanan Permanen Aktif
                  </span>
                ) : (
                  estimate?.supportsPersist && (
                    <button
                      type="button"
                      disabled={isRequestingPersist}
                      onClick={() => void handleEnablePersistence()}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold cursor-pointer"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>{isRequestingPersist ? 'Meminta Izin...' : 'Lindungi Data Permanen'}</span>
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  disabled={isLoadingStatus}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Segarkan info kapasitas penyimpanan"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {estimate && estimate.supportsEstimate && estimate.quotaBytes > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>Terpakai: {formatStorageBytes(estimate.usageBytes)}</span>
                  <span>Kuota Perangkat: {formatStorageBytes(estimate.quotaBytes)} ({estimate.usagePercent}%)</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      estimate.usagePercent > 80 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(2, estimate.usagePercent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-300">Arsip Foto</span>
                </div>
                <span className="font-mono font-bold text-white">{photos.length} File</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-2">
                  <VideoIcon className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-slate-300">Arsip Video</span>
                </div>
                <span className="font-mono font-bold text-white">
                  {videos.length} ({formatStorageBytes(totalVideoBytes)})
                </span>
              </div>
            </div>
          </div>

          {/* 2. Mode Lokasi Penyimpanan Perangkat */}
          <div className="space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>1. Lokasi Penyimpanan Foto &amp; Video pada Perangkat</span>
            </div>
            <div className="space-y-2">
              {modeOptions.map((opt) => {
                const selected = settings.storageMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelectMode(opt.id)}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-emerald-500/10 border-emerald-500/60 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs">{opt.title}</span>
                      {opt.badge && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            selected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel Konfigurasi Folder Perangkat (jika didukung / dipilih) */}
          {dirStatus.supported && (
            <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {dirStatus.hasHandle && dirStatus.permission === 'granted' ? (
                    <FolderCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-sky-400" />
                  )}
                  <div>
                    <div className="font-bold text-slate-200">
                      Folder Perangkat:{' '}
                      <span className="text-amber-300">
                        {dirStatus.hasHandle
                          ? dirStatus.folderName || settings.folderName
                          : 'Belum Dipilih'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {dirStatus.hasHandle
                        ? dirStatus.permission === 'granted'
                          ? 'Izin akses baca/tulis folder aktif'
                          : 'Izin akses folder perlu diperbarui'
                        : 'Pilih folder di penyimpanan HP/PC (mis. Download/SurveyMentawai)'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isPickingFolder}
                    onClick={() => void handlePickFolder()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-60"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{dirStatus.hasHandle ? 'Ganti Folder' : 'Pilih Folder'}</span>
                  </button>

                  {dirStatus.hasHandle && dirStatus.permission !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => void handleRegrantPermission()}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition cursor-pointer"
                    >
                      Aktifkan Izin
                    </button>
                  )}

                  {dirStatus.hasHandle && (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectFolder()}
                      title="Lepas tautan folder perangkat"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 cursor-pointer"
                    >
                      <FolderX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {dirStatus.hasHandle && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.organizeByRuasFolder}
                      onChange={(e) =>
                        onChangeSettings({ ...settings, organizeByRuasFolder: e.target.checked })
                      }
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                    <span className="text-slate-300">
                      Buat subfolder otomatis per Ruas Jalan (<span className="font-mono text-sky-300">Ruas_xxx/Foto &amp; Video</span>)
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={isBatchExporting || (photos.length === 0 && videos.length === 0)}
                    onClick={() => void handleBatchSyncToFolder()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] transition cursor-pointer"
                  >
                    {isBatchExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isBatchExporting
                        ? batchProgress || 'Menyalin...'
                        : 'Salin Semua Foto & Video ke Folder'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Setelan Kualitas & Otomatisasi Foto dan Video */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Foto Settings */}
            <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Penyimpanan Foto</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSavePhotosToDevice}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, autoSavePhotosToDevice: e.target.checked })
                    }
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300 font-semibold">Auto Simpan</span>
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 block">Resolusi File Tersimpan:</span>
                {(
                  [
                    {
                      id: 'hd_600dpi',
                      label: 'HD 600 DPI (3000×2102 px)',
                      sub: 'Kualitas cetak 3R terbaik (~1.5 MB/foto)',
                    },
                    {
                      id: 'standard_fhd',
                      label: 'Full HD Hemat Ruang (1920×1345 px)',
                      sub: 'Lebih hemat memori HP lapangan (~450 KB/foto)',
                    },
                  ] as { id: PhotoDeviceQuality; label: string; sub: string }[]
                ).map((q) => (
                  <label
                    key={q.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${
                      settings.photoQuality === q.id
                        ? 'bg-amber-500/10 border-amber-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="photo-device-quality"
                      checked={settings.photoQuality === q.id}
                      onChange={() => onChangeSettings({ ...settings, photoQuality: q.id })}
                      className="mt-0.5 accent-amber-500"
                    />
                    <div>
                      <div className="font-semibold text-[11px]">{q.label}</div>
                      <div className="text-[10px] text-slate-400">{q.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Video Settings */}
            <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <VideoIcon className="w-3.5 h-3.5" />
                  <span>Penyimpanan Video</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSaveVideosToDevice}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, autoSaveVideosToDevice: e.target.checked })
                    }
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300 font-semibold">Auto Simpan</span>
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 block">Bitrate &amp; Ukuran File Video:</span>
                {(
                  [
                    {
                      id: 'high_3mbps',
                      label: 'Tinggi 3 Mbps (Paling Jernih)',
                      sub: '~22 MB per menit rekaman survei',
                    },
                    {
                      id: 'balanced_2mbps',
                      label: 'Seimbang 2 Mbps',
                      sub: '~15 MB per menit rekaman survei',
                    },
                    {
                      id: 'compact_1mbps',
                      label: 'Hemat Memori 1.2 Mbps',
                      sub: '~9 MB per menit untuk ruas panjang',
                    },
                  ] as { id: VideoBitratePreset; label: string; sub: string }[]
                ).map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${
                      settings.videoBitratePreset === v.id
                        ? 'bg-rose-500/10 border-rose-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="video-bitrate-preset"
                      checked={settings.videoBitratePreset === v.id}
                      onChange={() => onChangeSettings({ ...settings, videoBitratePreset: v.id })}
                      className="mt-0.5 accent-rose-500"
                    />
                    <div>
                      <div className="font-semibold text-[11px]">{v.label}</div>
                      <div className="text-[10px] text-slate-400">{v.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Pintasan Kelola & Bersihkan Arsip */}
          <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {onNavigateTab && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateTab('photos');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-[11px] cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Buka Arsip Foto ({photos.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateTab('videos');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 font-semibold text-[11px] cursor-pointer"
                  >
                    <VideoIcon className="w-3.5 h-3.5" />
                    <span>Buka Arsip Video ({videos.length})</span>
                  </button>
                </>
              )}
            </div>

            {onClearAllPhotos && photos.length > 0 && (
              !confirmClearPhotos ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearPhotos(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-500/30 font-semibold text-[11px] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kosongkan Cache Foto</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-rose-300 font-semibold">Hapus semua foto?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllPhotos();
                      setConfirmClearPhotos(false);
                      void refreshStatus();
                    }}
                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] cursor-pointer"
                  >
                    Ya, Hapus
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearPhotos(false)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            Pengaturan tersimpan otomatis pada perangkat ini.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
