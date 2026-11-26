import React, { useState } from 'react';
import {
  Video as VideoIcon,
  Download,
  Eye,
  Filter,
  Trash2,
  Upload,
  HardDrive,
} from 'lucide-react';
import { RuasJalan, SurveyVideo } from '../types';
import { downloadSurveyVideo } from '../utils/videoRecorder';
import { formatMeterToSTA, getRuasSTASegments } from '../utils/pkrms';
import { ImportVideoModal } from './ImportVideoModal';

interface VideoDocumentationViewProps {
  ruasList: RuasJalan[];
  videos: SurveyVideo[];
  isOnline: boolean;
  onAddVideo: (video: SurveyVideo) => void;
  onViewVideo: (video: SurveyVideo) => void;
  onDeleteVideo: (id: string) => void;
  onOpenStorageSettings?: () => void;
}

export const VideoDocumentationView: React.FC<VideoDocumentationViewProps> = ({
  ruasList,
  videos,
  isOnline,
  onAddVideo,
  onViewVideo,
  onDeleteVideo,
  onOpenStorageSettings,
}) => {
  const [importTargetRuas, setImportTargetRuas] = useState<RuasJalan | null>(null);
  const [selectedRuasFilter, setSelectedRuasFilter] = useState<string>('all');
  const [confirmDeleteVideoId, setConfirmDeleteVideoId] = useState<string | null>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(null);

  const handleDownloadVideo = async (video: SurveyVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingVideoId(video.id);
    try {
      await downloadSurveyVideo(video);
    } catch (err) {
      console.error('Video download error:', err);
    } finally {
      setDownloadingVideoId(null);
    }
  };

  const knownRuasIds = new Set(ruasList.map((r) => r.id));
  const matchedVideoIds = new Set<string>();

  const groupedRuas = ruasList
    .map((ruas) => {
      const roadVideos = videos.filter((v) => {
        const directMatch = v.ruasId === ruas.id;
        const fallbackMatch = !knownRuasIds.has(v.ruasId) && v.nomorRuas === ruas.nomorRuas;
        if (directMatch || fallbackMatch) {
          matchedVideoIds.add(v.id);
          return true;
        }
        return false;
      });
      return {
        ruas,
        videos: roadVideos,
      };
    })
    .filter((group) => selectedRuasFilter === 'all' || group.ruas.id === selectedRuasFilter);

  const orphanVideos =
    selectedRuasFilter === 'all' ? videos.filter((v) => !matchedVideoIds.has(v.id)) : [];

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 p-2.5 sm:p-6 overflow-y-auto overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-3 sm:pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <VideoIcon className="w-5 h-5 text-rose-400 shrink-0" />
              <h2 className="text-base sm:text-xl font-bold text-white tracking-tight">
                Dokumentasi Video Survei Jalan (*.MP4 / *.MPEG)
              </h2>
            </div>
            <p className="text-[11px] sm:text-sm text-slate-400 mt-1">
              Arsip &amp; impor video survei kondisi lapangan per ruas jalan Kabupaten Kepulauan Mentawai yang dapat diputar dan diunduh langsung.
            </p>
          </div>
          {onOpenStorageSettings && (
            <button
              type="button"
              onClick={onOpenStorageSettings}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-semibold text-xs whitespace-nowrap shadow-md transition cursor-pointer"
              title="Atur lokasi & bitrate penyimpanan video pada perangkat"
            >
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Pengaturan Penyimpanan</span>
            </button>
          )}
        </div>

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

          <div className="text-[11px] sm:text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg self-start sm:self-auto whitespace-nowrap">
            Total Arsip Video: {videos.length} File
          </div>
        </div>

        {/* Grouped Road Segments Video Section */}
        <div className="space-y-4 sm:space-y-6">
          {groupedRuas.map(({ ruas, videos: rVideos }) => {
            const segments = getRuasSTASegments(ruas);

            return (
              <div
                key={ruas.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
              >
                {/* Ruas Header with dedicated Impor Video button */}
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold whitespace-nowrap shadow transition cursor-pointer"
                      title={`Impor video ke Ruas ${ruas.nomorRuas}`}
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>Impor Video</span>
                    </button>
                    <span className="text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-2 py-1 rounded border border-slate-700 whitespace-nowrap">
                      {segments.length} Segmen STA
                    </span>
                    <span className="text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-2 py-1 rounded border border-slate-700 whitespace-nowrap">
                      {rVideos.length} Video
                    </span>
                  </div>
                </div>

                <div className="p-2.5 sm:p-5">
                  {rVideos.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 py-3 px-3 sm:px-4 rounded-xl bg-slate-950/50 border border-dashed border-slate-800">
                      <p className="text-xs text-slate-500 italic">
                        Belum ada arsip video survei untuk ruas jalan ini.
                      </p>
                      <button
                        type="button"
                        onClick={() => setImportTargetRuas(ruas)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>Impor Video Sekarang</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {rVideos.map((video) => (
                        <div
                          key={video.id}
                          className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow flex flex-col justify-between transition"
                        >
                          <div>
                            <div
                              className="relative aspect-video bg-black cursor-pointer group"
                              onClick={() => onViewVideo(video)}
                            >
                              {video.thumbnailUrl ? (
                                <img
                                  src={video.thumbnailUrl}
                                  alt="Video Thumbnail"
                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                                  <VideoIcon className="w-12 h-12" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                                  <Eye className="w-6 h-6" />
                                </div>
                              </div>
                              <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-white">
                                Durasi: {video.durationSeconds}s
                              </div>
                              <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-white">
                                {(video.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                              </div>
                            </div>

                            <div className="p-3 text-xs space-y-1.5">
                              <div className="font-semibold text-white">
                                Survei STA {video.startSta} - {video.endSta} m
                              </div>
                              <div className="text-slate-400 text-[11px] flex items-center gap-2">
                                <span>{new Date(video.timestamp).toLocaleString('id-ID')}</span>
                                <span>•</span>
                                <span className="text-rose-400 font-semibold">{video.defectsCount} Cacat Terekam</span>
                              </div>
                            </div>
                          </div>

                          {/* View | Delete | Download */}
                          <div className="p-2.5 pt-0 border-t border-slate-900 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onViewVideo(video)}
                              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                              title="Putar & Lihat Video Survei"
                            >
                              <Eye className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="truncate">View</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteVideoId(video.id);
                              }}
                              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-semibold transition shadow-sm cursor-pointer"
                              title="Hapus File Video Ini"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="truncate">Delete</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleDownloadVideo(video, e)}
                              disabled={downloadingVideoId === video.id}
                              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow disabled:opacity-60 cursor-pointer"
                              title="Unduh File Video Survei"
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {downloadingVideoId === video.id ? 'Menyiapkan...' : 'Download'}
                              </span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {orphanVideos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-slate-950/80 px-3 py-3 sm:px-5 sm:py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white">Arsip Video Ruas Lainnya</h3>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    Rekaman video yang tersimpan sebelum daftar ruas diperbarui
                  </p>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 whitespace-nowrap">
                  {orphanVideos.length} Video
                </span>
              </div>
              <div className="p-2.5 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {orphanVideos.map((video) => (
                  <div
                    key={video.id}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow flex flex-col justify-between transition"
                  >
                    <div>
                      <div
                        className="relative aspect-video bg-black cursor-pointer group"
                        onClick={() => onViewVideo(video)}
                      >
                        {video.thumbnailUrl ? (
                          <img
                            src={video.thumbnailUrl}
                            alt="Video Thumbnail"
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                            <VideoIcon className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                            <Eye className="w-6 h-6" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-white">
                          Durasi: {video.durationSeconds}s
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-white">
                          {(video.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                      <div className="p-3 text-xs space-y-1.5">
                        <div className="font-semibold text-white">
                          Ruas {video.nomorRuas} - {video.ruasNama} (STA {video.startSta} - {video.endSta} m)
                        </div>
                        <div className="text-slate-400 text-[11px] flex items-center gap-2">
                          <span>{new Date(video.timestamp).toLocaleString('id-ID')}</span>
                          <span>•</span>
                          <span className="text-rose-400 font-semibold">{video.defectsCount} Cacat Terekam</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5 pt-0 border-t border-slate-900 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewVideo(video)}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">View</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteVideoId(video.id);
                        }}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-semibold transition shadow-sm cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">Delete</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDownloadVideo(video, e)}
                        disabled={downloadingVideoId === video.id}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow disabled:opacity-60 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {downloadingVideoId === video.id ? 'Menyiapkan...' : 'Download'}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Video */}
      {confirmDeleteVideoId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 text-center mb-2">
              Hapus File Video Survei?
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 text-center mb-5 sm:mb-6">
              Rekaman video survei ruas ini (*.MP4) akan dihapus dari penyimpanan aplikasi. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteVideoId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteVideo(confirmDeleteVideoId);
                  setConfirmDeleteVideoId(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Ya, Hapus Video
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportVideoModal
        ruas={importTargetRuas}
        isOnline={isOnline}
        onClose={() => setImportTargetRuas(null)}
        onImportVideo={onAddVideo}
      />
    </div>
  );
};
