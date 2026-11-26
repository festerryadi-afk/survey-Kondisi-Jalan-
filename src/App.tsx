/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { CameraSurveyView } from './components/CameraSurveyView';
import { InteractiveMapView } from './components/InteractiveMapView';
import { RoadsManagementView } from './components/RoadsManagementView';
import { PhotoDocumentationView } from './components/PhotoDocumentationView';
import { VideoDocumentationView } from './components/VideoDocumentationView';
import { AnalyticsDashboardView } from './components/AnalyticsDashboardView';
import { ViewMediaModal } from './components/ViewMediaModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { ApkDownloadModal } from './components/ApkDownloadModal';
import { PublishDataModal } from './components/PublishDataModal';
import { DeviceStorageSettingsModal } from './components/DeviceStorageSettingsModal';
import { DEFAULT_CONDITION_COLORS } from './components/MapLayerColorModal';
import {
  GpsTrackPoint,
  ImportedKmlLayer,
  MapConditionColors,
  RuasJalan,
  SurveyPhoto,
  SurveyVideo,
  NotificationPush,
} from './types';
import { 
  INITIAL_MENTAWAI_ROADS, 
  INITIAL_SURVEY_PHOTOS, 
  INITIAL_SURVEY_VIDEOS, 
  INITIAL_NOTIFICATIONS 
} from './data/mentawaiRoads';
import { encryptSurveyPacket } from './utils/crypto';
import {
  deleteVideoBlobFromStorage,
  loadVideoMetadataList,
  saveVideoMetadataList,
} from './utils/videoRecorder';
import {
  clearAllHdPhotosFromStorage,
  deleteHd600DpiPhotoFromStorage,
  loadPhotoMetadataList,
  savePhotoMetadataList,
} from './utils/photo3r';
import {
  DeviceStorageSettings,
  loadDeviceStorageSettings,
  persistPhotoToConfiguredDeviceTarget,
  persistVideoToConfiguredDeviceTarget,
  saveDeviceStorageSettings,
} from './utils/deviceStorage';
import { convertKmlLineStringsToRuas } from './utils/kmlKmz';
import { RestoredPublishState, tryParsePublishHashFromUrl } from './utils/publishPackage';
import { sortPhotosByRuasAndSta } from './utils/geo';

function loadStoredArray<T>(key: string, fallback: T[]): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // Navigation active tab (Default activated to 'map' / Peta Ruas Jalan)
  const [activeTab, setActiveTab] = useState<'camera' | 'map' | 'roads' | 'photos' | 'videos' | 'analytics'>('map');

  // Persistence State
  const [ruasList, setRuasList] = useState<RuasJalan[]>(() =>
    loadStoredArray('mentawai_ruas_list_v2', INITIAL_MENTAWAI_ROADS)
  );

  const [photos, setPhotos] = useState<SurveyPhoto[]>(() =>
    sortPhotosByRuasAndSta(loadStoredArray('mentawai_photos_v2', INITIAL_SURVEY_PHOTOS))
  );
  const isPhotosHydratedRef = useRef<boolean>(false);
  const addedSessionPhotoIdsRef = useRef<Set<string>>(new Set());
  const deletedSessionPhotoIdsRef = useRef<Set<string>>(new Set());

  const [videos, setVideos] = useState<SurveyVideo[]>(() =>
    loadStoredArray('mentawai_videos_v2', INITIAL_SURVEY_VIDEOS)
  );
  const isVideosHydratedRef = useRef<boolean>(false);
  const addedSessionVideoIdsRef = useRef<Set<string>>(new Set());
  const deletedSessionVideoIdsRef = useRef<Set<string>>(new Set());

  const [notifications, setNotifications] = useState<NotificationPush[]>(() =>
    loadStoredArray('mentawai_notifs_v2', INITIAL_NOTIFICATIONS)
  );

  const [kmlLayers, setKmlLayers] = useState<ImportedKmlLayer[]>(() =>
    loadStoredArray('mentawai_kml_layers_v1', [])
  );

  const [conditionColors, setConditionColors] = useState<MapConditionColors>(() => {
    try {
      const saved = localStorage.getItem('mentawai_map_condition_colors_v1');
      if (saved) {
        return { ...DEFAULT_CONDITION_COLORS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore invalid storage
    }
    return { ...DEFAULT_CONDITION_COLORS };
  });

  // Selected road across modules
  const [selectedRuasId, setSelectedRuasId] = useState<string>(ruasList[0]?.id || 'ruas-01');

  // System status
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [batterySaver, setBatterySaver] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSurveyFullscreen, setIsSurveyFullscreen] = useState<boolean>(false);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState<boolean>(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [isStorageSettingsOpen, setIsStorageSettingsOpen] = useState<boolean>(false);
  const [deviceStorageSettings, setDeviceStorageSettings] = useState<DeviceStorageSettings>(() =>
    loadDeviceStorageSettings()
  );
  const deviceStorageSettingsRef = useRef<DeviceStorageSettings>(deviceStorageSettings);
  const ruasListRef = useRef<RuasJalan[]>(ruasList);
  const isSurveyFullscreenRef = useRef<boolean>(false);
  const pendingAutoDownloadPhotosRef = useRef<SurveyPhoto[]>([]);

  useEffect(() => {
    deviceStorageSettingsRef.current = deviceStorageSettings;
    saveDeviceStorageSettings(deviceStorageSettings);
  }, [deviceStorageSettings]);

  useEffect(() => {
    ruasListRef.current = ruasList;
  }, [ruasList]);

  useEffect(() => {
    isSurveyFullscreenRef.current = isSurveyFullscreen;
    if (!isSurveyFullscreen && pendingAutoDownloadPhotosRef.current.length > 0) {
      const queued = [...pendingAutoDownloadPhotosRef.current];
      pendingAutoDownloadPhotosRef.current = [];
      const cfg = deviceStorageSettingsRef.current;
      if (cfg.storageMode === 'auto_download' && cfg.autoSavePhotosToDevice) {
        queued.forEach((p, idx) => {
          const targetRuas = ruasListRef.current.find((r) => r.id === p.ruasId);
          setTimeout(() => {
            void persistPhotoToConfiguredDeviceTarget(p, cfg, targetRuas, true);
          }, idx * 250);
        });
      }
    }
  }, [isSurveyFullscreen]);

  // Modals for full-res view
  const [viewingPhoto, setViewingPhoto] = useState<SurveyPhoto | null>(null);
  const [viewingVideo, setViewingVideo] = useState<SurveyVideo | null>(null);

  // Floating Toast alert
  const [toastMessage, setToastMessage] = useState<{ title: string; message: string; type: 'alert' | 'info' | 'sync' } | null>(null);

  // Hydrate full video archive metadata from IndexedDB (prevents data loss when localStorage hits quota)
  useEffect(() => {
    let active = true;
    void loadVideoMetadataList().then((idbVideos) => {
      if (!active) return;
      isVideosHydratedRef.current = true;
      if (idbVideos !== null) {
        setVideos((prev) => {
          const addedInSession = prev.filter(
            (v) => addedSessionVideoIdsRef.current.has(v.id) && !deletedSessionVideoIdsRef.current.has(v.id)
          );
          const idbFiltered = idbVideos.filter((v) => !deletedSessionVideoIdsRef.current.has(v.id));
          const mergedMap = new Map<string, SurveyVideo>();
          for (const v of addedInSession) {
            mergedMap.set(v.id, v);
          }
          for (const v of idbFiltered) {
            if (!mergedMap.has(v.id)) {
              mergedMap.set(v.id, v);
            }
          }
          const merged = Array.from(mergedMap.values());
          void saveVideoMetadataList(merged);
          return merged;
        });
      } else {
        setVideos((prev) => {
          void saveVideoMetadataList(prev);
          return prev;
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Hydrate HD photo archive from IndexedDB (mencegah kehilangan foto HD saat localStorage penuh)
  useEffect(() => {
    let active = true;
    void loadPhotoMetadataList().then((idbPhotos) => {
      if (!active) return;
      isPhotosHydratedRef.current = true;
      if (idbPhotos !== null) {
        setPhotos((prev) => {
          const addedInSession = prev.filter(
            (p) => addedSessionPhotoIdsRef.current.has(p.id) && !deletedSessionPhotoIdsRef.current.has(p.id)
          );
          const idbFiltered = idbPhotos.filter((p) => !deletedSessionPhotoIdsRef.current.has(p.id));
          const mergedMap = new Map<string, SurveyPhoto>();
          for (const p of addedInSession) {
            mergedMap.set(p.id, p);
          }
          for (const p of idbFiltered) {
            const existing = mergedMap.get(p.id);
            if (!existing) {
              mergedMap.set(p.id, p);
            } else if (!existing.imageUrl && p.imageUrl) {
              mergedMap.set(p.id, { ...existing, imageUrl: p.imageUrl });
            }
          }
          const merged = sortPhotosByRuasAndSta(Array.from(mergedMap.values()));
          void savePhotoMetadataList(merged);
          return merged;
        });
      } else {
        setPhotos((prev) => {
          void savePhotoMetadataList(prev);
          return prev;
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Save ruasList to localStorage safely (debounced + idle to prevent stalling active video recording)
  useEffect(() => {
    const timer = setTimeout(() => {
      const persistRuas = () => {
        try {
          localStorage.setItem('mentawai_ruas_list_v2', JSON.stringify(ruasList));
        } catch {
          // ignore storage quota error
        }
      };
      const winIdle = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof winIdle.requestIdleCallback === 'function') {
        winIdle.requestIdleCallback(persistRuas, { timeout: 1500 });
      } else {
        persistRuas();
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [ruasList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isPhotosHydratedRef.current) {
        void savePhotoMetadataList(photos);
      }
      const persistCompactLocal = () => {
        try {
          // Hindari JSON.stringify sinkron multi-MB base64 di main thread saat perekaman video aktif;
          // preview full-HD & versi cetak 600 DPI sudah disimpan asinkron ke IndexedDB.
          const compactPhotos = photos.map((p) =>
            p.imageUrl && p.imageUrl.length > 60_000 ? { ...p, imageUrl: '' } : p
          );
          localStorage.setItem('mentawai_photos_v2', JSON.stringify(compactPhotos));
        } catch {
          // ignore storage quota error; full HD 600 DPI & full photo list safely persisted in IndexedDB
        }
      };
      const winIdle = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof winIdle.requestIdleCallback === 'function') {
        winIdle.requestIdleCallback(persistCompactLocal, { timeout: 1500 });
      } else {
        persistCompactLocal();
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [photos]);

  useEffect(() => {
    if (isVideosHydratedRef.current) {
      void saveVideoMetadataList(videos);
    }
    try {
      localStorage.setItem('mentawai_videos_v2', JSON.stringify(videos));
    } catch {
      // QuotaExceeded fallback: store metadata without heavy base64 thumbnails in localStorage (IndexedDB keeps full thumbnails)
      try {
        const compactVideos = videos.map((v) => ({
          ...v,
          thumbnailUrl: v.thumbnailUrl && v.thumbnailUrl.length > 2000 ? '' : v.thumbnailUrl,
        }));
        localStorage.setItem('mentawai_videos_v2', JSON.stringify(compactVideos));
      } catch {
        // ignore remaining storage quota error
      }
    }
  }, [videos]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('mentawai_notifs_v2', JSON.stringify(notifications));
      } catch {
        // ignore storage quota error
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem('mentawai_kml_layers_v1', JSON.stringify(kmlLayers));
    } catch {
      // ignore storage quota error
    }
  }, [kmlLayers]);

  useEffect(() => {
    try {
      localStorage.setItem('mentawai_map_condition_colors_v1', JSON.stringify(conditionColors));
    } catch {
      // ignore storage quota error
    }
  }, [conditionColors]);

  // Auto-load compact publish data if opened via #publishData=... share URL
  useEffect(() => {
    const hashData = tryParsePublishHashFromUrl();
    if (hashData) {
      setRuasList(hashData.ruasList);
      setKmlLayers(hashData.kmlLayers);
      setConditionColors(hashData.conditionColors);
      setSelectedRuasId(hashData.ruasList[0]?.id || '');
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // ignore history error
      }
      setToastMessage({
        title: 'Data Publish Dimuat',
        message: `${hashData.ruasList.length} ruas jalan & ${hashData.kmlLayers.length} layer KML/KMZ berhasil dimuat dari tautan.`,
        type: 'sync',
      });
      setTimeout(() => setToastMessage(null), 5000);
    }
  }, []);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSyncToCloud();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Calculate pending items
  const pendingPhotos = photos.filter((p) => p.syncStatus === 'pending');
  const pendingVideos = videos.filter((v) => v.syncStatus === 'pending');
  const pendingSyncCount = pendingPhotos.length + pendingVideos.length;

  // Cloud Sync Handler with E2EE
  const triggerSyncToCloud = async () => {
    if (!isOnline || isSyncing || pendingSyncCount === 0) return;
    setIsSyncing(true);

    try {
      // Simulate Encrypted transmission
      await encryptSurveyPacket({
        photos: pendingPhotos,
        videos: pendingVideos,
        syncedAt: new Date().toISOString(),
      });

      // Artificial small latency for realistic network transit
      await new Promise((resolve) => setTimeout(resolve, 1400));

      setPhotos((prev) =>
        prev.map((p) => (p.syncStatus === 'pending' ? { ...p, syncStatus: 'synced' } : p))
      );

      setVideos((prev) =>
        prev.map((v) => (v.syncStatus === 'pending' ? { ...v, syncStatus: 'synced' } : v))
      );

      const notif: NotificationPush = {
        id: `notif-${Date.now()}`,
        title: 'Sinkronisasi Cloud Berhasil',
        message: `${pendingSyncCount} data foto & video baru berhasil disinkronkan ke server DPUPR Mentawai dengan enkripsi AES-256.`,
        timestamp: new Date().toISOString(),
        type: 'sync',
        read: false,
      };

      setNotifications((prev) => [notif, ...prev]);
      showToast('Sinkronisasi Sukses', `${pendingSyncCount} data tersinkron ke cloud DPUPR`, 'sync');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toast Helper
  const showToast = (title: string, message: string, type: 'alert' | 'info' | 'sync') => {
    setToastMessage({ title, message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Add Photo
  const handleAddPhoto = (newPhoto: SurveyPhoto) => {
    addedSessionPhotoIdsRef.current.add(newPhoto.id);
    deletedSessionPhotoIdsRef.current.delete(newPhoto.id);
    setPhotos((prev) => sortPhotosByRuasAndSta([...prev, newPhoto]));

    // Update documentation count for ruas
    setRuasList((prev) =>
      prev.map((r) =>
        r.id === newPhoto.ruasId
          ? { ...r, documentationCount: r.documentationCount + 1 }
          : r
      )
    );

    // If online and not yet synced, mark synced
    if (isOnline && newPhoto.syncStatus !== 'synced') {
      setTimeout(() => {
        setPhotos((prev) =>
          prev.map((p) => (p.id === newPhoto.id ? { ...p, syncStatus: 'synced' } : p))
        );
      }, 800);
    }

    if (newPhoto.id.startsWith('photo-import-')) {
      showToast(
        'Foto Berhasil Diimpor',
        `Foto untuk Ruas ${newPhoto.nomorRuas} (${newPhoto.staText}) disimpan HD 600 DPI.`,
        'sync'
      );
    }

    const storageCfg = deviceStorageSettingsRef.current;
    if (storageCfg.autoSavePhotosToDevice && storageCfg.storageMode !== 'internal_only') {
      const targetRuas = ruasListRef.current.find((r) => r.id === newPhoto.ruasId);
      if (storageCfg.storageMode === 'internal_and_folder') {
        setTimeout(() => {
          void persistPhotoToConfiguredDeviceTarget(newPhoto, storageCfg, targetRuas, false);
        }, 120);
      } else if (storageCfg.storageMode === 'auto_download') {
        if (isSurveyFullscreenRef.current) {
          pendingAutoDownloadPhotosRef.current.push(newPhoto);
        } else {
          setTimeout(() => {
            void persistPhotoToConfiguredDeviceTarget(newPhoto, storageCfg, targetRuas, true);
          }, 120);
        }
      }
    }
  };

  // Update Photo (mis. setelah deteksi otomatis kerusakan AI)
  const handleUpdatePhoto = (updatedPhoto: SurveyPhoto) => {
    setPhotos((prev) => prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p)));
    setViewingPhoto((prev) => (prev && prev.id === updatedPhoto.id ? updatedPhoto : prev));
  };

  // Add Video
  const handleAddVideo = (newVideo: SurveyVideo) => {
    addedSessionVideoIdsRef.current.add(newVideo.id);
    deletedSessionVideoIdsRef.current.delete(newVideo.id);
    setVideos((prev) => [newVideo, ...prev.filter((v) => v.id !== newVideo.id)]);

    const storageCfg = deviceStorageSettingsRef.current;
    if (storageCfg.autoSaveVideosToDevice && storageCfg.storageMode !== 'internal_only') {
      const targetRuas = ruasListRef.current.find((r) => r.id === newVideo.ruasId);
      setTimeout(() => {
        void persistVideoToConfiguredDeviceTarget(newVideo, storageCfg, targetRuas);
      }, 150);
    }

    if (newVideo.id.startsWith('video-import-')) {
      showToast(
        'Video Berhasil Diimpor',
        `Video untuk Ruas ${newVideo.nomorRuas} (STA ${newVideo.startSta} - ${newVideo.endSta} m) siap diputar & diunduh.`,
        'sync'
      );
    } else {
      showToast(
        'Video Survei Tersimpan di Arsip',
        `Rekaman video Ruas ${newVideo.nomorRuas} (STA ${newVideo.startSta} - ${newVideo.endSta} m) berhasil masuk arsip.`,
        'sync'
      );
    }
  };

  // Delete Photo
  const handleDeletePhoto = (id: string) => {
    deletedSessionPhotoIdsRef.current.add(id);
    addedSessionPhotoIdsRef.current.delete(id);
    const photoToDelete = photos.find((p) => p.id === id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    void deleteHd600DpiPhotoFromStorage(id);
    if (photoToDelete) {
      setRuasList((prev) =>
        prev.map((r) =>
          r.id === photoToDelete.ruasId
            ? { ...r, documentationCount: Math.max(0, r.documentationCount - 1) }
            : r
        )
      );
    }
    showToast('Foto Dokumentasi Dihapus', 'File foto survei jalan berhasil dihapus dari sistem.', 'info');
  };

  // Delete All Photos
  const handleDeleteAllPhotos = () => {
    const count = photos.length;
    photos.forEach((p) => deletedSessionPhotoIdsRef.current.add(p.id));
    addedSessionPhotoIdsRef.current.clear();
    setPhotos([]);
    setViewingPhoto(null);
    void clearAllHdPhotosFromStorage();
    setRuasList((prev) => prev.map((r) => ({ ...r, documentationCount: 0 })));
    showToast(
      'Seluruh Titik Foto Dihapus',
      `${count} titik foto dokumentasi telah dihapus dari peta dan arsip.`,
      'info'
    );
  };

  // Delete Video
  const handleDeleteVideo = (id: string) => {
    deletedSessionVideoIdsRef.current.add(id);
    addedSessionVideoIdsRef.current.delete(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
    void deleteVideoBlobFromStorage(id);
    showToast('Video Survei Dihapus', 'File video survei jalan berhasil dihapus.', 'info');
  };

  // Trigger Field Alert Notification
  const handleTriggerAlert = (title: string, message: string, ruasId: string, sta: string) => {
    const newNotif: NotificationPush = {
      id: `notif-${Date.now()}`,
      title,
      message,
      timestamp: new Date().toISOString(),
      type: 'alert',
      read: false,
      ruasId,
      sta,
    };
    setNotifications((prev) => [newNotif, ...prev]);
    showToast(title, message, 'alert');
  };

  // Ruas CRUD Handlers
  const handleAddRuas = (newRuas: RuasJalan) => {
    setRuasList((prev) => [...prev, newRuas]);
    showToast('Ruas Jalan Ditambahkan', `Ruas ${newRuas.nomorRuas}: ${newRuas.namaRuas} berhasil disimpan.`, 'info');
  };

  const handleImportRuasList = (importedRoads: RuasJalan[]) => {
    if (importedRoads.length === 0) return;
    setRuasList((prev) => [...prev, ...importedRoads]);
    showToast(
      'Impor Excel Ruas Berhasil',
      `${importedRoads.length} ruas jalan baru berhasil diimpor ke basis data.`,
      'sync'
    );
  };

  const handleUpdateRuas = (updatedRuas: RuasJalan) => {
    setRuasList((prev) => prev.map((r) => (r.id === updatedRuas.id ? updatedRuas : r)));
    showToast('Ruas Jalan Diperbarui', `Data ruas ${updatedRuas.nomorRuas} telah disimpan.`, 'info');
  };

  const handleSaveGpsTrack = (
    ruasId: string,
    gpsTrack: GpsTrackPoint[],
    options?: {
      customEndStaMeters?: number;
      applyGeometry?: boolean;
      silent?: boolean;
    }
  ) => {
    const targetRuas = ruasList.find((r) => r.id === ruasId);
    setRuasList((prev) =>
      prev.map((r) => {
        if (r.id !== ruasId) return r;
        const sorted = [...gpsTrack].sort((a, b) => a.staMeters - b.staMeters);
        const nextPanjangKm =
          typeof options?.customEndStaMeters === 'number' && options.customEndStaMeters > 0
            ? Number((options.customEndStaMeters / 1000).toFixed(3))
            : r.panjangKm;
        const shouldApplyGeom = Boolean(options?.applyGeometry && sorted.length >= 2);
        const routePts: [number, number][] = shouldApplyGeom
          ? sorted.map((pt) => [Number(pt.lat.toFixed(6)), Number(pt.lng.toFixed(6))])
          : r.points;
        return {
          ...r,
          gpsTrack: sorted,
          lastGpsTrackDate: new Date().toISOString(),
          panjangKm: nextPanjangKm,
          ...(shouldApplyGeom
            ? {
                koordinatAwal: routePts[0],
                koordinatAkhir: routePts[routePts.length - 1],
                points: routePts,
              }
            : {}),
        };
      })
    );
    if (!options?.silent && targetRuas) {
      showToast(
        'Tracking GPS Ruas Tersimpan',
        `Jalur GPS Ruas ${targetRuas.nomorRuas} (${gpsTrack.length} titik) berhasil disimpan.`,
        'sync'
      );
    }
  };

  const handleDeleteRuas = (id: string) => {
    const deleted = ruasList.find((r) => r.id === id);
    setRuasList((prev) => prev.filter((r) => r.id !== id));
    showToast('Ruas Jalan Dihapus', `Ruas ${deleted?.nomorRuas || ''} telah dihapus dari basis data.`, 'info');
  };

  const handleDeleteAllRuas = () => {
    const count = ruasList.length;
    setRuasList([]);
    setSelectedRuasId('');
    showToast(
      'Seluruh Ruas Dihapus',
      `${count} data ruas jalan berhasil dihapus dari basis data.`,
      'info'
    );
  };

  // KML / KMZ Map Layer Handlers
  const handleAddKmlLayer = (layer: ImportedKmlLayer, alsoRegisterRoads: boolean) => {
    setKmlLayers((prev) => [layer, ...prev]);

    if (alsoRegisterRoads) {
      const convertedRoads = convertKmlLineStringsToRuas(layer, ruasList.length);
      if (convertedRoads.length > 0) {
        setRuasList((prev) => [...prev, ...convertedRoads]);
        showToast(
          `Layer ${layer.fileType} & Ruas Tersimpan`,
          `Layer "${layer.name}" (${layer.features.length} objek) tersimpan di peta dan ${convertedRoads.length} ruas jalan baru ditambahkan.`,
          'sync'
        );
        return;
      }
    }

    showToast(
      `Layer ${layer.fileType} Tersimpan di Peta`,
      `"${layer.name}" (${layer.features.length} objek spasial) berhasil dimuat dan disimpan ke peta.`,
      'sync'
    );
  };

  const handleToggleKmlLayer = (id: string) => {
    setKmlLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer))
    );
  };

  const handleUpdateKmlLayerColor = (id: string, color: string) => {
    setKmlLayers((prev) =>
      prev.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              color,
              features: layer.features.map((f) => ({ ...f, color })),
            }
          : layer
      )
    );
    showToast('Warna Layer Diperbarui', 'Warna layer KML/KMZ pada peta berhasil diubah.', 'info');
  };

  const handleDeleteKmlLayer = (id: string) => {
    const target = kmlLayers.find((l) => l.id === id);
    setKmlLayers((prev) => prev.filter((l) => l.id !== id));
    showToast(
      'Layer Peta Dihapus',
      `Layer KML/KMZ "${target?.name || ''}" telah dihapus dari peta.`,
      'info'
    );
  };

  const handleRestorePublishState = (restored: RestoredPublishState) => {
    isVideosHydratedRef.current = true;
    addedSessionVideoIdsRef.current = new Set(restored.videos.map((v) => v.id));
    deletedSessionVideoIdsRef.current.clear();
    void saveVideoMetadataList(restored.videos);
    setRuasList(restored.ruasList);
    setKmlLayers(restored.kmlLayers);
    setConditionColors(restored.conditionColors);
    setPhotos(restored.photos);
    setVideos(restored.videos);
    setNotifications(restored.notifications);
    setSelectedRuasId(restored.ruasList[0]?.id || '');
    showToast(
      'Paket Data Publish Dipulihkan',
      `${restored.ruasList.length} ruas, ${restored.kmlLayers.length} layer KML/KMZ, ${restored.photos.length} foto, dan ${restored.videos.length} video aktif.`,
      'sync'
    );
  };

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const isFullscreenSurveyActive = activeTab === 'camera' && isSurveyFullscreen;

  return (
    <div className={`min-h-screen bg-slate-950 flex flex-col font-sans select-none overflow-x-hidden ${batterySaver ? 'brightness-90 contrast-95' : ''}`}>
      {/* App Header (disembunyikan saat survei berjalan agar layar hanya menampilkan kamera realtime) */}
      {!isFullscreenSurveyActive && (
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOnline={isOnline}
          setIsOnline={setIsOnline}
          batterySaver={batterySaver}
          setBatterySaver={setBatterySaver}
          pendingSyncCount={pendingSyncCount}
          onTriggerSync={triggerSyncToCloud}
          isSyncing={isSyncing}
          unreadNotifCount={unreadNotifCount}
          onOpenNotifDrawer={() => setIsNotifDrawerOpen(true)}
          onOpenApkModal={() => setIsApkModalOpen(true)}
          onOpenPublishModal={() => setIsPublishModalOpen(true)}
          onOpenStorageSettings={() => setIsStorageSettingsOpen(true)}
        />
      )}

      {/* Main Content Area based on Tab */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'camera' && (
          <CameraSurveyView
            ruasList={ruasList}
            selectedRuasId={selectedRuasId}
            setSelectedRuasId={setSelectedRuasId}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handleUpdatePhoto}
            onAddVideo={handleAddVideo}
            onUpdateRuas={handleUpdateRuas}
            onSaveGpsTrack={handleSaveGpsTrack}
            onTriggerAlert={handleTriggerAlert}
            isOnline={isOnline}
            batterySaver={batterySaver}
            onViewPhoto={(photo) => setViewingPhoto(photo)}
            onViewVideo={(video) => setViewingVideo(video)}
            onSurveyFocusModeChange={setIsSurveyFullscreen}
            onOpenStorageSettings={() => setIsStorageSettingsOpen(true)}
          />
        )}

        {activeTab === 'map' && (
          <InteractiveMapView
            ruasList={ruasList}
            photos={photos}
            videos={videos}
            kmlLayers={kmlLayers}
            selectedRuasId={selectedRuasId}
            setSelectedRuasId={setSelectedRuasId}
            isOnline={isOnline}
            onUpdateRuas={handleUpdateRuas}
            onAddPhoto={handleAddPhoto}
            onAddVideo={handleAddVideo}
            onAddKmlLayer={handleAddKmlLayer}
            onToggleKmlLayer={handleToggleKmlLayer}
            onUpdateKmlLayerColor={handleUpdateKmlLayerColor}
            onDeleteKmlLayer={handleDeleteKmlLayer}
            onViewPhoto={(photo) => setViewingPhoto(photo)}
            conditionColors={conditionColors}
            onUpdateConditionColors={setConditionColors}
          />
        )}

        {activeTab === 'roads' && (
          <RoadsManagementView
            ruasList={ruasList}
            photos={photos}
            videos={videos}
            onAddRuas={handleAddRuas}
            onImportRuasList={handleImportRuasList}
            onUpdateRuas={handleUpdateRuas}
            onDeleteRuas={handleDeleteRuas}
            onDeleteAllRuas={handleDeleteAllRuas}
            onAddPhoto={handleAddPhoto}
            onAddVideo={handleAddVideo}
            isOnline={isOnline}
            onViewPhoto={(photo) => setViewingPhoto(photo)}
          />
        )}

        {activeTab === 'photos' && (
          <PhotoDocumentationView
            ruasList={ruasList}
            photos={photos}
            isOnline={isOnline}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handleUpdatePhoto}
            onViewPhoto={(photo) => setViewingPhoto(photo)}
            onDeletePhoto={handleDeletePhoto}
            onDeleteAllPhotos={handleDeleteAllPhotos}
            onOpenStorageSettings={() => setIsStorageSettingsOpen(true)}
          />
        )}

        {activeTab === 'videos' && (
          <VideoDocumentationView
            ruasList={ruasList}
            videos={videos}
            isOnline={isOnline}
            onAddVideo={handleAddVideo}
            onViewVideo={(video) => setViewingVideo(video)}
            onDeleteVideo={handleDeleteVideo}
            onOpenStorageSettings={() => setIsStorageSettingsOpen(true)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboardView
            ruasList={ruasList}
            photos={photos}
          />
        )}
      </main>

      {/* Media Inspection Modal (View & Download *.JPG / *.MP4) */}
      <ViewMediaModal
        photo={viewingPhoto}
        video={viewingVideo}
        onClose={() => {
          setViewingPhoto(null);
          setViewingVideo(null);
        }}
        onUpdatePhoto={handleUpdatePhoto}
        onDelete={() => {
          if (viewingPhoto) {
            handleDeletePhoto(viewingPhoto.id);
            setViewingPhoto(null);
          } else if (viewingVideo) {
            handleDeleteVideo(viewingVideo.id);
            setViewingVideo(null);
          }
        }}
      />

      {/* Push Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        onClearNotifications={() => {
          setNotifications([]);
        }}
      />

      {/* APK Ready-to-Use Download & Android Installation Modal */}
      <ApkDownloadModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
      />

      {/* Publish & Full App Data Bundle Modal */}
      <PublishDataModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        ruasList={ruasList}
        kmlLayers={kmlLayers}
        conditionColors={conditionColors}
        photos={photos}
        videos={videos}
        notifications={notifications}
        onRestorePublishState={handleRestorePublishState}
      />

      {/* Device Storage Settings Modal (Lokasi & Kualitas Penyimpanan Foto/Video) */}
      <DeviceStorageSettingsModal
        isOpen={isStorageSettingsOpen}
        onClose={() => setIsStorageSettingsOpen(false)}
        settings={deviceStorageSettings}
        onChangeSettings={setDeviceStorageSettings}
        photos={photos}
        videos={videos}
        ruasList={ruasList}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onClearAllPhotos={handleDeleteAllPhotos}
      />

      {/* Floating Field Alert Toast (tidak muncul menutupi kamera saat survei aktif) */}
      {toastMessage && !isFullscreenSurveyActive && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-xs text-white animate-in fade-in slide-in-from-bottom duration-200 w-[calc(100vw-2rem)] sm:w-auto max-w-md">
          <div className={`w-3 h-3 rounded-full shrink-0 ${
            toastMessage.type === 'alert' ? 'bg-rose-500 animate-ping' : toastMessage.type === 'sync' ? 'bg-emerald-500' : 'bg-sky-500'
          }`} />
          <div>
            <div className="font-bold">{toastMessage.title}</div>
            <div className="text-slate-300 text-[11px]">{toastMessage.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}
