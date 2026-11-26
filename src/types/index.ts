export type SurfaceType = 'Aspal (AC-WC/HRS)' | 'Penetrasi Macadam (Lapen)' | 'Kerikil / Sirtu' | 'Beton (Rigid)' | 'Tanah';

export type DefectType = 
  | 'Lubang (Pothole)'
  | 'Retak Buaya (Alligator Cracking)'
  | 'Retak Memanjang / Melintang'
  | 'Retak Tepi (Edge Crack)'
  | 'Amblas / Alur (Rutting/Depression)'
  | 'Kerusakan Tepi (Edge Damage)'
  | 'Permukaan Aus / Lepas (Ravelling)';

export type PKRMSSeverity = 'Ringan' | 'Sedang' | 'Berat';

export type RoadConditionPKRMS = 'Baik' | 'Sedang' | 'Rusak Ringan' | 'Rusak Berat';

export type TreatmentRecommendation = 
  | 'Pemeliharaan Rutin' 
  | 'Pemeliharaan Berkala' 
  | 'Rehabilitasi Jalan' 
  | 'Rekonstruksi / Peningkatan';

export interface DefectItem {
  id: string;
  type: DefectType;
  severity: PKRMSSeverity;
  confidence: number; // 0 to 1
  dimensions?: {
    lengthCm?: number;
    widthCm?: number;
    depthCm?: number;
    crackWidthMm?: number;
    areaSqM?: number;
  };
  boundingBox?: {
    x: number; // percentage 0-100
    y: number;
    width: number;
    height: number;
  };
  notes?: string;
}

export interface SurveyPhoto {
  id: string;
  ruasId: string;
  ruasNama: string;
  nomorRuas: string;
  sta: number; // in meters, e.g. 1250 => STA 01+250
  staText: string;
  coordinates: {
    lat: number;
    lng: number;
    altitude?: number;
    accuracy?: number;
  };
  timestamp: string; // ISO string
  capturedBy: string;
  imageUrl: string; // data URL or blob URL with watermark
  rawImageUrl?: string;
  defects: DefectItem[];
  surfaceType: SurfaceType;
  pkrmsCondition: RoadConditionPKRMS;
  recommendation: TreatmentRecommendation;
  speedKmh?: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  hashSha256: string;
  isAutoCapture: boolean;
}

export interface SurveyVideo {
  id: string;
  ruasId: string;
  ruasNama: string;
  nomorRuas: string;
  startSta: number;
  endSta: number;
  timestamp: string;
  durationSeconds: number;
  videoUrl: string;
  fileSizeBytes: number;
  defectsCount: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  hashSha256: string;
  thumbnailUrl: string;
}

export interface RuasSTASegment {
  id: string;
  startSta: number; // in meters, e.g. 0 => STA 00+000
  endSta: number;   // in meters, e.g. 5000 => STA 05+000
  tipePermukaan: SurfaceType;
  kondisiJalan: RoadConditionPKRMS;
}

export type GpsTrackCategory = 'start' | 'checkpoint_100m' | 'final_sta' | 'breadcrumb';

export interface GpsTrackPoint {
  id: string;
  staMeters: number; // exact STA in meters (supports non-100 multiples like 1235)
  staText: string;   // e.g. "STA 01+235"
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
  speedKmh?: number;
  timestamp: string; // ISO string
  category: GpsTrackCategory;
  source: 'gps' | 'sim' | 'manual';
}

export interface RuasJalan {
  id: string;
  nomorRuas: string;
  namaRuas: string;
  kecamatanPulau: string; // e.g. Sipora Utara, Siberut Selatan
  panjangKm: number;
  lebarMeter: number;
  staSegments?: RuasSTASegment[];
  gpsTrack?: GpsTrackPoint[];
  lastGpsTrackDate?: string;
  tipePermukaan: SurfaceType;
  kondisiPKRMS: RoadConditionPKRMS;
  iriAvg: number; // International Roughness Index (m/km)
  sdiScore: number; // Surface Distress Index
  lastSurveyDate: string;
  koordinatAwal: [number, number]; // [lat, lng]
  koordinatAkhir: [number, number];
  points: [number, number][]; // route polyline coordinates
  documentationCount: number;
  rekomendasiPenanganan: TreatmentRecommendation;
  customColor?: string;
}

export type MapConditionColors = Record<RoadConditionPKRMS, string>;

export interface NotificationPush {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'alert' | 'info' | 'sync' | 'task';
  read: boolean;
  ruasId?: string;
  sta?: string;
}

export interface EncryptionInfo {
  algorithm: string;
  enabled: boolean;
  lastEncryptedAt: string;
  keyFingerprint: string;
}

export interface KmlFeature {
  id: string;
  name: string;
  description?: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  coordinates: [number, number][]; // [lat, lng][]
  color?: string;
  lengthKm?: number;
}

export interface ImportedKmlLayer {
  id: string;
  name: string;
  fileName: string;
  fileType: 'KML' | 'KMZ';
  importedAt: string;
  visible: boolean;
  color: string;
  features: KmlFeature[];
  totalLengthKm: number;
}

