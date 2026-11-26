import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, MapPin, AlertCircle } from 'lucide-react';
import {
  RuasJalan,
  RuasSTASegment,
  SurfaceType,
  RoadConditionPKRMS,
} from '../types';
import {
  formatMeterToSTA,
  getConditionColor,
  getRuasSTASegments,
  summarizeRuasFromSTASegments,
} from '../utils/pkrms';

interface RuasSTASegmentsModalProps {
  ruas: RuasJalan | null;
  onClose: () => void;
  onSaveRuas: (updated: RuasJalan) => void;
}

const SURFACE_OPTIONS: SurfaceType[] = [
  'Aspal (AC-WC/HRS)',
  'Penetrasi Macadam (Lapen)',
  'Kerikil / Sirtu',
  'Beton (Rigid)',
  'Tanah',
];

const CONDITION_OPTIONS: RoadConditionPKRMS[] = [
  'Baik',
  'Sedang',
  'Rusak Ringan',
  'Rusak Berat',
];

export const RuasSTASegmentsModal: React.FC<RuasSTASegmentsModalProps> = ({
  ruas,
  onClose,
  onSaveRuas,
}) => {
  const [segments, setSegments] = useState<RuasSTASegment[]>([]);
  const [newStartSta, setNewStartSta] = useState<number>(0);
  const [newEndSta, setNewEndSta] = useState<number>(1000);
  const [newSurface, setNewSurface] = useState<SurfaceType>('Aspal (AC-WC/HRS)');
  const [newCondition, setNewCondition] = useState<RoadConditionPKRMS>('Baik');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ruas) {
      const existing = getRuasSTASegments(ruas);
      setSegments(existing);
      const maxEnd = existing.length > 0 ? Math.max(...existing.map((s) => s.endSta)) : 0;
      const totalMeters = Math.max(100, Math.round(ruas.panjangKm * 1000));
      setNewStartSta(maxEnd < totalMeters ? maxEnd : 0);
      setNewEndSta(Math.min(totalMeters, (maxEnd < totalMeters ? maxEnd : 0) + 1000));
      setNewSurface('Aspal (AC-WC/HRS)');
      setNewCondition('Baik');
      setErrorMsg(null);
    }
  }, [ruas]);

  if (!ruas) return null;

  const totalRoadMeters = Math.max(100, Math.round(ruas.panjangKm * 1000));

  const handleAddSegment = () => {
    if (newEndSta <= newStartSta) {
      setErrorMsg('STA Akhir harus lebih besar dari STA Mulai.');
      return;
    }
    setErrorMsg(null);
    const added: RuasSTASegment = {
      id: `sta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startSta: Math.max(0, Math.round(newStartSta)),
      endSta: Math.round(newEndSta),
      tipePermukaan: newSurface,
      kondisiJalan: newCondition,
    };
    const next = [...segments, added].sort((a, b) => a.startSta - b.startSta);
    setSegments(next);

    const nextStart = added.endSta;
    setNewStartSta(nextStart);
    setNewEndSta(Math.min(totalRoadMeters, nextStart + 1000 > nextStart ? nextStart + 1000 : nextStart + 500));
  };

  const handleUpdateSegment = (id: string, patch: Partial<RuasSTASegment>) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const handleDeleteSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveAll = () => {
    const invalid = segments.find((s) => s.endSta <= s.startSta);
    if (invalid) {
      setErrorMsg('Pastikan semua segmen memiliki STA Akhir lebih besar dari STA Mulai.');
      return;
    }

    const sorted = [...segments].sort((a, b) => a.startSta - b.startSta);
    const summary = summarizeRuasFromSTASegments(
      sorted,
      ruas.tipePermukaan,
      ruas.kondisiPKRMS
    );

    onSaveRuas({
      ...ruas,
      staSegments: sorted,
      tipePermukaan: summary.tipePermukaan,
      kondisiPKRMS: summary.kondisiPKRMS,
      rekomendasiPenanganan: summary.rekomendasiPenanganan,
      iriAvg: summary.iriAvg,
      sdiScore: summary.sdiScore,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Tipe Permukaan &amp; Kondisi Jalan per STA
              </h3>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                Ruas {ruas.nomorRuas} - {ruas.namaRuas} ({ruas.panjangKm} km / {formatMeterToSTA(totalRoadMeters)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/40 text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Tambah Segmen STA Baru */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="font-bold text-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Tambah Segmen STA Baru</span>
              </div>
              <span className="text-[10px] font-normal text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded">
                Mendukung STA Akhir non-kelipatan 100m (contoh: 1235 m)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">STA Mulai (m)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={newStartSta}
                  onChange={(e) => setNewStartSta(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
                <span className="text-[10px] text-sky-400 font-mono mt-0.5 block">
                  {formatMeterToSTA(newStartSta)}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">STA Akhir (m)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={newEndSta}
                  onChange={(e) => setNewEndSta(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
                <span className="text-[10px] text-sky-400 font-mono mt-0.5 block">
                  {formatMeterToSTA(newEndSta)}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Tipe Permukaan</label>
                <select
                  value={newSurface}
                  onChange={(e) => setNewSurface(e.target.value as SurfaceType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                >
                  {SURFACE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Kondisi Jalan</label>
                <select
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value as RoadConditionPKRMS)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                >
                  {CONDITION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddSegment}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah ke Daftar STA</span>
              </button>
            </div>
          </div>

          {/* Daftar Segmen STA pada Ruas Ini */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300">
                Daftar Segmen STA ({segments.length} Segmen)
              </span>
              <span className="text-[11px] text-slate-400">
                Ubah langsung pada baris di bawah lalu klik Simpan
              </span>
            </div>

            {segments.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center text-slate-500 italic">
                Belum ada segmen STA. Tambahkan segmen STA di atas untuk menentukan tipe permukaan dan kondisi jalan ruas ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {segments.map((seg) => {
                  const colors = getConditionColor(seg.kondisiJalan);
                  return (
                    <div
                      key={seg.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <div className="sm:col-span-4 flex items-center gap-1.5">
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-500">Mulai (m)</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={seg.startSta}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, { startSta: Number(e.target.value) })
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-[11px]"
                          />
                          <span className="text-[10px] text-sky-400 font-mono">
                            {formatMeterToSTA(seg.startSta)}
                          </span>
                        </div>
                        <span className="text-slate-500 font-bold">–</span>
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-500">Akhir (m)</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={seg.endSta}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, { endSta: Number(e.target.value) })
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-[11px]"
                          />
                          <span className="text-[10px] text-sky-400 font-mono">
                            {formatMeterToSTA(seg.endSta)}
                          </span>
                        </div>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] text-slate-500 mb-0.5">Tipe Permukaan</label>
                        <select
                          value={seg.tipePermukaan}
                          onChange={(e) =>
                            handleUpdateSegment(seg.id, {
                              tipePermukaan: e.target.value as SurfaceType,
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-[11px]"
                        >
                          {SURFACE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-slate-500 mb-0.5">Kondisi Jalan</label>
                        <select
                          value={seg.kondisiJalan}
                          onChange={(e) =>
                            handleUpdateSegment(seg.id, {
                              kondisiJalan: e.target.value as RoadConditionPKRMS,
                            })
                          }
                          className={`w-full border rounded px-2 py-1.5 font-bold text-[11px] ${colors.badgeBg}`}
                        >
                          {CONDITION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="bg-slate-900 text-white">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteSegment(seg.id)}
                          className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 transition cursor-pointer"
                          title="Hapus Segmen STA"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Data per STA</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
