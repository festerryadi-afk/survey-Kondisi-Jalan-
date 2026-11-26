import {
  DefectItem,
  RoadConditionPKRMS,
  RuasJalan,
  RuasSTASegment,
  SurfaceType,
  TreatmentRecommendation,
} from '../types';

/**
 * Standar PKRMS (Provincial and Kabupaten Road Management System) 
 * Kementerian PUPR RI Tahun 2026
 */

export interface PKRMSAssessmentResult {
  sdiScore: number;
  iriEstimate: number;
  condition: RoadConditionPKRMS;
  recommendation: TreatmentRecommendation;
  defectSummary: string;
}

export function evaluatePKRMSCondition(defects: DefectItem[]): PKRMSAssessmentResult {
  let sdiScore = 15; // baseline good road SDI
  let iriEstimate = 3.2; // m/km

  let hasSeverePothole = false;
  let hasSevereCrack = false;
  let potholeCount = 0;
  let crackCount = 0;

  for (const defect of defects) {
    if (defect.type.includes('Lubang')) {
      potholeCount++;
      if (defect.severity === 'Berat') {
        sdiScore += 65;
        iriEstimate += 2.8;
        hasSeverePothole = true;
      } else if (defect.severity === 'Sedang') {
        sdiScore += 35;
        iriEstimate += 1.6;
      } else {
        sdiScore += 15;
        iriEstimate += 0.8;
      }
    } else if (defect.type.includes('Retak Buaya')) {
      crackCount++;
      if (defect.severity === 'Berat') {
        sdiScore += 55;
        iriEstimate += 2.2;
        hasSevereCrack = true;
      } else if (defect.severity === 'Sedang') {
        sdiScore += 30;
        iriEstimate += 1.4;
      } else {
        sdiScore += 15;
        iriEstimate += 0.6;
      }
    } else if (defect.type.includes('Retak Memanjang') || defect.type.includes('Retak Tepi')) {
      crackCount++;
      sdiScore += defect.severity === 'Berat' ? 30 : defect.severity === 'Sedang' ? 18 : 8;
      iriEstimate += 0.7;
    } else if (defect.type.includes('Amblas')) {
      sdiScore += defect.severity === 'Berat' ? 45 : 25;
      iriEstimate += 1.8;
    } else {
      sdiScore += 10;
      iriEstimate += 0.5;
    }
  }

  // Cap SDI at 200
  sdiScore = Math.min(200, Math.round(sdiScore));
  iriEstimate = Number(Math.min(18.0, iriEstimate).toFixed(1));

  let condition: RoadConditionPKRMS = 'Baik';
  let recommendation: TreatmentRecommendation = 'Pemeliharaan Rutin';

  if (sdiScore >= 140 || iriEstimate >= 10.0 || (hasSeverePothole && potholeCount >= 2)) {
    condition = 'Rusak Berat';
    recommendation = 'Rekonstruksi / Peningkatan';
  } else if (sdiScore >= 95 || iriEstimate >= 7.5 || hasSevereCrack || hasSeverePothole) {
    condition = 'Rusak Ringan';
    recommendation = 'Rehabilitasi Jalan';
  } else if (sdiScore >= 45 || iriEstimate >= 4.5 || potholeCount > 0 || crackCount > 0) {
    condition = 'Sedang';
    recommendation = 'Pemeliharaan Berkala';
  } else {
    condition = 'Baik';
    recommendation = 'Pemeliharaan Rutin';
  }

  let summary = 'Kondisi Permukaan Mantap';
  if (defects.length > 0) {
    summary = `${defects.length} Cacat Terdeteksi (${defects.map(d => `${d.type} [${d.severity}]`).join(', ')})`;
  }

  return {
    sdiScore,
    iriEstimate,
    condition,
    recommendation,
    defectSummary: summary,
  };
}

export function getConditionColor(condition: RoadConditionPKRMS): {
  badgeBg: string;
  badgeText: string;
  hex: string;
  borderHex: string;
} {
  switch (condition) {
    case 'Baik':
      return {
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        badgeText: 'text-emerald-700',
        hex: '#10b981',
        borderHex: '#059669',
      };
    case 'Sedang':
      return {
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
        badgeText: 'text-amber-700',
        hex: '#f59e0b',
        borderHex: '#d97706',
      };
    case 'Rusak Ringan':
      return {
        badgeBg: 'bg-orange-100 text-orange-800 border-orange-300',
        badgeText: 'text-orange-700',
        hex: '#f97316',
        borderHex: '#ea580c',
      };
    case 'Rusak Berat':
      return {
        badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
        badgeText: 'text-rose-700',
        hex: '#ef4444',
        borderHex: '#dc2626',
      };
  }
}

export function formatMeterToSTA(meters: number): string {
  const safe = Math.max(0, Math.round(meters));
  const km = Math.floor(safe / 1000);
  const m = safe % 1000;
  return `STA ${km.toString().padStart(2, '0')}+${m.toString().padStart(3, '0')}`;
}

/**
 * Mengembalikan daftar segmen per STA untuk suatu ruas jalan.
 * Jika belum memiliki staSegments, mengembalikan array kosong (untuk ruas baru)
 * atau fallback segmen penuh untuk data lama.
 */
export function getRuasSTASegments(ruas: RuasJalan): RuasSTASegment[] {
  if (Array.isArray(ruas.staSegments)) {
    return [...ruas.staSegments].sort((a, b) => a.startSta - b.startSta);
  }
  const totalMeters = Math.max(1, Math.round(ruas.panjangKm * 1000));
  return [
    {
      id: `seg-legacy-${ruas.id}`,
      startSta: 0,
      endSta: totalMeters,
      tipePermukaan: ruas.tipePermukaan || 'Aspal (AC-WC/HRS)',
      kondisiJalan: ruas.kondisiPKRMS || 'Baik',
    },
  ];
}

export function getSurfaceAndConditionAtSTA(
  ruas: RuasJalan,
  staMeters: number
): { tipePermukaan: SurfaceType; kondisiJalan: RoadConditionPKRMS } {
  const segments = getRuasSTASegments(ruas);
  if (segments.length === 0) {
    return {
      tipePermukaan: ruas.tipePermukaan || 'Aspal (AC-WC/HRS)',
      kondisiJalan: ruas.kondisiPKRMS || 'Baik',
    };
  }

  const matched =
    segments.find((s) => staMeters >= s.startSta && staMeters <= s.endSta) ||
    segments[segments.length - 1];

  return {
    tipePermukaan: matched.tipePermukaan,
    kondisiJalan: matched.kondisiJalan,
  };
}

export function summarizeRuasFromSTASegments(
  segments: RuasSTASegment[],
  fallbackSurface: SurfaceType = 'Aspal (AC-WC/HRS)',
  fallbackCondition: RoadConditionPKRMS = 'Baik'
): {
  tipePermukaan: SurfaceType;
  kondisiPKRMS: RoadConditionPKRMS;
  rekomendasiPenanganan: TreatmentRecommendation;
  iriAvg: number;
  sdiScore: number;
} {
  if (segments.length === 0) {
    return {
      tipePermukaan: fallbackSurface,
      kondisiPKRMS: fallbackCondition,
      rekomendasiPenanganan: 'Pemeliharaan Rutin',
      iriAvg: 3.5,
      sdiScore: 25,
    };
  }

  const surfaceMeters: Record<string, number> = {};
  const conditionMeters: Record<RoadConditionPKRMS, number> = {
    Baik: 0,
    Sedang: 0,
    'Rusak Ringan': 0,
    'Rusak Berat': 0,
  };

  let weightedIri = 0;
  let weightedSdi = 0;
  let totalMeters = 0;

  const conditionMetrics: Record<RoadConditionPKRMS, { iri: number; sdi: number }> = {
    Baik: { iri: 3.2, sdi: 25 },
    Sedang: { iri: 5.5, sdi: 70 },
    'Rusak Ringan': { iri: 9.2, sdi: 118 },
    'Rusak Berat': { iri: 13.4, sdi: 168 },
  };

  for (const seg of segments) {
    const len = Math.max(1, seg.endSta - seg.startSta);
    surfaceMeters[seg.tipePermukaan] = (surfaceMeters[seg.tipePermukaan] || 0) + len;
    conditionMeters[seg.kondisiJalan] = (conditionMeters[seg.kondisiJalan] || 0) + len;
    weightedIri += conditionMetrics[seg.kondisiJalan].iri * len;
    weightedSdi += conditionMetrics[seg.kondisiJalan].sdi * len;
    totalMeters += len;
  }

  const dominantSurface = (Object.entries(surfaceMeters).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    fallbackSurface) as SurfaceType;
  const dominantCondition = (Object.entries(conditionMeters).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    fallbackCondition) as RoadConditionPKRMS;

  const avgIri = Number((weightedIri / Math.max(1, totalMeters)).toFixed(1));
  const avgSdi = Math.round(weightedSdi / Math.max(1, totalMeters));

  let rekomendasiPenanganan: TreatmentRecommendation = 'Pemeliharaan Rutin';
  if (dominantCondition === 'Rusak Berat') rekomendasiPenanganan = 'Rekonstruksi / Peningkatan';
  else if (dominantCondition === 'Rusak Ringan') rekomendasiPenanganan = 'Rehabilitasi Jalan';
  else if (dominantCondition === 'Sedang') rekomendasiPenanganan = 'Pemeliharaan Berkala';

  return {
    tipePermukaan: dominantSurface,
    kondisiPKRMS: dominantCondition,
    rekomendasiPenanganan,
    iriAvg: avgIri,
    sdiScore: avgSdi,
  };
}

