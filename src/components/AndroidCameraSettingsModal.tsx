import React from 'react';
import {
  X,
  Smartphone,
  Camera,
  Focus,
  Sun,
  ZoomIn,
  Flashlight,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import {
  AndroidCameraPreset,
  AndroidCameraSettings,
  CameraDeviceOption,
  CameraHardwareCapabilities,
  getPresetCameraSettings,
} from '../utils/androidCamera';

interface AndroidCameraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AndroidCameraSettings;
  onChangeSettings: (next: AndroidCameraSettings, restartCamera?: boolean) => void;
  devices: CameraDeviceOption[];
  onRefreshDevices: () => void;
  capabilities: CameraHardwareCapabilities;
  cameraActive: boolean;
  isApplying: boolean;
  wakeLockActive: boolean;
}

export const AndroidCameraSettingsModal: React.FC<AndroidCameraSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  devices,
  onRefreshDevices,
  capabilities,
  cameraActive,
  isApplying,
  wakeLockActive,
}) => {
  if (!isOpen) return null;

  const handleSelectPreset = (preset: AndroidCameraPreset) => {
    const next = getPresetCameraSettings(preset, {
      deviceId: settings.deviceId,
      torch: settings.torch,
    });
    onChangeSettings(next, true);
  };

  const presets: {
    id: AndroidCameraPreset;
    title: string;
    subtitle: string;
    badge?: string;
  }[] = [
    {
      id: 'vehicle_stable',
      title: 'Stabil Kendaraan (720p · 30fps)',
      subtitle: 'Fokus kontinu otomatis tajam ke jalan, pencahayaan +0.3 EV, anti-drop FPS.',
      badge: 'Disarankan',
    },
    {
      id: 'detail_sharp',
      title: 'Detail Kerusakan (1080p · 30fps)',
      subtitle: 'Resolusi tinggi untuk survei jalan kaki atau foto retak halus.',
    },
    {
      id: 'battery_lite',
      title: 'Hemat Daya / HP Ringan (540p · 24fps)',
      subtitle: 'Ringan & stabil untuk survei ruas panjang di perangkat standar.',
    },
  ];

  const supportsManualFocus =
    capabilities.focusModes.includes('manual') && capabilities.focusDistanceRange !== null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Setelan Kamera Android (Pengambilan Stabil)
              </h3>
              <p className="text-[11px] text-slate-400">
                Optimasi fokus jalan, kunci frame rate 30fps, anti-getar, dan layar tetap aktif
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
          {/* Status sensor aktif */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="font-semibold text-slate-200">
                {cameraActive ? 'Kamera Fisik Aktif' : 'Mode Simulasi / Kamera Fisik Belum Aktif'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-300">
              {capabilities.actualWidth && capabilities.actualHeight && (
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {capabilities.actualWidth}×{capabilities.actualHeight}
                </span>
              )}
              {capabilities.actualFps && (
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300">
                  {capabilities.actualFps} fps
                </span>
              )}
              {wakeLockActive && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Wake Lock Aktif
                </span>
              )}
            </div>
          </div>

          {/* 1. Preset Stabilitas Android */}
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-200 mb-2">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>1. Pilih Preset Stabilitas Survei</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {presets.map((p) => {
                const selected = settings.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isApplying}
                    onClick={() => handleSelectPreset(p.id)}
                    className={`text-left p-2.5 rounded-lg border transition cursor-pointer disabled:opacity-60 ${
                      selected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow'
                        : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-[11px]">{p.title}</span>
                    </div>
                    {p.badge && (
                      <span className="inline-block mb-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                        {p.badge}
                      </span>
                    )}
                    <p className="text-[10px] text-slate-400 leading-relaxed">{p.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Pemilihan Lensa, Resolusi & Frame Rate */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                <span>2. Lensa Kamera, Resolusi & Frame Rate</span>
              </div>
              <button
                type="button"
                onClick={onRefreshDevices}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Muat Ulang Lensa</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-3">
                <label className="block text-[11px] text-slate-400 mb-1">
                  Lensa Kamera Perangkat Android
                </label>
                <select
                  value={settings.deviceId}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, deviceId: e.target.value }, true)
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="">Otomatis (Kamera Belakang Utama)</option>
                  {devices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Resolusi Kamera</label>
                <select
                  value={settings.resolution}
                  onChange={(e) =>
                    onChangeSettings(
                      {
                        ...settings,
                        resolution: e.target.value as AndroidCameraSettings['resolution'],
                      },
                      true
                    )
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="720p">1280×720 HD (Paling Stabil)</option>
                  <option value="1080p">1920×1080 Full HD</option>
                  <option value="540p">960×540 qHD (Ringan)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Target Frame Rate</label>
                <select
                  value={settings.targetFps}
                  onChange={(e) =>
                    onChangeSettings(
                      { ...settings, targetFps: Number(e.target.value) === 24 ? 24 : 30 },
                      true
                    )
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value={30}>30 FPS (Kunci Anti-Blur)</option>
                  <option value={24}>24 FPS (Hemat Baterai)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => onChangeSettings(settings, true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isApplying ? 'animate-spin' : ''}`} />
                  <span>{isApplying ? 'Menerapkan...' : 'Terapkan ke Kamera'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Kontrol Fokus, Eksposur, Zoom & Stabilisasi */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <Focus className="w-3.5 h-3.5 text-emerald-400" />
              <span>3. Kontrol Fokus, Eksposur & Anti-Getar</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Focus Mode */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Mode Fokus Jalan</span>
                  {capabilities.actualFocusMode && (
                    <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded">
                      {capabilities.actualFocusMode}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSettings({ ...settings, focusMode: 'auto_continuous', focusDistance: null }, false)
                    }
                    className={`px-2 py-1.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      settings.focusMode === 'auto_continuous'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    Auto Kontinu (Tajam)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSettings({ ...settings, focusMode: 'infinity_lock' }, false)
                    }
                    className={`px-2 py-1.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      settings.focusMode === 'infinity_lock'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    Kunci Fokus Jauh
                  </button>
                </div>

                {supportsManualFocus && capabilities.focusDistanceRange && (
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Jarak Fokus Manual</span>
                      <span className="font-mono">
                        {(
                          settings.focusDistance ?? capabilities.focusDistanceRange.max
                        ).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={capabilities.focusDistanceRange.min}
                      max={capabilities.focusDistanceRange.max}
                      step={capabilities.focusDistanceRange.step}
                      value={settings.focusDistance ?? capabilities.focusDistanceRange.max}
                      onChange={(e) =>
                        onChangeSettings(
                          {
                            ...settings,
                            focusMode: 'infinity_lock',
                            focusDistance: Number(e.target.value),
                          },
                          false
                        )
                      }
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Exposure & Brightness */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Eksposur / Cahaya</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.exposureLock}
                      onChange={(e) =>
                        onChangeSettings({ ...settings, exposureLock: e.target.checked }, false)
                      }
                      className="accent-amber-500 rounded cursor-pointer"
                    />
                    <span className="text-slate-300">Kunci Eksposur</span>
                  </label>
                </div>

                {capabilities.exposureCompRange ? (
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Kompensasi EV (Anti Gelap/Silau)</span>
                      <span className="font-mono">
                        {settings.exposureCompensation > 0 ? '+' : ''}
                        {settings.exposureCompensation.toFixed(1)} EV
                      </span>
                    </div>
                    <input
                      type="range"
                      min={capabilities.exposureCompRange.min}
                      max={capabilities.exposureCompRange.max}
                      step={capabilities.exposureCompRange.step}
                      value={settings.exposureCompensation}
                      onChange={(e) =>
                        onChangeSettings(
                          { ...settings, exposureCompensation: Number(e.target.value) },
                          false
                        )
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Kunci eksposur aktif otomatis menyesuaikan sensor kamera saat kamera fisik berjalan.
                  </p>
                )}
              </div>
            </div>

            {/* Zoom + Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold text-slate-200 flex items-center gap-1">
                    <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
                    <span>Zoom Lensa</span>
                  </span>
                  <span className="font-mono text-sky-300">{settings.zoom.toFixed(1)}x</span>
                </div>
                {capabilities.zoomRange ? (
                  <input
                    type="range"
                    min={capabilities.zoomRange.min}
                    max={Math.min(4, capabilities.zoomRange.max)}
                    step={capabilities.zoomRange.step}
                    value={Math.min(Math.min(4, capabilities.zoomRange.max), settings.zoom)}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, zoom: Number(e.target.value) }, false)
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Slider zoom aktif saat kamera fisik Android mendukung kontrol zoom Camera2.
                  </p>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-center gap-2">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-200 font-medium">
                    Stabilisasi Anti-Getar (Crop 6% EIS)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.eisCropMargin}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, eisCropMargin: e.target.checked }, false)
                    }
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-200 font-medium">
                    Foto Sensor Penuh ImageCapture (non-jeda otomatis saat rekam video)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.hdPhotoCapture}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, hdPhotoCapture: e.target.checked }, false)
                    }
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-200 font-medium">
                    Jaga Layar Selalu Menyala (Wake Lock)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.keepScreenAwake}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, keepScreenAwake: e.target.checked }, false)
                    }
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-200 font-medium">
                    Optimasi Pencahayaan Jalan (Anti-Gelap)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.enhanceLighting}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, enhanceLighting: e.target.checked }, false)
                    }
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-200 font-medium">
                    Penajaman Hasil Foto &amp; Video (Sharpness HD)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.enhanceSharpness}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, enhanceSharpness: e.target.checked }, false)
                    }
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </label>

                {capabilities.hasTorch && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSettings({ ...settings, torch: !settings.torch }, false)
                    }
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                      settings.torch
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                    }`}
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    <span>{settings.torch ? 'Matikan Lampu Flash' : 'Nyalakan Lampu Flash'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. Panduan Setting Fisik HP Android */}
          <div className="p-3 rounded-lg bg-emerald-950/25 border border-emerald-500/30 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
              <span>Panduan Setting HP Android di Lapangan agar Kamera Stabil</span>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Gunakan <b>Posisi Lanskap (Horizontal)</b> dengan holder kaca/dasbor berperedam karet agar sudut jalan simetris dan bebas getaran mesin.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Pilih <b>Lensa 1x Utama</b> atau <b>Ultrawide (0.6x)</b> untuk bidang pandang jalan yang lebih lebar dan lebih tahan guncangan.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Aktifkan <b>Kunci Fokus Jauh</b> saat melaju dengan mobil/motor agar kamera tidak salah fokus ke pantulan kaca depan.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Di Setelan Android &gt; Aplikasi &gt; Baterai, pilih <b>Tidak Dibatasi (Unrestricted)</b> untuk Chrome/APK agar GPS dan perekaman video tidak terjeda.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
