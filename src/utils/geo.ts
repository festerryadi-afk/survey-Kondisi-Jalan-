import { RuasJalan, SurveyPhoto } from '../types';
import { formatMeterToSTA, getRuasSTASegments } from './pkrms';
import { triggerBlobDownload } from './nativeDownload';

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculate distance between two GPS coordinates in meters using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format meter offset to standard Indonesian Road STA notation
 * e.g. 0 -> "STA 00+000"
 * e.g. 1250 -> "STA 01+250"
 * e.g. 14820 -> "STA 14+820"
 */
export function formatSTA(meters: number): string {
  const km = Math.floor(meters / 1000);
  const m = Math.floor(meters % 1000);
  const kmStr = km.toString().padStart(2, '0');
  const mStr = m.toString().padStart(3, '0');
  return `STA ${kmStr}+${mStr}`;
}

/**
 * Mengambil nilai STA numerik (meter) secara aman dari objek SurveyPhoto
 */
export function getPhotoStaMeters(photo: Pick<SurveyPhoto, 'sta' | 'staText'>): number {
  if (typeof photo.sta === 'number' && Number.isFinite(photo.sta)) {
    return photo.sta;
  }
  const match = String(photo.staText || '').match(/(\d+)\s*\+\s*(\d+)/);
  if (match) {
    return Number(match[1]) * 1000 + Number(match[2]);
  }
  return 0;
}

/**
 * Komparator urutan foto dari STA terendah ke STA tertinggi
 */
export function comparePhotosByStaAsc(a: SurveyPhoto, b: SurveyPhoto): number {
  const staDiff = getPhotoStaMeters(a) - getPhotoStaMeters(b);
  if (staDiff !== 0) return staDiff;

  const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
  const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
  const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
  const safeTimeB = Number.isFinite(timeB) ? timeB : 0;
  if (safeTimeA !== safeTimeB) return safeTimeA - safeTimeB;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Mengurutkan daftar foto berdasarkan Nomor Ruas lalu STA terendah ke tertinggi
 */
export function sortPhotosByRuasAndSta(photos: SurveyPhoto[]): SurveyPhoto[] {
  return [...photos].sort((a, b) => {
    if (a.ruasId !== b.ruasId) {
      const numCmp = String(a.nomorRuas || '').localeCompare(String(b.nomorRuas || ''), 'id', {
        numeric: true,
      });
      if (numCmp !== 0) return numCmp;
      return String(a.ruasId || '').localeCompare(String(b.ruasId || ''));
    }
    return comparePhotosByStaAsc(a, b);
  });
}

/**
 * Menghasilkan daftar titik STA (meter) setiap 100m dimulai dari STA Awal (0) sampai STA Akhir ruas jalan
 */
export function buildRuasStaPhotoStations(ruas: Pick<RuasJalan, 'panjangKm'>): number[] {
  const endStaMeters = Math.max(0, Math.round((ruas.panjangKm || 0) * 1000));
  const stations: number[] = [];
  for (let sta = 0; sta < endStaMeters; sta += 100) {
    stations.push(sta);
  }
  stations.push(endStaMeters);
  return stations;
}

/**
 * Mengembalikan daftar titik koordinat rute ruas jalan yang valid,
 * dimulai dari koordinatAwal dan mengikuti seluruh titik rute pada peta.
 */
export function getRuasRoutePoints(
  ruas: Pick<RuasJalan, 'koordinatAwal' | 'koordinatAkhir' | 'points'>
): [number, number][] {
  const validPoints = Array.isArray(ruas.points)
    ? ruas.points.filter(
        (pt): pt is [number, number] =>
          Array.isArray(pt) &&
          pt.length >= 2 &&
          Number.isFinite(pt[0]) &&
          Number.isFinite(pt[1])
      )
    : [];

  const hasValidStart =
    Array.isArray(ruas.koordinatAwal) &&
    ruas.koordinatAwal.length >= 2 &&
    Number.isFinite(ruas.koordinatAwal[0]) &&
    Number.isFinite(ruas.koordinatAwal[1]);

  const hasValidEnd =
    Array.isArray(ruas.koordinatAkhir) &&
    ruas.koordinatAkhir.length >= 2 &&
    Number.isFinite(ruas.koordinatAkhir[0]) &&
    Number.isFinite(ruas.koordinatAkhir[1]);

  if (validPoints.length >= 2) {
    if (
      hasValidStart &&
      calculateDistanceMeters(
        ruas.koordinatAwal[0],
        ruas.koordinatAwal[1],
        validPoints[0][0],
        validPoints[0][1]
      ) > 1
    ) {
      return [[ruas.koordinatAwal[0], ruas.koordinatAwal[1]], ...validPoints];
    }
    return validPoints;
  }

  if (hasValidStart && hasValidEnd) {
    return [
      [ruas.koordinatAwal[0], ruas.koordinatAwal[1]],
      [ruas.koordinatAkhir[0], ruas.koordinatAkhir[1]],
    ];
  }

  if (validPoints.length === 1) {
    return [validPoints[0], validPoints[0]];
  }

  if (hasValidStart) {
    return [
      [ruas.koordinatAwal[0], ruas.koordinatAwal[1]],
      [ruas.koordinatAwal[0], ruas.koordinatAwal[1]],
    ];
  }

  return [
    [-2.0234, 99.5912],
    [-2.0234, 99.5912],
  ];
}

/**
 * Menghitung koordinat [lat, lng] secara otomatis pada jarak STA tertentu (meter)
 * berdasarkan koordinat awal dan rute polyline ruas jalan di peta.
 */
export function interpolateCoordAlongRuas(
  ruas: Pick<RuasJalan, 'koordinatAwal' | 'koordinatAkhir' | 'points' | 'panjangKm'>,
  staMeters: number
): [number, number] {
  const routePts = getRuasRoutePoints(ruas);
  const startPt = routePts[0];

  if (staMeters <= 0 || routePts.length < 2) {
    return [Number(startPt[0].toFixed(6)), Number(startPt[1].toFixed(6))];
  }

  const cumDist: number[] = [0];
  for (let i = 1; i < routePts.length; i++) {
    const segLen = calculateDistanceMeters(
      routePts[i - 1][0],
      routePts[i - 1][1],
      routePts[i][0],
      routePts[i][1]
    );
    cumDist.push(cumDist[i - 1] + segLen);
  }

  const totalPolylineMeters = cumDist[cumDist.length - 1];
  if (totalPolylineMeters <= 0) {
    return [Number(startPt[0].toFixed(6)), Number(startPt[1].toFixed(6))];
  }

  const declaredTotalMeters =
    Number.isFinite(ruas.panjangKm) && ruas.panjangKm > 0
      ? ruas.panjangKm * 1000
      : totalPolylineMeters;

  const clampedSta = Math.max(0, Math.min(staMeters, declaredTotalMeters));
  const targetDist = (clampedSta / declaredTotalMeters) * totalPolylineMeters;

  if (targetDist <= 0) {
    return [Number(startPt[0].toFixed(6)), Number(startPt[1].toFixed(6))];
  }

  const endPt = routePts[routePts.length - 1];
  if (targetDist >= totalPolylineMeters) {
    return [Number(endPt[0].toFixed(6)), Number(endPt[1].toFixed(6))];
  }

  for (let i = 1; i < routePts.length; i++) {
    if (cumDist[i] >= targetDist) {
      const prevDist = cumDist[i - 1];
      const segLen = cumDist[i] - prevDist;
      const frac = segLen > 0 ? (targetDist - prevDist) / segLen : 0;
      const p1 = routePts[i - 1];
      const p2 = routePts[i];
      return [
        Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(6)),
        Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(6)),
      ];
    }
  }

  return [Number(endPt[0].toFixed(6)), Number(endPt[1].toFixed(6))];
}

/**
 * Memotong polyline rute ruas jalan berdasarkan rasio jarak tempuh riil (0..1)
 * agar segmen STA di peta selaras dengan interpolasi koordinat per 100 meter.
 */
export function slicePolylineByDistanceRatio(
  pts: [number, number][],
  startRatio: number,
  endRatio: number
): [number, number][] {
  if (pts.length < 2) return pts;

  const cumDist: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cumDist.push(
      cumDist[i - 1] + calculateDistanceMeters(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
    );
  }

  const totalDist = cumDist[cumDist.length - 1];
  if (totalDist <= 0) return pts;

  const interpolateAtRatio = (r: number): [number, number] => {
    const clamped = Math.max(0, Math.min(1, r));
    const targetDist = clamped * totalDist;
    if (targetDist <= 0) return pts[0];
    if (targetDist >= totalDist) return pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (cumDist[i] >= targetDist) {
        const segLen = cumDist[i] - cumDist[i - 1];
        const frac = segLen > 0 ? (targetDist - cumDist[i - 1]) / segLen : 0;
        const p1 = pts[i - 1];
        const p2 = pts[i];
        return [p1[0] + (p2[0] - p1[0]) * frac, p1[1] + (p2[1] - p1[1]) * frac];
      }
    }
    return pts[pts.length - 1];
  };

  const sliced: [number, number][] = [interpolateAtRatio(startRatio)];
  for (let i = 1; i < pts.length - 1; i++) {
    const nodeRatio = cumDist[i] / totalDist;
    if (nodeRatio > startRatio && nodeRatio < endRatio) {
      sliced.push(pts[i]);
    }
  }
  sliced.push(interpolateAtRatio(endRatio));
  return sliced;
}

/**
 * Watermark Geotagging Resmi:
 * Hanya menuliskan Nomor Ruas, Nama Ruas Jalan, Koordinat, dan STA.
 * Diletakkan di bagian kiri bawah, frame tulisan tidak digunakan.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  metadata: {
    nomorRuas: string;
    namaRuas: string;
    staText: string;
    lat: number;
    lng: number;
  },
  options?: { fastNoBlur?: boolean }
) {
  const baseFontSize = Math.max(14, Math.round(width * 0.022));
  const paddingX = Math.max(16, Math.round(width * 0.025));
  const paddingBottom = Math.max(20, Math.round(height * 0.035));

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // High contrast drop shadow & stroke so text is razor-sharp on any surface without a background frame
  if (!options?.fastNoBlur) {
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = options?.fastNoBlur ? 4 : 3.5;
  ctx.fillStyle = '#FFFFFF';

  // Line 2 (bottom): Koordinat & STA
  const line2Y = height - paddingBottom;
  ctx.font = `600 ${baseFontSize}px 'Inter', sans-serif, Arial`;
  const line2Text = `Koordinat: ${metadata.lat.toFixed(6)}°, ${metadata.lng.toFixed(6)}°  |  ${metadata.staText}`;
  ctx.strokeText(line2Text, paddingX, line2Y);
  ctx.fillText(line2Text, paddingX, line2Y);

  // Line 1 (above line 2): Nomor Ruas & Nama Ruas Jalan
  const line1Y = line2Y - (baseFontSize * 1.35);
  ctx.font = `bold ${baseFontSize + 2}px 'Inter', sans-serif, Arial`;
  const line1Text = `Ruas ${metadata.nomorRuas} - ${metadata.namaRuas}`;
  ctx.strokeText(line1Text, paddingX, line1Y);
  ctx.fillText(line1Text, paddingX, line1Y);

  ctx.restore();
}

/**
 * Generate standard KML (Keyhole Markup Language) file for Google Earth, QGIS, ArcGIS
 */
export function generateKML(ruasList: RuasJalan[], photos: SurveyPhoto[]): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Survei Kondisi Jalan Kab. Kepulauan Mentawai</name>
    <description>Hasil survei kondisi jalan otomatis DPUPR Kabupaten Kepulauan Mentawai.</description>
    
    <!-- Styles for Road Condition Lines -->
    <Style id="roadBaik">
      <LineStyle><color>ff00b910</color><width>5</width></LineStyle>
    </Style>
    <Style id="roadSedang">
      <LineStyle><color>ff0b9ef5</color><width>5</width></LineStyle>
    </Style>
    <Style id="roadRusakRingan">
      <LineStyle><color>ff1673f9</color><width>5</width></LineStyle>
    </Style>
    <Style id="roadRusakBerat">
      <LineStyle><color>ff4444ef</color><width>5</width></LineStyle>
    </Style>

    <!-- Folder: Ruas Jalan Mentawai (Polylines) -->
    <Folder>
      <name>Jaringan Ruas Jalan</name>
`;

  ruasList.forEach((ruas) => {
    const segments = getRuasSTASegments(ruas);
    const primaryCondition = segments[0]?.kondisiJalan || ruas.kondisiPKRMS;
    let styleId = 'roadBaik';
    if (primaryCondition === 'Sedang') styleId = 'roadSedang';
    if (primaryCondition === 'Rusak Ringan') styleId = 'roadRusakRingan';
    if (primaryCondition === 'Rusak Berat') styleId = 'roadRusakBerat';

    const coordsStr = ruas.points
      .map(([lat, lng]) => `${lng},${lat},0`)
      .join(' ');

    const staDetailsHtml =
      segments.length > 0
        ? segments
            .map(
              (s) =>
                `• ${formatMeterToSTA(s.startSta)} - ${formatMeterToSTA(s.endSta)}: ${s.tipePermukaan} (${s.kondisiJalan})`
            )
            .join('<br/>')
        : 'Belum ada segmen STA yang diatur';

    kml += `
      <Placemark>
        <name>${escapeXml(ruas.nomorRuas)} - ${escapeXml(ruas.namaRuas)}</name>
        <description><![CDATA[
          <b>Ruas:</b> ${ruas.nomorRuas} - ${ruas.namaRuas}<br/>
          <b>Wilayah:</b> ${ruas.kecamatanPulau}<br/>
          <b>Panjang:</b> ${ruas.panjangKm} km | <b>Lebar:</b> ${ruas.lebarMeter} m<br/>
          <b>Tipe Permukaan &amp; Kondisi Jalan per STA:</b><br/>
          ${staDetailsHtml}
        ]]></description>
        <styleUrl>#${styleId}</styleUrl>
        <LineString>
          <extrude>1</extrude>
          <tessellate>1</tessellate>
          <coordinates>${coordsStr}</coordinates>
        </LineString>
      </Placemark>`;
  });

  kml += `
    </Folder>
`;

  const trackedRoads = ruasList.filter((r) => Array.isArray(r.gpsTrack) && r.gpsTrack.length > 0);
  if (trackedRoads.length > 0) {
    kml += `
    <!-- Folder: Jalur Tracker GPS Survei (100m + STA Akhir) -->
    <Folder>
      <name>Jalur Tracker GPS Survei</name>`;
    trackedRoads.forEach((ruas) => {
      const sortedTrack = [...(ruas.gpsTrack || [])].sort((a, b) => a.staMeters - b.staMeters);
      const trackCoords = sortedTrack
        .map((pt) => `${pt.lng},${pt.lat},${pt.altitude || 0}`)
        .join(' ');
      const endStaText = sortedTrack[sortedTrack.length - 1]?.staText || formatSTA(Math.round(ruas.panjangKm * 1000));
      kml += `
      <Placemark>
        <name>${escapeXml(`Tracker GPS ${ruas.nomorRuas} - ${ruas.namaRuas}`)}</name>
        <description><![CDATA[Jalur GPS Tracker (${sortedTrack.length} titik, STA Akhir: ${escapeXml(endStaText)})]]></description>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${trackCoords}</coordinates>
        </LineString>
      </Placemark>`;
    });
    kml += `
    </Folder>`;
  }

  kml += `

    <!-- Folder: Titik Foto Survei & Deteksi Cacat (Points) -->
    <Folder>
      <name>Dokumentasi Geotagging &amp; Titik Cacat Jalan</name>
`;

  sortPhotosByRuasAndSta(photos).forEach((photo) => {
    const defectsList = photo.defects
      .map((d) => `<li>${d.type} (${d.severity}) - Keyakinan: ${(d.confidence * 100).toFixed(0)}%</li>`)
      .join('');

    kml += `
      <Placemark>
        <name>${photo.nomorRuas} - ${photo.staText}</name>
        <description><![CDATA[
          <div style="font-family: Arial, sans-serif; max-width: 320px;">
            <h4 style="margin: 0 0 6px; color: #1e3a8a;">${photo.nomorRuas} - ${photo.ruasNama}</h4>
            <p><b>STA:</b> ${photo.staText}</p>
            <p><b>Waktu:</b> ${new Date(photo.timestamp).toLocaleString('id-ID')}</p>
            <p><b>Koordinat:</b> ${photo.coordinates.lat.toFixed(6)}, ${photo.coordinates.lng.toFixed(6)}</p>
            <p><b>Kondisi PKRMS:</b> <b>${photo.pkrmsCondition}</b></p>
            <p><b>Rekomendasi:</b> ${photo.recommendation}</p>
            <p><b>Hasil Deteksi AI:</b></p>
            <ul>${defectsList || '<li>Tidak terdeteksi kerusakan signifikan</li>'}</ul>
            <p><b>Verifikasi SHA-256:</b> <code>${photo.hashSha256.substring(0, 16)}...</code></p>
          </div>
        ]]></description>
        <ExtendedData>
          <Data name="RuasID"><value>${photo.ruasId}</value></Data>
          <Data name="NomorRuas"><value>${photo.nomorRuas}</value></Data>
          <Data name="NamaRuas"><value>${photo.ruasNama}</value></Data>
          <Data name="STA"><value>${photo.staText}</value></Data>
          <Data name="KondisiPKRMS"><value>${photo.pkrmsCondition}</value></Data>
          <Data name="Rekomendasi"><value>${photo.recommendation}</value></Data>
          <Data name="SHA256"><value>${photo.hashSha256}</value></Data>
        </ExtendedData>
        <Point>
          <coordinates>${photo.coordinates.lng},${photo.coordinates.lat},${photo.coordinates.altitude || 0}</coordinates>
        </Point>
      </Placemark>`;
  });

  kml += `
    </Folder>
  </Document>
</kml>`;

  return kml;
}

/**
 * Generate CSV export
 */
export function generateCSV(photos: SurveyPhoto[]): string {
  const headers = [
    'ID_Foto',
    'Nomor_Ruas',
    'Nama_Ruas',
    'STA',
    'STA_Meter',
    'Latitude',
    'Longitude',
    'Elevasi_m',
    'Akurasi_m',
    'Waktu_Survei',
    'Jenis_Permukaan',
    'Kondisi_PKRMS_2026',
    'Rekomendasi_Penanganan',
    'Jumlah_Cacat',
    'Rincian_Cacat',
    'Kecepatan_Kmh',
    'Status_Sinkron',
    'Hash_SHA256'
  ];

  const rows = sortPhotosByRuasAndSta(photos).map((p) => {
    const defectDetails = p.defects.map(d => `${d.type}[${d.severity}]`).join('; ');
    return [
      `"${p.id}"`,
      `"${p.nomorRuas}"`,
      `"${p.ruasNama.replace(/"/g, '""')}"`,
      `"${p.staText}"`,
      p.sta,
      p.coordinates.lat.toFixed(6),
      p.coordinates.lng.toFixed(6),
      (p.coordinates.altitude || 0).toFixed(1),
      (p.coordinates.accuracy || 0).toFixed(1),
      `"${new Date(p.timestamp).toLocaleString('id-ID')}"`,
      `"${p.surfaceType}"`,
      `"${p.pkrmsCondition}"`,
      `"${p.recommendation}"`,
      p.defects.length,
      `"${defectDetails.replace(/"/g, '""')}"`,
      p.speedKmh || 0,
      `"${p.syncStatus}"`,
      `"${p.hashSha256}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate Excel-compatible XML Spreadsheet (.xls)
 */
export function generateExcelXML(ruasList: RuasJalan[], photos: SurveyPhoto[]): string {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="14" ss:Color="#1E3A8A" ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Ringkasan Ruas Jalan">
  <Table>
   <Row>
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">LAPORAN SURVEI KONDISI JALAN - DPUPR KAB. KEPULAUAN MENTAWAI</Data></Cell>
   </Row>
   <Row><Cell><Data ss:Type="String"></Data></Cell></Row>
   <Row>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No. Ruas</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Ruas</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Wilayah / Pulau</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Panjang (km)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Lebar (m)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Jumlah Segmen STA</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Permukaan &amp; Kondisi per STA</Data></Cell>
   </Row>
   ${ruasList.map(r => {
     const segments = getRuasSTASegments(r);
     const summaryText =
       segments.length > 0
         ? segments
             .map(
               (s) =>
                 `${formatMeterToSTA(s.startSta)} - ${formatMeterToSTA(s.endSta)}: ${s.tipePermukaan} (${s.kondisiJalan})`
             )
             .join('; ')
         : 'Belum diatur per STA';
     return `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(r.nomorRuas)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.namaRuas)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.kecamatanPulau)}</Data></Cell>
    <Cell><Data ss:Type="Number">${r.panjangKm}</Data></Cell>
    <Cell><Data ss:Type="Number">${r.lebarMeter}</Data></Cell>
    <Cell><Data ss:Type="Number">${segments.length}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(summaryText)}</Data></Cell>
   </Row>`;
   }).join('')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Segmen per STA">
  <Table>
   <Row>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No. Ruas</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Ruas</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Wilayah / Pulau</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">STA Mulai</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">STA Akhir</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Panjang Segmen (km)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Tipe Permukaan Jalan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Kondisi Jalan</Data></Cell>
   </Row>
   ${ruasList.flatMap(r =>
     getRuasSTASegments(r).map(seg => `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(r.nomorRuas)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.namaRuas)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.kecamatanPulau)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(formatMeterToSTA(seg.startSta))}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(formatMeterToSTA(seg.endSta))}</Data></Cell>
    <Cell><Data ss:Type="Number">${Number(((seg.endSta - seg.startSta) / 1000).toFixed(2))}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(seg.tipePermukaan)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(seg.kondisiJalan)}</Data></Cell>
   </Row>`)
   ).join('')}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Detail Titik Survei 100m">
  <Table>
   <Row>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Ruas</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">STA</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Latitude</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Longitude</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Kondisi PKRMS</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Cacat Terdeteksi</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Rekomendasi</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Waktu Pengambilan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Hash Verifikasi</Data></Cell>
   </Row>
   ${sortPhotosByRuasAndSta(photos).map(p => `
   <Row>
    <Cell><Data ss:Type="String">${p.nomorRuas} - ${p.ruasNama}</Data></Cell>
    <Cell><Data ss:Type="String">${p.staText}</Data></Cell>
    <Cell><Data ss:Type="Number">${p.coordinates.lat}</Data></Cell>
    <Cell><Data ss:Type="Number">${p.coordinates.lng}</Data></Cell>
    <Cell><Data ss:Type="String">${p.pkrmsCondition}</Data></Cell>
    <Cell><Data ss:Type="String">${p.defects.map(d => `${d.type}(${d.severity})`).join(', ') || 'Nihil'}</Data></Cell>
    <Cell><Data ss:Type="String">${p.recommendation}</Data></Cell>
    <Cell><Data ss:Type="String">${new Date(p.timestamp).toLocaleString('id-ID')}</Data></Cell>
    <Cell><Data ss:Type="String">${p.hashSha256.substring(0, 20)}</Data></Cell>
   </Row>`).join('')}
  </Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
}
