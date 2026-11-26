import JSZip from 'jszip';
import { ImportedKmlLayer, KmlFeature, RuasJalan } from '../types';
import { calculateDistanceMeters } from './geo';

/**
 * Konversi warna KML (format ABGR 8-digit hex: aabbggrr) ke warna CSS #RRGGBB
 */
function kmlColorToHex(kmlColor: string | null | undefined, fallback = '#38bdf8'): string {
  const clean = (kmlColor || '').trim().replace(/^#/, '');
  if (clean.length === 8 && /^[0-9a-fA-F]{8}$/.test(clean)) {
    const bb = clean.slice(2, 4);
    const gg = clean.slice(4, 6);
    const rr = clean.slice(6, 8);
    return `#${rr}${gg}${bb}`;
  }
  if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean}`;
  }
  return fallback;
}

/**
 * Parse string koordinat KML "lng,lat[,alt] lng,lat[,alt] ..." menjadi [lat, lng][]
 */
function parseCoordinatesText(coordText: string | null | undefined): [number, number][] {
  if (!coordText) return [];
  const tokens = coordText.trim().split(/\s+/);
  const points: [number, number][] = [];

  for (const token of tokens) {
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      points.push([lat, lng]);
    }
  }
  return points;
}

function computePolylineLengthKm(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += calculateDistanceMeters(
      points[i - 1][0],
      points[i - 1][1],
      points[i][0],
      points[i][1]
    );
  }
  return Number((meters / 1000).toFixed(3));
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' • ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDirectOrDescendantText(parent: Element, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return (el?.textContent || '').trim();
}

/**
 * Mengekstrak Style Map & Style Color dari dokumen KML
 */
function buildStyleColorMap(xmlDoc: Document): Map<string, string> {
  const styleColors = new Map<string, string>();

  const styles = Array.from(xmlDoc.getElementsByTagName('Style'));
  for (const styleEl of styles) {
    const id = styleEl.getAttribute('id');
    if (!id) continue;
    const lineColor =
      styleEl.getElementsByTagName('LineStyle')[0]?.getElementsByTagName('color')[0]?.textContent ||
      styleEl.getElementsByTagName('PolyStyle')[0]?.getElementsByTagName('color')[0]?.textContent ||
      styleEl.getElementsByTagName('IconStyle')[0]?.getElementsByTagName('color')[0]?.textContent;
    if (lineColor) {
      styleColors.set(`#${id}`, kmlColorToHex(lineColor));
    }
  }

  const styleMaps = Array.from(xmlDoc.getElementsByTagName('StyleMap'));
  for (const smEl of styleMaps) {
    const id = smEl.getAttribute('id');
    if (!id) continue;
    const pairs = Array.from(smEl.getElementsByTagName('Pair'));
    const normalPair =
      pairs.find((p) => getDirectOrDescendantText(p, 'key') === 'normal') || pairs[0];
    if (normalPair) {
      const targetUrl = getDirectOrDescendantText(normalPair, 'styleUrl');
      const resolved = styleColors.get(targetUrl);
      if (resolved) {
        styleColors.set(`#${id}`, resolved);
      }
    }
  }

  return styleColors;
}

/**
 * Membaca dan mem-parsing file *.KML atau *.KMZ (ZIP) menjadi ImportedKmlLayer
 */
export async function parseKmlOrKmzFile(
  file: File,
  defaultColor = '#38bdf8'
): Promise<ImportedKmlLayer> {
  const fileName = file.name || 'layer.kml';
  const lowerName = fileName.toLowerCase();
  const isKmzExtension = lowerName.endsWith('.kmz');

  const buffer = await file.arrayBuffer();
  const headerBytes = new Uint8Array(buffer.slice(0, 4));
  const isZipMagic = headerBytes[0] === 0x50 && headerBytes[1] === 0x4b; // "PK"

  let kmlText = '';
  let detectedType: 'KML' | 'KMZ' = 'KML';

  if (isKmzExtension || isZipMagic) {
    detectedType = 'KMZ';
    const zip = await JSZip.loadAsync(buffer);
    const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    const kmlEntryName =
      entryNames.find((name) => name.toLowerCase() === 'doc.kml') ||
      entryNames.find((name) => name.toLowerCase().endsWith('.kml'));

    if (!kmlEntryName) {
      throw new Error('Arsip KMZ tidak mengandung file *.kml di dalamnya.');
    }
    kmlText = await zip.files[kmlEntryName].async('text');
  } else {
    kmlText = new TextDecoder('utf-8').decode(buffer);
  }

  if (!kmlText.trim()) {
    throw new Error('Isi file KML kosong.');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Format XML KML tidak valid atau rusak.');
  }

  const docName =
    xmlDoc.getElementsByTagName('Document')[0]?.getElementsByTagName('name')[0]?.textContent?.trim() ||
    fileName.replace(/\.(kml|kmz)$/i, '');

  const styleColors = buildStyleColorMap(xmlDoc);
  const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));
  const features: KmlFeature[] = [];
  const baseTime = Date.now();

  placemarks.forEach((pm, pmIdx) => {
    const pmName = getDirectOrDescendantText(pm, 'name') || `Objek ${pmIdx + 1}`;
    const rawDesc = getDirectOrDescendantText(pm, 'description');
    const description = rawDesc ? stripHtmlTags(rawDesc) : undefined;

    // Cek warna inline Style atau styleUrl
    const inlineColorText =
      pm.getElementsByTagName('Style')[0]?.getElementsByTagName('color')[0]?.textContent;
    const styleUrl = getDirectOrDescendantText(pm, 'styleUrl');
    const resolvedColor = inlineColorText
      ? kmlColorToHex(inlineColorText, defaultColor)
      : styleColors.get(styleUrl) || defaultColor;

    // 1. LineString geometries
    const lineStrings = Array.from(pm.getElementsByTagName('LineString'));
    lineStrings.forEach((ls, lsIdx) => {
      const coords = parseCoordinatesText(getDirectOrDescendantText(ls, 'coordinates'));
      if (coords.length >= 2) {
        features.push({
          id: `kml-feat-${baseTime}-${pmIdx}-ls-${lsIdx}`,
          name: lineStrings.length > 1 ? `${pmName} (${lsIdx + 1})` : pmName,
          description,
          geometryType: 'LineString',
          coordinates: coords,
          color: resolvedColor,
          lengthKm: computePolylineLengthKm(coords),
        });
      }
    });

    // 2. Polygon geometries
    const polygons = Array.from(pm.getElementsByTagName('Polygon'));
    polygons.forEach((poly, polyIdx) => {
      const outer = poly.getElementsByTagName('outerBoundaryIs')[0] || poly;
      const coords = parseCoordinatesText(getDirectOrDescendantText(outer, 'coordinates'));
      if (coords.length >= 3) {
        features.push({
          id: `kml-feat-${baseTime}-${pmIdx}-poly-${polyIdx}`,
          name: polygons.length > 1 ? `${pmName} (${polyIdx + 1})` : pmName,
          description,
          geometryType: 'Polygon',
          coordinates: coords,
          color: resolvedColor,
        });
      }
    });

    // 3. Point geometries
    const points = Array.from(pm.getElementsByTagName('Point'));
    points.forEach((pt, ptIdx) => {
      const coords = parseCoordinatesText(getDirectOrDescendantText(pt, 'coordinates'));
      if (coords.length >= 1) {
        features.push({
          id: `kml-feat-${baseTime}-${pmIdx}-pt-${ptIdx}`,
          name: points.length > 1 ? `${pmName} (${ptIdx + 1})` : pmName,
          description,
          geometryType: 'Point',
          coordinates: [coords[0]],
          color: resolvedColor,
        });
      }
    });
  });

  if (features.length === 0) {
    throw new Error(
      'Tidak ditemukan geometri Point, LineString, atau Polygon yang valid di dalam file KML/KMZ.'
    );
  }

  const totalLengthKm = Number(
    features.reduce((acc, f) => acc + (f.lengthKm || 0), 0).toFixed(2)
  );

  return {
    id: `kml-layer-${baseTime}`,
    name: docName,
    fileName,
    fileType: detectedType,
    importedAt: new Date().toISOString(),
    visible: true,
    color: defaultColor,
    features,
    totalLengthKm,
  };
}

/**
 * Mengonversi fitur LineString dari layer KML/KMZ menjadi entri RuasJalan baru
 */
export function convertKmlLineStringsToRuas(
  layer: ImportedKmlLayer,
  existingCount: number
): RuasJalan[] {
  const lineFeatures = layer.features.filter(
    (f) => f.geometryType === 'LineString' && f.coordinates.length >= 2
  );
  const todayStr = new Date().toISOString().split('T')[0];

  return lineFeatures.map((feat, idx) => {
    const startPt = feat.coordinates[0];
    const endPt = feat.coordinates[feat.coordinates.length - 1];
    const panjangKm = Math.max(0.1, Number((feat.lengthKm || 1).toFixed(2)));
    const nomorCode = String(existingCount + idx + 1).padStart(3, '0');

    return {
      id: `ruas-kml-${Date.now()}-${idx}`,
      nomorRuas: nomorCode,
      namaRuas: feat.name || `${layer.name} #${idx + 1}`,
      kecamatanPulau: `Impor ${layer.fileType}: ${layer.name}`,
      panjangKm,
      lebarMeter: 5.5,
      staSegments: [],
      tipePermukaan: 'Aspal (AC-WC/HRS)',
      kondisiPKRMS: 'Baik',
      iriAvg: 3.2,
      sdiScore: 25,
      lastSurveyDate: todayStr,
      koordinatAwal: startPt,
      koordinatAkhir: endPt,
      points: feat.coordinates,
      documentationCount: 0,
      rekomendasiPenanganan: 'Pemeliharaan Rutin',
    };
  });
}
