import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Download, 
  Navigation, 
  MapPin, 
  FileSpreadsheet, 
  FileCode, 
  Eye, 
  Filter, 
  Maximize, 
  Compass,
  LocateFixed,
  Globe,
  RefreshCw,
  ImagePlus,
  Video as VideoIcon,
  ListChecks,
  Upload,
  EyeOff,
  Trash2,
  Palette,
  Route
} from 'lucide-react';
import { ImportedKmlLayer, MapConditionColors, RuasJalan, SurveyPhoto, SurveyVideo } from '../types';
import {
  generateKML,
  generateCSV,
  generateExcelXML,
  downloadFile,
  formatSTA,
  getRuasRoutePoints,
  slicePolylineByDistanceRatio,
} from '../utils/geo';
import {
  formatMeterToSTA,
  getConditionColor,
  getRuasSTASegments,
} from '../utils/pkrms';
import { escapeHtml } from '../utils/kmlKmz';
import {
  exportGpsTracksToExcel,
  exportGpsTracksToKML,
  exportGpsTracksToKMZ,
} from '../utils/gpsTrackerExport';
import { ImportPhotoModal } from './ImportPhotoModal';
import { ImportVideoModal } from './ImportVideoModal';
import { RuasSTASegmentsModal } from './RuasSTASegmentsModal';
import { ImportKmlModal } from './ImportKmlModal';
import {
  ColorEditTarget,
  DEFAULT_CONDITION_COLORS,
  MapLayerColorModal,
} from './MapLayerColorModal';

interface InteractiveMapViewProps {
  ruasList: RuasJalan[];
  photos: SurveyPhoto[];
  videos: SurveyVideo[];
  kmlLayers: ImportedKmlLayer[];
  selectedRuasId: string;
  setSelectedRuasId: (id: string) => void;
  isOnline: boolean;
  onUpdateRuas: (ruas: RuasJalan) => void;
  onAddPhoto: (photo: SurveyPhoto) => void;
  onAddVideo: (video: SurveyVideo) => void;
  onAddKmlLayer: (layer: ImportedKmlLayer, alsoRegisterRoads: boolean) => void;
  onToggleKmlLayer: (id: string) => void;
  onUpdateKmlLayerColor: (id: string, color: string) => void;
  onDeleteKmlLayer: (id: string) => void;
  onViewPhoto: (photo: SurveyPhoto) => void;
  conditionColors: MapConditionColors;
  onUpdateConditionColors: (colors: MapConditionColors) => void;
}

export const InteractiveMapView: React.FC<InteractiveMapViewProps> = ({
  ruasList,
  photos,
  videos,
  kmlLayers,
  selectedRuasId,
  setSelectedRuasId,
  isOnline,
  onUpdateRuas,
  onAddPhoto,
  onAddVideo,
  onAddKmlLayer,
  onToggleKmlLayer,
  onUpdateKmlLayerColor,
  onDeleteKmlLayer,
  onViewPhoto,
  conditionColors,
  onUpdateConditionColors,
}) => {
  const [importPhotoRuas, setImportPhotoRuas] = useState<RuasJalan | null>(null);
  const [importVideoRuas, setImportVideoRuas] = useState<RuasJalan | null>(null);
  const [staModalRuas, setStaModalRuas] = useState<RuasJalan | null>(null);
  const [isKmlImportModalOpen, setIsKmlImportModalOpen] = useState<boolean>(false);
  const [colorEditTarget, setColorEditTarget] = useState<ColorEditTarget | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const photoPointsRendererRef = useRef<L.SVG | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const labelTileLayerRef = useRef<L.TileLayer | null>(null);
  const userLocationMarkerRef = useRef<L.CircleMarker | null>(null);

  const [activeTileLayer, setActiveTileLayer] = useState<'streets' | 'satellite' | 'terrain'>('streets');
  const [tileStatus, setTileStatus] = useState<'loading' | 'active' | 'fallback'>('loading');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [showSurveyPoints, setShowSurveyPoints] = useState<boolean>(true);
  const [showGpsTracks, setShowGpsTracks] = useState<boolean>(true);
  const [selectedPointPhoto, setSelectedPointPhoto] = useState<SurveyPhoto | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: -2.1333,
    lng: 99.6000,
    zoom: 9,
  });
  const [isLocating, setIsLocating] = useState<boolean>(false);

  useEffect(() => {
    if (photos.length === 0 && selectedPointPhoto) {
      setSelectedPointPhoto(null);
    }
  }, [photos.length, selectedPointPhoto]);

  // 1. Initialize Leaflet Map & ResizeObserver
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (!mapInstanceRef.current) {
      // Center of Kepulauan Mentawai (Sipora / Tuapejat)
      const map = L.map(container, {
        center: [-2.1333, 99.6000],
        zoom: 9,
        zoomControl: true,
        attributionControl: true,
      });

      // Dedicated pane above road polylines & KML overlays (overlayPane = 400, markerPane = 600)
      const photoPointsPane = map.createPane('photoPointsPane');
      photoPointsPane.style.zIndex = '620';

      const layerGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layerGroup;
      photoPointsRendererRef.current = L.svg({ padding: 0.5, pane: 'photoPointsPane' });
      mapInstanceRef.current = map;

      // Track live coordinates & zoom
      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        setCursorCoords({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          zoom: map.getZoom(),
        });
      });

      map.on('zoomend moveend', () => {
        const center = map.getCenter();
        setCursorCoords({
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom(),
        });
      });

      map.whenReady(() => {
        map.invalidateSize({ animate: false });
      });

      setTimeout(() => {
        map.invalidateSize({ animate: false });
      }, 150);
    }

    // ResizeObserver agar ukuran kanvas peta selalu sinkron di HP, Tablet, & PC
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
        photoPointsRendererRef.current = null;
        baseTileLayerRef.current = null;
        labelTileLayerRef.current = null;
      }
    };
  }, []);

  // 2. Real-time Leaflet TileLayers (Peta Jalan, Satelit, Topografi) + Fallback Otomatis
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Bersihkan tile layer sebelumnya dengan aman
    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
      baseTileLayerRef.current = null;
    }
    if (labelTileLayerRef.current) {
      map.removeLayer(labelTileLayerRef.current);
      labelTileLayerRef.current = null;
    }

    setTileStatus('loading');
    let errorCount = 0;
    let switchedFallback = false;

    const attachBaseLayer = (
      primaryUrl: string,
      primaryOpts: L.TileLayerOptions,
      fallbackUrl: string,
      fallbackOpts: L.TileLayerOptions,
      overlayUrl?: string,
      overlayOpts?: L.TileLayerOptions
    ) => {
      const layer = L.tileLayer(primaryUrl, primaryOpts);

      layer.on('load', () => {
        if (!switchedFallback) {
          setTileStatus('active');
        }
      });

      layer.on('tileload', () => {
        if (!switchedFallback) {
          setTileStatus('active');
        }
      });

      layer.on('tileerror', () => {
        errorCount += 1;
        if (errorCount >= 3 && !switchedFallback && mapInstanceRef.current) {
          switchedFallback = true;
          setTileStatus('fallback');
          if (baseTileLayerRef.current) {
            map.removeLayer(baseTileLayerRef.current);
          }
          const fbLayer = L.tileLayer(fallbackUrl, fallbackOpts).addTo(map);
          fbLayer.bringToBack();
          baseTileLayerRef.current = fbLayer;
        }
      });

      layer.addTo(map);
      layer.bringToBack();
      baseTileLayerRef.current = layer;

      if (overlayUrl && overlayOpts) {
        const overlay = L.tileLayer(overlayUrl, overlayOpts).addTo(map);
        overlay.bringToFront();
        labelTileLayerRef.current = overlay;
      }
    };

    if (activeTileLayer === 'satellite') {
      // Satelit: Esri World Imagery + Overlay Nama Tempat, dengan fallback Google Hybrid Satellite
      attachBaseLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Citra Satelit &copy; Esri | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 19,
        },
        'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          subdomains: ['0', '1', '2', '3'],
          attribution: 'Citra Satelit &copy; Google | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 20,
        },
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          opacity: 0.9,
        }
      );
    } else if (activeTileLayer === 'terrain') {
      // Topografi: OpenTopoMap dengan fallback Esri World Topo
      attachBaseLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {
          attribution: 'Topografi &copy; OpenTopoMap | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 17,
        },
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Topografi &copy; Esri | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 19,
        }
      );
    } else {
      // Peta Jalan: OpenStreetMap dengan fallback Esri World Street Map
      attachBaseLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 19,
        },
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Peta Jalan &copy; Esri | DPUPR Kab. Kepulauan Mentawai',
          maxZoom: 19,
        }
      );
    }

    setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 100);
  }, [activeTileLayer]);

  // Ensure Leaflet recalculates size whenever mobileTab switches back to map
  useEffect(() => {
    if (mobileTab === 'map' && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize({ animate: false });
      }, 100);
    }
  }, [mobileTab]);

  // 3. Render Polylines & Markers whenever data or filters change
  useEffect(() => {
    if (!mapInstanceRef.current || !layersGroupRef.current) return;
    const layerGroup = layersGroupRef.current;
    layerGroup.clearLayers();

    // 1. Draw Road Segments (Polylines per STA using true cumulative distance along route)
    ruasList.forEach((ruas) => {
      const segments = getRuasSTASegments(ruas);
      const routePts = getRuasRoutePoints(ruas);
      const totalMeters = Math.max(1, Math.round(ruas.panjangKm * 1000));
      const isSelected = ruas.id === selectedRuasId;

      if (segments.length === 0) {
        if (filterCondition === 'all') {
          const polyline = L.polyline(routePts, {
            color: ruas.customColor || '#64748b',
            weight: isSelected ? 7 : 4,
            opacity: isSelected ? 1.0 : 0.85,
          });
          polyline.bindTooltip(`<b>${ruas.nomorRuas} - ${ruas.namaRuas}</b><br/>Belum ada data STA`, {
            sticky: true,
          });
          polyline.on('click', () => setSelectedRuasId(ruas.id));
          layerGroup.addLayer(polyline);
        }
      } else {
        segments.forEach((seg) => {
          if (filterCondition !== 'all' && seg.kondisiJalan !== filterCondition) {
            return;
          }
          const lineHex =
            ruas.customColor ||
            conditionColors[seg.kondisiJalan] ||
            getConditionColor(seg.kondisiJalan).hex;
          const startR = Math.max(0, Math.min(1, seg.startSta / totalMeters));
          const endR = Math.max(startR, Math.min(1, seg.endSta / totalMeters));
          const segPoints = slicePolylineByDistanceRatio(routePts, startR, endR);

          const polyline = L.polyline(segPoints, {
            color: lineHex,
            weight: isSelected ? 7 : 4,
            opacity: isSelected ? 1.0 : 0.85,
            dashArray: seg.tipePermukaan.includes('Tanah') ? '6, 8' : undefined,
          });

          polyline.bindTooltip(
            `<b>${ruas.nomorRuas} - ${ruas.namaRuas}</b><br/>${formatMeterToSTA(seg.startSta)} – ${formatMeterToSTA(seg.endSta)}<br/>Permukaan: ${seg.tipePermukaan}<br/>Kondisi: ${seg.kondisiJalan}`,
            { sticky: true }
          );

          polyline.on('click', () => {
            setSelectedRuasId(ruas.id);
          });

          layerGroup.addLayer(polyline);
        });
      }

      const headCond = segments[0]?.kondisiJalan || ruas.kondisiPKRMS;
      const headBorderHex =
        ruas.customColor || conditionColors[headCond] || getConditionColor(headCond).borderHex;
      const startMarker = L.circleMarker(ruas.koordinatAwal, {
        radius: isSelected ? 6 : 4,
        fillColor: '#ffffff',
        color: headBorderHex,
        weight: 2,
        fillOpacity: 1,
      }).bindTooltip(`Awal: ${ruas.nomorRuas} (${formatSTA(0)})`);
      layerGroup.addLayer(startMarker);
    });

    // 2. Draw Survey Photo / Defect Points (Markers) in dedicated top pane above road routes
    if (showSurveyPoints) {
      const renderer = photoPointsRendererRef.current ?? undefined;
      photos.forEach((photo) => {
        if (filterCondition !== 'all' && photo.pkrmsCondition !== filterCondition) {
          return;
        }
        const markerHex =
          conditionColors[photo.pkrmsCondition] || getConditionColor(photo.pkrmsCondition).hex;
        const hasSevere = photo.defects.some((d) => d.severity === 'Berat');
        const marker = L.circleMarker([photo.coordinates.lat, photo.coordinates.lng], {
          pane: 'photoPointsPane',
          renderer,
          radius: hasSevere ? 8 : 6.5,
          fillColor: markerHex,
          color: '#ffffff',
          weight: 2.5,
          opacity: 1,
          fillOpacity: 1,
        });
        marker.bindTooltip(
          `<b>${photo.nomorRuas} - ${photo.staText}</b><br/>${photo.ruasNama}<br/>Kondisi: ${photo.pkrmsCondition}`,
          { direction: 'top' }
        );
        marker.on('click', () => {
          setSelectedPointPhoto(photo);
        });
        layerGroup.addLayer(marker);
        marker.bringToFront();
      });
    }

    // 3. Draw Saved Imported KML / KMZ Layers
    kmlLayers.forEach((layer) => {
      if (!layer.visible) return;
      layer.features.forEach((feat) => {
        const featColor = feat.color || layer.color || '#38bdf8';
        const safeLayerName = escapeHtml(layer.name);
        const safeFeatName = escapeHtml(feat.name);
        const safeDesc = feat.description ? `<br/><span>${escapeHtml(feat.description)}</span>` : '';

        if (feat.geometryType === 'LineString' && feat.coordinates.length >= 2) {
          const polyline = L.polyline(feat.coordinates, {
            color: featColor,
            weight: 5,
            opacity: 0.92,
          });
          const lenLabel = feat.lengthKm ? ` • ${feat.lengthKm.toFixed(2)} km` : '';
          polyline.bindTooltip(
            `<b>[${layer.fileType}] ${safeFeatName}</b>${lenLabel}<br/>Layer: ${safeLayerName}`,
            { sticky: true }
          );
          polyline.bindPopup(
            `<div style="font-size:12px;max-width:260px;"><b>${safeFeatName}</b><br/><span style="color:#0284c7;">Layer ${layer.fileType}: ${safeLayerName}${lenLabel}</span>${safeDesc}</div>`
          );
          layerGroup.addLayer(polyline);
        } else if (feat.geometryType === 'Polygon' && feat.coordinates.length >= 3) {
          const polygon = L.polygon(feat.coordinates, {
            color: featColor,
            weight: 2.5,
            fillColor: featColor,
            fillOpacity: 0.18,
          });
          polygon.bindTooltip(
            `<b>[${layer.fileType} Area] ${safeFeatName}</b><br/>Layer: ${safeLayerName}`,
            { sticky: true }
          );
          polygon.bindPopup(
            `<div style="font-size:12px;max-width:260px;"><b>${safeFeatName}</b><br/><span style="color:#059669;">Layer ${layer.fileType}: ${safeLayerName}</span>${safeDesc}</div>`
          );
          layerGroup.addLayer(polygon);
        } else if (feat.geometryType === 'Point' && feat.coordinates.length >= 1) {
          const pt = feat.coordinates[0];
          const pointMarker = L.circleMarker(pt, {
            radius: 6,
            fillColor: featColor,
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.95,
          });
          pointMarker.bindTooltip(
            `<b>[${layer.fileType} Titik] ${safeFeatName}</b><br/>Layer: ${safeLayerName}`
          );
          pointMarker.bindPopup(
            `<div style="font-size:12px;max-width:260px;"><b>${safeFeatName}</b><br/><span style="color:#0284c7;">Layer ${layer.fileType}: ${safeLayerName}</span><br/>Koordinat: ${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}${safeDesc}</div>`
          );
          layerGroup.addLayer(pointMarker);
        }
      });
    });

    // 4. Draw Tracked GPS Route Polylines & 100m / STA Akhir Checkpoints
    if (showGpsTracks) {
      const renderer = photoPointsRendererRef.current ?? undefined;
      ruasList.forEach((ruas) => {
        const track = Array.isArray(ruas.gpsTrack) ? ruas.gpsTrack : [];
        if (track.length === 0) return;

        const sortedTrack = [...track].sort((a, b) => a.staMeters - b.staMeters);
        const latLngs: [number, number][] = sortedTrack.map((pt) => [pt.lat, pt.lng]);

        if (latLngs.length >= 2) {
          const trackCasing = L.polyline(latLngs, {
            color: '#083344',
            weight: ruas.id === selectedRuasId ? 7 : 5,
            opacity: 0.75,
          });
          layerGroup.addLayer(trackCasing);

          const trackLine = L.polyline(latLngs, {
            color: '#22d3ee',
            weight: ruas.id === selectedRuasId ? 4 : 2.5,
            opacity: 0.95,
            dashArray: '8, 6',
          });
          const endSta = sortedTrack[sortedTrack.length - 1]?.staText || formatSTA(Math.round(ruas.panjangKm * 1000));
          trackLine.bindTooltip(
            `<b>Jalur Tracker GPS: ${escapeHtml(ruas.nomorRuas)} - ${escapeHtml(ruas.namaRuas)}</b><br/>${sortedTrack.length} titik • STA Akhir: ${escapeHtml(endSta)}`,
            { sticky: true }
          );
          trackLine.on('click', () => setSelectedRuasId(ruas.id));
          layerGroup.addLayer(trackLine);
        }

        sortedTrack.forEach((pt) => {
          if (pt.category === 'breadcrumb') return;
          const isFinal = pt.category === 'final_sta';
          const isStart = pt.category === 'start';
          const ptMarker = L.circleMarker([pt.lat, pt.lng], {
            pane: 'photoPointsPane',
            renderer,
            radius: isFinal ? 7 : isStart ? 6 : 5,
            fillColor: isFinal ? '#f43f5e' : isStart ? '#10b981' : '#06b6d4',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1,
          });
          ptMarker.bindTooltip(
            `<b>[GPS Tracker] ${escapeHtml(ruas.nomorRuas)} • ${escapeHtml(pt.staText)}</b><br/>Koordinat: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}<br/>Kecepatan: ${(pt.speedKmh ?? 0).toFixed(1)} km/jam • Akurasi: ±${(pt.accuracy ?? 0).toFixed(1)}m`,
            { direction: 'top' }
          );
          layerGroup.addLayer(ptMarker);
        });
      });
    }
  }, [ruasList, photos, kmlLayers, conditionColors, selectedRuasId, filterCondition, showSurveyPoints, showGpsTracks, setSelectedRuasId]);

  // Update customized condition colors via App state
  const handleSaveConditionColors = (nextColors: MapConditionColors) => {
    onUpdateConditionColors(nextColors);
  };

  // Zoom map to Imported KML / KMZ Layer bounds
  const handleZoomToKmlLayer = (layer: ImportedKmlLayer) => {
    const allCoords = layer.features.flatMap((f) => f.coordinates);
    setMobileTab('map');
    if (mapInstanceRef.current && allCoords.length > 0) {
      setTimeout(() => {
        if (!mapInstanceRef.current) return;
        mapInstanceRef.current.invalidateSize({ animate: false });
        if (allCoords.length === 1) {
          mapInstanceRef.current.setView(allCoords[0], 14, { animate: true });
        } else {
          mapInstanceRef.current.fitBounds(L.latLngBounds(allCoords), {
            padding: [40, 40],
            maxZoom: 15,
          });
        }
      }, 120);
    }
  };

  // Zoom to selected Ruas
  const handleZoomToRuas = (ruas: RuasJalan) => {
    setSelectedRuasId(ruas.id);
    setMobileTab('map');
    if (mapInstanceRef.current && ruas.points.length > 0) {
      setTimeout(() => {
        if (!mapInstanceRef.current) return;
        mapInstanceRef.current.invalidateSize({ animate: false });
        const bounds = L.latLngBounds(ruas.points);
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      }, 120);
    }
  };

  // Zoom to fit all Mentawai roads
  const handleFitAllRoads = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const allCoords = ruasList.flatMap((r) => r.points);
    if (allCoords.length > 0) {
      map.invalidateSize({ animate: false });
      map.fitBounds(L.latLngBounds(allCoords), { padding: [35, 35], maxZoom: 11 });
    } else {
      map.setView([-2.1333, 99.6000], 9);
    }
  };

  // Locate current GPS position on map
  const handleLocateMe = () => {
    const map = mapInstanceRef.current;
    if (!map || !navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        if (userLocationMarkerRef.current) {
          map.removeLayer(userLocationMarkerRef.current);
        }
        const marker = L.circleMarker([latitude, longitude], {
          radius: 8,
          fillColor: '#38bdf8',
          color: '#ffffff',
          weight: 3,
          fillOpacity: 1,
        })
          .bindTooltip('Posisi GPS Anda Saat Ini')
          .addTo(map);
        userLocationMarkerRef.current = marker;
        map.setView([latitude, longitude], 14, { animate: true });
      },
      () => {
        setIsLocating(false);
        // Fallback center to Tuapejat Mentawai
        map.setView([-2.0234, 99.5912], 12, { animate: true });
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Open 3rd party navigation (Google Maps Navigation URL)
  const openExternalNavigation = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export handlers
  const handleExportKML = () => {
    const kml = generateKML(ruasList, photos);
    downloadFile(kml, `Survei_Jalan_Mentawai_${Date.now()}.kml`, 'application/vnd.google-earth.kml+xml');
  };

  const handleExportCSV = () => {
    const csv = generateCSV(photos);
    downloadFile(csv, `Data_Survei_Jalan_Mentawai_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportExcel = () => {
    const excel = generateExcelXML(ruasList, photos);
    downloadFile(excel, `Laporan_Survei_Jalan_Mentawai_${Date.now()}.xls`, 'application/vnd.ms-excel');
  };

  const handleExportGpsTrackerExcel = () => {
    exportGpsTracksToExcel(ruasList);
  };

  const handleExportGpsTrackerKML = () => {
    exportGpsTracksToKML(ruasList);
  };

  const handleExportGpsTrackerKMZ = () => {
    void exportGpsTracksToKMZ(ruasList);
  };

  const trackedRoadsCount = ruasList.filter((r) => Array.isArray(r.gpsTrack) && r.gpsTrack.length > 0).length;
  const activeRuas = ruasList.find((r) => r.id === selectedRuasId) || ruasList[0];

  return (
    <div className="flex flex-col flex-1 h-auto min-h-[calc(100vh-116px)] md:h-[calc(100vh-116px)] bg-slate-950 text-slate-100 overflow-y-auto md:overflow-hidden">
      {/* Compact Proportional Single-Line Toolbar */}
      <div className="bg-slate-900 border-b border-slate-800 px-2 py-1 shrink-0 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-nowrap items-center justify-between gap-1.5 overflow-x-auto whitespace-nowrap">
          {/* Refined and compact proportional title frame */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 px-2 py-0.5 rounded border border-slate-700/80 shrink-0 whitespace-nowrap">
            <Compass className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="font-bold text-[10px] text-slate-100 tracking-tight whitespace-nowrap">
              Peta Ruas Jalan Kab. Kep. Mentawai
            </span>
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-1 whitespace-nowrap shrink-0 ${
                tileStatus === 'active' || tileStatus === 'fallback'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              <Globe className="w-2.5 h-2.5 shrink-0" />
              <span>
                {activeTileLayer === 'satellite'
                  ? 'Satelit Aktif'
                  : activeTileLayer === 'terrain'
                  ? 'Topografi Aktif'
                  : 'Peta Jalan Aktif'}
              </span>
            </span>
          </div>

          {/* Map Layer Switcher & Condition Filter (1 single horizontal line) */}
          <div className="flex items-center flex-nowrap gap-1 text-[10px] shrink-0 whitespace-nowrap">
            {/* Tile Layer Selector */}
            <div className="flex items-center flex-nowrap rounded bg-slate-800 p-0.5 border border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTileLayer('streets')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition cursor-pointer ${
                  activeTileLayer === 'streets'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Peta Jalan
              </button>
              <button
                type="button"
                onClick={() => setActiveTileLayer('satellite')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition cursor-pointer ${
                  activeTileLayer === 'satellite'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Satelit
              </button>
              <button
                type="button"
                onClick={() => setActiveTileLayer('terrain')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition cursor-pointer ${
                  activeTileLayer === 'terrain'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Topografi
              </button>
            </div>

            {/* Condition Filter + Color Editor */}
            <div className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 shrink-0 whitespace-nowrap">
              <Filter className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
                className="bg-transparent text-slate-200 text-[10px] focus:outline-none cursor-pointer whitespace-nowrap"
              >
                <option value="all" className="bg-slate-800">Semua Kondisi</option>
                <option value="Baik" className="bg-slate-800">Kondisi Baik</option>
                <option value="Sedang" className="bg-slate-800">Kondisi Sedang</option>
                <option value="Rusak Ringan" className="bg-slate-800">Rusak Ringan</option>
                <option value="Rusak Berat" className="bg-slate-800">Rusak Berat</option>
              </select>
              <button
                type="button"
                onClick={() => setColorEditTarget({ type: 'legend' })}
                title="Edit Warna Kondisi Jalan"
                className="text-amber-400 hover:text-amber-300 pl-1 border-l border-slate-700 cursor-pointer shrink-0"
              >
                <Palette className="w-3 h-3" />
              </button>
            </div>

            {/* Toggle Survey Point Markers */}
            <label className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 cursor-pointer shrink-0 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showSurveyPoints}
                onChange={(e) => setShowSurveyPoints(e.target.checked)}
                className="accent-amber-500 rounded w-3 h-3"
              />
              <span className="text-slate-300 text-[10px] whitespace-nowrap">Titik Foto ({photos.length})</span>
            </label>

            {/* Toggle GPS Route Tracker Layer */}
            <label className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded border border-cyan-500/40 cursor-pointer shrink-0 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showGpsTracks}
                onChange={(e) => setShowGpsTracks(e.target.checked)}
                className="accent-cyan-400 rounded w-3 h-3"
              />
              <span className="text-cyan-300 text-[10px] whitespace-nowrap">Jalur GPS ({trackedRoadsCount})</span>
            </label>

            {/* GIS Import & Export Buttons Group (single horizontal line) */}
            <div className="flex items-center flex-nowrap gap-1 shrink-0 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setIsKmlImportModalOpen(true)}
                title="Impor file *.KML atau *.KMZ agar tersimpan dan tampil pada peta"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] whitespace-nowrap transition shadow cursor-pointer shrink-0"
              >
                <Upload className="w-3 h-3 shrink-0" />
                <span>Impor KML/KMZ</span>
              </button>

              <button
                type="button"
                onClick={handleExportKML}
                title="Ekspor data jalur dan titik survei ke KML untuk Google Earth, QGIS, ArcGIS"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950 hover:bg-sky-900 border border-sky-500/50 text-sky-200 font-semibold text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <FileCode className="w-3 h-3 text-sky-400 shrink-0" />
                <span>KML Spasial</span>
              </button>

              <button
                type="button"
                onClick={handleExportGpsTrackerKML}
                title="Ekspor jalur hasil GPS Tracker (100m + STA Akhir) ke file KML"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200 font-semibold text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <Route className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>Tracker KML</span>
              </button>

              <button
                type="button"
                onClick={handleExportGpsTrackerKMZ}
                title="Ekspor jalur hasil GPS Tracker (100m + STA Akhir) ke file KMZ"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-200 font-semibold text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <Route className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>Tracker KMZ</span>
              </button>

              <button
                type="button"
                onClick={handleExportGpsTrackerExcel}
                title="Ekspor hasil GPS Tracker (100m + STA Akhir) ke Excel (.xlsx)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-semibold text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Tracker Excel</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                title="Ekspor inventaris titik survei ke CSV"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <Download className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                title="Ekspor laporan survei jalan lengkap (.XLS)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-[10px] whitespace-nowrap transition cursor-pointer shrink-0"
              >
                <FileSpreadsheet className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Laporan XLS</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Switcher (Tampilan Peta / Daftar Ruas) untuk Device Mobile */}
      <div className="md:hidden flex items-center justify-center px-2 py-1 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex w-full max-w-sm items-center flex-nowrap bg-slate-800/90 p-0.5 rounded border border-slate-700">
          <button
            type="button"
            onClick={() => {
              setMobileTab('map');
              setTimeout(() => mapInstanceRef.current?.invalidateSize({ animate: false }), 120);
            }}
            className={`flex-1 py-1 text-[10px] font-bold whitespace-nowrap rounded transition cursor-pointer ${
              mobileTab === 'map'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Tampilan Peta
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('list')}
            className={`flex-1 py-1 text-[10px] font-bold whitespace-nowrap rounded transition cursor-pointer ${
              mobileTab === 'list'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Daftar Ruas ({ruasList.length})
          </button>
        </div>
      </div>

      {/* Main Map Body: Sidebar List + Map Viewport */}
      <div className="flex-1 min-h-[360px] md:min-h-0 flex overflow-hidden relative">
        {/* Left Side: Ruas Selector & Detail Panel */}
        <div className={`${mobileTab === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-80 lg:w-96 bg-slate-900/95 border-r border-slate-800 flex-col shrink-0 z-10 overflow-hidden`}>
          <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap truncate">
                Daftar Ruas Jalan Mentawai
              </span>
              <span className="text-[10px] text-amber-400 font-semibold whitespace-nowrap shrink-0">
                {ruasList.length} Ruas
              </span>
            </div>
          </div>

          {/* Saved Imported KML / KMZ Map Layers */}
          {kmlLayers.length > 0 && (
            <div className="p-2 border-b border-slate-800 bg-slate-950/60 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-[10px] whitespace-nowrap">
                <span className="font-bold text-sky-300 flex items-center gap-1 whitespace-nowrap truncate">
                  <FileCode className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>Layer KML / KMZ ({kmlLayers.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsKmlImportModalOpen(true)}
                  className="text-[9px] font-bold text-amber-400 hover:text-amber-300 whitespace-nowrap cursor-pointer shrink-0"
                >
                  + Impor
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                {kmlLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center justify-between gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => handleZoomToKmlLayer(layer)}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer whitespace-nowrap"
                      title="Pusatkan peta ke layer ini"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 border border-white/40"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span className="font-semibold text-white text-[10px] truncate whitespace-nowrap">
                        {layer.name}
                      </span>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">
                        • {layer.fileType} ({layer.features.length})
                        {layer.totalLengthKm > 0 ? ` • ${layer.totalLengthKm} km` : ''}
                      </span>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setColorEditTarget({ type: 'kml', layer })}
                        className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 cursor-pointer"
                        title="Edit Warna Layer KML/KMZ"
                      >
                        <Palette className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleKmlLayer(layer.id)}
                        className={`p-0.5 rounded border transition cursor-pointer ${
                          layer.visible
                            ? 'bg-sky-950/80 border-sky-500/40 text-sky-300'
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                        }`}
                        title={layer.visible ? 'Sembunyikan di peta' : 'Tampilkan di peta'}
                      >
                        {layer.visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleZoomToKmlLayer(layer)}
                        className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 cursor-pointer"
                        title="Fokus ke Layer"
                      >
                        <Maximize className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteKmlLayer(layer.id)}
                        className="p-0.5 rounded bg-slate-800 hover:bg-rose-900/60 border border-slate-700 text-rose-400 cursor-pointer"
                        title="Hapus Layer KML/KMZ"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* List of road segments */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-1.5 space-y-1">
            {ruasList.map((ruas) => {
              const segments = getRuasSTASegments(ruas);
              const isSelected = ruas.id === selectedRuasId;
              const photoCount = photos.filter((p) => p.ruasId === ruas.id).length;
              const videoCount = videos.filter((v) => v.ruasId === ruas.id).length;

              return (
                <div
                  key={ruas.id}
                  onClick={() => handleZoomToRuas(ruas)}
                  className={`p-2 rounded-lg cursor-pointer transition ${
                    isSelected
                      ? 'bg-slate-800 border border-amber-500/60 shadow-md'
                      : 'hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1 min-w-0 flex-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setColorEditTarget({ type: 'ruas', ruas });
                        }}
                        className="w-2.5 h-2.5 rounded-full border border-white/50 shrink-0 cursor-pointer hover:scale-125 transition"
                        style={{
                          backgroundColor:
                            ruas.customColor ||
                            (segments[0]
                              ? conditionColors[segments[0].kondisiJalan]
                              : '#64748b'),
                        }}
                        title={
                          ruas.customColor
                            ? `Warna Kustom (${ruas.customColor}) - Klik untuk edit`
                            : 'Warna otomatis kondisi STA - Klik untuk edit'
                        }
                      />
                      <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 shrink-0 whitespace-nowrap">
                        {ruas.nomorRuas}
                      </span>
                      <h4 className="font-semibold text-[10px] text-white truncate whitespace-nowrap">
                        {ruas.namaRuas}
                      </h4>
                      <span className="text-[9px] text-slate-400 truncate whitespace-nowrap">
                        ({ruas.kecamatanPulau})
                      </span>
                    </div>

                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-900 text-slate-300 border-slate-700 shrink-0 whitespace-nowrap">
                      {segments.length} STA
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-slate-800 text-[9px] text-slate-300 whitespace-nowrap overflow-x-auto">
                    <span className="whitespace-nowrap">
                      <span className="text-slate-500">P: </span>
                      <span className="font-semibold">{ruas.panjangKm} km</span>
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="text-slate-500">L: </span>
                      <span className="font-semibold">{ruas.lebarMeter} m</span>
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="text-slate-500">Foto: </span>
                      <span className="font-semibold text-sky-400">{photoCount}</span>
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="text-slate-500">Video: </span>
                      <span className="font-semibold text-rose-400">{videoCount}</span>
                    </span>
                  </div>

                  {/* Per-STA Surface & Condition preview */}
                  <div className="mt-1.5 pt-1 border-t border-slate-800/70 space-y-1">
                    {segments.length === 0 ? (
                      <div className="text-[9px] text-slate-500 italic whitespace-nowrap truncate">
                        Belum ada data permukaan &amp; kondisi per STA
                      </div>
                    ) : (
                      segments.slice(0, 3).map((seg) => {
                        const segColor = getConditionColor(seg.kondisiJalan);
                        return (
                          <div
                            key={seg.id}
                            className="flex items-center justify-between gap-1.5 text-[9px] bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/80 whitespace-nowrap"
                          >
                            <span className="font-mono text-sky-400 shrink-0 whitespace-nowrap">
                              {formatMeterToSTA(seg.startSta).replace('STA ', '')}–{formatMeterToSTA(seg.endSta).replace('STA ', '')}
                            </span>
                            <span className="text-slate-300 truncate flex-1 whitespace-nowrap">{seg.tipePermukaan.split(' ')[0]}</span>
                            <span className={`px-1.5 py-0.5 rounded-full border font-bold text-[8px] shrink-0 whitespace-nowrap ${segColor.badgeBg}`}>
                              {seg.kondisiJalan}
                            </span>
                          </div>
                        );
                      })
                    )}
                    {segments.length > 3 && (
                      <div className="text-[9px] text-slate-400 pl-1 whitespace-nowrap">
                        +{segments.length - 3} segmen STA lainnya...
                      </div>
                    )}
                  </div>

                  {/* Action row: Import & GPS Tracker Export in compact single-line horizontal strips */}
                  <div className="mt-1.5 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportPhotoRuas(ruas);
                      }}
                      className="flex items-center justify-center gap-1 py-0.5 px-1.5 rounded bg-sky-950/90 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-[9px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title={`Impor Foto ke Ruas ${ruas.nomorRuas}`}
                    >
                      <ImagePlus className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                      <span>Impor Foto</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportVideoRuas(ruas);
                      }}
                      className="flex items-center justify-center gap-1 py-0.5 px-1.5 rounded bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-[9px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title={`Impor Video ke Ruas ${ruas.nomorRuas}`}
                    >
                      <VideoIcon className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                      <span>Impor Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportGpsTracksToExcel(ruasList, ruas);
                      }}
                      className="flex items-center justify-center gap-1 py-0.5 px-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/35 text-emerald-200 text-[9px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title={`Ekspor Tracker GPS Ruas ${ruas.nomorRuas} ke Excel (.xlsx)`}
                    >
                      <FileSpreadsheet className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                      <span>GPS XLS</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportGpsTracksToKML(ruasList, ruas);
                      }}
                      className="flex items-center justify-center gap-1 py-0.5 px-1.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/35 text-cyan-200 text-[9px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title={`Ekspor Tracker GPS Ruas ${ruas.nomorRuas} ke KML`}
                    >
                      <FileCode className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                      <span>GPS KML</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void exportGpsTracksToKMZ(ruasList, ruas);
                      }}
                      className="flex items-center justify-center gap-1 py-0.5 px-1.5 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/35 text-indigo-200 text-[9px] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title={`Ekspor Tracker GPS Ruas ${ruas.nomorRuas} ke KMZ`}
                    >
                      <Route className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                      <span>GPS KMZ</span>
                    </button>
                  </div>

                  {/* Quick Action: Atur STA, Edit Warna Layer, Google Maps Navigation, Focus */}
                  <div className="mt-1.5 pt-1 flex items-center justify-between gap-2 whitespace-nowrap overflow-x-auto">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStaModalRuas(ruas);
                      }}
                      className="flex items-center gap-1 text-[9px] text-emerald-400 hover:text-emerald-300 font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title="Atur Tipe Permukaan & Kondisi per STA"
                    >
                      <ListChecks className="w-2.5 h-2.5 shrink-0" />
                      <span>Atur STA</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorEditTarget({ type: 'ruas', ruas });
                      }}
                      className="flex items-center gap-1 text-[9px] text-purple-300 hover:text-purple-200 font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
                      title="Edit Warna Layer Ruas Jalan di Peta"
                    >
                      <Palette className="w-2.5 h-2.5 shrink-0" />
                      <span>Warna</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openExternalNavigation(ruas.koordinatAwal[0], ruas.koordinatAwal[1]);
                      }}
                      className="flex items-center gap-1 text-[9px] text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0 transition cursor-pointer"
                      title="Buka Navigasi Rute di Google Maps"
                    >
                      <Navigation className="w-2.5 h-2.5 shrink-0" />
                      <span>Navigasi</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomToRuas(ruas);
                      }}
                      className="flex items-center gap-1 text-[9px] text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 transition cursor-pointer"
                    >
                      <Maximize className="w-2.5 h-2.5 shrink-0" />
                      <span>Fokus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Ruas Summary Card Footer */}
          {activeRuas && (
            <div className="px-2.5 py-1.5 bg-slate-950 border-t border-slate-800 text-[10px] space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-slate-300 whitespace-nowrap">
                <span className="text-slate-400 font-medium truncate whitespace-nowrap">Ruas Aktif ({activeRuas.nomorRuas}):</span>
                <button
                  type="button"
                  onClick={() => setStaModalRuas(activeRuas)}
                  className="font-bold text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {getRuasSTASegments(activeRuas).length} Segmen STA • Atur
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400 whitespace-nowrap">
                <span>P: {activeRuas.panjangKm} km</span>
                <span>L: {activeRuas.lebarMeter} m</span>
                <span>Survei: {activeRuas.lastSurveyDate}</span>
              </div>
            </div>
          )}
        </div>

        {/* Map Viewport Container (Explicit non-zero height guaranteed across Mobile, Tablet, PC) */}
        <div className={`${mobileTab === 'map' ? 'flex' : 'hidden'} md:flex flex-1 min-h-[360px] sm:min-h-[540px] h-full relative bg-slate-900`}>
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

          {/* Top-Right Quick Map Controls (Fit All & GPS Locate) */}
          <div className="absolute top-3 right-3 z-[400] flex flex-row flex-nowrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleFitAllRoads}
              title="Tampilkan Seluruh Jaringan Ruas Mentawai"
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 shadow-lg text-[10px] font-semibold whitespace-nowrap backdrop-blur-md transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Semua Ruas</span>
            </button>

            <button
              type="button"
              onClick={handleLocateMe}
              title="Pusatkan ke Lokasi GPS Saya"
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 shadow-lg text-[10px] font-semibold whitespace-nowrap backdrop-blur-md transition cursor-pointer"
            >
              <LocateFixed className={`w-3 h-3 text-sky-400 shrink-0 ${isLocating ? 'animate-spin' : ''}`} />
              <span>Lokasi GPS</span>
            </button>
          </div>

          {/* Live Cursor Coordinates & Zoom HUD */}
          <div className="hidden sm:flex items-center gap-1.5 absolute bottom-4 right-3 z-[400] bg-slate-900/90 backdrop-blur-md px-2 py-1 rounded border border-slate-700 shadow-lg text-[10px] font-mono text-slate-300 whitespace-nowrap">
            <span>Z:{cursorCoords.zoom}</span>
            <span className="text-slate-600">|</span>
            <span>{cursorCoords.lat.toFixed(5)}°, {cursorCoords.lng.toFixed(5)}°</span>
          </div>

          {/* Selected Point Photo Inspector Popover */}
          {selectedPointPhoto && (
            <div className="absolute top-12 right-3 z-[450] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-2.5 w-72 max-w-[90vw]">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800 whitespace-nowrap">
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="font-bold text-[10px] text-white truncate whitespace-nowrap">
                    {selectedPointPhoto.nomorRuas} - {selectedPointPhoto.staText}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPointPhoto(null)}
                  className="text-slate-400 hover:text-white text-[10px] font-bold px-1 shrink-0 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-1.5">
                <div className="w-full aspect-[127/89] rounded-lg border border-slate-800 overflow-hidden bg-black relative">
                  <img
                    src={selectedPointPhoto.imageUrl}
                    alt={selectedPointPhoto.staText}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-95"
                    onClick={() => onViewPhoto(selectedPointPhoto)}
                  />
                  <span className="absolute top-1 left-1 text-[8px] font-bold bg-black/75 text-amber-300 px-1 py-0.5 rounded border border-amber-500/40 whitespace-nowrap">
                    3R 8,9×12,7 cm • 600 DPI
                  </span>
                </div>
              </div>

              <div className="mt-1.5 text-[10px] space-y-0.5">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-slate-400 shrink-0">Ruas:</span>
                  <span className="text-slate-200 font-semibold truncate">{selectedPointPhoto.ruasNama}</span>
                </div>
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-slate-400 shrink-0">Kondisi:</span>
                  <span className="font-bold text-amber-400 truncate">{selectedPointPhoto.pkrmsCondition}</span>
                </div>
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-slate-400 shrink-0">Cacat:</span>
                  <span className="text-rose-400 font-semibold truncate">
                    {selectedPointPhoto.defects.length > 0
                      ? selectedPointPhoto.defects.map(d => `${d.type}(${d.severity})`).join(', ')
                      : 'Nihil (Permukaan Mantap)'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-slate-400 shrink-0">Koordinat:</span>
                  <span className="font-mono text-slate-300 truncate">
                    {selectedPointPhoto.coordinates.lat.toFixed(5)}, {selectedPointPhoto.coordinates.lng.toFixed(5)}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onViewPhoto(selectedPointPhoto)}
                  className="flex-1 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] whitespace-nowrap text-center flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <Eye className="w-3 h-3 shrink-0" />
                  <span>Lihat HD 600 DPI</span>
                </button>

                <button
                  type="button"
                  onClick={() => openExternalNavigation(selectedPointPhoto.coordinates.lat, selectedPointPhoto.coordinates.lng)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 cursor-pointer shrink-0"
                  title="Navigasi ke titik ini dengan Google Maps"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RuasSTASegmentsModal
        ruas={staModalRuas}
        onClose={() => setStaModalRuas(null)}
        onSaveRuas={onUpdateRuas}
      />

      <ImportPhotoModal
        ruas={importPhotoRuas}
        isOnline={isOnline}
        onClose={() => setImportPhotoRuas(null)}
        onImportPhoto={onAddPhoto}
      />

      <ImportVideoModal
        ruas={importVideoRuas}
        isOnline={isOnline}
        onClose={() => setImportVideoRuas(null)}
        onImportVideo={onAddVideo}
      />

      <ImportKmlModal
        isOpen={isKmlImportModalOpen}
        onClose={() => setIsKmlImportModalOpen(false)}
        onImportLayer={(layer, alsoRegisterRoads) => {
          onAddKmlLayer(layer, alsoRegisterRoads);
          handleZoomToKmlLayer(layer);
        }}
      />

      <MapLayerColorModal
        target={colorEditTarget}
        conditionColors={conditionColors}
        onClose={() => setColorEditTarget(null)}
        onSaveRuasColor={(ruas, customColor) => {
          onUpdateRuas({
            ...ruas,
            customColor,
          });
        }}
        onSaveKmlColor={onUpdateKmlLayerColor}
        onSaveConditionColors={handleSaveConditionColors}
      />
    </div>
  );
};
