import React, { useRef, useState } from 'react';
import {
  FileCode,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Route,
  Hexagon,
} from 'lucide-react';
import { ImportedKmlLayer } from '../types';
import { parseKmlOrKmzFile } from '../utils/kmlKmz';

interface ImportKmlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportLayer: (layer: ImportedKmlLayer, alsoRegisterRoads: boolean) => void;
}

const LAYER_COLOR_PRESETS = [
  { label: 'Biru Spasial', hex: '#38bdf8' },
  { label: 'Kuning Emas', hex: '#f59e0b' },
  { label: 'Hijau Zamrud', hex: '#10b981' },
  { label: 'Ungu Violet', hex: '#a855f7' },
  { label: 'Merah Muda', hex: '#f43f5e' },
];

export const ImportKmlModal: React.FC<ImportKmlModalProps> = ({
  isOpen,
  onClose,
  onImportLayer,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#38bdf8');
  const [parsedLayer, setParsedLayer] = useState<ImportedKmlLayer | null>(null);
  const [layerNameInput, setLayerNameInput] = useState<string>('');
  const [alsoRegisterRoads, setAlsoRegisterRoads] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setParsedLayer(null);
    setLayerNameInput('');
    setAlsoRegisterRoads(false);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMsg(null);
    setParsedLayer(null);

    try {
      const layer = await parseKmlOrKmzFile(file, selectedColor);
      setParsedLayer(layer);
      setLayerNameInput(layer.name);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memproses file *.KML / *.KMZ. Pastikan struktur file valid.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!parsedLayer) return;
    const finalLayer: ImportedKmlLayer = {
      ...parsedLayer,
      name: layerNameInput.trim() || parsedLayer.name,
      color: selectedColor,
    };
    onImportLayer(finalLayer, alsoRegisterRoads);
    handleClose();
  };

  const lineCount = parsedLayer?.features.filter((f) => f.geometryType === 'LineString').length || 0;
  const pointCount = parsedLayer?.features.filter((f) => f.geometryType === 'Point').length || 0;
  const polygonCount = parsedLayer?.features.filter((f) => f.geometryType === 'Polygon').length || 0;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Impor File Spasial *.KML / *.KMZ ke Peta
              </h3>
              <p className="text-xs text-slate-400">
                Muat jalur jalan, titik koordinat, atau poligon dari Google Earth, QGIS, atau ArcGIS agar tersimpan permanen di peta.
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
          {/* Layer Color Selector */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <div className="font-semibold text-slate-300 mb-2">
              Warna Default Layer Peta:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {LAYER_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setSelectedColor(preset.hex)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                    selectedColor === preset.hex
                      ? 'bg-slate-800 border-amber-400 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* File Picker */}
          <div className="bg-slate-950/60 border border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-4 transition">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-200">
                  Pilih File *.KML atau *.KMZ
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mendukung format standar Google Earth (<span className="text-sky-300 font-mono">.kml</span>) dan arsip terkompresi (<span className="text-sky-300 font-mono">.kmz</span>).
                </p>
              </div>

              <label className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold shadow cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>{isParsing ? 'Memproses...' : 'Pilih File KML/KMZ'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Error Feedback */}
          {errorMsg && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 flex items-start gap-2 text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedLayer && (
            <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>File {parsedLayer.fileType} Siap Disimpan ke Peta</span>
                </span>
                <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                  {parsedLayer.fileName}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nama Layer di Peta:</label>
                <input
                  type="text"
                  value={layerNameInput}
                  onChange={(e) => setLayerNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                  <Route className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-slate-400">Jalur</div>
                    <div className="font-bold text-white">
                      {lineCount} ({parsedLayer.totalLengthKm} km)
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-slate-400">Titik</div>
                    <div className="font-bold text-white">{pointCount} Titik</div>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                  <Hexagon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-slate-400">Poligon</div>
                    <div className="font-bold text-white">{polygonCount} Area</div>
                  </div>
                </div>
              </div>

              {lineCount > 0 && (
                <label className="flex items-start gap-2 bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoRegisterRoads}
                    onChange={(e) => setAlsoRegisterRoads(e.target.checked)}
                    className="mt-0.5 accent-amber-500 rounded"
                  />
                  <span className="text-[11px] text-slate-300">
                    Juga daftarkan <strong className="text-amber-300">{lineCount} jalur LineString</strong> ke Daftar Ruas Jalan sehingga dapat diatur segmen STA, foto, dan videonya.
                  </span>
                </label>
              )}
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
            disabled={!parsedLayer}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Simpan ke Peta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
