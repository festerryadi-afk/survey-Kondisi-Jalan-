import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Layers,
  MapPin,
  AlertCircle,
  Search,
  ImagePlus,
  Video as VideoIcon,
  ListChecks,
  FileSpreadsheet,
  Upload,
  Download,
  Route,
  FileCode,
} from 'lucide-react';
import { RuasJalan, SurveyPhoto, SurveyVideo } from '../types';
import { formatMeterToSTA, getConditionColor, getRuasSTASegments } from '../utils/pkrms';
import { downloadRuasExcelTemplate } from '../utils/ruasExcel';
import {
  exportGpsTracksToExcel,
  exportGpsTracksToKML,
  exportGpsTracksToKMZ,
} from '../utils/gpsTrackerExport';
import { ImportPhotoModal } from './ImportPhotoModal';
import { ImportVideoModal } from './ImportVideoModal';
import { RuasSTASegmentsModal } from './RuasSTASegmentsModal';
import { ImportRuasExcelModal } from './ImportRuasExcelModal';

interface RoadsManagementViewProps {
  ruasList: RuasJalan[];
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  onAddRuas: (ruas: RuasJalan) => void;
  onImportRuasList: (roads: RuasJalan[]) => void;
  onUpdateRuas: (ruas: RuasJalan) => void;
  onDeleteRuas: (id: string) => void;
  onDeleteAllRuas: () => void;
  onAddPhoto: (photo: SurveyPhoto) => void;
  onAddVideo: (video: SurveyVideo) => void;
  isOnline: boolean;
  onViewPhoto: (photo: SurveyPhoto) => void;
}

export const RoadsManagementView: React.FC<RoadsManagementViewProps> = ({
  ruasList,
  photos,
  videos,
  onAddRuas,
  onImportRuasList,
  onUpdateRuas,
  onDeleteRuas,
  onDeleteAllRuas,
  onAddPhoto,
  onAddVideo,
  isOnline,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingRuas, setEditingRuas] = useState<RuasJalan | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingRuasId, setDeletingRuasId] = useState<string | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);

  const [importPhotoRuas, setImportPhotoRuas] = useState<RuasJalan | null>(null);
  const [importVideoRuas, setImportVideoRuas] = useState<RuasJalan | null>(null);
  const [staModalRuas, setStaModalRuas] = useState<RuasJalan | null>(null);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState<boolean>(false);

  // Form states for Add/Edit Ruas (hanya identitas & dimensi ruas)
  const [formNomor, setFormNomor] = useState<string>('');
  const [formNama, setFormNama] = useState<string>('');
  const [formWilayah, setFormWilayah] = useState<string>('Sipora Utara, Kab. Kep. Mentawai');
  const [formPanjang, setFormPanjang] = useState<number>(10.0);
  const [formEndStaMeters, setFormEndStaMeters] = useState<number>(10000);
  const [formLebar, setFormLebar] = useState<number>(5.5);

  // Filtered Ruas berdasarkan pencarian
  const filteredRuas = ruasList.filter((r) => {
    return (
      r.nomorRuas.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.namaRuas.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.kecamatanPulau.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Open Edit modal
  const handleOpenEdit = (ruas: RuasJalan) => {
    setEditingRuas(ruas);
    setFormNomor(ruas.nomorRuas);
    setFormNama(ruas.namaRuas);
    setFormWilayah(ruas.kecamatanPulau);
    setFormPanjang(ruas.panjangKm);
    setFormEndStaMeters(Math.max(1, Math.round(ruas.panjangKm * 1000)));
    setFormLebar(ruas.lebarMeter);
    setIsEditModalOpen(true);
  };

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingRuas(null);
    setFormNomor(`00${ruasList.length + 1}`);
    setFormNama('');
    setFormWilayah('Sipora Utara, Kab. Kep. Mentawai');
    setFormPanjang(10.0);
    setFormEndStaMeters(10000);
    setFormLebar(5.5);
    setIsEditModalOpen(true);
  };

  // Save Add/Edit
  const handleSaveRuas = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRuas) {
      const updated: RuasJalan = {
        ...editingRuas,
        nomorRuas: formNomor,
        namaRuas: formNama,
        kecamatanPulau: formWilayah,
        panjangKm: formPanjang,
        lebarMeter: formLebar,
      };
      onUpdateRuas(updated);
    } else {
      const newRuas: RuasJalan = {
        id: `ruas-${Date.now()}`,
        nomorRuas: formNomor,
        namaRuas: formNama || 'Ruas Jalan Baru',
        kecamatanPulau: formWilayah,
        panjangKm: formPanjang,
        lebarMeter: formLebar,
        staSegments: [],
        tipePermukaan: 'Aspal (AC-WC/HRS)',
        kondisiPKRMS: 'Baik',
        iriAvg: 3.2,
        sdiScore: 25,
        lastSurveyDate: new Date().toISOString().split('T')[0],
        koordinatAwal: [-2.0234, 99.5912],
        koordinatAkhir: [-2.0834, 99.6412],
        points: [
          [-2.0234, 99.5912],
          [-2.0534, 99.6150],
          [-2.0834, 99.6412],
        ],
        documentationCount: 0,
        rekomendasiPenanganan: 'Pemeliharaan Rutin',
      };
      onAddRuas(newRuas);
    }
    setIsEditModalOpen(false);
  };

  // Open Delete confirmation
  const handleOpenDelete = (id: string) => {
    setDeletingRuasId(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingRuasId) {
      onDeleteRuas(deletingRuasId);
      setDeletingRuasId(null);
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Title Bar & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                Kelola Ruas Jalan &amp; Lampiran Lapangan
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Basis data ruas jalan Kabupaten Kepulauan Mentawai dengan tipe permukaan jalan dan kondisi jalan per STA pada setiap ruas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadRuasExcelTemplate}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-semibold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Unduh file template Excel (*.xlsx) untuk pengisian ruas jalan baru"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Template Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExcelImportModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/50 text-sky-200 font-semibold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Impor daftar ruas jalan baru dari file Excel (*.xlsx / *.xls)"
            >
              <FileSpreadsheet className="w-4 h-4 text-sky-400" />
              <Upload className="w-3.5 h-3.5 text-sky-300" />
              <span>Impor Ruas (Excel)</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Ruas Baru</span>
            </button>

            <button
              type="button"
              disabled={ruasList.length === 0}
              onClick={() => exportGpsTracksToExcel(ruasList)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 disabled:opacity-40 disabled:cursor-not-allowed border border-cyan-500/50 text-cyan-200 font-semibold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Ekspor hasil GPS Tracker (per 100m + STA Akhir) seluruh ruas ke file Excel (.xlsx)"
            >
              <Route className="w-4 h-4 text-cyan-400" />
              <span>Tracker Excel</span>
            </button>

            <button
              type="button"
              disabled={ruasList.length === 0}
              onClick={() => void exportGpsTracksToKMZ(ruasList)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-500/50 text-indigo-200 font-semibold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Ekspor hasil GPS Tracker seluruh ruas ke file KMZ (Google Earth)"
            >
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>Tracker KMZ</span>
            </button>

            <button
              type="button"
              disabled={ruasList.length === 0}
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-rose-950 hover:bg-rose-900 disabled:opacity-40 disabled:cursor-not-allowed border border-rose-500/50 text-rose-200 font-semibold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Hapus seluruh data ruas jalan"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Hapus Seluruh Ruas</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-700">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari nomor, nama ruas jalan, atau wilayah/pulau..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Ruas Jalan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRuas.map((ruas) => {
            const segments = getRuasSTASegments(ruas);
            const ruasPhotoCount = photos.filter((p) => p.ruasId === ruas.id).length;
            const ruasVideoCount = videos.filter((v) => v.ruasId === ruas.id).length;

            return (
              <div
                key={ruas.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between shadow-lg transition"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded border border-amber-500/30">
                      Ruas {ruas.nomorRuas}
                    </span>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-slate-800 text-slate-200 border-slate-700">
                      {segments.length} Segmen STA
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white leading-snug">
                    {ruas.namaRuas}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{ruas.kecamatanPulau}</span>
                  </p>

                  {/* Road Dimensions */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500">Panjang: </span>
                      <span className="font-semibold text-white">{ruas.panjangKm} km</span>
                      <span className="block text-[10px] font-mono text-sky-400">
                        STA Akhir: {formatMeterToSTA(Math.round(ruas.panjangKm * 1000))}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Lebar: </span>
                      <span className="font-semibold text-white">{ruas.lebarMeter} m</span>
                      <span className="block text-[10px] font-mono text-cyan-400">
                        GPS Track: {ruas.gpsTrack?.length || 0} titik
                      </span>
                    </div>
                  </div>

                  {/* Per-STA Surface Type & Condition List */}
                  <div className="mt-3 bg-slate-950/75 p-2.5 rounded-lg border border-slate-800/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300">
                        Permukaan &amp; Kondisi per STA:
                      </span>
                      <button
                        type="button"
                        onClick={() => setStaModalRuas(ruas)}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      >
                        <ListChecks className="w-3 h-3" />
                        <span>Atur STA</span>
                      </button>
                    </div>

                    {segments.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setStaModalRuas(ruas)}
                        className="w-full py-2 px-2 rounded border border-dashed border-slate-700 hover:border-amber-500/50 text-[11px] text-slate-400 hover:text-amber-300 transition cursor-pointer"
                      >
                        + Tambah Tipe Permukaan &amp; Kondisi per STA
                      </button>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                        {segments.map((seg) => {
                          const segColor = getConditionColor(seg.kondisiJalan);
                          return (
                            <div
                              key={seg.id}
                              className="flex items-center justify-between gap-2 text-[11px] bg-slate-900/90 px-2 py-1.5 rounded border border-slate-800"
                            >
                              <div className="min-w-0">
                                <div className="font-mono font-bold text-sky-400 text-[10px]">
                                  {formatMeterToSTA(seg.startSta)} – {formatMeterToSTA(seg.endSta)}
                                </div>
                                <div className="text-slate-300 truncate">
                                  {seg.tipePermukaan}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${segColor.badgeBg}`}
                              >
                                {seg.kondisiJalan}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Media Count Badges: Foto vs Video */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-sky-950/40 border border-sky-500/25 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-sky-300 flex items-center gap-1">
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>Foto</span>
                      </span>
                      <span className="font-bold text-white">{ruasPhotoCount}</span>
                    </div>
                    <div className="bg-rose-950/40 border border-rose-500/25 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-rose-300 flex items-center gap-1">
                        <VideoIcon className="w-3.5 h-3.5" />
                        <span>Video</span>
                      </span>
                      <span className="font-bold text-white">{ruasVideoCount}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons: Fitur Impor Foto, Impor Video, Atur STA, Edit & Delete */}
                <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportPhotoRuas(ruas)}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-xs font-semibold transition cursor-pointer"
                      title="Impor foto dokumentasi ke ruas jalan ini"
                    >
                      <ImagePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Impor Foto</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportVideoRuas(ruas)}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-semibold transition cursor-pointer"
                      title="Impor video survei ke ruas jalan ini"
                    >
                      <VideoIcon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Impor Video</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => exportGpsTracksToExcel(ruasList, ruas)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold transition cursor-pointer"
                      title={`Ekspor hasil GPS Tracker Ruas ${ruas.nomorRuas} ke Excel (.xlsx)`}
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>GPS .XLSX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportGpsTracksToKML(ruasList, ruas)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-200 text-[11px] font-semibold transition cursor-pointer"
                      title={`Ekspor hasil GPS Tracker Ruas ${ruas.nomorRuas} ke KML`}
                    >
                      <FileCode className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>GPS .KML</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportGpsTracksToKMZ(ruasList, ruas)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 text-[11px] font-semibold transition cursor-pointer"
                      title={`Ekspor hasil GPS Tracker Ruas ${ruas.nomorRuas} ke KMZ`}
                    >
                      <Route className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>GPS .KMZ</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setStaModalRuas(ruas)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="Kelola Tipe Permukaan dan Kondisi Jalan per STA"
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      <span>STA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(ruas)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                      title="Edit Data Ruas Jalan"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-300" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDelete(ruas.id)}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-400 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Hapus Ruas Jalan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredRuas.length === 0 && (
          <div className="bg-slate-900/70 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <Layers className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-300">
              {ruasList.length === 0
                ? 'Belum ada data ruas jalan tersimpan'
                : 'Tidak ada ruas jalan yang sesuai dengan kata kunci pencarian'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {ruasList.length === 0
                ? 'Silakan tambahkan ruas jalan baru secara manual atau impor daftar ruas jalan melalui file Excel (*.xlsx).'
                : 'Ubah kata kunci pencarian untuk menampilkan ruas jalan lainnya.'}
            </p>
            {ruasList.length === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExcelImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/50 text-sky-200 font-semibold text-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  <span>Impor Ruas (Excel)</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Ruas Baru</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: Tambah / Edit Ruas Jalan (tanpa tipe permukaan, kondisi, SDI, IRI, rekomendasi penanganan) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                {editingRuas ? 'Edit Data Ruas Jalan' : 'Tambah Ruas Jalan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRuas} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Nomor Ruas *</label>
                  <input
                    type="text"
                    required
                    value={formNomor}
                    onChange={(e) => setFormNomor(e.target.value)}
                    placeholder="Contoh: 007"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Wilayah / Pulau *</label>
                  <input
                    type="text"
                    required
                    value={formWilayah}
                    onChange={(e) => setFormWilayah(e.target.value)}
                    placeholder="Contoh: Sipora Utara"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nama Ruas Jalan *</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Contoh: Tuapejat - SP2"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Panjang Ruas (km) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={formPanjang}
                    onChange={(e) => {
                      const km = Number(e.target.value);
                      setFormPanjang(km);
                      if (Number.isFinite(km) && km > 0) {
                        setFormEndStaMeters(Math.round(km * 1000));
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">STA Akhir (meter) *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={formEndStaMeters}
                    onChange={(e) => {
                      const m = Math.max(1, Math.round(Number(e.target.value) || 0));
                      setFormEndStaMeters(m);
                      setFormPanjang(Number((m / 1000).toFixed(3)));
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-[10px] text-sky-400 font-mono mt-1 block">
                    {formatMeterToSTA(formEndStaMeters)} (non-kelipatan 100 didukung)
                  </span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Lebar Perkerasan (m) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="2"
                    required
                    value={formLebar}
                    onChange={(e) => setFormLebar(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400">
                Tipe permukaan jalan dan kondisi jalan diatur per segmen STA melalui tombol <strong className="text-amber-300">Atur STA</strong> pada kartu ruas jalan.
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer"
                >
                  Simpan Ruas Jalan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Hapus Ruas Jalan */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Konfirmasi Hapus Ruas</h3>
            </div>
            <p className="text-xs text-slate-300">
              Apakah Anda yakin ingin menghapus data ruas jalan ini dari sistem? Seluruh relasi titik survei akan terputus.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Hapus Seluruh Ruas Jalan */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">
                Konfirmasi Hapus Seluruh Ruas
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong className="text-rose-300">seluruh ({ruasList.length}) ruas jalan</strong> dari sistem? Daftar ruas jalan akan dikosongkan dan tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAllRuas();
                  setIsDeleteAllModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Seluruh Ruas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Atur Tipe Permukaan & Kondisi Jalan per STA */}
      <RuasSTASegmentsModal
        ruas={staModalRuas}
        onClose={() => setStaModalRuas(null)}
        onSaveRuas={onUpdateRuas}
      />

      {/* MODAL: Fitur Impor Foto per Ruas Jalan */}
      <ImportPhotoModal
        ruas={importPhotoRuas}
        isOnline={isOnline}
        onClose={() => setImportPhotoRuas(null)}
        onImportPhoto={onAddPhoto}
      />

      {/* MODAL: Fitur Impor Video per Ruas Jalan */}
      <ImportVideoModal
        ruas={importVideoRuas}
        isOnline={isOnline}
        onClose={() => setImportVideoRuas(null)}
        onImportVideo={onAddVideo}
      />

      {/* MODAL: Impor Ruas Baru dari File Excel */}
      <ImportRuasExcelModal
        isOpen={isExcelImportModalOpen}
        existingRuasList={ruasList}
        onClose={() => setIsExcelImportModalOpen(false)}
        onImportRuasList={onImportRuasList}
      />
    </div>
  );
};
