import React, { useEffect, useState } from 'react';
import { Palette, RotateCcw, X, Check } from 'lucide-react';
import { ImportedKmlLayer, MapConditionColors, RoadConditionPKRMS, RuasJalan } from '../types';

export const DEFAULT_CONDITION_COLORS: MapConditionColors = {
  Baik: '#10b981',
  Sedang: '#f59e0b',
  'Rusak Ringan': '#f97316',
  'Rusak Berat': '#ef4444',
};

const COLOR_PRESETS = [
  '#10b981', // Emerald
  '#38bdf8', // Sky
  '#2563eb', // Blue
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#ffffff', // White
  '#94a3b8', // Slate
];

export type ColorEditTarget =
  | { type: 'ruas'; ruas: RuasJalan }
  | { type: 'kml'; layer: ImportedKmlLayer }
  | { type: 'legend' };

interface MapLayerColorModalProps {
  target: ColorEditTarget | null;
  conditionColors: MapConditionColors;
  onClose: () => void;
  onSaveRuasColor: (ruas: RuasJalan, customColor?: string) => void;
  onSaveKmlColor: (layerId: string, color: string) => void;
  onSaveConditionColors: (colors: MapConditionColors) => void;
}

export const MapLayerColorModal: React.FC<MapLayerColorModalProps> = ({
  target,
  conditionColors,
  onClose,
  onSaveRuasColor,
  onSaveKmlColor,
  onSaveConditionColors,
}) => {
  const [useCustomRuasColor, setUseCustomRuasColor] = useState<boolean>(true);
  const [singleColor, setSingleColor] = useState<string>('#38bdf8');
  const [draftConditionColors, setDraftConditionColors] = useState<MapConditionColors>(
    conditionColors
  );

  useEffect(() => {
    if (!target) return;
    if (target.type === 'ruas') {
      setUseCustomRuasColor(Boolean(target.ruas.customColor));
      setSingleColor(target.ruas.customColor || '#38bdf8');
    } else if (target.type === 'kml') {
      setSingleColor(target.layer.color || '#38bdf8');
    } else {
      setDraftConditionColors({ ...conditionColors });
    }
  }, [target, conditionColors]);

  if (!target) return null;

  const handleSave = () => {
    if (target.type === 'ruas') {
      onSaveRuasColor(target.ruas, useCustomRuasColor ? singleColor : undefined);
    } else if (target.type === 'kml') {
      onSaveKmlColor(target.layer.id, singleColor);
    } else {
      onSaveConditionColors(draftConditionColors);
    }
    onClose();
  };

  const conditionKeys: RoadConditionPKRMS[] = [
    'Baik',
    'Sedang',
    'Rusak Ringan',
    'Rusak Berat',
  ];

  return (
    <div className="fixed inset-0 z-[1050] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {target.type === 'ruas'
                  ? 'Edit Warna Layer Ruas Jalan'
                  : target.type === 'kml'
                  ? 'Edit Warna Layer KML / KMZ'
                  : 'Edit Warna Layer Kondisi Peta'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {target.type === 'ruas'
                  ? `Ruas ${target.ruas.nomorRuas} - ${target.ruas.namaRuas}`
                  : target.type === 'kml'
                  ? `${target.layer.fileType}: ${target.layer.name}`
                  : 'Sesuaikan warna garis untuk setiap tingkat kondisi jalan pada peta.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {target.type === 'ruas' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUseCustomRuasColor(false)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  !useCustomRuasColor
                    ? 'bg-emerald-950/60 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold text-[11px]">Ikuti Kondisi STA</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Otomatis per warna kondisi
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUseCustomRuasColor(true)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  useCustomRuasColor
                    ? 'bg-amber-950/50 border-amber-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold text-[11px]">Warna Kustom</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Satu warna khusus ruas ini
                </div>
              </button>
            </div>
          )}

          {(target.type === 'kml' || (target.type === 'ruas' && useCustomRuasColor)) && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
              {/* Live Line Preview */}
              <div className="flex items-center justify-between gap-3 bg-slate-900 px-3 py-2.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400">Pratinjau Garis Peta:</span>
                <div className="flex items-center gap-2 flex-1 max-w-[190px]">
                  <div
                    className="h-2 rounded-full flex-1 shadow"
                    style={{ backgroundColor: singleColor }}
                  />
                  <span className="font-mono text-[11px] font-bold text-slate-200 uppercase">
                    {singleColor}
                  </span>
                </div>
              </div>

              {/* Color Swatches */}
              <div>
                <div className="text-[11px] font-semibold text-slate-300 mb-2">
                  Pilihan Warna Cepat:
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setSingleColor(hex)}
                      className={`h-8 rounded-lg border-2 flex items-center justify-center transition cursor-pointer ${
                        singleColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-white scale-105 shadow-lg'
                          : 'border-slate-700 hover:border-slate-400'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                    >
                      {singleColor.toLowerCase() === hex.toLowerCase() && (
                        <Check
                          className={`w-4 h-4 ${
                            hex === '#ffffff' || hex === '#eab308'
                              ? 'text-slate-950'
                              : 'text-white'
                          }`}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Native Color Picker */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <label className="text-[11px] text-slate-300 font-semibold">
                  Atau Pilih Warna Bebas:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={singleColor}
                    onChange={(e) => setSingleColor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer bg-transparent border border-slate-700"
                  />
                  <span className="font-mono text-[11px] text-slate-300 uppercase">
                    {singleColor}
                  </span>
                </div>
              </div>
            </div>
          )}

          {target.type === 'legend' && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              {conditionKeys.map((cond) => (
                <div
                  key={cond}
                  className="flex items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                      style={{ backgroundColor: draftConditionColors[cond] }}
                    />
                    <span className="font-semibold text-slate-200">{cond}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400 uppercase">
                      {draftConditionColors[cond]}
                    </span>
                    <input
                      type="color"
                      value={draftConditionColors[cond]}
                      onChange={(e) =>
                        setDraftConditionColors((prev) => ({
                          ...prev,
                          [cond]: e.target.value,
                        }))
                      }
                      className="w-9 h-7 rounded cursor-pointer bg-transparent border border-slate-700"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setDraftConditionColors({ ...DEFAULT_CONDITION_COLORS })}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ke Warna Standar</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer"
          >
            Simpan Warna Layer
          </button>
        </div>
      </div>
    </div>
  );
};
