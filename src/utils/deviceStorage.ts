import { RuasJalan, SurveyPhoto, SurveyVideo } from '../types';
import { getHd600DpiPhotoFromStorage } from './photo3r';
import { downloadSurveyVideo, getStoredVideoEntry } from './videoRecorder';
import { triggerBlobDownload } from './nativeDownload';

export type DeviceStorageMode = 'internal_only' | 'internal_and_folder' | 'auto_download';
export type PhotoDeviceQuality = 'hd_600dpi' | 'standard_fhd';
export type VideoBitratePreset = 'high_3mbps' | 'balanced_2mbps' | 'compact_1mbps';

export interface DeviceStorageSettings {
  storageMode: DeviceStorageMode;
  autoSavePhotosToDevice: boolean;
  autoSaveVideosToDevice: boolean;
  organizeByRuasFolder: boolean;
  photoQuality: PhotoDeviceQuality;
  videoBitratePreset: VideoBitratePreset;
  folderName: string;
}

export const DEFAULT_DEVICE_STORAGE_SETTINGS: DeviceStorageSettings = {
  storageMode: 'internal_only',
  autoSavePhotosToDevice: true,
  autoSaveVideosToDevice: true,
  organizeByRuasFolder: true,
  photoQuality: 'hd_600dpi',
  videoBitratePreset: 'high_3mbps',
  folderName: '',
};

const STORAGE_SETTINGS_KEY = 'mentawai_device_storage_settings_v1';
const STORAGE_DB_NAME = 'mentawai_device_storage_db';
const STORAGE_DB_VERSION = 1;
const HANDLE_STORE = 'directory_handles';
const ROOT_HANDLE_KEY = 'root_directory_handle';

type PermissionStateType = 'granted' | 'denied' | 'prompt';

export interface FileSystemDirectoryHandleLike {
  name: string;
  kind: 'directory';
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionStateType>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionStateType>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export interface DirectoryHandleStatus {
  supported: boolean;
  hasHandle: boolean;
  folderName: string;
  permission: PermissionStateType | 'unsupported';
}

export interface DeviceStorageEstimateInfo {
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isPersisted: boolean;
  supportsEstimate: boolean;
  supportsPersist: boolean;
}

export function loadDeviceStorageSettings(): DeviceStorageSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_DEVICE_STORAGE_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DEVICE_STORAGE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DeviceStorageSettings>;
    return {
      ...DEFAULT_DEVICE_STORAGE_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_DEVICE_STORAGE_SETTINGS };
  }
}

export function saveDeviceStorageSettings(settings: DeviceStorageSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota error
  }
}

export function getVideoBitrateBps(preset: VideoBitratePreset): number {
  if (preset === 'compact_1mbps') return 1_200_000;
  if (preset === 'balanced_2mbps') return 2_000_000;
  return 3_000_000;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isDirectoryPickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as Window & { showDirectoryPicker?: unknown };
  return typeof win.showDirectoryPicker === 'function';
}

function openHandleDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandleLike | null> {
  const db = await openHandleDB();
  if (!db) return null;
  try {
    const handle = await new Promise<unknown>((resolve) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (handle && typeof (handle as FileSystemDirectoryHandleLike).getFileHandle === 'function') {
      return handle as FileSystemDirectoryHandleLike;
    }
    return null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandleLike): Promise<void> {
  const db = await openHandleDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, ROOT_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

export async function clearSavedDirectoryHandle(): Promise<void> {
  const db = await openHandleDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(ROOT_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  } finally {
    db.close();
  }
}

export async function getDirectoryHandleStatus(): Promise<DirectoryHandleStatus> {
  const supported = isDirectoryPickerSupported();
  if (!supported) {
    return {
      supported: false,
      hasHandle: false,
      folderName: '',
      permission: 'unsupported',
    };
  }

  const handle = await getStoredDirectoryHandle();
  if (!handle) {
    return {
      supported: true,
      hasHandle: false,
      folderName: '',
      permission: 'prompt',
    };
  }

  let permission: PermissionStateType = 'prompt';
  try {
    if (typeof handle.queryPermission === 'function') {
      permission = await handle.queryPermission({ mode: 'readwrite' });
    } else {
      permission = 'granted';
    }
  } catch {
    permission = 'prompt';
  }

  return {
    supported: true,
    hasHandle: true,
    folderName: handle.name || 'Folder Terpilih',
    permission,
  };
}

export async function pickDeviceStorageFolder(): Promise<{
  folderName: string;
  permission: PermissionStateType;
}> {
  if (!isDirectoryPickerSupported()) {
    throw new Error(
      'Browser/WebView pada perangkat ini belum mendukung pemilihan folder langsung. Gunakan mode Unduh Otomatis ke Folder Download atau Penyimpanan Internal.'
    );
  }
  const win = window as Window & {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandleLike>;
  };

  if (!win.showDirectoryPicker) {
    throw new Error(
      'Browser/WebView pada perangkat ini belum mendukung pemilihan folder langsung.'
    );
  }

  const handle = await win.showDirectoryPicker({
    id: 'mentawai-survey-media',
    mode: 'readwrite',
    startIn: 'downloads',
  });

  let permission: PermissionStateType = 'granted';
  try {
    if (typeof handle.requestPermission === 'function') {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
  } catch {
    permission = 'granted';
  }

  await saveStoredDirectoryHandle(handle);
  return {
    folderName: handle.name || 'SurveyJalanMentawai',
    permission,
  };
}

export async function requestSavedDirectoryPermission(): Promise<PermissionStateType> {
  const handle = await getStoredDirectoryHandle();
  if (!handle) return 'prompt';
  try {
    if (typeof handle.requestPermission === 'function') {
      return await handle.requestPermission({ mode: 'readwrite' });
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}

function sanitizePathSegment(input: string): string {
  return (input || 'Umum')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
}

async function dataUrlToBlobAsync(dataUrl: string): Promise<Blob | null> {
  if (!dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function writeBlobToDirectoryHandle(
  rootHandle: FileSystemDirectoryHandleLike,
  subFolders: string[],
  filename: string,
  blob: Blob
): Promise<boolean> {
  try {
    if (typeof rootHandle.queryPermission === 'function') {
      const perm = await rootHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
    }

    let currentDir = rootHandle;
    for (const folder of subFolders) {
      const safeName = sanitizePathSegment(folder);
      if (!safeName) continue;
      currentDir = await currentDir.getDirectoryHandle(safeName, { create: true });
    }

    const safeFileName = sanitizePathSegment(filename);
    const fileHandle = await currentDir.getFileHandle(safeFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export function buildPhotoDeviceFilename(photo: SurveyPhoto): string {
  const safeRuas = sanitizePathSegment(photo.nomorRuas || '001');
  const safeSta = sanitizePathSegment(photo.staText || `STA_${photo.sta}`);
  const stamp = photo.timestamp
    ? photo.timestamp.slice(0, 19).replace(/[:T]/g, '-')
    : String(Date.now());
  return `DPUPR_MENTAWAI_Ruas${safeRuas}_${safeSta}_${stamp}.jpg`;
}

export function buildVideoDeviceFilename(video: SurveyVideo, extension = 'webm'): string {
  const safeRuas = sanitizePathSegment(video.nomorRuas || '001');
  const safeExt = extension.replace(/[^a-z0-9]/gi, '') || 'webm';
  return `DPUPR_MENTAWAI_Video_Ruas${safeRuas}_STA${video.startSta}-${video.endSta}_${video.id.slice(-4)}.${safeExt}`;
}

export async function resolvePhotoBlobForDeviceSave(
  photo: SurveyPhoto,
  quality: PhotoDeviceQuality
): Promise<Blob | null> {
  if (quality === 'hd_600dpi') {
    const hdUrl = await getHd600DpiPhotoFromStorage(photo.id);
    if (hdUrl) {
      const hdBlob = await dataUrlToBlobAsync(hdUrl);
      if (hdBlob) return hdBlob;
    }
  }
  return dataUrlToBlobAsync(photo.imageUrl);
}

export function triggerBlobBrowserDownload(blob: Blob, filename: string): void {
  triggerBlobDownload(blob, filename);
}

export async function persistPhotoToConfiguredDeviceTarget(
  photo: SurveyPhoto,
  settings: DeviceStorageSettings,
  ruas?: RuasJalan,
  allowBrowserDownloadNow = true
): Promise<'folder' | 'download' | 'skipped'> {
  if (!settings.autoSavePhotosToDevice || settings.storageMode === 'internal_only') {
    return 'skipped';
  }

  const filename = buildPhotoDeviceFilename(photo);

  if (settings.storageMode === 'internal_and_folder') {
    const handle = await getStoredDirectoryHandle();
    if (!handle) return 'skipped';
    const blob = await resolvePhotoBlobForDeviceSave(photo, settings.photoQuality);
    if (!blob) return 'skipped';

    const ruasFolder = `Ruas_${sanitizePathSegment(ruas?.nomorRuas || photo.nomorRuas)}_${sanitizePathSegment(ruas?.namaRuas || photo.ruasNama)}`;
    const subFolders = settings.organizeByRuasFolder ? [ruasFolder, 'Foto'] : ['Foto_Survei'];
    const ok = await writeBlobToDirectoryHandle(handle, subFolders, filename, blob);
    return ok ? 'folder' : 'skipped';
  }

  if (settings.storageMode === 'auto_download' && allowBrowserDownloadNow) {
    const blob = await resolvePhotoBlobForDeviceSave(photo, settings.photoQuality);
    if (!blob) return 'skipped';
    triggerBlobBrowserDownload(blob, filename);
    return 'download';
  }

  return 'skipped';
}

export async function persistVideoToConfiguredDeviceTarget(
  video: SurveyVideo,
  settings: DeviceStorageSettings,
  ruas?: RuasJalan
): Promise<'folder' | 'download' | 'skipped'> {
  if (!settings.autoSaveVideosToDevice || settings.storageMode === 'internal_only') {
    return 'skipped';
  }

  if (settings.storageMode === 'internal_and_folder') {
    const handle = await getStoredDirectoryHandle();
    if (!handle) return 'skipped';
    const entry = await getStoredVideoEntry(video.id);
    if (!entry || entry.blob.size === 0) return 'skipped';

    const filename = buildVideoDeviceFilename(video, entry.extension);
    const ruasFolder = `Ruas_${sanitizePathSegment(ruas?.nomorRuas || video.nomorRuas)}_${sanitizePathSegment(ruas?.namaRuas || video.ruasNama)}`;
    const subFolders = settings.organizeByRuasFolder ? [ruasFolder, 'Video'] : ['Video_Survei'];
    const ok = await writeBlobToDirectoryHandle(handle, subFolders, filename, entry.blob);
    return ok ? 'folder' : 'skipped';
  }

  if (settings.storageMode === 'auto_download') {
    await downloadSurveyVideo(video);
    return 'download';
  }

  return 'skipped';
}

export async function batchExportMediaToSavedFolder(params: {
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  ruasList: RuasJalan[];
  settings: DeviceStorageSettings;
  onProgress?: (done: number, total: number, currentLabel: string) => void;
}): Promise<{ exportedPhotos: number; exportedVideos: number; failed: number }> {
  const handle = await getStoredDirectoryHandle();
  if (!handle) {
    throw new Error('Folder penyimpanan perangkat belum dipilih.');
  }

  if (typeof handle.queryPermission === 'function') {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') {
      throw new Error('Izin tulis ke folder perangkat ditolak.');
    }
  }

  const { photos, videos, ruasList, settings, onProgress } = params;
  const total = photos.length + videos.length;
  let done = 0;
  let exportedPhotos = 0;
  let exportedVideos = 0;
  let failed = 0;

  for (const photo of photos) {
    const ruas = ruasList.find((r) => r.id === photo.ruasId);
    onProgress?.(done, total, `Menyimpan foto ${photo.staText}...`);
    const blob = await resolvePhotoBlobForDeviceSave(photo, settings.photoQuality);
    if (blob) {
      const filename = buildPhotoDeviceFilename(photo);
      const ruasFolder = `Ruas_${sanitizePathSegment(ruas?.nomorRuas || photo.nomorRuas)}_${sanitizePathSegment(ruas?.namaRuas || photo.ruasNama)}`;
      const subFolders = settings.organizeByRuasFolder ? [ruasFolder, 'Foto'] : ['Foto_Survei'];
      const ok = await writeBlobToDirectoryHandle(handle, subFolders, filename, blob);
      if (ok) exportedPhotos++;
      else failed++;
    } else {
      failed++;
    }
    done++;
    onProgress?.(done, total, `Menyimpan foto ${photo.staText}...`);
  }

  for (const video of videos) {
    const ruas = ruasList.find((r) => r.id === video.ruasId);
    onProgress?.(done, total, `Menyimpan video Ruas ${video.nomorRuas}...`);
    const entry = await getStoredVideoEntry(video.id);
    if (entry && entry.blob.size > 0) {
      const filename = buildVideoDeviceFilename(video, entry.extension);
      const ruasFolder = `Ruas_${sanitizePathSegment(ruas?.nomorRuas || video.nomorRuas)}_${sanitizePathSegment(ruas?.namaRuas || video.ruasNama)}`;
      const subFolders = settings.organizeByRuasFolder ? [ruasFolder, 'Video'] : ['Video_Survei'];
      const ok = await writeBlobToDirectoryHandle(handle, subFolders, filename, entry.blob);
      if (ok) exportedVideos++;
      else failed++;
    } else {
      failed++;
    }
    done++;
    onProgress?.(done, total, `Menyimpan video Ruas ${video.nomorRuas}...`);
  }

  return { exportedPhotos, exportedVideos, failed };
}

export async function getDeviceStorageEstimate(): Promise<DeviceStorageEstimateInfo> {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          storage?: {
            estimate?: () => Promise<{ usage?: number; quota?: number }>;
            persisted?: () => Promise<boolean>;
            persist?: () => Promise<boolean>;
          };
        })
      : undefined;

  let usageBytes = 0;
  let quotaBytes = 0;
  let isPersisted = false;
  const supportsEstimate = Boolean(nav?.storage?.estimate);
  const supportsPersist = Boolean(nav?.storage?.persist);

  if (nav?.storage?.estimate) {
    try {
      const est = await nav.storage.estimate();
      usageBytes = est.usage || 0;
      quotaBytes = est.quota || 0;
    } catch {
      // ignore
    }
  }

  if (nav?.storage?.persisted) {
    try {
      isPersisted = await nav.storage.persisted();
    } catch {
      isPersisted = false;
    }
  }

  const usagePercent =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;

  return {
    usageBytes,
    quotaBytes,
    usagePercent,
    isPersisted,
    supportsEstimate,
    supportsPersist,
  };
}

export async function requestPersistentDeviceStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    storage?: { persist?: () => Promise<boolean> };
  };
  if (!nav.storage?.persist) return false;
  try {
    return await nav.storage.persist();
  } catch {
    return false;
  }
}
