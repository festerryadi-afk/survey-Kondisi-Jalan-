import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Download,
  Eye,
  FileSpreadsheet,
  Printer,
  Filter,
  MapPin,
  CheckCircle2,
  Trash2,
  AlertCircle,
  ImagePlus,
  Sparkles,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { RuasJalan, SurveyPhoto } from '../types';
import { generateExcelXML, downloadFile, comparePhotosByStaAsc } from '../utils/geo';
import { downloadPhoto3R600DPI, exportGroupedReportPDF } from '../utils/photo3r';
import { formatMeterToSTA, getConditionColor, getRuasSTASegments } from '../utils/pkrms';
import { analyzeRoadDamageFromPhoto } from '../utils/roadDamageAI';
import { ImportPhotoModal } from './ImportPhotoModal';

interface PhotoDocumentationViewProps {
  ruasList: RuasJalan[];
  photos: SurveyPhoto[];
  isOnline: boolean;
  onAddPhoto: (photo: SurveyPhoto) => void;
  onUpdatePhoto?: (photo: SurveyPhoto) => void;
  onViewPhoto: (photo: SurveyPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteAllPhotos?: () => void;
  onOpenStorageSettings?: () => void;
}

export const PhotoDocumentationView: React.FC<PhotoDocumentationViewProps> = ({
  ruasList,
  photos,
  isOnline,
  onAddPhoto,
  onUpdatePhoto,
  onViewPhoto,
  onDeletePhoto,
  onDeleteAllPhotos,
  onOpenStorageSettings,
}) => {
  const [importTargetRuas, setImportTargetRuas] = useState<RuasJalan | null>(null);
  const [selectedRuasFilter, setSelectedRuasFilter] = useState<string>('all');
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);
  const [confirmDeleteAllPhotos, setConfirmDeleteAllPhotos] = useState<boolean>(false);

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfFeedback, setPdfFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState<string | null>(null);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState<boolean>(false);
  const [batchProgressText, setBatchProgressText] = useState<string>('');
  const [aiFeedback, setAiFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleDownloadPhoto = async (photo: SurveyPhoto, e: React.MouseEvent) => {
    e.stopPropagation();
    await downloadPhoto3R600DPI(
      photo.imageUrl,
      `DPUPR_MENTAWAI_3R_600DPI_Ruas${photo.nomorRuas}_${photo.staText}_${Date.now()}.jpg`,
      photo.id
    );
  };

  const handleExportGroupedExcel = () => {
    const xml = generateExcelXML(ruasList, photos);
    downloadFile(xml, `Pelaporan_Dokumentasi_Foto_Mentawai_${Date.now()}.xls`, 'application/vnd.ms-excel');
  };

  const handleExportPDF = async () => {
    setIsExportingPdf(true);
    setPdfFeedback(null);
    try {
      await exportGroupedReportPDF(ruasList, photos, selectedRuasFilter);
      setPdfFeedback({
        type: 'success',
        message: 'Laporan *.PDF Portrait (3 foto per halaman urut STA kecil ke besar, HD 600 DPI) berhasil diunduh.',
      });
      setTimeout(() => setPdfFeedback(null), 5000);
    } catch (err) {
      console.error('PDF export error:', err);
      const detail = err instanceof Error ? err.message : '';
      setPdfFeedback({
        type: 'error',
        message: detail
          ? `Gagal membuat file *.PDF (${detail}). Silakan coba kembali.`
          : 'Gagal membuat file *.PDF. Pastikan data foto valid dan coba kembali.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const groupedRuas = ruasList
    .map((ruas) => ({
      ruas,
      photos: photos
        .filter((p) => p.ruasId === ruas.id)
        .sort(comparePhotosByStaAsc),
    }))
    .filter((group) => selectedRuasFilter === 'all' || group.ruas.id === selectedRuasFilter);

  const handleDetectPhotoAI = async (photo: SurveyPhoto, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline) {
      setAiFeedback({
        type: 'error',
        message: 'Deteksi AI memerlukan koneksi internet aktif.',
      });
      return;
    }
    setAnalyzingPhotoId(photo.id);
    setAiFeedback(null);
    try {
      const result = await analyzeRoadDamageFromPhoto(photo.imageUrl, photo.surfaceType);
      onUpdatePhoto?.({
        ...photo,
        defects: result.defects,
        pkrmsCondition: result.condition,
        recommendation: result.recommendation,
        surfaceType: result.detectedSurfaceType,
      });
      setAiFeedback({
        type: 'success',
        message: `Deteksi AI (${photo.staText}): Kondisi ${result.condition} • ${result.defects.length} cacat • ${result.summary}`,
      });
      setTimeout(() => setAiFeedback(null), 6000);
    } catch (err) {
      setAiFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Gagal mendeteksi tingkat kerusakan jalan dari foto.',
      });
    } finally {
      setAnalyzingPhotoId(null);
    }
  };

  const handleBatchDetectAI = async () => {
    if (!isOnline) {
      setAiFeedback({
        type: 'error',
        message: 'Deteksi AI massal memerlukan koneksi internet aktif.',
      });
      return;
    }
    const targetPhotos = groupedRuas.flatMap((g) => g.photos);
    if (targetPhotos.length === 0) {
      setAiFeedback({
        type: 'error',
        message: 'Tidak ada foto pada filter ruas yang dipilih untuk dianalisis.',
      });
      return;
    }

    setIsBatchAnalyzing(true);
    setAiFeedback(null);
    let successCount = 0;
    try {
      for (let i = 0; i < targetPhotos.length; i++) {
        const p = targetPhotos[i];
        setBatchProgressText(`Deteksi AI (${i + 1}/${targetPhotos.length})...`);
        const result = await analyzeRoadDamageFromPhoto(p.imageUrl, p.surfaceType);
        onUpdatePhoto?.({
          ...p,
          defects: result.defects,
          pkrmsCondition: result.condition,
          recommendation: result.recommendation,
          surfaceType: result.detectedSurfaceType,
        });
        successCount++;
      }
      setAiFeedback({
        type: 'success',
        message: `${successCount} foto selesai dideteksi tingkat kerusakannya secara otomatis oleh AI.`,
      });
      setTimeout(() => setAiFeedback(null), 6000);
    } catch (err) {
      setAiFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? `Berhasil ${successCount}/${targetPhotos.length} foto. Error: ${err.message}`
            : 'Gagal menyelesaikan deteksi AI pada sebagian foto.',
      });
    } finally {
      setIsBatchAnalyzing(false);
      setBatchProgressText('');
    }
  };

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-2.5 sm:p-6 overflow-y-auto overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-3 sm:pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-sky-400 shrink-0" />
              <h2 className="text-base sm:text-xl font-bold text-white tracking-tight">
                Dokumentasi Foto Lapangan (*.JPG)
              </h2>
            </div>
            <p className="text-[11px] sm:text-sm text-slate-400 mt-1">
              Arsip &amp; impor foto geotagging resolusi HD 600 DPI ukuran cetak 3R (8,9 × 12,7 cm) per ruas jalan Kabupaten Kepulauan Mentawai.
            </p>
          </div>

          {/* Export & AI Action Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {onOpenStorageSettings && (
              <button
                type="button"
                onClick={onOpenStorageSettings}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-semibold text-[11px] sm:text-xs whitespace-nowrap shadow-md transition cursor-pointer"
                title="Atur lokasi & kualitas penyimpanan foto pada perangkat"
              >
                <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Penyimpanan</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleBatchDetectAI}
              disabled={isBatchAnalyzing || analyzingPhotoId !== null}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] sm:text-xs whitespace-nowrap shadow-md transition disabled:opacity-60 cursor-pointer"
              title="Deteksi otomatis tingkat kerusakan jalan seluruh foto menggunakan AI"
            >
              {isBatchAnalyzing ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              )}
              <span className="truncate">
                {isBatchAnalyzing ? batchProgressText || 'Menganalisis AI...' : 'Deteksi AI'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPdf}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-semibold text-[11px] sm:text-xs whitespace-nowrap shadow-md transition disabled:opacity-60 cursor-pointer"
              title="Unduh Laporan Foto Dokumentasi *.PDF Portrait (3 foto per halaman urut STA, HD 600 DPI)"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
              <span className="truncate">{isExportingPdf ? 'Membuat *.PDF...' : 'Ekspor *.PDF (Portrait)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportGroupedExcel}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:px-3.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-semibold text-[11px] sm:text-xs whitespace-nowrap shadow-md transition cursor-pointer"
              title="Ekspor Seluruh Inventaris dan Foto ke Excel (.XLS)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Ekspor Excel</span>
            </button>
          </div>
        </div>

        {pdfFeedback && (
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              pdfFeedback.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
            }`}
          >
            {pdfFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{pdfFeedback.message}</span>
          </div>
        )}

        {aiFeedback && (
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              aiFeedback.type === 'success'
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-100'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
            }`}
          >
            {aiFeedback.type === 'success' ? (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{aiFeedback.message}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 bg-slate-900 p-2.5 sm:p-3 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Ruas:</span>
            <select
              value={selectedRuasFilter}
              onChange={(e) => setSelectedRuasFilter(e.target.value)}
              className="w-full sm:w-auto min-w-0 truncate bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Ruas Jalan ({ruasList.length})</option>
              {ruasList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nomorRuas} - {r.namaRuas}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <div className="text-[11px] sm:text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-lg whitespace-nowrap">
              Total Foto: {photos.length} (*.JPG)
            </div>
            {photos.length > 0 && onDeleteAllPhotos && (
              <button
                type="button"
                onClick={() => setConfirmDeleteAllPhotos(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                title="Hapus seluruh titik foto dokumentasi"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Hapus Semua</span>
              </button>
            )}
          </div>
        </div>

        {/* Grouped Road Segments Photo Section */}
        <div className="space-y-4 sm:space-y-6">
          {groupedRuas.map(({ ruas, photos: rPhotos }) => {
            const segments = getRuasSTASegments(ruas);

            return (
              <div
                key={ruas.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
              >
                {/* Ruas Header with dedicated Impor Foto button */}
                <div className="bg-slate-950/80 px-3 py-3 sm:px-5 sm:py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                    <span className="font-mono text-xs sm:text-sm font-bold bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/30 whitespace-nowrap shrink-0">
                      Ruas {ruas.nomorRuas}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">{ruas.namaRuas}</h3>
                      <p className="text-[11px] sm:text-xs text-slate-400">
                        {ruas.kecamatanPulau} • {ruas.panjangKm} km •{' '}
                        {segments.length > 0
                          ? segments
                              .map(
                                (s) =>
                                  `${formatMeterToSTA(s.startSta)}-${formatMeterToSTA(s.endSta)} (${s.tipePermukaan.split(' ')[0]} / ${s.kondisiJalan})`
                              )
                              .join(' • ')
                          : 'Belum ada data STA'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setImportTargetRuas(ruas)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold whitespace-nowrap shadow transition cursor-pointer"
                      title={`Impor foto ke Ruas ${ruas.nomorRuas}`}
                    >
                      <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Impor Foto</span>
                    </button>
                    <span className="text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-2 py-1 rounded border border-slate-700 whitespace-nowrap">
                      {segments.length} Segmen STA
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-2 py-1 rounded border border-slate-700 whitespace-nowrap">
                      {rPhotos.length} Foto
                    </span>
                  </div>
                </div>

                <div className="p-2.5 sm:p-5">
                  {rPhotos.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 py-3 px-3 sm:px-4 rounded-xl bg-slate-950/50 border border-dashed border-slate-800">
                      <p className="text-xs text-slate-500 italic">
                        Belum ada dokumentasi foto untuk ruas jalan ini.
                      </p>
                      <button
                        type="button"
                        onClick={() => setImportTargetRuas(ruas)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>Impor Foto Sekarang</span>
                      </button>
                    </div>
                  ) : (
                    <div dir="ltr" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {rPhotos.map((photo) => {
                        const pColors = getConditionColor(photo.pkrmsCondition);

                        return (
                          <div
                            key={photo.id}
                            className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow flex flex-col justify-between transition group"
                          >
                            <div>
                              <div
                                className="relative cursor-pointer overflow-hidden aspect-[127/89] bg-slate-900"
                                onClick={() => onViewPhoto(photo)}
                              >
                                <img
                                  src={photo.imageUrl}
                                  alt={photo.staText}
                                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                                />
                                {photo.isAutoCapture && (
                                  <div className="absolute top-2 left-2 bg-sky-950/90 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                    Auto 100m
                                  </div>
                                )}
                                <div className="absolute top-2 right-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow ${pColors.badgeBg}`}>
                                    {photo.pkrmsCondition}
                                  </span>
                                </div>
                              </div>

                              <div className="p-3 text-xs space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-sky-400 text-xs">
                                    {photo.staText}
                                  </span>
                                  <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    3R (8,9×12,7 cm) • 600 DPI
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                                    <span>
                                      {photo.coordinates.lat.toFixed(5)}, {photo.coordinates.lng.toFixed(5)}
                                    </span>
                                  </div>
                                  <span>
                                    {new Date(photo.timestamp).toLocaleTimeString('id-ID', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}{' '}
                                    WIB
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-300">
                                  <span className="text-slate-500">Cacat: </span>
                                  <span className={photo.defects.length > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                                    {photo.defects.length > 0
                                      ? photo.defects.map((d) => `${d.type} [${d.severity}]`).join(', ')
                                      : 'Permukaan Baik'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* View | AI | Delete | Download */}
                            <div className="p-2.5 pt-0 border-t border-slate-900 flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onViewPhoto(photo)}
                                className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                                title="Lihat Foto Dokumentasi Resolusi Penuh"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="truncate">View</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => void handleDetectPhotoAI(photo, e)}
                                disabled={analyzingPhotoId === photo.id || isBatchAnalyzing}
                                className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                                title="Deteksi Otomatis Tingkat Kerusakan Jalan dari Foto Ini"
                              >
                                {analyzingPhotoId === photo.id ? (
                                  <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                )}
                                <span className="truncate">
                                  {analyzingPhotoId === photo.id ? 'AI...' : 'Deteksi AI'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeletePhotoId(photo.id);
                                }}
                                className="py-1.5 px-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-semibold transition shadow-sm cursor-pointer"
                                title="Hapus File Foto Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleDownloadPhoto(photo, e)}
                                className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow cursor-pointer"
                                title="Unduh File Foto Watermark (*.JPG)"
                              >
                                <Download className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Unduh</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Foto */}
      {confirmDeletePhotoId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 text-center mb-2">
              Hapus Foto Dokumentasi?
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 text-center mb-5 sm:mb-6">
              Foto dokumentasi survei kondisi jalan ini akan dihapus dari penyimpanan lokal dan pelaporan ruas. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeletePhotoId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePhoto(confirmDeletePhotoId);
                  setConfirmDeletePhotoId(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Ya, Hapus Foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Semua Titik Foto */}
      {confirmDeleteAllPhotos && onDeleteAllPhotos && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 text-center mb-2">
              Hapus Semua Titik Foto?
            </h3>
            <p className="text-sm text-slate-400 text-center mb-6">
              Seluruh <b>{photos.length} titik foto</b> dokumentasi di semua ruas jalan dan peta akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteAllPhotos(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAllPhotos();
                  setConfirmDeleteAllPhotos(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportPhotoModal
        ruas={importTargetRuas}
        isOnline={isOnline}
        onClose={() => setImportTargetRuas(null)}
        onImportPhoto={onAddPhoto}
      />
    </div>
  );
};
