import React from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  PieChart as PieIcon, 
  Layers, 
  TrendingUp, 
  Wrench, 
  MapPin, 
  ShieldCheck, 
  FileSpreadsheet
} from 'lucide-react';
import { RuasJalan, SurveyPhoto } from '../types';
import { generateExcelXML, downloadFile } from '../utils/geo';
import { getRuasSTASegments } from '../utils/pkrms';

interface AnalyticsDashboardViewProps {
  ruasList: RuasJalan[];
  photos: SurveyPhoto[];
}

export const AnalyticsDashboardView: React.FC<AnalyticsDashboardViewProps> = ({
  ruasList,
  photos,
}) => {
  // Aggregate stats across all Mentawai roads per STA segment
  const totalLengthKm = ruasList.reduce((acc, r) => acc + r.panjangKm, 0);

  const conditionKm = {
    Baik: 0,
    Sedang: 0,
    'Rusak Ringan': 0,
    'Rusak Berat': 0,
  };

  const surfaceStats: Record<string, number> = {};
  const treatmentStats: Record<string, number> = {};
  let categorizedKm = 0;

  ruasList.forEach((ruas) => {
    const segments = getRuasSTASegments(ruas);
    segments.forEach((seg) => {
      const segKm = Math.max(0, (seg.endSta - seg.startSta) / 1000);
      categorizedKm += segKm;
      conditionKm[seg.kondisiJalan] = (conditionKm[seg.kondisiJalan] || 0) + segKm;
      surfaceStats[seg.tipePermukaan] = (surfaceStats[seg.tipePermukaan] || 0) + segKm;

      let treatment = 'Pemeliharaan Rutin';
      if (seg.kondisiJalan === 'Sedang') treatment = 'Pemeliharaan Berkala';
      else if (seg.kondisiJalan === 'Rusak Ringan') treatment = 'Rehabilitasi Jalan';
      else if (seg.kondisiJalan === 'Rusak Berat') treatment = 'Rekonstruksi / Peningkatan';
      treatmentStats[treatment] = (treatmentStats[treatment] || 0) + segKm;
    });
  });

  const denomKm = categorizedKm > 0 ? categorizedKm : totalLengthKm || 1;
  const kmMantap = conditionKm.Baik + conditionKm.Sedang;
  const kmTidakMantap = conditionKm['Rusak Ringan'] + conditionKm['Rusak Berat'];
  const percentMantap = categorizedKm > 0 ? (kmMantap / categorizedKm) * 100 : 0;

  // Defect counts
  let potholeCount = 0;
  let alligatorCrackCount = 0;
  let linearCrackCount = 0;
  let depressionCount = 0;

  photos.forEach((p) => {
    p.defects.forEach((d) => {
      if (d.type.includes('Lubang')) potholeCount++;
      else if (d.type.includes('Retak Buaya')) alligatorCrackCount++;
      else if (d.type.includes('Retak')) linearCrackCount++;
      else if (d.type.includes('Amblas')) depressionCount++;
    });
  });

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Dasbor Analisis Kondisi Jalan
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Rekapitulasi teknis kemantapan jalan, distribusi kerusakan, dan rekomendasi program penanganan DPUPR Kab. Kepulauan Mentawai.
            </p>
          </div>

          <button
            onClick={() => {
              const xml = generateExcelXML(ruasList, photos);
              downloadFile(xml, `Rekap_Analisis_Kondisi_Jalan_Mentawai_${Date.now()}.xls`, 'application/vnd.ms-excel');
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-semibold text-xs transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Ekspor Rekap Excel</span>
          </button>
        </div>

        {/* Top Summary Cards: Kemantapan Jalan Standar Bina Marga & PKRMS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Jaringan Ruas</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {totalLengthKm.toFixed(1)} <span className="text-sm font-semibold text-slate-400">km</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {ruasList.length} Ruas Prioritas Mentawai
            </p>
          </div>

          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Tingkat Kemantapan Jalan</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-400">
              {percentMantap.toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {kmMantap.toFixed(1)} km Mantap (Baik + Sedang)
            </p>
          </div>

          <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Kondisi Belum Mantap</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-rose-400">
              {kmTidakMantap.toFixed(1)} <span className="text-sm font-semibold text-slate-400">km</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Rusak Ringan &amp; Rusak Berat
            </p>
          </div>
        </div>

        {/* PKRMS 2026 Condition Progress Bars */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Klasifikasi Kondisi Jalan PKRMS 2026 (Kementerian PUPR)</span>
            </h3>
            <span className="text-xs text-slate-400">Standar Bina Marga RI</span>
          </div>

          <div className="space-y-3">
            {/* Baik */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Kondisi Baik (IRI &lt; 4.0 m/km, SDI &lt; 50)
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {conditionKm.Baik.toFixed(1)} km ({((conditionKm.Baik / denomKm) * 100 || 0).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(conditionKm.Baik / denomKm) * 100}%` }}
                />
              </div>
            </div>

            {/* Sedang */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Kondisi Sedang (IRI 4.0 - 8.0 m/km, SDI 50 - 100)
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {conditionKm.Sedang.toFixed(1)} km ({((conditionKm.Sedang / denomKm) * 100 || 0).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(conditionKm.Sedang / denomKm) * 100}%` }}
                />
              </div>
            </div>

            {/* Rusak Ringan */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-orange-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                  Rusak Ringan (IRI 8.0 - 12.0 m/km, SDI 100 - 150)
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {conditionKm['Rusak Ringan'].toFixed(1)} km ({((conditionKm['Rusak Ringan'] / denomKm) * 100 || 0).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-orange-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(conditionKm['Rusak Ringan'] / denomKm) * 100}%` }}
                />
              </div>
            </div>

            {/* Rusak Berat */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Rusak Berat (IRI &gt; 12.0 m/km, SDI &gt; 150)
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {conditionKm['Rusak Berat'].toFixed(1)} km ({((conditionKm['Rusak Berat'] / denomKm) * 100 || 0).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(conditionKm['Rusak Berat'] / denomKm) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Section: Surface Types & Treatment Program Budget */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Surface Types Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <PieIcon className="w-4 h-4 text-amber-400" />
              <span>Distribusi Jenis Perkerasan Jalan (per STA)</span>
            </h3>

            <div className="space-y-3">
              {Object.entries(surfaceStats).map(([type, km]) => (
                <div key={type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">{type}</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {km.toFixed(1)} km ({((km / denomKm) * 100 || 0).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-full" 
                      style={{ width: `${(km / denomKm) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PKRMS Treatment Program Allocation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Wrench className="w-4 h-4 text-sky-400" />
              <span>Rencana Program Penanganan PKRMS 2026</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-white">Pemeliharaan Rutin</div>
                  <div className="text-[11px] text-slate-400">Pembersihan saluran, penambalan retak minor</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-400">
                    {(treatmentStats['Pemeliharaan Rutin'] || 0).toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {(((treatmentStats['Pemeliharaan Rutin'] || 0) / denomKm) * 100).toFixed(1)}% jaringan
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-white">Pemeliharaan Berkala</div>
                  <div className="text-[11px] text-slate-400">Pelapisan ulang (overlay), perbaikan bahu jalan</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-amber-400">
                    {(treatmentStats['Pemeliharaan Berkala'] || 0).toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {(((treatmentStats['Pemeliharaan Berkala'] || 0) / denomKm) * 100).toFixed(1)}% jaringan
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-white">Rehabilitasi Jalan</div>
                  <div className="text-[11px] text-slate-400">Perbaikan pondasi &amp; perkerasan rusak ringan</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-orange-400">
                    {(treatmentStats['Rehabilitasi Jalan'] || 0).toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {(((treatmentStats['Rehabilitasi Jalan'] || 0) / denomKm) * 100).toFixed(1)}% jaringan
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-white">Rekonstruksi / Peningkatan</div>
                  <div className="text-[11px] text-slate-400">Pembangunan kembali perkerasan rusak berat</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-rose-400">
                    {(treatmentStats['Rekonstruksi / Peningkatan'] || 0).toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {(((treatmentStats['Rekonstruksi / Peningkatan'] || 0) / denomKm) * 100).toFixed(1)}% jaringan
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Road Defect Detection Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Inventarisasi Cacat Jalan Terdeteksi AI (Interval 100m)</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Lubang (Pothole)</div>
              <div className="text-2xl font-black text-rose-400 mt-1">{potholeCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Titik Cacat</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Retak Buaya</div>
              <div className="text-2xl font-black text-amber-400 mt-1">{alligatorCrackCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Segmen 100m</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Retak Memanjang</div>
              <div className="text-2xl font-black text-sky-400 mt-1">{linearCrackCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Segmen</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400">Amblas / Alur</div>
              <div className="text-2xl font-black text-purple-400 mt-1">{depressionCount}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Titik Amblas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
