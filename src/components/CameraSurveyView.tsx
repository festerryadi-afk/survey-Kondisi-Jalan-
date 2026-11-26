import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause,
  Square, 
  Camera, 
  Video, 
  MapPin, 
  Gauge, 
  AlertTriangle, 
  CheckCircle2, 
  Car, 
  Bike,
  Footprints,
  Eye, 
  Volume2, 
  VolumeX, 
  ShieldCheck,
  Maximize2,
  Sparkles,
  Loader2,
  Route,
  FileSpreadsheet,
  FileCode,
  Flag,
  Settings2,
  Flashlight,
  HardDrive,
} from 'lucide-react';
import {
  RuasJalan,
  SurveyPhoto,
  SurveyVideo,
  DefectItem,
  RoadConditionPKRMS,
  TreatmentRecommendation,
  GpsTrackPoint,
} from '../types';
import { calculateDistanceMeters, formatSTA, drawWatermark, interpolateCoordAlongRuas } from '../utils/geo';
import {
  drawImageCover3R,
  cacheHd600DpiPhoto,
} from '../utils/photo3r';
import {
  encodePhotoAsyncFallback,
  runPhotoEncodeInWorker,
} from '../utils/photoWorkerClient';
import { evaluatePKRMSCondition, getSurfaceAndConditionAtSTA } from '../utils/pkrms';
import { generateSHA256 } from '../utils/crypto';
import {
  RoadSurveyRecorder,
  generateFallbackRoadVideoEntry,
  createCompactVideoThumbnail,
  drawRoadSimulationVideoFrame,
} from '../utils/videoRecorder';
import { analyzeRoadDamageFromPhoto } from '../utils/roadDamageAI';
import {
  exportGpsTracksToExcel,
  exportGpsTracksToKML,
  exportGpsTracksToKMZ,
} from '../utils/gpsTrackerExport';
import {
  AndroidCameraSettings,
  CameraDeviceOption,
  CameraHardwareCapabilities,
  EMPTY_HARDWARE_CAPABILITIES,
  applyAndroidCameraTrackSettings,
  buildAndroidGetUserMediaConstraints,
  captureHighResStillSource,
  getResolutionDimensions,
  listAndroidCameraDevices,
  loadAndroidCameraSettings,
  saveAndroidCameraSettings,
} from '../utils/androidCamera';
import { AndroidCameraSettingsModal } from './AndroidCameraSettingsModal';
import { getVideoBitrateBps, loadDeviceStorageSettings } from '../utils/deviceStorage';

interface CameraSurveyViewProps {
  ruasList: RuasJalan[];
  selectedRuasId: string;
  setSelectedRuasId: (id: string) => void;
  onAddPhoto: (photo: SurveyPhoto) => void;
  onUpdatePhoto?: (photo: SurveyPhoto) => void;
  onAddVideo: (video: SurveyVideo) => void;
  onUpdateRuas?: (ruas: RuasJalan) => void;
  onSaveGpsTrack?: (
    ruasId: string,
    gpsTrack: GpsTrackPoint[],
    options?: {
      customEndStaMeters?: number;
      applyGeometry?: boolean;
      silent?: boolean;
    }
  ) => void;
  onTriggerAlert: (title: string, message: string, ruasId: string, sta: string) => void;
  isOnline: boolean;
  batterySaver: boolean;
  onViewPhoto: (photo: SurveyPhoto) => void;
  onViewVideo?: (video: SurveyVideo) => void;
  onSurveyFocusModeChange?: (active: boolean) => void;
  onOpenStorageSettings?: () => void;
}

export const CameraSurveyView: React.FC<CameraSurveyViewProps> = ({
  ruasList,
  selectedRuasId,
  setSelectedRuasId,
  onAddPhoto,
  onUpdatePhoto,
  onAddVideo,
  onUpdateRuas,
  onSaveGpsTrack,
  onTriggerAlert,
  isOnline,
  batterySaver,
  onViewPhoto,
  onViewVideo,
  onSurveyFocusModeChange,
  onOpenStorageSettings,
}) => {
  const currentRuas = ruasList.find((r) => r.id === selectedRuasId) || ruasList[0];

  // Survey Run State
  const [isSurveyRunning, setIsSurveyRunning] = useState<boolean>(false);
  const [isSurveyPaused, setIsSurveyPaused] = useState<boolean>(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [videoElapsedSec, setVideoElapsedSec] = useState<number>(0);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(true);
  const [videoFeatureEnabled, setVideoFeatureEnabled] = useState<boolean>(true);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState<boolean>(true);
  const [useSimulationDriving, setUseSimulationDriving] = useState<boolean>(true);
  const [simulationMode, setSimulationMode] = useState<'car' | 'motorcycle' | 'walking'>('car');
  const [vehicleSpeedKmh, setVehicleSpeedKmh] = useState<number>(0);

  // Position & STA tracking
  const [currentSta, setCurrentSta] = useState<number>(0);
  const [distanceSinceLastCapture, setDistanceSinceLastCapture] = useState<number>(0);
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number; altitude: number; accuracy: number }>({
    lat: currentRuas ? currentRuas.koordinatAwal[0] : -2.0234,
    lng: currentRuas ? currentRuas.koordinatAwal[1] : 99.5912,
    altitude: 18.5,
    accuracy: 2.4,
  });

  const lastCaptureCoordRef = useRef<{ lat: number; lng: number }>({
    lat: currentRuas ? currentRuas.koordinatAwal[0] : -2.0234,
    lng: currentRuas ? currentRuas.koordinatAwal[1] : 99.5912,
  });
  const prevGpsFixRef = useRef<{ lat: number; lng: number; timeMs: number } | null>(null);
  const staRef = useRef<number>(0);
  const distAccumRef = useRef<number>(0);
  const lastAutoCaptureStaRef = useRef<number>(0);
  const lastTrack100StaRef = useRef<number>(0);
  const lastTrackedCoordRef = useRef<{ lat: number; lng: number; staMeters: number } | null>(null);

  // GPS Route Tracker state & custom STA Akhir (non-kelipatan 100m didukung)
  const [gpsTrackPoints, setGpsTrackPoints] = useState<GpsTrackPoint[]>(() =>
    currentRuas?.gpsTrack ? [...currentRuas.gpsTrack] : []
  );
  const gpsTrackRef = useRef<GpsTrackPoint[]>(currentRuas?.gpsTrack ? [...currentRuas.gpsTrack] : []);
  const [customEndStaInput, setCustomEndStaInput] = useState<string>(() =>
    String(Math.max(1, Math.round((currentRuas?.panjangKm || 1) * 1000)))
  );

  // Camera video & canvas references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isActivatingCamera, setIsActivatingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [androidCameraSettings, setAndroidCameraSettings] = useState<AndroidCameraSettings>(() =>
    loadAndroidCameraSettings()
  );
  const androidCameraSettingsRef = useRef<AndroidCameraSettings>(androidCameraSettings);
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [cameraCapabilities, setCameraCapabilities] = useState<CameraHardwareCapabilities>(
    EMPTY_HARDWARE_CAPABILITIES
  );
  const [showCameraSettingsModal, setShowCameraSettingsModal] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // Real-time AI detection state & controls
  const [aiDetectionEnabled, setAiDetectionEnabled] = useState<boolean>(true);
  const [isScanningLiveAI, setIsScanningLiveAI] = useState<boolean>(false);
  const [aiLastSummary, setAiLastSummary] = useState<string | null>(null);
  const [detectedDefects, setDetectedDefects] = useState<DefectItem[]>([]);
  const detectedDefectsRef = useRef<DefectItem[]>([]);
  const aiDetectionEnabledRef = useRef<boolean>(true);
  const autoCaptureEnabledRef = useRef<boolean>(autoCaptureEnabled);
  const isScanningLiveAIRef = useRef<boolean>(false);
  const vehicleSpeedRef = useRef<number>(0);
  const simulationModeRef = useRef<'car' | 'motorcycle' | 'walking'>('car');
  const currentCoordRef = useRef(currentCoord);
  const currentRuasRef = useRef(currentRuas);
  const cameraActiveRef = useRef(false);
  const recorderRef = useRef<RoadSurveyRecorder | null>(null);
  const isRecordingVideoRef = useRef<boolean>(false);
  const isSurveyPausedRef = useRef<boolean>(false);
  const videoStartStaRef = useRef<number>(0);
  const videoStartTimeMsRef = useRef<number>(0);
  const videoPausedTotalMsRef = useRef<number>(0);
  const videoPauseStartedAtMsRef = useRef<number>(0);
  const videoDefectsMaxRef = useRef<number>(0);
  const hasCompletedRoadRef = useRef<boolean>(false);
  const hasCapturedStartStaRef = useRef<boolean>(false);
  const lastAiQuotaAlertAtRef = useRef<number>(0);
  const [lastCapturedPhoto, setLastCapturedPhoto] = useState<SurveyPhoto | null>(null);
  const [lastRecordedVideo, setLastRecordedVideo] = useState<SurveyVideo | null>(null);
  const [capturedCountThisSession, setCapturedCountThisSession] = useState<number>(0);

  const onAddVideoRef = useRef(onAddVideo);
  const onTriggerAlertRef = useRef(onTriggerAlert);
  const onSaveGpsTrackRef = useRef(onSaveGpsTrack);
  const isOnlineRef = useRef(isOnline);
  const videoFeatureEnabledRef = useRef(videoFeatureEnabled);
  const lastCapturedPhotoRef = useRef<SurveyPhoto | null>(null);
  const videoElapsedSecRef = useRef<number>(0);
  const activeRecordingRuasRef = useRef<RuasJalan | undefined>(currentRuas);

  useEffect(() => {
    onAddVideoRef.current = onAddVideo;
  }, [onAddVideo]);

  useEffect(() => {
    onTriggerAlertRef.current = onTriggerAlert;
  }, [onTriggerAlert]);

  useEffect(() => {
    onSaveGpsTrackRef.current = onSaveGpsTrack;
  }, [onSaveGpsTrack]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    videoFeatureEnabledRef.current = videoFeatureEnabled;
  }, [videoFeatureEnabled]);

  useEffect(() => {
    lastCapturedPhotoRef.current = lastCapturedPhoto;
  }, [lastCapturedPhoto]);

  useEffect(() => {
    videoElapsedSecRef.current = videoElapsedSec;
  }, [videoElapsedSec]);

  useEffect(() => {
    currentCoordRef.current = currentCoord;
  }, [currentCoord]);

  useEffect(() => {
    currentRuasRef.current = currentRuas;
  }, [currentRuas]);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
    if (cameraActive && videoRef.current && videoRef.current.paused) {
      void videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => {
    aiDetectionEnabledRef.current = aiDetectionEnabled;
    if (!aiDetectionEnabled) {
      detectedDefectsRef.current = [];
      setDetectedDefects([]);
      setAiLastSummary(null);
    }
  }, [aiDetectionEnabled]);

  useEffect(() => {
    autoCaptureEnabledRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  useEffect(() => {
    isSurveyPausedRef.current = isSurveyPaused;
  }, [isSurveyPaused]);

  useEffect(() => {
    onSurveyFocusModeChange?.(isSurveyRunning);
  }, [isSurveyRunning, onSurveyFocusModeChange]);

  useEffect(() => {
    if (isRecordingVideo) {
      videoDefectsMaxRef.current = Math.max(videoDefectsMaxRef.current, detectedDefects.length);
    }
  }, [detectedDefects, isRecordingVideo]);

  useEffect(() => {
    return () => {
      onSurveyFocusModeChange?.(false);
      if (currentRuasRef.current && gpsTrackRef.current.length > 0) {
        onSaveGpsTrackRef.current?.(currentRuasRef.current.id, gpsTrackRef.current, { silent: true });
      }
      if (isRecordingVideoRef.current) {
        void stopAndSaveVideoRecording(Math.round(staRef.current), activeRecordingRuasRef.current || currentRuasRef.current);
      } else if (recorderRef.current) {
        void recorderRef.current.stop(`video-cleanup-${Date.now()}`);
        recorderRef.current = null;
      }
    };
  }, []);

  // Audio beep generator using Web Audio API
  const playAlertSound = (isSevere: boolean) => {
    if (!audioAlertsEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = isSevere ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isSevere ? 880 : 587.33, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (isSevere ? 0.45 : 0.25));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (isSevere ? 0.5 : 0.3));
    } catch {
      // AudioContext muted or not allowed
    }
  };

  const recordGpsTrackPoint = (
    road: RuasJalan,
    pointData: Omit<GpsTrackPoint, 'id' | 'staText'>,
    options?: {
      flush?: boolean;
      customEndStaMeters?: number;
      applyGeometry?: boolean;
      silent?: boolean;
    }
  ) => {
    const safeSta = Math.max(0, Math.round(pointData.staMeters));
    const entry: GpsTrackPoint = {
      ...pointData,
      id: `trk-${road.id}-${safeSta}-${pointData.category}-${Date.now()}`,
      staMeters: safeSta,
      staText: formatSTA(safeSta),
    };

    const existing = [...gpsTrackRef.current];
    if (pointData.category === 'start') {
      const idx = existing.findIndex((p) => p.category === 'start');
      if (idx >= 0) existing[idx] = entry;
      else existing.unshift(entry);
    } else if (pointData.category === 'final_sta') {
      const idx = existing.findIndex((p) => p.category === 'final_sta');
      if (idx >= 0) existing[idx] = entry;
      else existing.push(entry);
    } else if (pointData.category === 'checkpoint_100m') {
      const idx = existing.findIndex(
        (p) => p.category === 'checkpoint_100m' && p.staMeters === safeSta
      );
      if (idx >= 0) existing[idx] = entry;
      else existing.push(entry);
    } else {
      existing.push(entry);
    }

    const sorted = existing.sort((a, b) => a.staMeters - b.staMeters);
    gpsTrackRef.current = sorted;
    setGpsTrackPoints(sorted);
    lastTrackedCoordRef.current = {
      lat: entry.lat,
      lng: entry.lng,
      staMeters: safeSta,
    };

    const shouldFlush =
      options?.flush ||
      pointData.category === 'start' ||
      pointData.category === 'checkpoint_100m' ||
      pointData.category === 'final_sta' ||
      sorted.length % 4 === 0;

    if (shouldFlush) {
      onSaveGpsTrackRef.current?.(road.id, sorted, {
        customEndStaMeters: options?.customEndStaMeters,
        applyGeometry: options?.applyGeometry,
        silent: options?.silent ?? true,
      });
    }
  };

  // Switch ruas reset (save active video recording & flush GPS track for previous road if running)
  useEffect(() => {
    if (
      isRecordingVideoRef.current &&
      activeRecordingRuasRef.current &&
      activeRecordingRuasRef.current.id !== selectedRuasId
    ) {
      void stopAndSaveVideoRecording(Math.round(staRef.current), activeRecordingRuasRef.current);
    }
    if (currentRuas) {
      const [initLat, initLng] = interpolateCoordAlongRuas(currentRuas, 0);
      staRef.current = 0;
      distAccumRef.current = 0;
      lastAutoCaptureStaRef.current = 0;
      lastTrack100StaRef.current = 0;
      lastTrackedCoordRef.current = null;
      prevGpsFixRef.current = null;
      vehicleSpeedRef.current = 0;
      hasCompletedRoadRef.current = false;
      hasCapturedStartStaRef.current = false;
      isSurveyPausedRef.current = false;
      setIsSurveyRunning(false);
      setIsSurveyPaused(false);
      setCurrentSta(0);
      setDistanceSinceLastCapture(0);
      setVehicleSpeedKmh(0);
      setCurrentCoord({
        lat: initLat,
        lng: initLng,
        altitude: 18.5,
        accuracy: 2.2,
      });
      lastCaptureCoordRef.current = {
        lat: initLat,
        lng: initLng,
      };
      const existingTrack = Array.isArray(currentRuas.gpsTrack) ? [...currentRuas.gpsTrack] : [];
      gpsTrackRef.current = existingTrack;
      setGpsTrackPoints(existingTrack);
      setCustomEndStaInput(String(Math.max(1, Math.round(currentRuas.panjangKm * 1000))));
    }
  }, [selectedRuasId]);

  useEffect(() => {
    if (currentRuas) {
      setCustomEndStaInput(String(Math.max(1, Math.round(currentRuas.panjangKm * 1000))));
    }
  }, [currentRuas?.panjangKm]);

  useEffect(() => {
    androidCameraSettingsRef.current = androidCameraSettings;
  }, [androidCameraSettings]);

  const refreshCameraDevices = async () => {
    const list = await listAndroidCameraDevices();
    setCameraDevices(list);
  };

  const stopPhysicalCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraCapabilities(EMPTY_HARDWARE_CAPABILITIES);
  };

  const startPhysicalCamera = async (overrideSettings?: AndroidCameraSettings): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraActive(false);
      setCameraError('Browser tidak mendukung akses kamera fisik. Menggunakan umpan simulasi.');
      return false;
    }

    const activeSettings = overrideSettings || androidCameraSettingsRef.current;
    setIsActivatingCamera(true);
    try {
      stopPhysicalCamera();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          buildAndroidGetUserMediaConstraints(activeSettings)
        );
      } catch (firstErr) {
        if (activeSettings.deviceId) {
          const fallbackSettings = { ...activeSettings, deviceId: '' };
          stream = await navigator.mediaDevices.getUserMedia(
            buildAndroidGetUserMediaConstraints(fallbackSettings)
          );
          setAndroidCameraSettings(fallbackSettings);
          saveAndroidCameraSettings(fallbackSettings);
        } else {
          throw firstErr;
        }
      }

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const appliedCaps = await applyAndroidCameraTrackSettings(stream, activeSettings);
      setCameraCapabilities(appliedCaps);
      void refreshCameraDevices();

      setCameraActive(true);
      setCameraError(null);
      setUseSimulationDriving(false);
      return true;
    } catch (err) {
      console.warn('Real camera not available or denied, falling back to realistic simulation feed:', err);
      setCameraActive(false);
      setCameraCapabilities(EMPTY_HARDWARE_CAPABILITIES);
      setCameraError('Kamera fisik tidak terdeteksi / izin ditolak. Menggunakan umpan simulasi jalan Mentawai.');
      return false;
    } finally {
      setIsActivatingCamera(false);
    }
  };

  const handleUpdateAndroidCameraSettings = async (
    next: AndroidCameraSettings,
    restartCamera = false
  ) => {
    setAndroidCameraSettings(next);
    androidCameraSettingsRef.current = next;
    saveAndroidCameraSettings(next);

    if (restartCamera) {
      if (cameraActiveRef.current || cameraStreamRef.current) {
        await startPhysicalCamera(next);
      }
      return;
    }

    if (cameraStreamRef.current) {
      const updatedCaps = await applyAndroidCameraTrackSettings(cameraStreamRef.current, next);
      setCameraCapabilities(updatedCaps);
    }
  };

  const handleToggleCameraSource = async () => {
    if (cameraActive) {
      stopPhysicalCamera();
      setUseSimulationDriving(true);
    } else {
      await startPhysicalCamera();
    }
  };

  // Jaga layar Android tetap menyala (Wake Lock) selama kamera/survei aktif agar GPS & perekaman tidak ter-throttle
  useEffect(() => {
    const shouldKeepAwake =
      androidCameraSettings.keepScreenAwake &&
      (cameraActive || isSurveyRunning || isRecordingVideo);
    if (!shouldKeepAwake) {
      setWakeLockActive(false);
      return;
    }

    const navWithWakeLock = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<{
          released: boolean;
          release: () => Promise<void>;
        }>;
      };
    };

    if (!navWithWakeLock.wakeLock) {
      setWakeLockActive(false);
      return;
    }

    let cancelled = false;
    let sentinel: { released: boolean; release: () => Promise<void> } | null = null;

    const acquireWakeLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navWithWakeLock.wakeLock!.request('screen');
        if (!cancelled) {
          setWakeLockActive(true);
        }
      } catch {
        if (!cancelled) {
          setWakeLockActive(false);
        }
      }
    };

    void acquireWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setWakeLockActive(false);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [androidCameraSettings.keepScreenAwake, cameraActive, isSurveyRunning, isRecordingVideo]);

  // Request actual camera stream on mount
  useEffect(() => {
    void startPhysicalCamera();
    void refreshCameraDevices();

    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  // Helper: Stop survey cleanly when road end (panjangKm * 1000 / custom STA Akhir) is reached, always capturing STA Akhir & GPS track
  const completeSurveyAtRoadEnd = (
    road: RuasJalan,
    totalMeters: number,
    overrideCoord?: { lat: number; lng: number; altitude?: number; accuracy?: number }
  ) => {
    if (hasCompletedRoadRef.current) return;
    hasCompletedRoadRef.current = true;

    const [fallbackLat, fallbackLng] = interpolateCoordAlongRuas(road, totalMeters);
    const endLat = overrideCoord
      ? overrideCoord.lat
      : !useSimulationDriving
        ? currentCoordRef.current.lat
        : fallbackLat;
    const endLng = overrideCoord
      ? overrideCoord.lng
      : !useSimulationDriving
        ? currentCoordRef.current.lng
        : fallbackLng;

    recordGpsTrackPoint(
      road,
      {
        staMeters: totalMeters,
        lat: endLat,
        lng: endLng,
        altitude: overrideCoord?.altitude ?? currentCoordRef.current.altitude,
        accuracy: overrideCoord?.accuracy ?? currentCoordRef.current.accuracy,
        speedKmh: vehicleSpeedRef.current,
        timestamp: new Date().toISOString(),
        category: 'final_sta',
        source: useSimulationDriving ? 'sim' : 'gps',
      },
      {
        flush: true,
        customEndStaMeters: totalMeters,
        applyGeometry: !useSimulationDriving,
        silent: false,
      }
    );

    if (autoCaptureEnabledRef.current && lastAutoCaptureStaRef.current < totalMeters) {
      lastAutoCaptureStaRef.current = totalMeters;
      void triggerPhotoCapture(endLat, endLng, totalMeters, true);
      lastCaptureCoordRef.current = { lat: endLat, lng: endLng };
    }

    staRef.current = totalMeters;
    distAccumRef.current = 0;
    vehicleSpeedRef.current = 0;
    setCurrentSta(totalMeters);
    setDistanceSinceLastCapture(0);
    setVehicleSpeedKmh(0);

    setCurrentCoord((prev) => ({
      ...prev,
      lat: endLat,
      lng: endLng,
    }));

    isSurveyPausedRef.current = false;
    setIsSurveyPaused(false);
    setIsSurveyRunning(false);

    if (isRecordingVideoRef.current) {
      void stopAndSaveVideoRecording(totalMeters);
    }

    playAlertSound(false);
    onTriggerAlert(
      'Survei Otomatis & Tracking GPS Selesai',
      `Survei pada ${road.namaRuas} mencapai STA Akhir (${formatSTA(totalMeters)} / ${(totalMeters / 1000).toFixed(3)} km). Jalur GPS (${gpsTrackRef.current.length} titik) tersimpan.`,
      road.id,
      formatSTA(totalMeters)
    );
  };

  // Real GPS tracking with stationary drift filtering, idle reset, 100m checkpoints, polyline breadcrumbs & end-of-road stop
  useEffect(() => {
    if (!useSimulationDriving && isSurveyRunning && navigator.geolocation && currentRuasRef.current) {
      let idleZeroTimer: ReturnType<typeof setTimeout> | null = null;

      const resetSpeedToZero = () => {
        vehicleSpeedRef.current = 0;
        setVehicleSpeedKmh(0);
      };

      const armIdleZeroTimer = () => {
        if (idleZeroTimer) clearTimeout(idleZeroTimer);
        idleZeroTimer = setTimeout(resetSpeedToZero, 3500);
      };

      resetSpeedToZero();

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const activeRoad = currentRuasRef.current;
          if (!activeRoad || hasCompletedRoadRef.current || isSurveyPausedRef.current) return;
          const totalRoadMeters = Math.max(1, Math.round(activeRoad.panjangKm * 1000));

          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          const alt = pos.coords.altitude || 20.0;
          const acc =
            typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : 15.0;
          const nowMs = pos.timestamp || Date.now();
          const nowIso = new Date(nowMs).toISOString();
          const rawHardwareSpeedMs =
            typeof pos.coords.speed === 'number' &&
            Number.isFinite(pos.coords.speed) &&
            pos.coords.speed >= 0
              ? pos.coords.speed
              : null;

          setCurrentCoord({
            lat: newLat,
            lng: newLng,
            altitude: alt,
            accuracy: acc,
          });

          if (!prevGpsFixRef.current) {
            prevGpsFixRef.current = { lat: newLat, lng: newLng, timeMs: nowMs };
            const initialSpeedKmh =
              rawHardwareSpeedMs !== null && rawHardwareSpeedMs >= 0.8 && acc <= 25
                ? Math.min(120, Math.round(rawHardwareSpeedMs * 3.6))
                : 0;
            vehicleSpeedRef.current = initialSpeedKmh;
            setVehicleSpeedKmh(initialSpeedKmh);
            if (staRef.current === 0) {
              recordGpsTrackPoint(activeRoad, {
                staMeters: 0,
                lat: newLat,
                lng: newLng,
                altitude: alt,
                accuracy: acc,
                speedKmh: initialSpeedKmh,
                timestamp: nowIso,
                category: 'start',
                source: 'gps',
              });
            }
            armIdleZeroTimer();
            return;
          }

          const stepDist = calculateDistanceMeters(
            prevGpsFixRef.current.lat,
            prevGpsFixRef.current.lng,
            newLat,
            newLng
          );
          const dtSec = Math.max(0.25, (nowMs - prevGpsFixRef.current.timeMs) / 1000);
          const minEffectiveDist = Math.max(2.5, Math.min(12, acc * 0.4));
          const isAccuracyTooPoor = acc > 65;

          let autoSpeedKmh = 0;
          if (!isAccuracyTooPoor) {
            if (rawHardwareSpeedMs !== null) {
              // Saring noise sensor GPS saat diam (< 0.7 m/s ≈ 2.5 km/jam)
              if (rawHardwareSpeedMs >= 0.7 && (stepDist >= 0.5 || rawHardwareSpeedMs >= 1.4)) {
                autoSpeedKmh = Math.min(120, Math.round(rawHardwareSpeedMs * 3.6));
              }
            } else if (stepDist >= minEffectiveDist && stepDist < 300) {
              const computedKmh = (stepDist / dtSec) * 3.6;
              if (computedKmh >= 2.0 && computedKmh <= 120) {
                autoSpeedKmh = Math.round(computedKmh);
              }
            }
          }

          vehicleSpeedRef.current = autoSpeedKmh;
          setVehicleSpeedKmh(autoSpeedKmh);
          armIdleZeroTimer();

          const hasConfirmedMove =
            !isAccuracyTooPoor &&
            stepDist < 300 &&
            (stepDist >= minEffectiveDist || (autoSpeedKmh > 0 && stepDist >= 1.5));

          if (hasConfirmedMove) {
            prevGpsFixRef.current = { lat: newLat, lng: newLng, timeMs: nowMs };
            const clampedNextSta = Math.min(totalRoadMeters, staRef.current + stepDist);
            const actualMoved = Math.max(0, clampedNextSta - staRef.current);
            staRef.current = clampedNextSta;
            distAccumRef.current += actualMoved;
            setCurrentSta(Math.round(clampedNextSta));
            setDistanceSinceLastCapture(distAccumRef.current);

            // Rekam breadcrumb rute GPS nyata setiap perpindahan >= 8m agar jalur akurat mengikuti belokan jalan
            const lastTrk = lastTrackedCoordRef.current;
            const movedSinceLastTrack = lastTrk
              ? calculateDistanceMeters(lastTrk.lat, lastTrk.lng, newLat, newLng)
              : 999;
            if (movedSinceLastTrack >= 8 && clampedNextSta < totalRoadMeters) {
              recordGpsTrackPoint(activeRoad, {
                staMeters: Math.round(clampedNextSta),
                lat: newLat,
                lng: newLng,
                altitude: alt,
                accuracy: acc,
                speedKmh: autoSpeedKmh,
                timestamp: nowIso,
                category: 'breadcrumb',
                source: 'gps',
              });
            }

            // Selalu rekam titik GPS Tracker per 100m meskipun toggle Fitur Foto dimatikan
            while (lastTrack100StaRef.current + 100 <= clampedNextSta && lastTrack100StaRef.current + 100 < totalRoadMeters) {
              const targetTrackSta = lastTrack100StaRef.current + 100;
              lastTrack100StaRef.current = targetTrackSta;
              recordGpsTrackPoint(activeRoad, {
                staMeters: targetTrackSta,
                lat: newLat,
                lng: newLng,
                altitude: alt,
                accuracy: acc,
                speedKmh: autoSpeedKmh,
                timestamp: nowIso,
                category: 'checkpoint_100m',
                source: 'gps',
              });
            }

            while (autoCaptureEnabledRef.current && lastAutoCaptureStaRef.current + 100 <= clampedNextSta) {
              const targetSta = lastAutoCaptureStaRef.current + 100;
              lastAutoCaptureStaRef.current = targetSta;
              void triggerPhotoCapture(newLat, newLng, targetSta, true);
              lastCaptureCoordRef.current = { lat: newLat, lng: newLng };
              distAccumRef.current = Math.max(0, clampedNextSta - targetSta);
              setDistanceSinceLastCapture(distAccumRef.current);
            }

            if (clampedNextSta >= totalRoadMeters) {
              completeSurveyAtRoadEnd(activeRoad, totalRoadMeters, {
                lat: newLat,
                lng: newLng,
                altitude: alt,
                accuracy: acc,
              });
            }
          } else if (dtSec >= 4) {
            // Segarkan timestamp tanpa menggeser anchor koordinat saat diam agar drift GPS tidak terakumulasi
            prevGpsFixRef.current = { ...prevGpsFixRef.current, timeMs: nowMs };
          }
        },
        (err) => {
          console.warn('GPS watch error:', err);
          resetSpeedToZero();
        },
        { enableHighAccuracy: true, maximumAge: 1000 }
      );

      return () => {
        if (idleZeroTimer) clearTimeout(idleZeroTimer);
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [useSimulationDriving, isSurveyRunning, selectedRuasId]);

  // Sinkronkan ref mode simulasi
  useEffect(() => {
    simulationModeRef.current = simulationMode;
  }, [simulationMode]);

  // Reset kecepatan otomatis ke 0 saat survei berhenti atau berpindah ke mode GPS Nyata
  useEffect(() => {
    if (!isSurveyRunning || !useSimulationDriving) {
      vehicleSpeedRef.current = 0;
      setVehicleSpeedKmh(0);
      prevGpsFixRef.current = null;
    }
  }, [isSurveyRunning, useSimulationDriving]);

  // Simulation drive loop (kecepatan dihitung otomatis berdasarkan moda transportasi, kondisi ruas, permukaan & jarak/waktu)
  useEffect(() => {
    if (!isSurveyRunning || !useSimulationDriving || !currentRuasRef.current) return;

    const intervalTime = batterySaver ? 1500 : 1000;
    let lastTickMs = performance.now();

    const interval = setInterval(() => {
      const nowMs = performance.now();
      const dtSec = Math.max(0.2, Math.min(2.5, (nowMs - lastTickMs) / 1000));
      lastTickMs = nowMs;

      const activeRoad = currentRuasRef.current;
      if (!activeRoad || hasCompletedRoadRef.current || isSurveyPausedRef.current) return;

      const hasSevere = detectedDefectsRef.current.some((d) => d.severity === 'Berat');
      const activeStaInfo = getSurfaceAndConditionAtSTA(activeRoad, staRef.current);
      const isUnpaved =
        activeStaInfo.tipePermukaan.includes('Tanah') ||
        activeStaInfo.tipePermukaan.includes('Kerikil');

      let baseSpeedKmh = 36;
      let effectiveSpeedKmh = 36;

      if (simulationMode === 'walking') {
        // Kecepatan survei jalan kaki (km/jam)
        if (activeStaInfo.kondisiJalan === 'Baik') baseSpeedKmh = 5.5;
        else if (activeStaInfo.kondisiJalan === 'Sedang') baseSpeedKmh = 5.0;
        else if (activeStaInfo.kondisiJalan === 'Rusak Ringan') baseSpeedKmh = 4.2;
        else if (activeStaInfo.kondisiJalan === 'Rusak Berat') baseSpeedKmh = 3.5;
        else baseSpeedKmh = 4.8;

        if (isUnpaved) {
          baseSpeedKmh = Math.min(baseSpeedKmh, 4.0);
        }

        const jitter = Math.sin(Date.now() / 1800) * 0.5;
        effectiveSpeedKmh = Math.max(2.5, baseSpeedKmh - (hasSevere ? 0.8 : 0) + jitter);
      } else if (simulationMode === 'motorcycle') {
        // Kecepatan survei sepeda motor (lebih lincah di jalan sempit/kerikil)
        if (activeStaInfo.kondisiJalan === 'Baik') baseSpeedKmh = 38;
        else if (activeStaInfo.kondisiJalan === 'Sedang') baseSpeedKmh = 30;
        else if (activeStaInfo.kondisiJalan === 'Rusak Ringan') baseSpeedKmh = 22;
        else if (activeStaInfo.kondisiJalan === 'Rusak Berat') baseSpeedKmh = 16;

        if (isUnpaved) {
          baseSpeedKmh = Math.min(baseSpeedKmh, 22);
        }

        const jitter = Math.sin(Date.now() / 2000) * 2.5;
        effectiveSpeedKmh = Math.max(10, baseSpeedKmh - (hasSevere ? 4 : 0) + jitter);
      } else {
        // Kecepatan survei mobil
        if (activeStaInfo.kondisiJalan === 'Baik') baseSpeedKmh = 44;
        else if (activeStaInfo.kondisiJalan === 'Sedang') baseSpeedKmh = 34;
        else if (activeStaInfo.kondisiJalan === 'Rusak Ringan') baseSpeedKmh = 25;
        else if (activeStaInfo.kondisiJalan === 'Rusak Berat') baseSpeedKmh = 18;

        if (isUnpaved) {
          baseSpeedKmh = Math.min(baseSpeedKmh, 20);
        }

        const jitter = Math.sin(Date.now() / 2200) * 3;
        effectiveSpeedKmh = Math.max(12, baseSpeedKmh - (hasSevere ? 6 : 0) + jitter);
      }

      const totalRoadMeters = Math.max(1, Math.round(activeRoad.panjangKm * 1000));
      if (staRef.current >= totalRoadMeters) {
        completeSurveyAtRoadEnd(activeRoad, totalRoadMeters);
        return;
      }

      const metersPerSec = (effectiveSpeedKmh * 1000) / 3600;
      const metersMoved = metersPerSec * dtSec;

      // Hitung kecepatan otomatis dari jarak riil yang ditempuh per selang waktu
      const rawSpeedKmh = (metersMoved / dtSec) * 3.6;
      const computedAutoSpeed =
        simulationMode === 'walking'
          ? Math.round(rawSpeedKmh * 10) / 10
          : Math.round(rawSpeedKmh);
      vehicleSpeedRef.current = computedAutoSpeed;
      setVehicleSpeedKmh(computedAutoSpeed);

      const nextSta = Math.min(totalRoadMeters, staRef.current + metersMoved);
      const actualMoved = Math.max(0, nextSta - staRef.current);
      staRef.current = nextSta;
      setCurrentSta(Math.round(nextSta));

      // Hitung koordinat otomatis berdasarkan koordinat awal & jarak tempuh pada rute ruas jalan di peta
      const [nextLat, nextLng] = interpolateCoordAlongRuas(activeRoad, nextSta);

      setCurrentCoord((prev) => ({
        ...prev,
        lat: nextLat,
        lng: nextLng,
      }));

      // Rekam jalur breadcrumb GPS Tracker per ~50m & checkpoint tepat per 100m (independen dari toggle foto)
      const simLastSta = lastTrackedCoordRef.current?.staMeters ?? 0;
      if (nextSta - simLastSta >= 50 && nextSta < totalRoadMeters) {
        recordGpsTrackPoint(activeRoad, {
          staMeters: Math.round(nextSta),
          lat: nextLat,
          lng: nextLng,
          altitude: currentCoordRef.current.altitude,
          accuracy: currentCoordRef.current.accuracy,
          speedKmh: computedAutoSpeed,
          timestamp: new Date().toISOString(),
          category: 'breadcrumb',
          source: 'sim',
        });
      }

      while (lastTrack100StaRef.current + 100 <= nextSta && lastTrack100StaRef.current + 100 < totalRoadMeters) {
        const targetTrackSta = lastTrack100StaRef.current + 100;
        lastTrack100StaRef.current = targetTrackSta;
        const [trkLat, trkLng] = interpolateCoordAlongRuas(activeRoad, targetTrackSta);
        recordGpsTrackPoint(activeRoad, {
          staMeters: targetTrackSta,
          lat: trkLat,
          lng: trkLng,
          altitude: currentCoordRef.current.altitude,
          accuracy: currentCoordRef.current.accuracy,
          speedKmh: computedAutoSpeed,
          timestamp: new Date().toISOString(),
          category: 'checkpoint_100m',
          source: 'sim',
        });
      }

      distAccumRef.current += actualMoved;
      setDistanceSinceLastCapture(distAccumRef.current);
      while (autoCaptureEnabledRef.current && lastAutoCaptureStaRef.current + 100 <= nextSta) {
        const targetSta = lastAutoCaptureStaRef.current + 100;
        lastAutoCaptureStaRef.current = targetSta;
        const [capLat, capLng] = interpolateCoordAlongRuas(activeRoad, targetSta);
        void triggerPhotoCapture(capLat, capLng, targetSta, true);
        lastCaptureCoordRef.current = { lat: capLat, lng: capLng };
        distAccumRef.current = Math.max(0, nextSta - targetSta);
        setDistanceSinceLastCapture(distAccumRef.current);
      }

      if (nextSta >= totalRoadMeters) {
        completeSurveyAtRoadEnd(activeRoad, totalRoadMeters);
        return;
      }

      // AI defect random simulator on driving road (only when Deteksi AI is active)
      if (!aiDetectionEnabledRef.current) {
        detectedDefectsRef.current = [];
        setDetectedDefects([]);
        return;
      }

      const dice = Math.random();
      if (dice > 0.82) {
        const newDefect: DefectItem = {
          id: `ai-defect-${Date.now()}`,
          type: 'Lubang (Pothole)',
          severity: 'Berat',
          confidence: 0.94,
          dimensions: { lengthCm: 26, widthCm: 22, depthCm: 5.8 },
          boundingBox: { x: 38, y: 55, width: 24, height: 18 },
        };
        detectedDefectsRef.current = [newDefect];
        setDetectedDefects([newDefect]);
        playAlertSound(true);
        onTriggerAlert(
          'Deteksi Cacat Kritis: Lubang Berat',
          `Lubang terdeteksi pada ${activeRoad.namaRuas} (${formatSTA(Math.round(nextSta))}). Diameter 26cm, kedalaman 5.8cm.`,
          activeRoad.id,
          formatSTA(Math.round(nextSta))
        );
      } else if (dice > 0.65) {
        const newDefect: DefectItem = {
          id: `ai-defect-${Date.now()}`,
          type: 'Retak Buaya (Alligator Cracking)',
          severity: 'Sedang',
          confidence: 0.89,
          dimensions: { crackWidthMm: 2.2, areaSqM: 2.4 },
          boundingBox: { x: 32, y: 50, width: 36, height: 22 },
        };
        detectedDefectsRef.current = [newDefect];
        setDetectedDefects([newDefect]);
        playAlertSound(false);
      } else if (dice > 0.45) {
        const newDefect: DefectItem = {
          id: `ai-defect-${Date.now()}`,
          type: 'Retak Tepi (Edge Crack)',
          severity: 'Ringan',
          confidence: 0.86,
          dimensions: { crackWidthMm: 1.0 },
          boundingBox: { x: 68, y: 58, width: 20, height: 16 },
        };
        detectedDefectsRef.current = [newDefect];
        setDetectedDefects([newDefect]);
      } else {
        detectedDefectsRef.current = [];
        setDetectedDefects([]);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [
    isSurveyRunning,
    useSimulationDriving,
    simulationMode,
    selectedRuasId,
    batterySaver
  ]);

  // Video recording timer (berhenti menghitung saat survei di-pause)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRecordingVideo && !isSurveyPaused) {
      timer = setInterval(() => {
        setVideoElapsedSec((s) => s + 1);
      }, 1000);
    } else if (!isRecordingVideo) {
      setVideoElapsedSec(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecordingVideo, isSurveyPaused]);

  // Real-time Live Frame AI Scan (triggered manually or periodically during active physical camera survey)
  const runLiveAiFrameScan = async (options?: { silent?: boolean }) => {
    const activeRuas = currentRuasRef.current;
    if (!activeRuas || !aiDetectionEnabledRef.current || isScanningLiveAIRef.current) return;

    isScanningLiveAIRef.current = true;
    setIsScanningLiveAI(true);
    try {
      const scanCanvas = document.createElement('canvas');
      scanCanvas.width = 960;
      scanCanvas.height = 540;
      const scanCtx = scanCanvas.getContext('2d');
      if (!scanCtx) return;

      const usingRealCam =
        cameraActiveRef.current && videoRef.current && videoRef.current.readyState >= 2;

      const rawBitmap = isRecordingVideoRef.current
        ? await recorderRef.current?.grabCleanRawBitmap()
        : null;

      if (rawBitmap) {
        drawImageCover3R(scanCtx, rawBitmap, 960, 540);
        rawBitmap.close();
      } else if (usingRealCam && videoRef.current) {
        drawImageCover3R(scanCtx, videoRef.current, 960, 540);
      } else {
        drawSimulatedRoadFrame(scanCtx, 960, 540, detectedDefectsRef.current);
      }

      const frameDataUrl = await new Promise<string>((resolve) => {
        if (typeof scanCanvas.toBlob === 'function') {
          scanCanvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(scanCanvas.toDataURL('image/jpeg', 0.85));
                return;
              }
              const reader = new FileReader();
              reader.onloadend = () =>
                resolve(
                  typeof reader.result === 'string'
                    ? reader.result
                    : scanCanvas.toDataURL('image/jpeg', 0.85)
                );
              reader.onerror = () => resolve(scanCanvas.toDataURL('image/jpeg', 0.85));
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            0.85
          );
        } else {
          resolve(scanCanvas.toDataURL('image/jpeg', 0.85));
        }
      });
      scanCanvas.width = 0;
      scanCanvas.height = 0;

      const staNow = Math.round(staRef.current);
      const surfaceHint = getSurfaceAndConditionAtSTA(activeRuas, staNow).tipePermukaan;

      const applyLocalPkrmsEvaluation = () => {
        const staInfo = getSurfaceAndConditionAtSTA(activeRuas, staNow);
        if (staInfo.kondisiJalan === 'Rusak Berat' || staInfo.kondisiJalan === 'Rusak Ringan') {
          const offlineDefect: DefectItem = {
            id: `ai-offline-${Date.now()}`,
            type:
              staInfo.kondisiJalan === 'Rusak Berat'
                ? 'Lubang (Pothole)'
                : 'Retak Buaya (Alligator Cracking)',
            severity: staInfo.kondisiJalan === 'Rusak Berat' ? 'Berat' : 'Sedang',
            confidence: 0.85,
          };
          detectedDefectsRef.current = [offlineDefect];
          setDetectedDefects([offlineDefect]);
          playAlertSound(staInfo.kondisiJalan === 'Rusak Berat');
          setAiLastSummary(`PKRMS Lokal: ${staInfo.kondisiJalan} (${staInfo.tipePermukaan})`);
        } else {
          detectedDefectsRef.current = [];
          setDetectedDefects([]);
          setAiLastSummary(`PKRMS Lokal: ${staInfo.kondisiJalan} (${staInfo.tipePermukaan})`);
        }
      };

      if (isOnline) {
        try {
          const result = await analyzeRoadDamageFromPhoto(frameDataUrl, surfaceHint, {
            isBackground: Boolean(options?.silent),
          });
          if (!aiDetectionEnabledRef.current) return;
          detectedDefectsRef.current = result.defects;
          setDetectedDefects(result.defects);
          setAiLastSummary(`${result.condition}: ${result.summary}`);

          if (result.condition === 'Rusak Berat' || result.condition === 'Rusak Ringan') {
            playAlertSound(result.condition === 'Rusak Berat');
            if (!options?.silent || result.condition === 'Rusak Berat') {
              onTriggerAlert(
                `Deteksi AI Live: ${result.condition}`,
                `${activeRuas.namaRuas} (${formatSTA(staNow)}): ${result.summary}`,
                activeRuas.id,
                formatSTA(staNow)
              );
            }
          }
        } catch (aiErr) {
          const errCode = (aiErr as { code?: string })?.code;
          if (errCode === 'OFFLINE_APK_NO_SERVER' || options?.silent) {
            applyLocalPkrmsEvaluation();
          } else {
            throw aiErr;
          }
        }
      } else {
        applyLocalPkrmsEvaluation();
      }
    } catch (err) {
      if (!options?.silent) {
        setAiLastSummary(err instanceof Error ? err.message : 'Pemindaian AI gagal.');
      }
    } finally {
      isScanningLiveAIRef.current = false;
      setIsScanningLiveAI(false);
    }
  };

  // Photo Capture Function (Zero-Pause: diproses di Web Worker agar perekaman video tidak terjeda)
  const triggerPhotoCapture = async (
    lat: number,
    lng: number,
    staVal: number,
    isAuto: boolean
  ) => {
    const activeRuas = currentRuasRef.current || currentRuas;
    if (!activeRuas) return;
    const photoId = `photo-${Date.now()}-${Math.round(staVal)}-${Math.random().toString(36).slice(2, 6)}`;
    const activeDefects = detectedDefectsRef.current;
    const activeSpeed = vehicleSpeedRef.current;
    const staText = formatSTA(staVal);
    const watermarkMeta = {
      nomorRuas: activeRuas.nomorRuas,
      namaRuas: activeRuas.namaRuas,
      staText,
      lat,
      lng,
    };

    const isUsingCamera = Boolean(
      videoRef.current && cameraActiveRef.current && videoRef.current.readyState >= 2
    );
    const isVideoRecordingNow = isRecordingVideoRef.current;

    let hd600DpiDataUrl = '';
    let dataUrl = '';

    if (isUsingCamera && videoRef.current) {
      let workerResult: { hd600DpiDataUrl: string; storageDataUrl: string } | null = null;
      let fallbackSource: HTMLVideoElement | HTMLImageElement | ImageBitmap = videoRef.current;
      let cleanupFallback: () => void = () => {};

      if (isVideoRecordingNow) {
        // Saat video sedang direkam: JANGAN memanggil ImageCapture.takePhoto() maupun menyentuh <video>
        // agar pipeline kamera Android tidak terjeda. Salin frame bersih langsung dari rawCanvas perekam.
        let frameBitmap: ImageBitmap | null = await (recorderRef.current?.grabCleanRawBitmap() ??
          Promise.resolve(null));

        if (!frameBitmap && typeof createImageBitmap === 'function') {
          try {
            frameBitmap = await createImageBitmap(videoRef.current);
          } catch {
            frameBitmap = null;
          }
        }

        if (frameBitmap) {
          workerResult = await runPhotoEncodeInWorker({
            id: photoId,
            bitmap: frameBitmap,
            watermark: watermarkMeta,
          });
          if (!workerResult) {
            // Re-grab or draw simulated if bitmap was transferred/neutered
            const retryBitmap = await (recorderRef.current?.grabCleanRawBitmap() ??
              Promise.resolve(null));
            if (retryBitmap) {
              fallbackSource = retryBitmap;
              cleanupFallback = () => {
                try {
                  retryBitmap.close();
                } catch {
                  // ignore
                }
              };
            }
          }
        }
      } else {
        // Saat tidak sedang merekam video: boleh gunakan sensor penuh ImageCapture HD bila tersedia
        const capturedFrame = await captureHighResStillSource(
          cameraStreamRef.current,
          videoRef.current,
          androidCameraSettingsRef.current.hdPhotoCapture
        );

        if (typeof ImageBitmap !== 'undefined' && capturedFrame.source instanceof ImageBitmap) {
          workerResult = await runPhotoEncodeInWorker({
            id: photoId,
            bitmap: capturedFrame.source,
            watermark: watermarkMeta,
          });
          if (!workerResult) {
            capturedFrame.cleanup();
          }
        } else {
          fallbackSource = capturedFrame.source;
          cleanupFallback = capturedFrame.cleanup;
        }
      }

      if (workerResult) {
        hd600DpiDataUrl = workerResult.hd600DpiDataUrl;
        dataUrl = workerResult.storageDataUrl;
      } else {
        try {
          const fallbackEncoded = await encodePhotoAsyncFallback({
            source: fallbackSource,
            drawFallbackSim: (ctx, w, h) => drawSimulatedRoadFrame(ctx, w, h, activeDefects),
            watermark: watermarkMeta,
            compactFallback: isVideoRecordingNow,
          });
          hd600DpiDataUrl = fallbackEncoded.hd600DpiDataUrl;
          dataUrl = fallbackEncoded.storageDataUrl;
        } finally {
          cleanupFallback();
        }
      }
    } else {
      const workerResult = await runPhotoEncodeInWorker({
        id: photoId,
        useSimulation: true,
        defects: activeDefects,
        watermark: watermarkMeta,
      });

      if (workerResult) {
        hd600DpiDataUrl = workerResult.hd600DpiDataUrl;
        dataUrl = workerResult.storageDataUrl;
      } else {
        const fallbackEncoded = await encodePhotoAsyncFallback({
          source: null,
          drawFallbackSim: (ctx, w, h) => drawSimulatedRoadFrame(ctx, w, h, activeDefects),
          watermark: watermarkMeta,
          compactFallback: isRecordingVideoRef.current,
        });
        hd600DpiDataUrl = fallbackEncoded.hd600DpiDataUrl;
        dataUrl = fallbackEncoded.storageDataUrl;
      }
    }

    if (!dataUrl) return;
    if (hd600DpiDataUrl) {
      cacheHd600DpiPhoto(photoId, hd600DpiDataUrl);
    }

    // Evaluate PKRMS condition for this capture
    const pkrms = evaluatePKRMSCondition(activeDefects);

    // Cryptographic hash for verification
    const timestampIso = new Date().toISOString();
    const hashData = `${activeRuas.nomorRuas}-${staText}-${lat}-${lng}-${timestampIso}-${pkrms.condition}`;
    const hashSha256 = await generateSHA256(hashData);

    const modeLabel = !useSimulationDriving
      ? 'Kamera Survei GPS DPUPR Mentawai'
      : simulationModeRef.current === 'walking'
        ? 'Kamera Survei Jalan Kaki DPUPR Mentawai'
        : simulationModeRef.current === 'motorcycle'
          ? 'Kamera Sepeda Motor Survei DPUPR Mentawai'
          : 'Kamera Mobil Survei DPUPR Mentawai';

    const newPhoto: SurveyPhoto = {
      id: photoId,
      ruasId: activeRuas.id,
      ruasNama: activeRuas.namaRuas,
      nomorRuas: activeRuas.nomorRuas,
      sta: staVal,
      staText,
      coordinates: {
        lat,
        lng,
        altitude: currentCoordRef.current.altitude,
        accuracy: currentCoordRef.current.accuracy,
      },
      timestamp: timestampIso,
      capturedBy: modeLabel,
      imageUrl: dataUrl,
      defects: [...activeDefects],
      surfaceType: getSurfaceAndConditionAtSTA(activeRuas, staVal).tipePermukaan,
      pkrmsCondition: pkrms.condition,
      recommendation: pkrms.recommendation,
      speedKmh: activeSpeed,
      syncStatus: isOnlineRef.current ? 'synced' : 'pending',
      hashSha256,
      isAutoCapture: isAuto,
    };

    onAddPhoto(newPhoto);
    setLastCapturedPhoto(newPhoto);
    setCapturedCountThisSession((c) => c + 1);

    // Jika kamera fisik aktif, Deteksi AI aktif & perangkat online, analisis otomatis tingkat kerusakan dari foto asli
    if (cameraActive && aiDetectionEnabledRef.current && isOnline && onUpdatePhoto) {
      void analyzeRoadDamageFromPhoto(dataUrl, newPhoto.surfaceType, { isBackground: true })
        .then((result) => {
          const updatedPhoto: SurveyPhoto = {
            ...newPhoto,
            defects: result.defects,
            surfaceType: result.detectedSurfaceType,
            pkrmsCondition: result.condition,
            recommendation: result.recommendation,
          };
          onUpdatePhoto(updatedPhoto);
          setLastCapturedPhoto((prev) => (prev?.id === updatedPhoto.id ? updatedPhoto : prev));
          if (result.condition === 'Rusak Berat' || result.condition === 'Rusak Ringan') {
            playAlertSound(result.condition === 'Rusak Berat');
            onTriggerAlert(
              `Deteksi AI Kamera: ${result.condition}`,
              `${activeRuas.namaRuas} (${newPhoto.staText}): ${result.summary}`,
              activeRuas.id,
              newPhoto.staText
            );
          }
        })
        .catch((err) => {
          const errObj = err as Error & { status?: number; code?: string };
          if (errObj?.code === 'OFFLINE_APK_NO_SERVER') {
            return;
          }
          const msg =
            errObj instanceof Error
              ? errObj.message
              : 'Analisis AI foto kamera tidak dapat diselesaikan.';
          const isQuotaErr = errObj?.status === 429 || errObj?.code === 'QUOTA_EXHAUSTED';
          if (isQuotaErr) {
            setAiLastSummary('Kuota Gemini API habis — foto tetap tersimpan, analisis AI dapat diulang nanti.');
            const now = Date.now();
            if (now - lastAiQuotaAlertAtRef.current < 120_000) {
              return;
            }
            lastAiQuotaAlertAtRef.current = now;
          }
          onTriggerAlert(
            isQuotaErr ? 'Kuota AI Sementara Tercapai' : 'Analisis AI Foto Tertunda',
            `${activeRuas.namaRuas} (${newPhoto.staText}): ${msg}`,
            activeRuas.id,
            newPhoto.staText
          );
        });
    }
  };

  const captureCurrentVideoThumbnail = (road: RuasJalan, staVal: number): string => {
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 960;
      snapCanvas.height = 540;
      const snapCtx = snapCanvas.getContext('2d');
      if (snapCtx) {
        if (cameraActiveRef.current && videoRef.current && videoRef.current.readyState >= 2) {
          drawImageCover3R(snapCtx, videoRef.current, 960, 540);
        } else {
          drawSimulatedRoadFrame(snapCtx, 960, 540, detectedDefectsRef.current);
        }
        drawWatermark(snapCtx, 960, 540, {
          nomorRuas: road.nomorRuas,
          namaRuas: road.namaRuas,
          staText: formatSTA(staVal),
          lat: currentCoordRef.current.lat,
          lng: currentCoordRef.current.lng,
        });
        const thumb = createCompactVideoThumbnail(snapCanvas);
        snapCanvas.width = 0;
        snapCanvas.height = 0;
        return thumb;
      }
    } catch {
      // ignore thumbnail capture error
    }
    return '';
  };

  const stopAndSaveVideoRecording = async (forcedEndSta?: number, overrideRuas?: RuasJalan) => {
    const activeRuas = overrideRuas || activeRecordingRuasRef.current || currentRuasRef.current;
    if (!activeRuas || !isRecordingVideoRef.current) return;

    isRecordingVideoRef.current = false;
    activeRecordingRuasRef.current = undefined;
    setIsRecordingVideo(false);

    const videoId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startSta = videoStartStaRef.current;
    const rawEnd = typeof forcedEndSta === 'number' ? forcedEndSta : Math.round(staRef.current);
    const endSta = Math.max(startSta, rawEnd);
    const activePauseNowMs = videoPauseStartedAtMsRef.current
      ? Math.max(0, Date.now() - videoPauseStartedAtMsRef.current)
      : 0;
    const totalPausedMs = videoPausedTotalMsRef.current + activePauseNowMs;
    videoPausedTotalMsRef.current = 0;
    videoPauseStartedAtMsRef.current = 0;
    const elapsedSec = videoStartTimeMsRef.current
      ? Math.round(Math.max(0, Date.now() - videoStartTimeMsRef.current - totalPausedMs) / 1000)
      : videoElapsedSecRef.current;
    const durationSec = Math.max(2, elapsedSec);
    const timestampIso = new Date().toISOString();

    let hashSha256 = `sha256-${Date.now()}`;
    try {
      hashSha256 = await generateSHA256(`video-${activeRuas.id}-${endSta}-${timestampIso}`);
    } catch {
      // keep fallback hash
    }

    let recordedEntry = null;
    let capturedThumb = '';

    if (recorderRef.current) {
      try {
        const res = await recorderRef.current.stop(videoId);
        recordedEntry = res.entry;
        if (res.thumbnailUrl) {
          capturedThumb = res.thumbnailUrl;
        }
      } catch (err) {
        console.warn('Recorder stop error, falling back:', err);
      } finally {
        recorderRef.current = null;
      }
    }

    if (!recordedEntry) {
      try {
        recordedEntry = await generateFallbackRoadVideoEntry({
          id: videoId,
          nomorRuas: activeRuas.nomorRuas,
          ruasNama: activeRuas.namaRuas,
          startSta,
          endSta,
          thumbnailUrl: capturedThumb,
        });
      } catch (err) {
        console.warn('Fallback video entry generation error:', err);
      }
    }

    if (!capturedThumb) {
      capturedThumb = captureCurrentVideoThumbnail(activeRuas, startSta);
      if (!capturedThumb && lastCapturedPhotoRef.current?.ruasId === activeRuas.id) {
        capturedThumb = lastCapturedPhotoRef.current.imageUrl;
      }
    }

    const newVideo: SurveyVideo = {
      id: videoId,
      ruasId: activeRuas.id,
      ruasNama: activeRuas.namaRuas,
      nomorRuas: activeRuas.nomorRuas,
      startSta,
      endSta,
      timestamp: timestampIso,
      durationSeconds: durationSec,
      videoUrl: recordedEntry ? recordedEntry.blobUrl : '',
      fileSizeBytes: recordedEntry ? recordedEntry.blob.size : Math.round(durationSec * 250000),
      defectsCount: videoDefectsMaxRef.current,
      syncStatus: isOnlineRef.current ? 'synced' : 'pending',
      hashSha256,
      thumbnailUrl: capturedThumb,
    };

    onAddVideoRef.current(newVideo);
    setLastRecordedVideo(newVideo);
    onTriggerAlertRef.current(
      'Rekaman Video Survei Disimpan',
      `Video survei ruas ${activeRuas.namaRuas} (${newVideo.durationSeconds} detik) berhasil disimpan ke arsip dan siap diputar/diunduh.`,
      activeRuas.id,
      formatSTA(endSta)
    );
  };

  const startVideoRecording = (initialSta?: number) => {
    const activeRuas = currentRuasRef.current;
    if (!activeRuas || isRecordingVideoRef.current) return;

    const startStaVal = typeof initialSta === 'number' ? initialSta : Math.round(staRef.current);
    videoStartStaRef.current = startStaVal;
    videoStartTimeMsRef.current = Date.now();
    videoPausedTotalMsRef.current = 0;
    videoPauseStartedAtMsRef.current = 0;
    videoDefectsMaxRef.current = detectedDefectsRef.current.length;
    activeRecordingRuasRef.current = activeRuas;

    const activeCamSettings = androidCameraSettingsRef.current;
    const isCompactAndroid =
      typeof navigator !== 'undefined' &&
      (/Android/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && window.innerWidth <= 480));
    const recDims =
      activeCamSettings.resolution === '540p' ||
      (isCompactAndroid && activeCamSettings.resolution !== '1080p')
        ? getResolutionDimensions('540p')
        : getResolutionDimensions('720p');
    const recFps = isCompactAndroid
      ? Math.min(24, activeCamSettings.targetFps)
      : activeCamSettings.targetFps;

    const activeStorageSettings = loadDeviceStorageSettings();
    const rawBitrate = getVideoBitrateBps(activeStorageSettings.videoBitratePreset);
    const recBitrate = isCompactAndroid ? Math.min(1_600_000, rawBitrate) : rawBitrate;

    const recorder = new RoadSurveyRecorder({
      getSnapshot: () => ({
        nomorRuas: (activeRecordingRuasRef.current || currentRuasRef.current)?.nomorRuas || activeRuas.nomorRuas,
        namaRuas: (activeRecordingRuasRef.current || currentRuasRef.current)?.namaRuas || activeRuas.namaRuas,
        sta: Math.round(staRef.current),
        lat: currentCoordRef.current.lat,
        lng: currentCoordRef.current.lng,
        speedKmh: vehicleSpeedRef.current,
        defects: detectedDefectsRef.current,
      }),
      getVideoEl: () => videoRef.current,
      isCameraActive: () => cameraActiveRef.current,
      getStabilizeCrop: () => androidCameraSettingsRef.current.eisCropMargin,
      width: recDims.width,
      height: recDims.height,
      targetFps: recFps,
      videoBitsPerSecond: recBitrate,
    });

    const started = recorder.start();
    recorderRef.current = started ? recorder : null;
    isRecordingVideoRef.current = true;
    setIsRecordingVideo(true);
    setVideoElapsedSec(0);
  };

  // Start / Stop real video recording handler (MediaRecorder + Watermark + IndexedDB)
  const handleToggleVideoRecord = async () => {
    if (!currentRuas) return;
    if (!isRecordingVideoRef.current) {
      startVideoRecording();
    } else {
      await stopAndSaveVideoRecording();
    }
  };

  const handleStartAutoSurvey = () => {
    if (!currentRuas) return;
    const totalRoadMeters = Math.max(1, Math.round(currentRuas.panjangKm * 1000));
    let startSta = Math.round(staRef.current);
    if (staRef.current >= totalRoadMeters || startSta === 0) {
      const [initLat, initLng] = interpolateCoordAlongRuas(currentRuas, 0);
      staRef.current = 0;
      distAccumRef.current = 0;
      lastAutoCaptureStaRef.current = 0;
      lastTrack100StaRef.current = 0;
      lastTrackedCoordRef.current = null;
      prevGpsFixRef.current = null;
      hasCapturedStartStaRef.current = false;
      startSta = 0;
      gpsTrackRef.current = [];
      setGpsTrackPoints([]);
      setCurrentSta(0);
      setDistanceSinceLastCapture(0);
      if (useSimulationDriving) {
        setCurrentCoord((prev) => ({
          ...prev,
          lat: initLat,
          lng: initLng,
        }));
      }
      lastCaptureCoordRef.current = { lat: initLat, lng: initLng };
    }

    // Aktifkan Fitur Foto dan Fitur Video secara bersamaan saat survei otomatis dimulai
    autoCaptureEnabledRef.current = true;
    videoFeatureEnabledRef.current = true;
    setAutoCaptureEnabled(true);
    setVideoFeatureEnabled(true);

    hasCompletedRoadRef.current = false;
    isSurveyPausedRef.current = false;
    setIsSurveyPaused(false);
    setIsSurveyRunning(true);

    // Langsung mulai perekaman video survei LEBIH DULU sebelum foto STA 00+000
    // agar capture foto STA 00+000 mengambil snapshot rawCanvas non-blocking tanpa memicu shutter Camera2.
    if (!isRecordingVideoRef.current) {
      startVideoRecording(startSta);
    }

    // Ambil foto STA Awal (00+000) & catat titik awal GPS Tracker
    if (startSta === 0 && !hasCapturedStartStaRef.current) {
      hasCapturedStartStaRef.current = true;
      lastAutoCaptureStaRef.current = 0;
      const [interpLat, interpLng] = interpolateCoordAlongRuas(currentRuas, 0);
      const startLat = !useSimulationDriving ? currentCoordRef.current.lat : interpLat;
      const startLng = !useSimulationDriving ? currentCoordRef.current.lng : interpLng;
      lastCaptureCoordRef.current = { lat: startLat, lng: startLng };
      recordGpsTrackPoint(currentRuas, {
        staMeters: 0,
        lat: startLat,
        lng: startLng,
        altitude: currentCoordRef.current.altitude,
        accuracy: currentCoordRef.current.accuracy,
        speedKmh: 0,
        timestamp: new Date().toISOString(),
        category: 'start',
        source: useSimulationDriving ? 'sim' : 'gps',
      });
      void triggerPhotoCapture(startLat, startLng, 0, true);
    }
  };

  const handleTogglePauseSurvey = () => {
    if (!isSurveyRunning) return;
    const nextPaused = !isSurveyPausedRef.current;
    isSurveyPausedRef.current = nextPaused;
    setIsSurveyPaused(nextPaused);
    prevGpsFixRef.current = null;

    if (nextPaused) {
      vehicleSpeedRef.current = 0;
      setVehicleSpeedKmh(0);
      if (isRecordingVideoRef.current) {
        videoPauseStartedAtMsRef.current = Date.now();
        recorderRef.current?.pause();
      }
    } else {
      if (videoPauseStartedAtMsRef.current > 0) {
        videoPausedTotalMsRef.current += Math.max(0, Date.now() - videoPauseStartedAtMsRef.current);
        videoPauseStartedAtMsRef.current = 0;
      }
      if (isRecordingVideoRef.current) {
        recorderRef.current?.resume();
      }
    }
  };

  const handleStopAutoSurvey = () => {
    isSurveyPausedRef.current = false;
    setIsSurveyPaused(false);
    setIsSurveyRunning(false);
    vehicleSpeedRef.current = 0;
    setVehicleSpeedKmh(0);
    distAccumRef.current = 0;
    setDistanceSinceLastCapture(0);

    if (!currentRuas) {
      if (isRecordingVideoRef.current) {
        void stopAndSaveVideoRecording();
      }
      return;
    }

    // Hitung panjang ruas otomatis dari jarak tempuh odometer / akumulasi lintasan GPS saat survei berhenti
    const odoMeters = Math.round(staRef.current);
    const pts = gpsTrackRef.current;
    let trackHaversineMeters = 0;
    for (let i = 1; i < pts.length; i++) {
      trackHaversineMeters += calculateDistanceMeters(
        pts[i - 1].lat,
        pts[i - 1].lng,
        pts[i].lat,
        pts[i].lng
      );
    }
    const surveyedMeters = odoMeters > 0 ? odoMeters : Math.round(trackHaversineMeters);

    if (surveyedMeters >= 1) {
      hasCompletedRoadRef.current = true;
      const [fallbackLat, fallbackLng] = interpolateCoordAlongRuas(currentRuas, surveyedMeters);
      const finLat = !useSimulationDriving ? currentCoordRef.current.lat : fallbackLat;
      const finLng = !useSimulationDriving ? currentCoordRef.current.lng : fallbackLng;
      const calculatedKm = Number((surveyedMeters / 1000).toFixed(3));

      recordGpsTrackPoint(
        currentRuas,
        {
          staMeters: surveyedMeters,
          lat: finLat,
          lng: finLng,
          altitude: currentCoordRef.current.altitude,
          accuracy: currentCoordRef.current.accuracy,
          speedKmh: 0,
          timestamp: new Date().toISOString(),
          category: 'final_sta',
          source: useSimulationDriving ? 'sim' : 'gps',
        },
        {
          flush: true,
          customEndStaMeters: surveyedMeters,
          applyGeometry: true,
          silent: true,
        }
      );

      if (autoCaptureEnabledRef.current && lastAutoCaptureStaRef.current < surveyedMeters) {
        lastAutoCaptureStaRef.current = surveyedMeters;
        lastCaptureCoordRef.current = { lat: finLat, lng: finLng };
        void triggerPhotoCapture(finLat, finLng, surveyedMeters, true);
      }

      staRef.current = surveyedMeters;
      setCurrentSta(surveyedMeters);
      setCustomEndStaInput(String(surveyedMeters));
      setCurrentCoord((prev) => ({
        ...prev,
        lat: finLat,
        lng: finLng,
      }));

      if (isRecordingVideoRef.current) {
        void stopAndSaveVideoRecording(surveyedMeters);
      }

      playAlertSound(false);
      onTriggerAlert(
        'Panjang Ruas Dihitung Otomatis',
        `Survei ${currentRuas.namaRuas} berhenti pada ${formatSTA(surveyedMeters)}. Panjang ruas otomatis diperbarui menjadi ${calculatedKm.toFixed(3)} km (${surveyedMeters} m).`,
        currentRuas.id,
        formatSTA(surveyedMeters)
      );
    } else {
      if (gpsTrackRef.current.length > 0) {
        onSaveGpsTrackRef.current?.(currentRuas.id, gpsTrackRef.current, { silent: true });
      }
      if (isRecordingVideoRef.current) {
        void stopAndSaveVideoRecording(0);
      }
    }
  };

  // Input/Update Target STA Akhir (mendukung angka non-kelipatan 100m, mis. 1235 m)
  const handleApplyTargetEndSta = () => {
    if (!currentRuas) return;
    const parsedMeters = Math.max(1, Math.round(Number(customEndStaInput) || 0));
    setCustomEndStaInput(String(parsedMeters));
    const nextKm = Number((parsedMeters / 1000).toFixed(3));
    if (onUpdateRuas) {
      onUpdateRuas({
        ...currentRuas,
        panjangKm: nextKm,
      });
    }
    onTriggerAlert(
      'Target STA Akhir Diperbarui',
      `Target STA Akhir Ruas ${currentRuas.nomorRuas} diatur ke ${formatSTA(parsedMeters)} (${nextKm} km).`,
      currentRuas.id,
      formatSTA(parsedMeters)
    );
  };

  // Catat STA Akhir secara langsung pada posisi/input non-kelipatan 100m saat survei selesai di lapangan
  const handleRecordFinalStaNow = () => {
    if (!currentRuas) return;
    const typedMeters = Math.round(Number(customEndStaInput) || 0);
    const activeMeters =
      isSurveyRunning && staRef.current > 0
        ? Math.max(1, Math.round(staRef.current))
        : Math.max(1, typedMeters || Math.round(currentRuas.panjangKm * 1000));

    setCustomEndStaInput(String(activeMeters));
    hasCompletedRoadRef.current = false;

    const [fallbackLat, fallbackLng] = interpolateCoordAlongRuas(currentRuas, activeMeters);
    const finLat = !useSimulationDriving ? currentCoordRef.current.lat : fallbackLat;
    const finLng = !useSimulationDriving ? currentCoordRef.current.lng : fallbackLng;

    completeSurveyAtRoadEnd(currentRuas, activeMeters, {
      lat: finLat,
      lng: finLng,
      altitude: currentCoordRef.current.altitude,
      accuracy: currentCoordRef.current.accuracy,
    });
  };

  // Terapkan jalur GPS hasil tracking ke geometri ruas jalan di peta
  const handleApplyGpsTrackToRuasGeometry = () => {
    if (!currentRuas || gpsTrackRef.current.length < 2) return;
    const lastPt = gpsTrackRef.current[gpsTrackRef.current.length - 1];
    const endMeters = Math.max(
      1,
      lastPt?.staMeters || Math.round(currentRuas.panjangKm * 1000)
    );
    onSaveGpsTrackRef.current?.(currentRuas.id, gpsTrackRef.current, {
      customEndStaMeters: endMeters,
      applyGeometry: true,
      silent: false,
    });
  };

  // Helper to draw realistic road simulation frame on canvas
  const drawSimulatedRoadFrame = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    defects: DefectItem[]
  ) => {
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, '#0284c7');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.45);

    // Mentawai tropical vegetation / roadside greenery
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.45);
    ctx.lineTo(w * 0.35, h * 0.4);
    ctx.lineTo(w * 0.65, h * 0.4);
    ctx.lineTo(w, h * 0.45);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    // Road asphalt trapezoid (converging to horizon)
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.42);
    ctx.lineTo(w * 0.62, h * 0.42);
    ctx.lineTo(w * 0.95, h);
    ctx.lineTo(w * 0.05, h);
    ctx.closePath();
    ctx.fill();

    // Road shoulder (bahu jalan)
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.42);
    ctx.lineTo(w * 0.05, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.42);
    ctx.lineTo(w * 0.95, h);
    ctx.stroke();

    // Center divider dashed line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.setLineDash([40, 30]);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.42);
    ctx.lineTo(w * 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw defect texture on asphalt if present
    for (const defect of defects) {
      if (defect.type.includes('Lubang')) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(w * 0.46, h * 0.65, 80, 40, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (defect.type.includes('Retak')) {
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w * 0.42, h * 0.6);
        ctx.lineTo(w * 0.55, h * 0.66);
        ctx.lineTo(w * 0.48, h * 0.72);
        ctx.lineTo(w * 0.62, h * 0.75);
        ctx.stroke();
      }
    }
  };

  const progressPercent = Math.min(100, (distanceSinceLastCapture / 100) * 100);

  if (!currentRuas) {
    return (
      <div className="flex-1 bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full text-center space-y-2">
          <MapPin className="w-9 h-9 text-amber-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Belum Ada Ruas Jalan Terdaftar</h3>
          <p className="text-xs text-slate-400">
            Silakan tambahkan atau impor ruas jalan terlebih dahulu melalui menu Data Ruas Jalan sebelum memulai survei lapangan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isSurveyRunning
          ? 'fixed inset-0 z-40 flex flex-col bg-black text-slate-100 overflow-hidden'
          : 'flex flex-col flex-1 min-h-0 md:min-h-[calc(100vh-115px)] bg-slate-950 text-slate-100 overflow-y-auto md:overflow-hidden'
      }
    >
      {/* 
        TOP TELEMETRY & STATUS BAR:
        Disembunyikan saat survei berjalan agar layar depan hanya menampilkan kamera realtime
      */}
      {!isSurveyRunning && (
      <div className="bg-slate-900/95 border-b border-slate-800 px-2.5 sm:px-4 py-1.5 sm:py-2 flex flex-col gap-1.5 sm:gap-2 shrink-0 shadow-lg z-20 backdrop-blur-md">
        {/* Row 1: Ruas Selector, STA, Speed, GPS, and Recording badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-[11px] sm:text-xs">
          {/* Ruas Selector */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
            <span className="font-semibold text-amber-400 whitespace-nowrap shrink-0">Ruas:</span>
            <select
              value={selectedRuasId}
              onChange={(e) => setSelectedRuasId(e.target.value)}
              className="w-full sm:w-auto max-w-full min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-medium text-[11px] sm:text-xs truncate focus:ring-1 focus:ring-amber-500 focus:outline-none"
            >
              {ruasList.map((ruas) => (
                <option key={ruas.id} value={ruas.id}>
                  {ruas.nomorRuas} - {ruas.namaRuas} ({ruas.panjangKm} km)
                </option>
              ))}
            </select>
          </div>

          {/* Current STA & Speed */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-slate-700">
              <span className="text-slate-400">STA:</span>
              <span className="font-mono font-bold text-sky-400 text-xs sm:text-sm">
                {formatSTA(currentSta)}
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                / {formatSTA(Math.max(1, Math.round(currentRuas.panjangKm * 1000)))}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-slate-700">
              {useSimulationDriving && simulationMode === 'walking' ? (
                <Footprints className="w-3.5 h-3.5 text-emerald-400" />
              ) : useSimulationDriving && simulationMode === 'motorcycle' ? (
                <Bike className="w-3.5 h-3.5 text-sky-400" />
              ) : useSimulationDriving ? (
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="font-mono font-bold text-white">
                {vehicleSpeedKmh} km/jam
              </span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                (
                {useSimulationDriving
                  ? simulationMode === 'walking'
                    ? 'Simulasi Jalan Kaki'
                    : simulationMode === 'motorcycle'
                      ? 'Simulasi Motor'
                      : 'Simulasi Mobil'
                  : 'GPS Nyata'}
                )
              </span>
            </div>

            {/* Video Recording Status Badge in top bar (not blocking camera) */}
            {isRecordingVideo && (
              <div className="flex items-center gap-1.5 bg-rose-600 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-rose-400 text-white font-bold text-[11px] sm:text-xs animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
                <span>MEREKAM ({videoElapsedSec}s)</span>
              </div>
            )}
          </div>

          {/* Geotagging GPS */}
          <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[10px] sm:text-[11px] bg-slate-950/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-slate-800">
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400 shrink-0" />
            <span>
              {currentCoord.lat.toFixed(6)}°, {currentCoord.lng.toFixed(6)}°
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">Alt: {currentCoord.altitude.toFixed(0)}m</span>
            <span className="text-slate-500">|</span>
            <span className="text-emerald-400">±{currentCoord.accuracy.toFixed(1)}m</span>
          </div>
        </div>

        {/* Row 2: 100m Auto-Capture Progress Bar & Real-time AI Status */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-1.5 sm:gap-3 items-center text-[11px] sm:text-xs">
          {/* 100m Auto-Capture Progress bar */}
          <div className="md:col-span-6 flex items-center gap-2 sm:gap-3 bg-slate-950/70 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border border-slate-800">
            <div className="flex items-center gap-1.5 shrink-0">
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-slate-200">
                Odometer 100m:
              </span>
            </div>

            <div className="flex-1 bg-slate-800 h-2 sm:h-2.5 rounded-full overflow-hidden relative">
              <div 
                className={`h-full transition-all duration-300 ${
                  progressPercent >= 90 ? 'bg-amber-400 animate-pulse' : 'bg-sky-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <span className="font-mono text-amber-300 text-[11px] sm:text-xs font-semibold shrink-0">
              {Math.round(distanceSinceLastCapture)}m / 100m
            </span>
          </div>

          {/* Real-time AI Detection Status banner (Interactive Active Controls) */}
          <div className="md:col-span-6 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 bg-slate-950/70 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border border-slate-800">
            <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
              <button
                type="button"
                onClick={() => setAiDetectionEnabled((prev) => !prev)}
                title={aiDetectionEnabled ? 'Deteksi AI Aktif (klik untuk nonaktifkan)' : 'Deteksi AI Nonaktif (klik untuk aktifkan)'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-bold transition shrink-0 cursor-pointer ${
                  aiDetectionEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    aiDetectionEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <Eye className="w-3 h-3 shrink-0" />
                <span>{aiDetectionEnabled ? 'Deteksi AI: Aktif' : 'Deteksi AI: Nonaktif'}</span>
              </button>

              {!aiDetectionEnabled ? (
                <span className="text-slate-500 truncate text-[11px]">
                  Dinonaktifkan
                </span>
              ) : isScanningLiveAI ? (
                <span className="font-medium text-amber-300 truncate flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span>Memindai jalan...</span>
                </span>
              ) : detectedDefects.length > 0 ? (
                <span
                  className="font-semibold text-rose-400 truncate flex items-center gap-1"
                  title={aiLastSummary || `${detectedDefects[0].type} (${detectedDefects[0].severity})`}
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="truncate">
                    {detectedDefects[0].type} ({detectedDefects[0].severity})
                  </span>
                </span>
              ) : (
                <span
                  className="font-medium text-emerald-400 truncate flex items-center gap-1"
                  title={aiLastSummary || 'Permukaan Mantap PKRMS'}
                >
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {aiLastSummary ? aiLastSummary : 'Permukaan Mantap PKRMS'}
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {aiDetectionEnabled && (
                <button
                  type="button"
                  onClick={() => void runLiveAiFrameScan({ silent: false })}
                  disabled={isScanningLiveAI}
                  title="Pindai kondisi jalan pada tampilan kamera saat ini menggunakan AI"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-[11px] font-bold transition cursor-pointer"
                >
                  {isScanningLiveAI ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Pindai AI</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleToggleCameraSource()}
                disabled={isActivatingCamera}
                title={
                  cameraActive
                    ? 'Kamera Fisik Aktif (klik untuk beralih ke Kamera Simulasi)'
                    : cameraError || 'Klik untuk mengaktifkan Kamera Fisik perangkat'
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold transition cursor-pointer disabled:opacity-60 ${
                  cameraActive
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-amber-500/50'
                }`}
              >
                <Camera className="w-3 h-3 shrink-0" />
                <span className="hidden sm:inline">
                  {isActivatingCamera
                    ? 'Mengaktifkan...'
                    : cameraActive
                      ? 'Kamera Fisik'
                      : 'Kamera Simulasi'}
                </span>
              </button>

              {cameraActive && cameraCapabilities.hasTorch && (
                <button
                  type="button"
                  onClick={() =>
                    void handleUpdateAndroidCameraSettings(
                      { ...androidCameraSettings, torch: !androidCameraSettings.torch },
                      false
                    )
                  }
                  title={androidCameraSettings.torch ? 'Matikan Lampu Flash' : 'Nyalakan Lampu Flash'}
                  className={`p-1 rounded border cursor-pointer transition ${
                    androidCameraSettings.torch
                      ? 'bg-amber-500 border-amber-400 text-slate-950'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  void refreshCameraDevices();
                  setShowCameraSettingsModal(true);
                }}
                title="Setelan Kamera Android (Fokus, Frame Rate 30fps, Anti-Getar, Lensa)"
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-sky-500/50 text-slate-200 text-[10px] font-semibold transition cursor-pointer"
              >
                <Settings2 className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="hidden md:inline">Setelan Android</span>
              </button>

              {onOpenStorageSettings && (
                <button
                  type="button"
                  onClick={onOpenStorageSettings}
                  title="Pengaturan Penyimpanan Foto & Video pada Perangkat"
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-emerald-500/50 text-emerald-300 text-[10px] font-semibold transition cursor-pointer"
                >
                  <HardDrive className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="hidden md:inline">Penyimpanan</span>
                </button>
              )}

              {/* Audio Alert Toggle */}
              <button
                type="button"
                onClick={() => setAudioAlertsEnabled(!audioAlertsEnabled)}
                title={audioAlertsEnabled ? 'Alarm Suara Aktif' : 'Alarm Suara Dimatikan'}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                {audioAlertsEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: GPS Route Tracker (100m), Non-100m STA Akhir Input & Export Excel / KML / KMZ */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 bg-slate-950/75 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border border-cyan-500/30 text-[11px] sm:text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Route className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Tracker Rute GPS:</span>
              <span className="font-mono bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 rounded text-[11px]">
                {gpsTrackPoints.length} titik (
                {gpsTrackPoints.filter((p) => p.category === 'checkpoint_100m' || p.category === 'start' || p.category === 'final_sta').length} STA)
              </span>
              <span
                className="font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-[11px]"
                title="Panjang ruas jalan otomatis dihitung dan disimpan sesuai jarak tempuh saat survei berhenti"
              >
                Terukur: {((currentSta > 0 ? currentSta : Math.round(currentRuas.panjangKm * 1000)) / 1000).toFixed(3)} km
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
              <span className="text-[11px] text-slate-400">STA Akhir (m):</span>
              <input
                type="number"
                step="1"
                min="1"
                value={customEndStaInput}
                onChange={(e) => setCustomEndStaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyTargetEndSta();
                  }
                }}
                className="w-20 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-white font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-400"
                title="Input STA Akhir dalam meter (mendukung angka non-kelipatan 100m, contoh: 1235)"
              />
              <span className="text-[10px] font-mono text-sky-400 hidden sm:inline">
                {formatSTA(Math.max(1, Math.round(Number(customEndStaInput) || 0)))}
              </span>
              <button
                type="button"
                onClick={handleApplyTargetEndSta}
                className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition cursor-pointer"
                title="Terapkan target STA Akhir (bisa non-kelipatan 100m) ke ruas jalan ini"
              >
                Set STA
              </button>
              <button
                type="button"
                onClick={handleRecordFinalStaNow}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition cursor-pointer"
                title="Catat STA Akhir GPS sekarang (menggunakan STA berjalan atau nilai STA Akhir di samping)"
              >
                <Flag className="w-2.5 h-2.5" />
                <span>Catat STA Akhir</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {gpsTrackPoints.length >= 2 && (
              <button
                type="button"
                onClick={handleApplyGpsTrackToRuasGeometry}
                className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-[11px] font-bold transition cursor-pointer"
                title="Terapkan jalur rute hasil GPS Tracker menjadi rute resmi ruas jalan di peta"
              >
                <MapPin className="w-3 h-3" />
                <span>Terapkan ke Peta</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => exportGpsTracksToExcel(ruasList, currentRuas)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold transition cursor-pointer"
              title="Ekspor hasil GPS Tracker ruas ini ke file Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportGpsTracksToKML(ruasList, currentRuas)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-[11px] font-semibold transition cursor-pointer"
              title="Ekspor hasil GPS Tracker ruas ini ke file KML"
            >
              <FileCode className="w-3 h-3 text-sky-400" />
              <span>KML</span>
            </button>
            <button
              type="button"
              onClick={() => void exportGpsTracksToKMZ(ruasList, currentRuas)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 text-[11px] font-semibold transition cursor-pointer"
              title="Ekspor hasil GPS Tracker ruas ini ke file KMZ"
            >
              <Route className="w-3 h-3 text-indigo-400" />
              <span>KMZ</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 
        MAIN CAMERA / VIDEO VIEWPORT:
        100% BERSIH DARI TULISAN - Bebas dari tulisan overlay sehingga tidak menutupi display kamera
      */}
      <div className="relative flex-1 min-h-[230px] sm:min-h-[300px] bg-black overflow-hidden flex items-center justify-center">
        {/* Real Camera Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform duration-200 ${
            cameraActive ? 'block' : 'hidden'
          } ${cameraActive && androidCameraSettings.eisCropMargin ? 'scale-[1.06]' : ''}`}
        />

        {/* Fallback Simulation Canvas when physical camera is inactive */}
        {!cameraActive && (
          <div className="w-full h-full">
            <SimulatedRoadCanvas 
              defects={detectedDefects} 
              isMoving={isSurveyRunning && !isSurveyPaused} 
              speed={vehicleSpeedKmh} 
              batterySaver={batterySaver}
            />
          </div>
        )}
      </div>

      {/* 
        BOTTOM CONTROL PANEL:
        Saat survei berjalan hanya menampilkan tombol Pause & Berhenti di bawah layar kamera realtime
      */}
      {isSurveyRunning ? (
        <div className="bg-slate-950/95 border-t border-slate-800/80 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleTogglePauseSurvey}
            className={`flex-1 max-w-[165px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition cursor-pointer ${
              isSurveyPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {isSurveyPaused ? (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Lanjutkan</span>
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleStopAutoSurvey}
            className="flex-1 max-w-[165px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm shadow-lg transition cursor-pointer"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Berhenti</span>
          </button>
        </div>
      ) : (
      <div className="bg-slate-900 border-t border-slate-800 p-2.5 sm:p-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          {/* Survey Execution & Separated Photo/Video Feature Mode */}
          <div className="flex flex-wrap items-center gap-2">
            {!isSurveyRunning ? (
              <button
                type="button"
                onClick={handleStartAutoSurvey}
                className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {currentSta >= Math.max(1, Math.round(currentRuas.panjangKm * 1000))
                    ? 'Ulangi Survei Otomatis'
                    : 'Mulai Survei Otomatis'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopAutoSurvey}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Hentikan Survei</span>
              </button>
            )}

            {/* Toggle Fitur Foto & Fitur Video (Dapat Aktif Bersamaan Saat Survei Otomatis) */}
            <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-700 gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = !autoCaptureEnabled;
                  autoCaptureEnabledRef.current = next;
                  setAutoCaptureEnabled(next);
                }}
                title={autoCaptureEnabled ? 'Fitur Foto 100m Aktif (klik untuk nonaktifkan)' : 'Fitur Foto Nonaktif (klik untuk aktifkan)'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  autoCaptureEnabled
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    autoCaptureEnabled ? 'bg-slate-950 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                <Camera className="w-3.5 h-3.5" />
                <span>Fitur Foto</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !videoFeatureEnabled;
                  videoFeatureEnabledRef.current = next;
                  setVideoFeatureEnabled(next);
                  if (!next && isRecordingVideoRef.current) {
                    void stopAndSaveVideoRecording();
                  } else if (next && isSurveyRunning && !isRecordingVideoRef.current) {
                    startVideoRecording();
                  }
                }}
                title={videoFeatureEnabled ? 'Fitur Video Aktif (klik untuk nonaktifkan)' : 'Fitur Video Nonaktif (klik untuk aktifkan)'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  videoFeatureEnabled || isRecordingVideo
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRecordingVideo
                      ? 'bg-white animate-ping'
                      : videoFeatureEnabled
                        ? 'bg-emerald-300'
                        : 'bg-slate-600'
                  }`}
                />
                <Video className="w-3.5 h-3.5" />
                <span>Fitur Video</span>
              </button>
            </div>

            {(videoFeatureEnabled || isRecordingVideo) && (
              <button
                type="button"
                onClick={handleToggleVideoRecord}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition cursor-pointer ${
                  isRecordingVideo
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-rose-950 hover:bg-rose-900 text-rose-100 border border-rose-500/50'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>{isRecordingVideo ? `Stop & Simpan (${videoElapsedSec}s)` : 'Rekam Video Survei'}</span>
              </button>
            )}
          </div>

          {/* Right controls: Last captured photo & video previews + simulation settings */}
          <div className="flex items-center flex-wrap gap-3 text-xs">
            {lastCapturedPhoto && (
              <div className="flex items-center gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <img 
                  src={lastCapturedPhoto.imageUrl} 
                  alt="Foto Terakhir" 
                  className="w-10 h-7 object-cover rounded border border-slate-700 cursor-pointer hover:opacity-90"
                  onClick={() => onViewPhoto(lastCapturedPhoto)}
                />
                <div className="text-[11px]">
                  <span className="text-slate-400 block text-[10px]">Foto 100m Terakhir:</span>
                  <span className="font-mono text-amber-400 font-bold">{lastCapturedPhoto.staText}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onViewPhoto(lastCapturedPhoto)}
                  className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold rounded cursor-pointer"
                >
                  Lihat
                </button>
              </div>
            )}

            {lastRecordedVideo && (
              <div className="flex items-center gap-2 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-rose-500/30">
                {lastRecordedVideo.thumbnailUrl ? (
                  <img
                    src={lastRecordedVideo.thumbnailUrl}
                    alt="Video Terakhir"
                    className="w-10 h-7 object-cover rounded border border-slate-700 cursor-pointer hover:opacity-90"
                    onClick={() => onViewVideo?.(lastRecordedVideo)}
                  />
                ) : (
                  <div className="w-10 h-7 rounded border border-slate-700 bg-slate-900 flex items-center justify-center text-rose-400">
                    <Video className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="text-[11px]">
                  <span className="text-slate-400 block text-[10px]">Arsip Ruas {lastRecordedVideo.nomorRuas}:</span>
                  <span className="font-mono text-rose-300 font-bold">
                    {formatSTA(lastRecordedVideo.startSta)} - {formatSTA(lastRecordedVideo.endSta)}
                  </span>
                </div>
                {onViewVideo && (
                  <button
                    type="button"
                    onClick={() => onViewVideo(lastRecordedVideo)}
                    className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[10px] font-semibold rounded cursor-pointer"
                  >
                    Lihat
                  </button>
                )}
              </div>
            )}

            {/* Simulation & Real GPS Transport Mode Controls */}
            <div className="flex items-center flex-wrap gap-2 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSimulationDriving}
                  onChange={(e) => setUseSimulationDriving(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <span className="text-slate-300 font-medium">Simulasi:</span>
              </label>

              <div className="flex items-center rounded-md bg-slate-900/90 p-0.5 border border-slate-700/80 gap-0.5">
                <button
                  type="button"
                  onClick={() => setUseSimulationDriving(false)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    !useSimulationDriving
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Gunakan Kecepatan & Pergerakan GPS Nyata Perangkat (0 km/jam saat tidak bergerak)"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>GPS Nyata</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUseSimulationDriving(true);
                    setSimulationMode('car');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    useSimulationDriving && simulationMode === 'car'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Simulasi Survei Menggunakan Mobil"
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Mobil</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUseSimulationDriving(true);
                    setSimulationMode('motorcycle');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    useSimulationDriving && simulationMode === 'motorcycle'
                      ? 'bg-sky-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Simulasi Survei Menggunakan Sepeda Motor"
                >
                  <Bike className="w-3.5 h-3.5" />
                  <span>Sepeda Motor</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUseSimulationDriving(true);
                    setSimulationMode('walking');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    useSimulationDriving && simulationMode === 'walking'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Simulasi Survei Jalan Kaki"
                >
                  <Footprints className="w-3.5 h-3.5" />
                  <span>Jalan Kaki</span>
                </button>
              </div>
            </div>

            {/* Automatic Speed Readout (Dihitung Otomatis dari GPS/Odometer) */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Gauge className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400">Kecepatan Otomatis:</span>
              <span className="font-mono font-bold text-amber-300">
                {vehicleSpeedKmh} km/jam
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-slate-400">Auto 100m:</span>
              <input
                type="checkbox"
                checked={autoCaptureEnabled}
                onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Hidden offscreen canvas for watermark rasterization */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Android Camera Settings Modal */}
      <AndroidCameraSettingsModal
        isOpen={showCameraSettingsModal}
        onClose={() => setShowCameraSettingsModal(false)}
        settings={androidCameraSettings}
        onChangeSettings={(next, restart) => void handleUpdateAndroidCameraSettings(next, restart)}
        devices={cameraDevices}
        onRefreshDevices={() => void refreshCameraDevices()}
        capabilities={cameraCapabilities}
        cameraActive={cameraActive}
        isApplying={isActivatingCamera}
        wakeLockActive={wakeLockActive}
      />
    </div>
  );
};

// Simulation Road Canvas Component (memoized to avoid re-renders on telemetry updates)
const SimulatedRoadCanvas: React.FC<{
  defects: DefectItem[];
  isMoving: boolean;
  speed: number;
  batterySaver: boolean;
}> = React.memo(({ defects, isMoving, speed, batterySaver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);
  const latestPropsRef = useRef({ defects, isMoving, speed, batterySaver });
  const isCompactCanvas = typeof window !== 'undefined' && window.innerWidth <= 480;

  useEffect(() => {
    latestPropsRef.current = { defects, isMoving, speed, batterySaver };
  }, [defects, isMoving, speed, batterySaver]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx =
      canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
      canvas.getContext('2d', { alpha: false }) ||
      canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastMs = 0;
    let lastBatteryRenderMs = 0;
    let active = true;

    const render = (nowMs: number) => {
      if (!active) return;
      const { defects: curDefects, isMoving: curMoving, speed: curSpeed, batterySaver: curBattery } =
        latestPropsRef.current;

      if (curBattery && lastBatteryRenderMs > 0 && nowMs - lastBatteryRenderMs < 66) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastBatteryRenderMs = nowMs;

      const dtSec = lastMs > 0 ? Math.min(0.1, Math.max(0.001, (nowMs - lastMs) / 1000)) : 1 / 60;
      lastMs = nowMs;

      if (curMoving && curSpeed > 0) {
        phaseRef.current = (phaseRef.current + (curSpeed / 40) * 0.65 * dtSec) % 1;
      }

      drawRoadSimulationVideoFrame(
        ctx,
        canvas.width,
        canvas.height,
        phaseRef.current,
        curDefects,
        true
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={isCompactCanvas ? 854 : 1280}
      height={isCompactCanvas ? 480 : 720}
      className="w-full h-full object-cover"
    />
  );
});
