import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { GpsTrackPoint, RuasJalan } from '../types';
import {
  buildRuasStaPhotoStations,
  calculateDistanceMeters,
  downloadFile,
  formatSTA,
  interpolateCoordAlongRuas,
} from './geo';
import { triggerBlobDownload } from './nativeDownload';

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeFileSegment(text: string): string {
  return (text || 'ruas')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}


export interface EffectiveRuasGpsTrack {
  ruas: RuasJalan;
  points: GpsTrackPoint[];
  checkpoints: GpsTrackPoint[]; // start + checkpoint_100m + final_sta
  isRecordedSurveyTrack: boolean;
  totalTrackedMeters: number;
  endStaMeters: number;
  endStaText: string;
}

function getCategoryLabel(category: GpsTrackPoint['category']): string {
  switch (category) {
    case 'start':
      return 'STA Awal (00+000)';
    case 'checkpoint_100m':
      return 'Checkpoint 100m';
    case 'final_sta':
      return 'STA Akhir';
    default:
      return 'Titik Jalur GPS';
  }
}

function getSourceLabel(source: GpsTrackPoint['source'], isRecorded: boolean): string {
  if (!isRecorded) return 'Geometri Ruas (Estimasi)';
  if (source === 'gps') return 'GPS Lapangan';
  if (source === 'manual') return 'Input Manual STA';
  return 'Simulasi Survei';
}

/**
 * Mengembalikan data titik GPS tracker per ruas.
 * Jika ruas sudah pernah direkam trackernya saat survei, gunakan titik gpsTrack riil (urut STA & waktu).
 * Jika belum ada rekaman tracker pada ruas tersebut, hasilkan titik per 100m + STA Akhir (termasuk non-kelipatan 100) dari geometri ruas.
 */
export function buildEffectiveRuasGpsTrack(ruas: RuasJalan): EffectiveRuasGpsTrack {
  const rawTrack = Array.isArray(ruas.gpsTrack) ? ruas.gpsTrack : [];
  if (rawTrack.length > 0) {
    const sorted = [...rawTrack].sort((a, b) => {
      if (a.staMeters !== b.staMeters) return a.staMeters - b.staMeters;
      return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
    });

    const checkpoints = sorted.filter(
      (pt) =>
        pt.category === 'start' ||
        pt.category === 'checkpoint_100m' ||
        pt.category === 'final_sta'
    );

    const lastPt = sorted[sorted.length - 1];
    let trackedMeters = 0;
    for (let i = 1; i < sorted.length; i++) {
      trackedMeters += calculateDistanceMeters(
        sorted[i - 1].lat,
        sorted[i - 1].lng,
        sorted[i].lat,
        sorted[i].lng
      );
    }

    const declaredMeters = Math.max(1, Math.round((ruas.panjangKm || 0) * 1000));
    const endStaMeters = Math.max(lastPt?.staMeters ?? declaredMeters, declaredMeters);
    const effectiveEndMeters = lastPt ? lastPt.staMeters : endStaMeters;

    return {
      ruas,
      points: sorted,
      checkpoints: checkpoints.length > 0 ? checkpoints : sorted,
      isRecordedSurveyTrack: true,
      totalTrackedMeters: Math.round(trackedMeters),
      endStaMeters: effectiveEndMeters,
      endStaText: formatSTA(effectiveEndMeters),
    };
  }

  // Fallback jika belum ada rekaman tracker lapangan: buat titik per 100m + STA Akhir dari geometri ruas
  const stations = buildRuasStaPhotoStations(ruas);
  const endMeters = stations[stations.length - 1] ?? 0;
  const fallbackDate = ruas.lastSurveyDate
    ? `${ruas.lastSurveyDate}T08:00:00.000Z`
    : new Date().toISOString();

  const generatedPoints: GpsTrackPoint[] = stations.map((sta, idx) => {
    const [lat, lng] = interpolateCoordAlongRuas(ruas, sta);
    const isStart = sta === 0;
    const isFinal = idx === stations.length - 1 && sta > 0;
    return {
      id: `geom-${ruas.id}-${sta}`,
      staMeters: sta,
      staText: formatSTA(sta),
      lat,
      lng,
      altitude: 18,
      accuracy: 5,
      speedKmh: 0,
      timestamp: fallbackDate,
      category: isStart ? 'start' : isFinal ? 'final_sta' : 'checkpoint_100m',
      source: 'manual',
    };
  });

  return {
    ruas,
    points: generatedPoints,
    checkpoints: generatedPoints,
    isRecordedSurveyTrack: false,
    totalTrackedMeters: endMeters,
    endStaMeters: endMeters,
    endStaText: formatSTA(endMeters),
  };
}

/**
 * Ekspor hasil GPS Tracker ruas jalan ke file Excel (.xlsx)
 * Mencakup Ringkasan Ruas, Titik per 100m + STA Akhir (non-kelipatan 100 didukung), dan Detail Jalur GPS Lengkap.
 */
export function exportGpsTracksToExcel(
  ruasItems: RuasJalan[],
  singleRuas?: RuasJalan
): { exportedCount: number; totalPoints: number } {
  const targets = singleRuas ? [singleRuas] : ruasItems;
  const tracks = targets.map((r) => buildEffectiveRuasGpsTrack(r));

  const wb = XLSX.utils.book_new();

  // Sheet 1: Ringkasan Tracking GPS per Ruas
  const summaryRows = tracks.map((t) => {
    const isMultipleOf100 = t.endStaMeters % 100 === 0;
    return {
      Nomor_Ruas: t.ruas.nomorRuas,
      Nama_Ruas: t.ruas.namaRuas,
      Wilayah_Pulau: t.ruas.kecamatanPulau,
      Panjang_Ruas_km: Number((t.endStaMeters / 1000).toFixed(3)),
      STA_Awal: formatSTA(0),
      STA_Akhir: t.endStaText,
      STA_Akhir_Meter: t.endStaMeters,
      Tipe_STA_Akhir: isMultipleOf100 ? 'Kelipatan 100m' : 'Non-Kelipatan 100m',
      Total_Titik_Jalur_GPS: t.points.length,
      Jumlah_Checkpoint_100m_dan_Akhir: t.checkpoints.length,
      Jarak_Lintasan_GPS_Meter: t.totalTrackedMeters,
      Status_Tracker: t.isRecordedSurveyTrack
        ? 'Hasil Tracking Survei'
        : 'Geometri Ruas (Belum Ditrack)',
      Tanggal_Tracker: t.ruas.lastGpsTrackDate
        ? new Date(t.ruas.lastGpsTrackDate).toLocaleString('id-ID')
        : t.ruas.lastSurveyDate,
    };
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 12 },
    { wch: 34 },
    { wch: 26 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 26 },
    { wch: 22 },
    { wch: 28 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan_Tracker_GPS');

  // Sheet 2: Titik Checkpoint per 100m & STA Akhir
  const checkpointRows = tracks.flatMap((t) =>
    t.checkpoints.map((pt, idx) => ({
      No: idx + 1,
      Nomor_Ruas: t.ruas.nomorRuas,
      Nama_Ruas: t.ruas.namaRuas,
      STA: pt.staText,
      STA_Meter: pt.staMeters,
      Jenis_Titik: getCategoryLabel(pt.category),
      Latitude: Number(pt.lat.toFixed(6)),
      Longitude: Number(pt.lng.toFixed(6)),
      Elevasi_m: typeof pt.altitude === 'number' ? Number(pt.altitude.toFixed(1)) : 0,
      Akurasi_GPS_m: typeof pt.accuracy === 'number' ? Number(pt.accuracy.toFixed(1)) : 0,
      Kecepatan_Kmh: typeof pt.speedKmh === 'number' ? Number(pt.speedKmh.toFixed(1)) : 0,
      Sumber_Data: getSourceLabel(pt.source, t.isRecordedSurveyTrack),
      Waktu_GPS: pt.timestamp ? new Date(pt.timestamp).toLocaleString('id-ID') : '',
    }))
  );

  const wsCheckpoints = XLSX.utils.json_to_sheet(checkpointRows);
  wsCheckpoints['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 11 },
    { wch: 14 },
    { wch: 15 },
    { wch: 24 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCheckpoints, 'Titik_100m_STA_Akhir');

  // Sheet 3: Detail Jalur GPS Lengkap (semua vertex rute + 100m + STA Akhir)
  const fullTrackRows = tracks.flatMap((t) =>
    t.points.map((pt, idx) => ({
      Urutan: idx + 1,
      Nomor_Ruas: t.ruas.nomorRuas,
      Nama_Ruas: t.ruas.namaRuas,
      STA: pt.staText,
      STA_Meter: pt.staMeters,
      Kategori: getCategoryLabel(pt.category),
      Latitude: Number(pt.lat.toFixed(6)),
      Longitude: Number(pt.lng.toFixed(6)),
      Elevasi_m: typeof pt.altitude === 'number' ? Number(pt.altitude.toFixed(1)) : 0,
      Akurasi_m: typeof pt.accuracy === 'number' ? Number(pt.accuracy.toFixed(1)) : 0,
      Kecepatan_Kmh: typeof pt.speedKmh === 'number' ? Number(pt.speedKmh.toFixed(1)) : 0,
      Sumber: getSourceLabel(pt.source, t.isRecordedSurveyTrack),
      Waktu_ISO: pt.timestamp,
    }))
  );

  const wsFull = XLSX.utils.json_to_sheet(fullTrackRows);
  wsFull['!cols'] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 11 },
    { wch: 11 },
    { wch: 15 },
    { wch: 24 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFull, 'Detail_Jalur_GPS');

  const dateTag = new Date().toISOString().split('T')[0];
  const fileName = singleRuas
    ? `Tracker_GPS_Ruas_${sanitizeFileSegment(singleRuas.nomorRuas)}_${sanitizeFileSegment(singleRuas.namaRuas)}_${dateTag}.xlsx`
    : `Tracker_GPS_Jalan_Mentawai_${dateTag}.xlsx`;

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const excelBlob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(excelBlob, fileName);

  return {
    exportedCount: tracks.length,
    totalPoints: fullTrackRows.length,
  };
}

/**
 * Menghasilkan dokumen XML KML lengkap berisi jalur polyline hasil GPS tracking
 * dan Placemark titik tiap 100m + STA Akhir (mendukung non-kelipatan 100m).
 */
export function generateGpsTracksKML(
  ruasItems: RuasJalan[],
  singleRuas?: RuasJalan
): string {
  const targets = singleRuas ? [singleRuas] : ruasItems;
  const tracks = targets.map((r) => buildEffectiveRuasGpsTrack(r));

  const docTitle = singleRuas
    ? `Tracker GPS Ruas ${singleRuas.nomorRuas} - ${singleRuas.namaRuas}`
    : 'Tracker GPS Jalur Survei Jalan Kab. Kepulauan Mentawai';

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docTitle)}</name>
    <description>Hasil tracking jalur GPS survei jalan DPUPR Kabupaten Kepulauan Mentawai (interval 100m + STA Akhir).</description>

    <Style id="gpsTrackRoute">
      <LineStyle>
        <color>ffffd406</color>
        <width>5</width>
      </LineStyle>
    </Style>
    <Style id="gpsStartPin">
      <IconStyle>
        <color>ff55c522</color>
        <scale>1.1</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="gps100mPin">
      <IconStyle>
        <color>fff8bd38</color>
        <scale>0.9</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/ltblu-circle.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="gpsFinalPin">
      <IconStyle>
        <color>ff4444ef</color>
        <scale>1.15</scale>
        <Icon><href>https://maps.google.com/mapfiles/kml/paddle/red-stars.png</href></Icon>
      </IconStyle>
    </Style>
`;

  tracks.forEach((t) => {
    const lineCoords = t.points
      .map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)},${(pt.altitude || 0).toFixed(1)}`)
      .join(' ');

    kml += `
    <Folder>
      <name>${escapeXml(`Ruas ${t.ruas.nomorRuas} - ${t.ruas.namaRuas}`)}</name>
      <Placemark>
        <name>${escapeXml(`Jalur Tracker GPS - Ruas ${t.ruas.nomorRuas}`)}</name>
        <description><![CDATA[
          <b>Ruas:</b> ${escapeXml(t.ruas.nomorRuas)} - ${escapeXml(t.ruas.namaRuas)}<br/>
          <b>Wilayah:</b> ${escapeXml(t.ruas.kecamatanPulau)}<br/>
          <b>STA Awal:</b> ${formatSTA(0)}<br/>
          <b>STA Akhir:</b> ${escapeXml(t.endStaText)} (${t.endStaMeters} m)<br/>
          <b>Total Titik Jalur GPS:</b> ${t.points.length} titik (${t.checkpoints.length} titik 100m/Akhir)<br/>
          <b>Status:</b> ${t.isRecordedSurveyTrack ? 'Hasil Tracking Survei GPS' : 'Geometri Ruas'}
        ]]></description>
        <styleUrl>#gpsTrackRoute</styleUrl>
        <ExtendedData>
          <Data name="NomorRuas"><value>${escapeXml(t.ruas.nomorRuas)}</value></Data>
          <Data name="NamaRuas"><value>${escapeXml(t.ruas.namaRuas)}</value></Data>
          <Data name="STAAkhir"><value>${escapeXml(t.endStaText)}</value></Data>
          <Data name="STAAkhirMeter"><value>${t.endStaMeters}</value></Data>
          <Data name="TotalTitik"><value>${t.points.length}</value></Data>
        </ExtendedData>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${lineCoords}</coordinates>
        </LineString>
      </Placemark>
`;

    t.checkpoints.forEach((pt) => {
      const styleId =
        pt.category === 'start'
          ? 'gpsStartPin'
          : pt.category === 'final_sta'
            ? 'gpsFinalPin'
            : 'gps100mPin';
      kml += `
      <Placemark>
        <name>${escapeXml(`${t.ruas.nomorRuas} | ${pt.staText}`)}</name>
        <description><![CDATA[
          <b>Ruas:</b> ${escapeXml(t.ruas.nomorRuas)} - ${escapeXml(t.ruas.namaRuas)}<br/>
          <b>STA:</b> ${escapeXml(pt.staText)} (${pt.staMeters} m)<br/>
          <b>Kategori:</b> ${escapeXml(getCategoryLabel(pt.category))}<br/>
          <b>Koordinat:</b> ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}<br/>
          <b>Akurasi GPS:</b> ±${(pt.accuracy ?? 0).toFixed(1)} m<br/>
          <b>Kecepatan:</b> ${(pt.speedKmh ?? 0).toFixed(1)} km/jam<br/>
          <b>Sumber:</b> ${escapeXml(getSourceLabel(pt.source, t.isRecordedSurveyTrack))}<br/>
          <b>Waktu:</b> ${pt.timestamp ? escapeXml(new Date(pt.timestamp).toLocaleString('id-ID')) : '-'}
        ]]></description>
        <styleUrl>#${styleId}</styleUrl>
        <ExtendedData>
          <Data name="NomorRuas"><value>${escapeXml(t.ruas.nomorRuas)}</value></Data>
          <Data name="STA"><value>${escapeXml(pt.staText)}</value></Data>
          <Data name="STAMeter"><value>${pt.staMeters}</value></Data>
          <Data name="Kategori"><value>${escapeXml(getCategoryLabel(pt.category))}</value></Data>
          <Data name="KecepatanKmh"><value>${(pt.speedKmh ?? 0).toFixed(1)}</value></Data>
          <Data name="AkurasiM"><value>${(pt.accuracy ?? 0).toFixed(1)}</value></Data>
        </ExtendedData>
        <Point>
          <coordinates>${pt.lng.toFixed(6)},${pt.lat.toFixed(6)},${(pt.altitude || 0).toFixed(1)}</coordinates>
        </Point>
      </Placemark>`;
    });

    kml += `
    </Folder>`;
  });

  kml += `
  </Document>
</kml>`;

  return kml;
}

/**
 * Ekspor jalur GPS Tracker ke file *.KML
 */
export function exportGpsTracksToKML(ruasItems: RuasJalan[], singleRuas?: RuasJalan) {
  const kml = generateGpsTracksKML(ruasItems, singleRuas);
  const dateTag = new Date().toISOString().split('T')[0];
  const fileName = singleRuas
    ? `Tracker_GPS_Ruas_${sanitizeFileSegment(singleRuas.nomorRuas)}_${sanitizeFileSegment(singleRuas.namaRuas)}_${dateTag}.kml`
    : `Tracker_GPS_Jalan_Mentawai_${dateTag}.kml`;

  downloadFile(kml, fileName, 'application/vnd.google-earth.kml+xml');
}

/**
 * Ekspor jalur GPS Tracker ke file *.KMZ (arsip ZIP berisi doc.kml)
 */
export async function exportGpsTracksToKMZ(ruasItems: RuasJalan[], singleRuas?: RuasJalan) {
  const kml = generateGpsTracksKML(ruasItems, singleRuas);
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const dateTag = new Date().toISOString().split('T')[0];
  const fileName = singleRuas
    ? `Tracker_GPS_Ruas_${sanitizeFileSegment(singleRuas.nomorRuas)}_${sanitizeFileSegment(singleRuas.namaRuas)}_${dateTag}.kmz`
    : `Tracker_GPS_Jalan_Mentawai_${dateTag}.kmz`;

  triggerBlobDownload(blob, fileName);
}
