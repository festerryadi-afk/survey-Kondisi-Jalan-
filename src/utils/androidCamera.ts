export type AndroidCameraPreset = 'vehicle_stable' | 'detail_sharp' | 'battery_lite';
export type AndroidCameraResolution = '720p' | '1080p' | '540p';
export type AndroidFocusPreference = 'auto_continuous' | 'infinity_lock';

export interface AndroidCameraSettings {
  preset: AndroidCameraPreset;
  deviceId: string;
  resolution: AndroidCameraResolution;
  targetFps: 24 | 30;
  focusMode: AndroidFocusPreference;
  focusDistance: number | null;
  exposureLock: boolean;
  exposureCompensation: number;
  zoom: number;
  torch: boolean;
  eisCropMargin: boolean;
  keepScreenAwake: boolean;
  hdPhotoCapture: boolean;
  enhanceLighting: boolean;
  enhanceSharpness: boolean;
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
  facingHint: 'back' | 'front' | 'other';
}

export interface NumericCapabilityRange {
  min: number;
  max: number;
  step: number;
}

export interface CameraHardwareCapabilities {
  supported: boolean;
  focusModes: string[];
  focusDistanceRange: NumericCapabilityRange | null;
  exposureModes: string[];
  exposureCompRange: NumericCapabilityRange | null;
  zoomRange: NumericCapabilityRange | null;
  hasTorch: boolean;
  actualWidth?: number;
  actualHeight?: number;
  actualFps?: number;
  actualFocusMode?: string;
}

const LEGACY_STORAGE_KEY_V1 = 'dpupr_android_camera_settings_v1';
const STORAGE_KEY = 'dpupr_android_camera_settings_v2';

export const DEFAULT_ANDROID_CAMERA_SETTINGS: AndroidCameraSettings = {
  preset: 'vehicle_stable',
  deviceId: '',
  resolution: '720p',
  targetFps: 30,
  focusMode: 'auto_continuous',
  focusDistance: null,
  exposureLock: false,
  exposureCompensation: 0.3,
  zoom: 1,
  torch: false,
  eisCropMargin: true,
  keepScreenAwake: true,
  hdPhotoCapture: true,
  enhanceLighting: true,
  enhanceSharpness: true,
};

export function getPresetCameraSettings(
  preset: AndroidCameraPreset,
  current?: Partial<AndroidCameraSettings>
): AndroidCameraSettings {
  const base: AndroidCameraSettings = {
    ...DEFAULT_ANDROID_CAMERA_SETTINGS,
    ...current,
    preset,
  };

  if (preset === 'vehicle_stable') {
    return {
      ...base,
      resolution: '720p',
      targetFps: 30,
      focusMode: 'auto_continuous',
      focusDistance: null,
      exposureCompensation: 0.3,
      eisCropMargin: true,
      keepScreenAwake: true,
      enhanceLighting: true,
      enhanceSharpness: true,
    };
  }

  if (preset === 'detail_sharp') {
    return {
      ...base,
      resolution: '1080p',
      targetFps: 30,
      focusMode: 'auto_continuous',
      focusDistance: null,
      exposureCompensation: 0.3,
      eisCropMargin: false,
      keepScreenAwake: true,
      enhanceLighting: true,
      enhanceSharpness: true,
    };
  }

  // battery_lite
  return {
    ...base,
    resolution: '540p',
    targetFps: 24,
    focusMode: 'auto_continuous',
    focusDistance: null,
    exposureCompensation: 0.2,
    eisCropMargin: true,
    keepScreenAwake: true,
    enhanceLighting: true,
    enhanceSharpness: true,
  };
}

export function loadAndroidCameraSettings(): AndroidCameraSettings {
  if (typeof window === 'undefined') return DEFAULT_ANDROID_CAMERA_SETTINGS;
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<AndroidCameraSettings>;
      return {
        ...DEFAULT_ANDROID_CAMERA_SETTINGS,
        ...parsed,
      };
    }

    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1) as Partial<AndroidCameraSettings>;
      const migratedFocusMode: AndroidFocusPreference =
        parsedV1.focusMode === 'infinity_lock' && parsedV1.focusDistance == null
          ? 'auto_continuous'
          : (parsedV1.focusMode ?? 'auto_continuous');
      const migrated: AndroidCameraSettings = {
        ...DEFAULT_ANDROID_CAMERA_SETTINGS,
        ...parsedV1,
        focusMode: migratedFocusMode,
        exposureCompensation:
          typeof parsedV1.exposureCompensation === 'number' && parsedV1.exposureCompensation !== 0
            ? parsedV1.exposureCompensation
            : DEFAULT_ANDROID_CAMERA_SETTINGS.exposureCompensation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return DEFAULT_ANDROID_CAMERA_SETTINGS;
  } catch {
    return DEFAULT_ANDROID_CAMERA_SETTINGS;
  }
}

export function saveAndroidCameraSettings(settings: AndroidCameraSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

export function getResolutionDimensions(resolution: AndroidCameraResolution): {
  width: number;
  height: number;
} {
  if (resolution === '1080p') return { width: 1920, height: 1080 };
  if (resolution === '540p') return { width: 960, height: 540 };
  return { width: 1280, height: 720 };
}

export function buildAndroidGetUserMediaConstraints(
  settings: AndroidCameraSettings
): MediaStreamConstraints {
  const { width, height } = getResolutionDimensions(settings.resolution);

  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: {
      ideal: settings.targetFps,
      max: settings.targetFps,
    },
  };

  if (settings.deviceId) {
    videoConstraints.deviceId = { exact: settings.deviceId };
  } else {
    videoConstraints.facingMode = { ideal: 'environment' };
  }

  return {
    video: videoConstraints,
    audio: false,
  };
}

export async function listAndroidCameraDevices(): Promise<CameraDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    let backCounter = 0;
    let frontCounter = 0;

    return videoInputs.map((d, idx) => {
      const rawLabel = (d.label || '').trim();
      const lower = rawLabel.toLowerCase();
      const isFront =
        lower.includes('front') || lower.includes('depan') || lower.includes('user');
      const isBack =
        lower.includes('back') ||
        lower.includes('rear') ||
        lower.includes('belakang') ||
        lower.includes('environment') ||
        lower.includes('wide') ||
        lower.includes('tele');

      let facingHint: 'back' | 'front' | 'other' = 'other';
      if (isBack) facingHint = 'back';
      else if (isFront) facingHint = 'front';

      let friendlyLabel = rawLabel;
      if (!friendlyLabel) {
        friendlyLabel = `Kamera Perangkat ${idx + 1}`;
      } else if (isBack) {
        backCounter++;
        const suffix =
          lower.includes('wide') || lower.includes('0,5') || lower.includes('0.6')
            ? ' (Wide)'
            : backCounter === 1
              ? ' (Utama)'
              : ` (${backCounter})`;
        friendlyLabel = `Kamera Belakang${suffix} — ${rawLabel}`;
      } else if (isFront) {
        frontCounter++;
        friendlyLabel = `Kamera Depan${frontCounter > 1 ? ` ${frontCounter}` : ''} — ${rawLabel}`;
      }

      return {
        deviceId: d.deviceId,
        label: friendlyLabel,
        facingHint,
      };
    });
  } catch {
    return [];
  }
}

export const EMPTY_HARDWARE_CAPABILITIES: CameraHardwareCapabilities = {
  supported: false,
  focusModes: [],
  focusDistanceRange: null,
  exposureModes: [],
  exposureCompRange: null,
  zoomRange: null,
  hasTorch: false,
};

type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min?: number; max?: number; step?: number };
  exposureMode?: string[];
  exposureCompensation?: { min?: number; max?: number; step?: number };
  zoom?: { min?: number; max?: number; step?: number };
  torch?: boolean;
  whiteBalanceMode?: string[];
  sharpness?: { min?: number; max?: number; step?: number };
  contrast?: { min?: number; max?: number; step?: number };
  brightness?: { min?: number; max?: number; step?: number };
};

type ExtendedSettings = MediaTrackSettings & {
  focusMode?: string;
};

function toRange(
  raw?: { min?: number; max?: number; step?: number }
): NumericCapabilityRange | null {
  if (!raw || typeof raw.min !== 'number' || typeof raw.max !== 'number') return null;
  if (raw.max <= raw.min) return null;
  return {
    min: raw.min,
    max: raw.max,
    step: typeof raw.step === 'number' && raw.step > 0 ? raw.step : (raw.max - raw.min) / 20,
  };
}

export function inspectCameraTrackCapabilities(
  stream: MediaStream | null
): CameraHardwareCapabilities {
  if (!stream) return EMPTY_HARDWARE_CAPABILITIES;
  const track = stream.getVideoTracks()[0];
  if (!track) return EMPTY_HARDWARE_CAPABILITIES;

  const caps = (
    typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
  ) as ExtendedCapabilities;
  const trackSettings = (
    typeof track.getSettings === 'function' ? track.getSettings() : {}
  ) as ExtendedSettings;

  return {
    supported: true,
    focusModes: Array.isArray(caps.focusMode) ? caps.focusMode : [],
    focusDistanceRange: toRange(caps.focusDistance),
    exposureModes: Array.isArray(caps.exposureMode) ? caps.exposureMode : [],
    exposureCompRange: toRange(caps.exposureCompensation),
    zoomRange: toRange(caps.zoom),
    hasTorch: Boolean(caps.torch),
    actualWidth: trackSettings.width,
    actualHeight: trackSettings.height,
    actualFps:
      typeof trackSettings.frameRate === 'number'
        ? Math.round(trackSettings.frameRate)
        : undefined,
    actualFocusMode: trackSettings.focusMode,
  };
}

export async function applyAndroidCameraTrackSettings(
  stream: MediaStream | null,
  settings: AndroidCameraSettings
): Promise<CameraHardwareCapabilities> {
  if (!stream) return EMPTY_HARDWARE_CAPABILITIES;
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.applyConstraints !== 'function') {
    return inspectCameraTrackCapabilities(stream);
  }

  const caps = inspectCameraTrackCapabilities(stream);
  const rawCaps = (
    typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
  ) as ExtendedCapabilities;

  const advancedSteps: Record<string, unknown>[] = [];

  // 1. Focus mode:
  // Catatan Camera2 Android (termasuk Vivo Y93 Android 8.1): focusDistance sering memakai satuan diopter
  // (0 = tak terhingga, max = jarak dekat/makro). Memaksa focusDistance=max membuat jalan buram!
  // Gunakan 'continuous' AF sebagai standar utama atau 'single-shot' / focusDistance manual bila disetel user.
  if (settings.focusMode === 'infinity_lock') {
    if (
      typeof settings.focusDistance === 'number' &&
      caps.focusModes.includes('manual') &&
      caps.focusDistanceRange
    ) {
      const targetDist = Math.min(
        caps.focusDistanceRange.max,
        Math.max(caps.focusDistanceRange.min, settings.focusDistance)
      );
      advancedSteps.push({ focusMode: 'manual', focusDistance: targetDist });
    } else if (caps.focusModes.includes('single-shot')) {
      advancedSteps.push({ focusMode: 'single-shot' });
    } else if (
      caps.focusModes.includes('manual') &&
      caps.focusDistanceRange &&
      caps.focusDistanceRange.min === 0
    ) {
      // Pada skala diopter Android, 0.0 adalah fokus jauh/tak terhingga
      advancedSteps.push({ focusMode: 'manual', focusDistance: 0 });
    } else if (caps.focusModes.includes('continuous')) {
      advancedSteps.push({ focusMode: 'continuous' });
    }
  } else if (caps.focusModes.includes('continuous')) {
    advancedSteps.push({ focusMode: 'continuous' });
  } else if (caps.focusModes.includes('single-shot')) {
    advancedSteps.push({ focusMode: 'single-shot' });
  }

  // 2. Exposure mode & compensation (mencegah aspal jalan gelap akibat backlight langit)
  if (settings.exposureLock && caps.exposureModes.includes('manual')) {
    advancedSteps.push({ exposureMode: 'manual' });
  } else if (!settings.exposureLock && caps.exposureModes.includes('continuous')) {
    advancedSteps.push({ exposureMode: 'continuous' });
  }

  if (caps.exposureCompRange) {
    const desiredEv = settings.enhanceLighting
      ? settings.exposureCompensation
      : Math.min(0, settings.exposureCompensation);
    const clampedEv = Math.min(
      caps.exposureCompRange.max,
      Math.max(caps.exposureCompRange.min, desiredEv)
    );
    advancedSteps.push({ exposureCompensation: clampedEv });
  }

  // 3. White balance stabil
  if (Array.isArray(rawCaps.whiteBalanceMode) && rawCaps.whiteBalanceMode.includes('continuous')) {
    advancedSteps.push({ whiteBalanceMode: 'continuous' });
  }

  // 4. Hardware sharpness boost ringan bila didukung driver kamera Android
  const sharpnessRange = toRange(rawCaps.sharpness);
  if (sharpnessRange && settings.enhanceSharpness) {
    const midSharpness = sharpnessRange.min + (sharpnessRange.max - sharpnessRange.min) * 0.65;
    advancedSteps.push({ sharpness: midSharpness });
  }

  // 5. Hardware Zoom
  if (caps.zoomRange) {
    const clampedZoom = Math.min(
      caps.zoomRange.max,
      Math.max(caps.zoomRange.min, settings.zoom)
    );
    advancedSteps.push({ zoom: clampedZoom });
  }

  // 6. Torch / Flash
  if (caps.hasTorch) {
    advancedSteps.push({ torch: settings.torch });
  }

  // Terapkan satu per satu agar jika salah satu constraint tidak didukung driver Android tertentu,
  // constraint lainnya tetap berhasil diterapkan.
  for (const step of advancedSteps) {
    try {
      await track.applyConstraints({
        advanced: [step as MediaTrackConstraintSet],
      });
    } catch {
      // Abaikan constraint yang ditolak oleh HAL kamera tertentu
    }
  }

  return inspectCameraTrackCapabilities(stream);
}

export interface CapturedStillFrame {
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap;
  isNativeSensor: boolean;
  cleanup: () => void;
}

/**
 * Mengambil gambar resolusi HD asli langsung dari sensor kamera Android via ImageCapture.takePhoto()
 * (mis. 12MP / 4K / Full HD) dengan batas waktu aman dan fallback instan ke frame <video>.
 */
export async function captureHighResStillSource(
  stream: MediaStream | null,
  videoEl: HTMLVideoElement,
  preferNativeSensor = true
): Promise<CapturedStillFrame> {
  const fallback: CapturedStillFrame = {
    source: videoEl,
    isNativeSensor: false,
    cleanup: () => {},
  };

  if (!preferNativeSensor || !stream) return fallback;

  const track = stream.getVideoTracks()[0];
  const ImageCaptureCtor = (
    window as unknown as {
      ImageCapture?: new (track: MediaStreamTrack) => {
        getPhotoCapabilities?: () => Promise<{
          imageWidth?: { min?: number; max?: number };
          imageHeight?: { min?: number; max?: number };
        }>;
        takePhoto: (settings?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob>;
      };
    }
  ).ImageCapture;

  if (!track || track.readyState !== 'live' || typeof ImageCaptureCtor !== 'function') {
    return fallback;
  }

  try {
    const capturer = new ImageCaptureCtor(track);
    let photoSettings: { imageWidth?: number; imageHeight?: number } | undefined;

    if (typeof capturer.getPhotoCapabilities === 'function') {
      try {
        const photoCaps = await Promise.race([
          capturer.getPhotoCapabilities(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 350)),
        ]);
        if (photoCaps?.imageWidth?.max) {
          // Targetkan hingga 3840px (4K HD) agar tajam 3000x2102 tanpa membebani memori
          const targetW = Math.min(3840, photoCaps.imageWidth.max);
          photoSettings = { imageWidth: targetW };
        }
      } catch {
        // gunakan pengaturan default sensor bila getPhotoCapabilities ditolak
      }
    }

    const blob = await Promise.race([
      capturer.takePhoto(photoSettings),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1400)),
    ]);

    if (!blob || blob.size === 0) {
      return fallback;
    }

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        isNativeSensor: true,
        cleanup: () => {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
        },
      };
    }

    const objUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objUrl;
    });

    if (!img) {
      URL.revokeObjectURL(objUrl);
      return fallback;
    }

    return {
      source: img,
      isNativeSensor: true,
      cleanup: () => {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return fallback;
  }
}
