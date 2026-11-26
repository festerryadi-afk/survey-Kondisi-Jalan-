import {
  ImportedKmlLayer,
  MapConditionColors,
  NotificationPush,
  RuasJalan,
  SurveyPhoto,
  SurveyVideo,
} from '../types';
import { getStoredVideoEntry, saveVideoBlobToStorage } from './videoRecorder';
import { DEFAULT_CONDITION_COLORS } from '../components/MapLayerColorModal';
import { triggerBlobDownload } from './nativeDownload';

export interface SerializedVideoBlob {
  videoId: string;
  mimeType: string;
  extension: string;
  dataUrl: string;
}

export interface PublishAppSnapshot {
  format: 'mentawai-survey-publish-bundle';
  version: number;
  exportedAt: string;
  appName: string;
  sourceOrigin: string;
  data: {
    ruasList: RuasJalan[];
    kmlLayers: ImportedKmlLayer[];
    conditionColors: MapConditionColors;
    photos: SurveyPhoto[];
    videos: SurveyVideo[];
    notifications: NotificationPush[];
    videoBlobs?: SerializedVideoBlob[];
  };
}

export interface CompactShareSnapshot {
  format: 'mentawai-survey-compact-share';
  version: number;
  exportedAt: string;
  data: {
    ruasList: RuasJalan[];
    kmlLayers: ImportedKmlLayer[];
    conditionColors: MapConditionColors;
  };
}

export interface RestoredPublishState {
  ruasList: RuasJalan[];
  kmlLayers: ImportedKmlLayer[];
  conditionColors: MapConditionColors;
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  notifications: NotificationPush[];
  restoredVideoBlobCount: number;
}

const MAX_INLINE_VIDEO_BYTES = 45 * 1024 * 1024; // 45 MB safety limit per video blob

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca data biner video.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal mengonversi video ke format paket publish.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, fallbackMime = 'video/webm'): Blob {
  const parts = dataUrl.split(',');
  const header = parts[0] || '';
  const base64 = parts[1] || '';
  const mimeMatch = header.match(/data:([^;]+);base64/i);
  const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function createFullAppPublishPackage(input: {
  ruasList: RuasJalan[];
  kmlLayers: ImportedKmlLayer[];
  conditionColors: MapConditionColors;
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  notifications: NotificationPush[];
}): Promise<{ snapshot: PublishAppSnapshot; skippedLargeVideos: number }> {
  const videoBlobs: SerializedVideoBlob[] = [];
  let skippedLargeVideos = 0;

  for (const video of input.videos) {
    try {
      const stored = await getStoredVideoEntry(video.id);
      if (stored && stored.blob.size > 0) {
        if (stored.blob.size <= MAX_INLINE_VIDEO_BYTES) {
          const dataUrl = await blobToDataUrl(stored.blob);
          videoBlobs.push({
            videoId: video.id,
            mimeType: stored.mimeType,
            extension: stored.extension,
            dataUrl,
          });
        } else {
          skippedLargeVideos++;
        }
      }
    } catch {
      // Skip unreadable video blob gracefully
    }
  }

  const snapshot: PublishAppSnapshot = {
    format: 'mentawai-survey-publish-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: 'Survey Kondisi Jalan Kab. Kep. Mentawai',
    sourceOrigin: typeof window !== 'undefined' ? window.location.origin : '',
    data: {
      ruasList: input.ruasList,
      kmlLayers: input.kmlLayers,
      conditionColors: input.conditionColors,
      photos: input.photos,
      videos: input.videos,
      notifications: input.notifications,
      videoBlobs,
    },
  };

  return { snapshot, skippedLargeVideos };
}

export function downloadPublishPackageJson(snapshot: PublishAppSnapshot): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Paket_Publish_SurveyJalan_Mentawai_${dateStr}.json`;
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function importFullAppPublishPackage(file: File): Promise<RestoredPublishState> {
  const rawText = await file.text();
  let parsed: PublishAppSnapshot;
  try {
    parsed = JSON.parse(rawText) as PublishAppSnapshot;
  } catch {
    throw new Error('File bukan format JSON paket publish yang valid.');
  }

  if (
    !parsed ||
    parsed.format !== 'mentawai-survey-publish-bundle' ||
    !parsed.data ||
    !Array.isArray(parsed.data.ruasList)
  ) {
    throw new Error('Struktur file tidak dikenali sebagai Paket Publish Survey Jalan Mentawai.');
  }

  const restoredVideos: SurveyVideo[] = Array.isArray(parsed.data.videos)
    ? parsed.data.videos.map((v) => ({ ...v }))
    : [];

  let restoredVideoBlobCount = 0;
  const blobs = Array.isArray(parsed.data.videoBlobs) ? parsed.data.videoBlobs : [];

  for (const item of blobs) {
    if (!item?.videoId || !item?.dataUrl) continue;
    try {
      const blob = dataUrlToBlob(item.dataUrl, item.mimeType || 'video/webm');
      const entry = await saveVideoBlobToStorage(
        item.videoId,
        blob,
        item.mimeType || blob.type || 'video/webm',
        `video.${item.extension || 'webm'}`
      );
      const targetIndex = restoredVideos.findIndex((v) => v.id === item.videoId);
      if (targetIndex !== -1) {
        restoredVideos[targetIndex] = {
          ...restoredVideos[targetIndex],
          videoUrl: entry.blobUrl,
        };
      }
      restoredVideoBlobCount++;
    } catch {
      // Ignore individual blob restore error
    }
  }

  return {
    ruasList: parsed.data.ruasList,
    kmlLayers: Array.isArray(parsed.data.kmlLayers) ? parsed.data.kmlLayers : [],
    conditionColors: {
      ...DEFAULT_CONDITION_COLORS,
      ...(parsed.data.conditionColors || {}),
    },
    photos: Array.isArray(parsed.data.photos) ? parsed.data.photos : [],
    videos: restoredVideos,
    notifications: Array.isArray(parsed.data.notifications) ? parsed.data.notifications : [],
    restoredVideoBlobCount,
  };
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Utf8(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function buildCompactShareUrl(
  baseUrl: string,
  input: {
    ruasList: RuasJalan[];
    kmlLayers: ImportedKmlLayer[];
    conditionColors: MapConditionColors;
  }
): { url: string; tooLarge: boolean; length: number } {
  const payload: CompactShareSnapshot = {
    format: 'mentawai-survey-compact-share',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      ruasList: input.ruasList,
      kmlLayers: input.kmlLayers,
      conditionColors: input.conditionColors,
    },
  };
  const encoded = toBase64Utf8(JSON.stringify(payload));
  const cleanBase = baseUrl.split('#')[0];
  const fullUrl = `${cleanBase}#publishData=${encoded}`;
  return {
    url: fullUrl,
    tooLarge: fullUrl.length > 60000,
    length: fullUrl.length,
  };
}

export function tryParsePublishHashFromUrl(): CompactShareSnapshot['data'] | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#publishData=')) return null;
  try {
    const encoded = hash.slice('#publishData='.length);
    if (!encoded) return null;
    const json = fromBase64Utf8(encoded);
    const parsed = JSON.parse(json) as CompactShareSnapshot;
    if (
      parsed?.format === 'mentawai-survey-compact-share' &&
      parsed?.data &&
      Array.isArray(parsed.data.ruasList)
    ) {
      return {
        ruasList: parsed.data.ruasList,
        kmlLayers: Array.isArray(parsed.data.kmlLayers) ? parsed.data.kmlLayers : [],
        conditionColors: {
          ...DEFAULT_CONDITION_COLORS,
          ...(parsed.data.conditionColors || {}),
        },
      };
    }
  } catch {
    return null;
  }
  return null;
}
