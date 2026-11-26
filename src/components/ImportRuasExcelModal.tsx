import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
} from 'lucide-react';
import { RuasJalan } from '../types';
import { downloadRuasExcelTemplate, parseRuasFromExcelFile } from '../utils/ruasExcel';

interface ImportRuasExcelModalProps {
  isOpen: boolean;
  existingRuasList: RuasJalan[];
  onClose: () => void;
  onImportRuasList: (newRoads: RuasJalan[]) => void;
}

export const ImportRuasExcelModal: React.FC<ImportRuasExcelModalProps> = ({
  isOpen,
  existingRuasList,
  onClose,
  onImportRuasList,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [parsedRoads, setParsedRoads] = useState<RuasJalan[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  if (!isOpen) return null;

  const existingNomorSet = new Set(
    existingRuasList.map((r) => r.nomorRuas.trim().toLowerCase())
  );

  const handleReset = () => {
    setSelectedFileName('');
    setParsedRoads([]);
    setWarnings([]);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsParsing(true);
    setErrors([]);
    setWarnings([]);
    setParsedRoads([]);

    try {
      const result = await parseRuasFromExcelFile(file, existingRuasList.length);
      setParsedRoads(result.roads);
      setWarnings(result.warnings);
      setErrors(result.errors);
    } catch (err) {
      setErrors([
        err instanceof Error
          ? `Gagal membaca file Excel: ${err.message}`
          : 'Gagal membaca file Excel. Pastikan format file valid (*.xlsx / *.xls).',
      ]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleRemovePreviewRow = (id: string) => {
    setParsedRoads((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConfirmImport = () => {
    if (parsedRoads.length === 0) return;
    onImportRuasList(parsedRoads);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Impor Ruas Jalan Baru dari File Excel
              </h3>
              <p className="text-xs text-slate-400">
                Unggah file *.xlsx / *.xls / *.csv sesuai template untuk menambahkan banyak ruas jalan sekaligus.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {/* Step 1: Download Template Excel */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-slate-200">
                1. Unduh Template Excel Ruas Baru (*.xlsx)
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Berisi kolom <span className="text-slate-200 font-medium">Nomor_Ruas</span>,{' '}
                <span className="text-slate-200 font-medium">Nama_Ruas_Jalan</span>,{' '}
                <span className="text-slate-200 font-medium">Wilayah_Pulau</span>,{' '}
                <span className="text-slate-200 font-medium">Panjang_km</span>,{' '}
                <span className="text-slate-200 font-medium">Lebar_m</span>, serta sheet opsional{' '}
                <span className="text-amber-300 font-medium">Segmen_STA</span>.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadRuasExcelTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-bold transition cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Unduh Template Excel</span>
            </button>
          </div>

          {/* Step 2: Upload Excel File */}
          <div className="bg-slate-950/60 border border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl p-4 transition">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-200">
                  2. Pilih File Excel Data Ruas Baru
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mendukung format <span className="text-sky-300 font-mono">.xlsx</span>,{' '}
                  <span className="text-sky-300 font-mono">.xls</span>, dan{' '}
                  <span className="text-sky-300 font-mono">.csv</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedFileName && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <label className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span>{isParsing ? 'Membaca File...' : 'Pilih File Excel'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {selectedFileName && (
              <div className="mt-2.5 text-[11px] text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>File dipilih: {selectedFileName}</span>
              </div>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 space-y-1 text-rose-200">
              <div className="font-bold flex items-center gap-1.5 text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Pesan Validasi File</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 space-y-1 text-amber-200">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Catatan Penyesuaian Otomatis</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          {parsedRoads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Pratinjau Data Siap Diimpor ({parsedRoads.length} Ruas Jalan)</span>
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70">
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-900 text-slate-300 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">No. Ruas</th>
                        <th className="py-2 px-3">Nama Ruas Jalan</th>
                        <th className="py-2 px-3">Wilayah / Pulau</th>
                        <th className="py-2 px-3 text-right">Panjang</th>
                        <th className="py-2 px-3 text-right">Lebar</th>
                        <th className="py-2 px-3 text-center">Segmen STA</th>
                        <th className="py-2 px-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {parsedRoads.map((ruas) => {
                        const isDuplicateNomor = existingNomorSet.has(
                          ruas.nomorRuas.trim().toLowerCase()
                        );
                        return (
                          <tr key={ruas.id} className="hover:bg-slate-900/50">
                            <td className="py-2 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                              {ruas.nomorRuas}
                              {isDuplicateNomor && (
                                <span
                                  className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  title="Nomor ruas sudah ada di daftar saat ini"
                                >
                                  Duplikat
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-semibold text-white">
                              {ruas.namaRuas}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{ruas.kecamatanPulau}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                              {ruas.panjangKm} km
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                              {ruas.lebarMeter} m
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-sky-300 font-semibold">
                                {ruas.staSegments?.length || 0} STA
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewRow(ruas.id)}
                                className="p-1 rounded text-rose-400 hover:bg-rose-950/60 cursor-pointer"
                                title="Hapus baris ini dari daftar impor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={parsedRoads.length === 0}
            onClick={handleConfirmImport}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor {parsedRoads.length} Ruas Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
};
