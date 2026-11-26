import * as XLSX from 'xlsx';
import { RoadConditionPKRMS, RuasJalan, RuasSTASegment, SurfaceType } from '../types';
import { summarizeRuasFromSTASegments } from './pkrms';
import { triggerBlobDownload } from './nativeDownload';

export interface ExcelRuasParseResult {
  roads: RuasJalan[];
  warnings: string[];
  errors: string[];
}

function normalizeHeader(header: unknown): string {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[().\-/]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumberFlexible(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  const str = String(value ?? '').trim().replace(',', '.');
  if (!str) return fallback;
  const num = Number(str);
  return Number.isFinite(num) ? num : fallback;
}

function parseStaToMeters(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;

  // Format STA XX+XXX atau XX+XXX
  const staMatch = raw.match(/(?:STA\s*)?(\d+)\s*\+\s*(\d+)/);
  if (staMatch) {
    const km = parseInt(staMatch[1], 10);
    const m = parseInt(staMatch[2], 10);
    if (Number.isFinite(km) && Number.isFinite(m)) {
      return Math.max(0, km * 1000 + m);
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric));
  }

  return null;
}

function normalizeSurfaceType(value: unknown): SurfaceType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw.includes('beton') || raw.includes('rigid')) return 'Beton (Rigid)';
  if (raw.includes('lapen') || raw.includes('penetrasi') || raw.includes('macadam')) {
    return 'Penetrasi Macadam (Lapen)';
  }
  if (raw.includes('kerikil') || raw.includes('sirtu') || raw.includes('agregat')) {
    return 'Kerikil / Sirtu';
  }
  if (raw.includes('tanah')) return 'Tanah';
  return 'Aspal (AC-WC/HRS)';
}

function normalizeRoadCondition(value: unknown): RoadConditionPKRMS {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw.includes('berat')) return 'Rusak Berat';
  if (raw.includes('ringan')) return 'Rusak Ringan';
  if (raw.includes('sedang')) return 'Sedang';
  return 'Baik';
}

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of Object.keys(row)) {
    const norm = normalizeHeader(key);
    if (candidates.includes(norm)) {
      return row[key];
    }
  }
  return undefined;
}

/**
 * Mengunduh file template Excel (*.xlsx) resmi untuk impor ruas jalan baru
 */
export function downloadRuasExcelTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data Ruas Baru (utama)
  const ruasRows = [
    {
      Nomor_Ruas: '007',
      Nama_Ruas_Jalan: 'Tuapejat - SP2 Transmigrasi',
      Wilayah_Pulau: 'Sipora Utara, Kab. Kep. Mentawai',
      Panjang_km: 8.5,
      Lebar_m: 5.5,
      Lat_Awal: -2.0234,
      Lng_Awal: 99.5912,
      Lat_Akhir: -2.0650,
      Lng_Akhir: 99.6180,
    },
    {
      Nomor_Ruas: '008',
      Nama_Ruas_Jalan: 'Saibi Samukop - Simatalu',
      Wilayah_Pulau: 'Siberut Tengah, Kab. Kep. Mentawai',
      Panjang_km: 12.0,
      Lebar_m: 5.0,
      Lat_Awal: -1.3510,
      Lng_Awal: 99.0920,
      Lat_Akhir: -1.4120,
      Lng_Akhir: 99.0480,
    },
  ];

  const wsRuas = XLSX.utils.json_to_sheet(ruasRows);
  wsRuas['!cols'] = [
    { wch: 14 }, // Nomor_Ruas
    { wch: 34 }, // Nama_Ruas_Jalan
    { wch: 34 }, // Wilayah_Pulau
    { wch: 13 }, // Panjang_km
    { wch: 11 }, // Lebar_m
    { wch: 12 }, // Lat_Awal
    { wch: 12 }, // Lng_Awal
    { wch: 12 }, // Lat_Akhir
    { wch: 12 }, // Lng_Akhir
  ];
  XLSX.utils.book_append_sheet(wb, wsRuas, 'Data_Ruas_Baru');

  // Sheet 2: Segmen_STA (opsional untuk langsung mengisi tipe permukaan & kondisi per STA)
  const staRows = [
    {
      Nomor_Ruas: '007',
      STA_Awal_Meter: 0,
      STA_Akhir_Meter: 5000,
      Tipe_Permukaan: 'Aspal (AC-WC/HRS)',
      Kondisi_Jalan: 'Baik',
    },
    {
      Nomor_Ruas: '007',
      STA_Awal_Meter: 5000,
      STA_Akhir_Meter: 8500,
      Tipe_Permukaan: 'Penetrasi Macadam (Lapen)',
      Kondisi_Jalan: 'Sedang',
    },
    {
      Nomor_Ruas: '008',
      STA_Awal_Meter: 0,
      STA_Akhir_Meter: 6000,
      Tipe_Permukaan: 'Beton (Rigid)',
      Kondisi_Jalan: 'Baik',
    },
    {
      Nomor_Ruas: '008',
      STA_Awal_Meter: 6000,
      STA_Akhir_Meter: 12000,
      Tipe_Permukaan: 'Kerikil / Sirtu',
      Kondisi_Jalan: 'Rusak Ringan',
    },
  ];

  const wsSta = XLSX.utils.json_to_sheet(staRows);
  wsSta['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSta, 'Segmen_STA');

  // Sheet 3: Petunjuk Pengisian
  const guideRows = [
    {
      Kolom: 'Nomor_Ruas',
      Keterangan: 'Wajib diisi. Kode/nomor ruas jalan (contoh: 007, 008).',
    },
    {
      Kolom: 'Nama_Ruas_Jalan',
      Keterangan: 'Wajib diisi. Nama ruas jalan kabupaten (contoh: Tuapejat - SP2).',
    },
    {
      Kolom: 'Wilayah_Pulau',
      Keterangan: 'Nama kecamatan atau pulau (contoh: Sipora Utara, Kab. Kep. Mentawai).',
    },
    {
      Kolom: 'Panjang_km',
      Keterangan: 'Angka panjang ruas dalam kilometer (contoh: 8.5).',
    },
    {
      Kolom: 'Lebar_m',
      Keterangan: 'Angka lebar perkerasan jalan dalam meter (contoh: 5.5).',
    },
    {
      Kolom: 'Lat_Awal, Lng_Awal, Lat_Akhir, Lng_Akhir',
      Keterangan: 'Opsional. Koordinat awal dan akhir ruas (format desimal, contoh: -2.0234 dan 99.5912).',
    },
    {
      Kolom: 'Sheet Segmen_STA (Opsional)',
      Keterangan:
        'Gunakan untuk langsung mengisi Tipe Permukaan dan Kondisi Jalan per STA sesuai Nomor_Ruas.',
    },
    {
      Kolom: 'Pilihan Tipe_Permukaan',
      Keterangan:
        'Aspal (AC-WC/HRS) | Penetrasi Macadam (Lapen) | Kerikil / Sirtu | Beton (Rigid) | Tanah',
    },
    {
      Kolom: 'Pilihan Kondisi_Jalan',
      Keterangan: 'Baik | Sedang | Rusak Ringan | Rusak Berat',
    },
  ];

  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 36 }, { wch: 82 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk_Pengisian');

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const excelBlob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(excelBlob, 'Template_Ruas_Jalan_Baru_Mentawai.xlsx');
}

/**
 * Membaca file Excel (.xlsx, .xls, .csv) berisi daftar ruas jalan baru (+ segmen STA opsional)
 */
export async function parseRuasFromExcelFile(
  file: File,
  existingCount = 0
): Promise<ExcelRuasParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return {
      roads: [],
      warnings: [],
      errors: ['File Excel tidak memiliki lembar kerja (worksheet).'],
    };
  }

  // Prioritaskan sheet bernama Data_Ruas_Baru atau sheet pertama
  const mainSheetName =
    sheetNames.find((n) => normalizeHeader(n).includes('ruas')) || sheetNames[0];
  const mainSheet = workbook.Sheets[mainSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(mainSheet, {
    defval: '',
  });

  if (rawRows.length === 0) {
    return {
      roads: [],
      warnings: [],
      errors: [`Sheet "${mainSheetName}" kosong atau tidak memiliki baris data.`],
    };
  }

  // Baca sheet Segmen_STA jika tersedia
  const staSegmentsByNomor = new Map<string, RuasSTASegment[]>();
  const staSheetName = sheetNames.find((n) => {
    const norm = normalizeHeader(n);
    return norm.includes('sta') || norm.includes('segmen');
  });

  if (staSheetName) {
    const staSheet = workbook.Sheets[staSheetName];
    const staRawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(staSheet, {
      defval: '',
    });

    staRawRows.forEach((row, idx) => {
      const nomorRaw = String(
        pickField(row, ['nomor_ruas', 'no_ruas', 'kode_ruas', 'nomor']) ?? ''
      ).trim();
      if (!nomorRaw) return;

      const startSta = parseStaToMeters(
        pickField(row, ['sta_awal_meter', 'sta_awal', 'start_sta', 'sta_mulai'])
      );
      const endSta = parseStaToMeters(
        pickField(row, ['sta_akhir_meter', 'sta_akhir', 'end_sta', 'sta_selesai'])
      );

      if (startSta === null || endSta === null || endSta <= startSta) return;

      const tipePermukaan = normalizeSurfaceType(
        pickField(row, ['tipe_permukaan', 'permukaan', 'jenis_permukaan', 'surface'])
      );
      const kondisiJalan = normalizeRoadCondition(
        pickField(row, ['kondisi_jalan', 'kondisi', 'kondisi_pkrms', 'condition'])
      );

      const list = staSegmentsByNomor.get(nomorRaw.toLowerCase()) || [];
      list.push({
        id: `sta-imp-${Date.now()}-${idx}`,
        startSta,
        endSta,
        tipePermukaan,
        kondisiJalan,
      });
      staSegmentsByNomor.set(nomorRaw.toLowerCase(), list);
    });
  }

  const roads: RuasJalan[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const nowBase = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // Excel 1-indexed + header row

    const nomorVal = String(
      pickField(row, ['nomor_ruas', 'no_ruas', 'kode_ruas', 'nomor']) ?? ''
    ).trim();
    const namaVal = String(
      pickField(row, ['nama_ruas_jalan', 'nama_ruas', 'ruas_jalan', 'nama']) ?? ''
    ).trim();
    const wilayahVal = String(
      pickField(row, ['wilayah_pulau', 'wilayah', 'kecamatan_pulau', 'kecamatan', 'pulau']) ?? ''
    ).trim();

    // Lewati baris kosong
    if (!nomorVal && !namaVal && !wilayahVal) {
      return;
    }

    if (!namaVal) {
      errors.push(`Baris ${rowNum}: Kolom Nama_Ruas_Jalan kosong, baris dilewati.`);
      return;
    }

    const nomorRuas =
      nomorVal || String(existingCount + roads.length + 1).padStart(3, '0');
    const kecamatanPulau = wilayahVal || 'Kab. Kepulauan Mentawai';

    let panjangKm = parseNumberFlexible(
      pickField(row, ['panjang_km', 'panjang_ruas_km', 'panjang', 'length_km']),
      NaN
    );
    if (!Number.isFinite(panjangKm) || panjangKm <= 0) {
      panjangKm = 5.0;
      warnings.push(
        `Baris ${rowNum} (${nomorRuas}): Panjang_km tidak valid/kosong, diisi default 5.0 km.`
      );
    } else {
      panjangKm = Number(panjangKm.toFixed(2));
    }

    let lebarMeter = parseNumberFlexible(
      pickField(row, ['lebar_m', 'lebar_perkerasan_m', 'lebar', 'width_m']),
      NaN
    );
    if (!Number.isFinite(lebarMeter) || lebarMeter <= 0) {
      lebarMeter = 5.5;
      warnings.push(
        `Baris ${rowNum} (${nomorRuas}): Lebar_m tidak valid/kosong, diisi default 5.5 m.`
      );
    } else {
      lebarMeter = Number(lebarMeter.toFixed(1));
    }

    // Koordinat awal & akhir (opsional -> fallback realistis Mentawai dengan sedikit offset unik)
    const offset = (roads.length % 10) * 0.012;
    const latAwal = parseNumberFlexible(
      pickField(row, ['lat_awal', 'latitude_awal', 'awal_lat']),
      Number((-2.0234 - offset).toFixed(4))
    );
    const lngAwal = parseNumberFlexible(
      pickField(row, ['lng_awal', 'lon_awal', 'longitude_awal', 'awal_lng']),
      Number((99.5912 + offset * 0.6).toFixed(4))
    );
    const latAkhir = parseNumberFlexible(
      pickField(row, ['lat_akhir', 'latitude_akhir', 'akhir_lat']),
      Number((latAwal - 0.045).toFixed(4))
    );
    const lngAkhir = parseNumberFlexible(
      pickField(row, ['lng_akhir', 'lon_akhir', 'longitude_akhir', 'akhir_lng']),
      Number((lngAwal + 0.032).toFixed(4))
    );

    const midLat = Number(((latAwal + latAkhir) / 2).toFixed(5));
    const midLng = Number(((lngAwal + lngAkhir) / 2).toFixed(5));

    const attachedSegments = (staSegmentsByNomor.get(nomorRuas.toLowerCase()) || []).sort(
      (a, b) => a.startSta - b.startSta
    );
    const summary = summarizeRuasFromSTASegments(attachedSegments);

    roads.push({
      id: `ruas-excel-${nowBase}-${index}`,
      nomorRuas,
      namaRuas: namaVal,
      kecamatanPulau,
      panjangKm,
      lebarMeter,
      staSegments: attachedSegments,
      tipePermukaan: summary.tipePermukaan,
      kondisiPKRMS: summary.kondisiPKRMS,
      iriAvg: summary.iriAvg,
      sdiScore: summary.sdiScore,
      lastSurveyDate: todayStr,
      koordinatAwal: [latAwal, lngAwal],
      koordinatAkhir: [latAkhir, lngAkhir],
      points: [
        [latAwal, lngAwal],
        [midLat, midLng],
        [latAkhir, lngAkhir],
      ],
      documentationCount: 0,
      rekomendasiPenanganan: summary.rekomendasiPenanganan,
    });
  });

  if (roads.length === 0 && errors.length === 0) {
    errors.push('Tidak ditemukan baris data ruas jalan yang valid di file Excel.');
  }

  return { roads, warnings, errors };
}
