import { RuasJalan, SurveyPhoto, SurveyVideo, NotificationPush } from '../types';

export const INITIAL_MENTAWAI_ROADS: RuasJalan[] = [
  {
    id: 'ruas-01',
    nomorRuas: '001',
    namaRuas: 'Tuapejat - Rokot (Bandara)',
    kecamatanPulau: 'Sipora Utara, Kab. Kep. Mentawai',
    panjangKm: 24.5,
    lebarMeter: 6.0,
    staSegments: [
      { id: 'sta-01-1', startSta: 0, endSta: 10000, tipePermukaan: 'Aspal (AC-WC/HRS)', kondisiJalan: 'Baik' },
      { id: 'sta-01-2', startSta: 10000, endSta: 18500, tipePermukaan: 'Aspal (AC-WC/HRS)', kondisiJalan: 'Sedang' },
      { id: 'sta-01-3', startSta: 18500, endSta: 24500, tipePermukaan: 'Penetrasi Macadam (Lapen)', kondisiJalan: 'Rusak Ringan' },
    ],
    tipePermukaan: 'Aspal (AC-WC/HRS)',
    kondisiPKRMS: 'Sedang',
    iriAvg: 5.4,
    sdiScore: 68,
    lastSurveyDate: '2026-10-31',
    koordinatAwal: [-2.0234, 99.5912],
    koordinatAkhir: [-2.1645, 99.6421],
    points: [
      [-2.0234, 99.5912],
      [-2.0450, 99.5980],
      [-2.0720, 99.6080],
      [-2.1050, 99.6190],
      [-2.1380, 99.6320],
      [-2.1645, 99.6421],
    ],
    documentationCount: 8,
    rekomendasiPenanganan: 'Pemeliharaan Berkala',
  },
  {
    id: 'ruas-02',
    nomorRuas: '002',
    namaRuas: 'Rokot - Sioban',
    kecamatanPulau: 'Sipora Selatan, Kab. Kep. Mentawai',
    panjangKm: 18.2,
    lebarMeter: 5.5,
    staSegments: [
      { id: 'sta-02-1', startSta: 0, endSta: 8000, tipePermukaan: 'Aspal (AC-WC/HRS)', kondisiJalan: 'Sedang' },
      { id: 'sta-02-2', startSta: 8000, endSta: 18200, tipePermukaan: 'Penetrasi Macadam (Lapen)', kondisiJalan: 'Rusak Ringan' },
    ],
    tipePermukaan: 'Penetrasi Macadam (Lapen)',
    kondisiPKRMS: 'Rusak Ringan',
    iriAvg: 8.6,
    sdiScore: 112,
    lastSurveyDate: '2026-10-30',
    koordinatAwal: [-2.1645, 99.6421],
    koordinatAkhir: [-2.2850, 99.7120],
    points: [
      [-2.1645, 99.6421],
      [-2.1920, 99.6580],
      [-2.2210, 99.6750],
      [-2.2530, 99.6940],
      [-2.2850, 99.7120],
    ],
    documentationCount: 5,
    rekomendasiPenanganan: 'Rehabilitasi Jalan',
  },
  {
    id: 'ruas-03',
    nomorRuas: '003',
    namaRuas: 'Muara Siberut - Muara Sikabaluan',
    kecamatanPulau: 'Siberut Selatan - Siberut Utara',
    panjangKm: 32.0,
    lebarMeter: 5.0,
    staSegments: [
      { id: 'sta-03-1', startSta: 0, endSta: 6000, tipePermukaan: 'Beton (Rigid)', kondisiJalan: 'Baik' },
      { id: 'sta-03-2', startSta: 6000, endSta: 19000, tipePermukaan: 'Kerikil / Sirtu', kondisiJalan: 'Rusak Ringan' },
      { id: 'sta-03-3', startSta: 19000, endSta: 32000, tipePermukaan: 'Tanah', kondisiJalan: 'Rusak Berat' },
    ],
    tipePermukaan: 'Kerikil / Sirtu',
    kondisiPKRMS: 'Rusak Berat',
    iriAvg: 12.8,
    sdiScore: 165,
    lastSurveyDate: '2026-10-28',
    koordinatAwal: [-1.5830, 99.2150],
    koordinatAkhir: [-1.3250, 99.0450],
    points: [
      [-1.5830, 99.2150],
      [-1.5200, 99.1800],
      [-1.4650, 99.1400],
      [-1.3950, 99.0950],
      [-1.3250, 99.0450],
    ],
    documentationCount: 6,
    rekomendasiPenanganan: 'Rekonstruksi / Peningkatan',
  },
  {
    id: 'ruas-04',
    nomorRuas: '004',
    namaRuas: 'Sikakap - Matobe',
    kecamatanPulau: 'Pagai Utara - Sikakap',
    panjangKm: 14.8,
    lebarMeter: 6.0,
    staSegments: [
      { id: 'sta-04-1', startSta: 0, endSta: 10000, tipePermukaan: 'Beton (Rigid)', kondisiJalan: 'Baik' },
      { id: 'sta-04-2', startSta: 10000, endSta: 14800, tipePermukaan: 'Aspal (AC-WC/HRS)', kondisiJalan: 'Sedang' },
    ],
    tipePermukaan: 'Beton (Rigid)',
    kondisiPKRMS: 'Baik',
    iriAvg: 3.4,
    sdiScore: 28,
    lastSurveyDate: '2026-10-29',
    koordinatAwal: [-2.7840, 100.2150],
    koordinatAkhir: [-2.6850, 100.1750],
    points: [
      [-2.7840, 100.2150],
      [-2.7520, 100.2010],
      [-2.7210, 100.1890],
      [-2.6850, 100.1750],
    ],
    documentationCount: 4,
    rekomendasiPenanganan: 'Pemeliharaan Rutin',
  },
  {
    id: 'ruas-05',
    nomorRuas: '005',
    namaRuas: 'Sioban - Nemnemleleu',
    kecamatanPulau: 'Sipora Selatan',
    panjangKm: 12.4,
    lebarMeter: 4.5,
    staSegments: [
      { id: 'sta-05-1', startSta: 0, endSta: 6000, tipePermukaan: 'Penetrasi Macadam (Lapen)', kondisiJalan: 'Sedang' },
      { id: 'sta-05-2', startSta: 6000, endSta: 12400, tipePermukaan: 'Kerikil / Sirtu', kondisiJalan: 'Rusak Ringan' },
    ],
    tipePermukaan: 'Penetrasi Macadam (Lapen)',
    kondisiPKRMS: 'Rusak Ringan',
    iriAvg: 9.1,
    sdiScore: 118,
    lastSurveyDate: '2026-10-25',
    koordinatAwal: [-2.2850, 99.7120],
    koordinatAkhir: [-2.3420, 99.7450],
    points: [
      [-2.2850, 99.7120],
      [-2.3050, 99.7240],
      [-2.3250, 99.7360],
      [-2.3420, 99.7450],
    ],
    documentationCount: 3,
    rekomendasiPenanganan: 'Rehabilitasi Jalan',
  },
  {
    id: 'ruas-06',
    nomorRuas: '006',
    namaRuas: 'Taileleu - Pepei',
    kecamatanPulau: 'Siberut Barat Daya',
    panjangKm: 16.5,
    lebarMeter: 4.0,
    staSegments: [
      { id: 'sta-06-1', startSta: 0, endSta: 5000, tipePermukaan: 'Kerikil / Sirtu', kondisiJalan: 'Rusak Ringan' },
      { id: 'sta-06-2', startSta: 5000, endSta: 16500, tipePermukaan: 'Tanah', kondisiJalan: 'Rusak Berat' },
    ],
    tipePermukaan: 'Tanah',
    kondisiPKRMS: 'Rusak Berat',
    iriAvg: 14.2,
    sdiScore: 178,
    lastSurveyDate: '2026-10-20',
    koordinatAwal: [-1.6240, 99.1120],
    koordinatAkhir: [-1.6980, 99.0420],
    points: [
      [-1.6240, 99.1120],
      [-1.6490, 99.0880],
      [-1.6740, 99.0650],
      [-1.6980, 99.0420],
    ],
    documentationCount: 2,
    rekomendasiPenanganan: 'Rekonstruksi / Peningkatan',
  },
];

// Helper to create HD 3R (8,9 x 12,7 cm) road texture snapshots with defect highlights
export function createRoadSnapshotDataUrl(
  defectType: string,
  severity: string,
  ruasNomor: string,
  ruasNama: string,
  staText: string,
  lat: number,
  lng: number,
  _timestampStr: string
): string {
  const w = 1427;
  const h = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Sky / Horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.28);
  skyGrad.addColorStop(0, '#0369a1');
  skyGrad.addColorStop(1, '#7dd3fc');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.28);

  // Mentawai roadside tropical greenery
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, h * 0.25, w, h * 0.75);

  // Asphalt surface trapezoid
  const roadGrad = ctx.createLinearGradient(0, h * 0.25, 0, h);
  roadGrad.addColorStop(0, '#475569');
  roadGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = roadGrad;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.25);
  ctx.lineTo(w * 0.68, h * 0.25);
  ctx.lineTo(w * 0.96, h);
  ctx.lineTo(w * 0.04, h);
  ctx.closePath();
  ctx.fill();

  // Perspective road edge lines
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.25);
  ctx.lineTo(w * 0.06, h);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w * 0.68, h * 0.25);
  ctx.lineTo(w * 0.94, h);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 7;
  ctx.stroke();

  // Center dashed line
  ctx.setLineDash([44, 34]);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.25);
  ctx.lineTo(w * 0.5, h);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.setLineDash([]);

  // Road defect graphic
  if (defectType.includes('Lubang')) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(w * 0.52, h * 0.55, 130, 78, Math.PI / 14, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = severity === 'Berat' ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // AI Bounding Box
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(w * 0.40, h * 0.43, w * 0.24, h * 0.24);

    // AI Label Tag
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(w * 0.40, h * 0.385, w * 0.24, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px Inter, sans-serif, Arial';
    ctx.fillText(`AI: ${defectType} [${severity}] 94%`, w * 0.408, h * 0.415);
  } else if (defectType.includes('Retak') || defectType.includes('Amblas')) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = severity === 'Berat' ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.40, h * 0.46);
    ctx.lineTo(w * 0.49, h * 0.52);
    ctx.lineTo(w * 0.56, h * 0.48);
    ctx.lineTo(w * 0.62, h * 0.57);
    ctx.lineTo(w * 0.53, h * 0.63);
    ctx.lineTo(w * 0.44, h * 0.59);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(w * 0.37, h * 0.42, w * 0.28, h * 0.25);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(w * 0.37, h * 0.375, w * 0.28, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Inter, sans-serif, Arial';
    ctx.fillText(`AI: ${defectType.split(' ')[0]} [${severity}] 90%`, w * 0.378, h * 0.405);
  } else {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(w * 0.38, h * 0.40, w * 0.24, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px Inter, sans-serif, Arial';
    ctx.fillText('AI: Permukaan Mantap 97%', w * 0.39, h * 0.43);
  }

  // Watermark kiri bawah tanpa frame tulisan
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.fillStyle = '#FFFFFF';

  const line2Y = h - 36;
  ctx.font = '600 28px Inter, sans-serif, Arial';
  const line2 = `Koordinat: ${lat.toFixed(6)}°, ${lng.toFixed(6)}°  |  ${staText}`;
  ctx.strokeText(line2, 34, line2Y);
  ctx.fillText(line2, 34, line2Y);

  const line1Y = line2Y - 40;
  ctx.font = 'bold 33px Inter, sans-serif, Arial';
  const line1 = `Ruas ${ruasNomor} - ${ruasNama}`;
  ctx.strokeText(line1, 34, line1Y);
  ctx.fillText(line1, 34, line1Y);

  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.9);
}

export const INITIAL_SURVEY_PHOTOS: SurveyPhoto[] = [];

export const INITIAL_SURVEY_VIDEOS: SurveyVideo[] = [
  {
    id: 'video-01',
    ruasId: 'ruas-01',
    nomorRuas: '001',
    ruasNama: 'Tuapejat - Rokot (Bandara)',
    startSta: 4000,
    endSta: 5000,
    timestamp: '2026-10-31T09:15:00Z',
    durationSeconds: 98,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    fileSizeBytes: 24800000, // ~24.8 MB
    defectsCount: 4,
    syncStatus: 'synced',
    hashSha256: 'a12bc981240985172498bcae9812749182374619283746bcdae9812740918237',
    thumbnailUrl: createRoadSnapshotDataUrl('Lubang (Pothole)', 'Sedang', '001', 'Tuapejat - Rokot (Bandara)', 'STA 04+000 - 05+000', -2.0450, 99.5980, '2026-10-31T09:15:00Z'),
  },
  {
    id: 'video-02',
    ruasId: 'ruas-02',
    nomorRuas: '002',
    ruasNama: 'Rokot - Sioban',
    startSta: 2000,
    endSta: 3000,
    timestamp: '2026-10-30T14:18:00Z',
    durationSeconds: 112,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    fileSizeBytes: 29400000,
    defectsCount: 7,
    syncStatus: 'synced',
    hashSha256: '9812739481273491827349812734981273491827349182734918273948127349',
    thumbnailUrl: createRoadSnapshotDataUrl('Lubang (Pothole)', 'Berat', '002', 'Rokot - Sioban', 'STA 02+000 - 03+000', -2.1920, 99.6580, '2026-10-30T14:18:00Z'),
  },
];

export const INITIAL_NOTIFICATIONS: NotificationPush[] = [
  {
    id: 'notif-1',
    title: 'Peringatan Cacat Jalan Kritis!',
    message: 'Terdeteksi lubang berat (>20cm, d>5cm) di Ruas 002 (Rokot - Sioban) pada STA 02+100. Rekomendasi: Penanganan darurat patching/rehab.',
    timestamp: '2026-10-31T09:30:00Z',
    type: 'alert',
    read: false,
    ruasId: 'ruas-02',
    sta: 'STA 02+100',
  },
  {
    id: 'notif-2',
    title: 'Tugas Survei Baru: Tuapejat - Rokot',
    message: 'Jadwal survei berkala 100m ruas jalan Tuapejat - Rokot telah dialokasikan untuk Tim 1.',
    timestamp: '2026-10-31T08:00:00Z',
    type: 'task',
    read: false,
    ruasId: 'ruas-01',
  },
  {
    id: 'notif-3',
    title: 'Sinkronisasi Otomatis Selesai',
    message: '5 data foto dan 2 video survei telah berhasil diunggah ke Pusat Data DPUPR dengan enkripsi end-to-end AES-256.',
    timestamp: '2026-10-31T07:15:00Z',
    type: 'sync',
    read: true,
  },
];
