import React from 'react';
import { MentawaiLogo } from './MentawaiLogo';
import { 
  Camera, 
  Map as MapIcon, 
  Layers, 
  Image as ImageIcon, 
  Video as VideoIcon,
  BarChart3, 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryCharging, 
  ShieldCheck, 
  Bell, 
  RefreshCw,
  Smartphone,
  Rocket,
  HardDrive
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activeTab: 'camera' | 'map' | 'roads' | 'photos' | 'videos' | 'analytics';
  setActiveTab: (tab: 'camera' | 'map' | 'roads' | 'photos' | 'videos' | 'analytics') => void;
  isOnline: boolean;
  setIsOnline: (val: boolean) => void;
  batterySaver: boolean;
  setBatterySaver: (val: boolean) => void;
  pendingSyncCount: number;
  onTriggerSync: () => void;
  isSyncing: boolean;
  unreadNotifCount: number;
  onOpenNotifDrawer: () => void;
  onOpenApkModal: () => void;
  onOpenPublishModal: () => void;
  onOpenStorageSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isOnline,
  setIsOnline,
  batterySaver,
  setBatterySaver,
  pendingSyncCount,
  onTriggerSync,
  isSyncing,
  unreadNotifCount,
  onOpenNotifDrawer,
  onOpenApkModal,
  onOpenPublishModal,
  onOpenStorageSettings,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      {/* Top Bar: Branding and Status Telemetry */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Branding - Logo Pemerintah Kabupaten Kepulauan Mentawai */}
        <div className="flex items-center space-x-3">
          <div className="h-12 w-auto shrink-0 flex items-center justify-center filter drop-shadow">
            <MentawaiLogo className="h-12 w-auto max-w-[44px]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-normal text-[15px] leading-[19px] text-white tracking-tight">
                Pemerintah Kabupaten Kepulauan Mentawai
              </h1>
            </div>
            <p className="font-normal text-[17px] leading-[19px] text-slate-300">
              Dinas Pekerjaan Umum Penataan Ruang
            </p>
            <p className="font-['Arial'] font-bold text-[16px] leading-[20px] text-[#f1f1f1]">
              Survey Kondisi Jalan Kabupaten
            </p>
          </div>
        </div>

        {/* System telemetry & control buttons */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* E2EE Security Badge */}
          <div 
            title="Enkripsi End-to-End AES-256 GCM Aktif & Tervalidasi SHA-256"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium hidden md:inline">E2EE Enkripsi</span>
          </div>

          {/* Battery Optimization Mode Button */}
          <button
            onClick={() => setBatterySaver(!batterySaver)}
            title={batterySaver ? 'Mode Hemat Baterai Aktif (Layar redup & hemat FPS)' : 'Aktifkan Mode Hemat Baterai Kendaraan'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
              batterySaver 
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300' 
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {batterySaver ? (
              <BatteryCharging className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            ) : (
              <Battery className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="font-medium">
              {batterySaver ? 'Hemat Baterai On' : 'Hemat Baterai'}
            </span>
          </button>

          {/* Online/Offline Status & Toggle */}
          <button
            onClick={() => setIsOnline(!isOnline)}
            title="Klik untuk simulasi mode Online/Offline lapangan"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
              isOnline
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-medium">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="font-medium">Mode Offline</span>
              </>
            )}
          </button>

          {/* Cloud Sync Status */}
          <button
            onClick={onTriggerSync}
            disabled={isSyncing || pendingSyncCount === 0 || !isOnline}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
              pendingSyncCount > 0
                ? 'bg-sky-950 border-sky-500 text-sky-200 hover:bg-sky-900'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : 'text-slate-400'}`} />
            <span>
              {isSyncing ? 'Sinkron...' : pendingSyncCount > 0 ? `Antrean (${pendingSyncCount})` : 'Tersinkron'}
            </span>
          </button>

          {/* PWA In-App Install Button */}
          <PWAInstallButton />

          {/* Publish & Paket Data Button */}
          <button
            onClick={onOpenPublishModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shadow-sm transition cursor-pointer"
            title="Publish Aplikasi & Ekspor/Muat Seluruh Data"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span className="font-bold">Publish &amp; Data</span>
          </button>

          {/* Pengaturan Penyimpanan Foto & Video Perangkat */}
          <button
            onClick={onOpenStorageSettings}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 font-semibold transition cursor-pointer"
            title="Pengaturan Lokasi & Kualitas Penyimpanan Foto/Video pada Perangkat"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>Penyimpanan</span>
          </button>

          {/* Download / Pasang APK Siap Pakai Button (disembunyikan jika sudah dibuka di dalam APK Android) */}
          {typeof window !== 'undefined' &&
            !(window as Window & { MentawaiAndroidDownloader?: unknown }).MentawaiAndroidDownloader && (
              <button
                onClick={onOpenApkModal}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-sm transition cursor-pointer"
                title="Download File APK Siap Pakai & Pasang di HP Android"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="font-bold">Download APK</span>
              </button>
            )}

          {/* Push Notification Drawer Trigger */}
          <button
            onClick={onOpenNotifDrawer}
            className="relative p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            aria-label="Notifikasi Tugas dan Peringatan"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-slate-950/90 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto space-x-1 sm:space-x-2 py-1.5 scrollbar-thin">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'camera'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Kamera Survei AI (100m)</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'map'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>Peta Ruas Jalan</span>
          </button>

          <button
            onClick={() => setActiveTab('roads')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'roads'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Kelola Ruas Jalan & Lampiran</span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'photos'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Dokumentasi Foto</span>
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'videos'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <VideoIcon className="w-4 h-4" />
            <span>Dokumentasi Video</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analisis Kondisi jalan</span>
          </button>
        </div>
      </div>
    </header>
  );
};
