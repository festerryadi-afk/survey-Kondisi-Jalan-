export interface NativeAndroidDownloaderBridge {
  beginFile: (filename: string, mimeType: string) => string;
  appendChunk: (sessionId: string, base64Chunk: string) => boolean;
  finishFile: (sessionId: string) => boolean;
  abortFile: (sessionId: string) => void;
  getLastError?: () => string;
  getLastSavedPath?: () => string;
  hasStoragePermission?: () => boolean;
  requestStoragePermission?: () => void;
}

export interface BlobDownloadResult {
  ok: boolean;
  via: 'android_bridge' | 'browser';
  location?: string;
  error?: string;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const blockSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += blockSize) {
    const slice = bytes.subarray(i, Math.min(i + blockSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function normalizeMimeType(rawMime: string | undefined, filename: string): string {
  const stripped = (rawMime || '').split(';')[0].trim();
  if (stripped && stripped !== 'application/octet-stream') {
    return stripped;
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

async function saveBlobViaAndroidApkBridge(
  bridge: NativeAndroidDownloaderBridge,
  blob: Blob,
  filename: string
): Promise<BlobDownloadResult> {
  const cleanMime = normalizeMimeType(blob.type, filename);
  const sessionId = bridge.beginFile(filename, cleanMime);
  if (!sessionId) {
    const detail = bridge.getLastError?.() || 'Gagal menyiapkan penyimpanan Android.';
    return { ok: false, via: 'android_bridge', error: detail };
  }

  try {
    // 256 KB raw binary -> ~342 KB base64 (aman di bawah batas 1 MB Android Binder IPC & ringan di RAM 3GB)
    const CHUNK_SIZE = 256 * 1024;
    let offset = 0;
    let chunkCount = 0;

    while (offset < blob.size) {
      const end = Math.min(offset + CHUNK_SIZE, blob.size);
      const buffer = await blob.slice(offset, end).arrayBuffer();
      const base64Chunk = uint8ArrayToBase64(new Uint8Array(buffer));
      const ok = bridge.appendChunk(sessionId, base64Chunk);
      if (!ok) {
        bridge.abortFile(sessionId);
        const detail = bridge.getLastError?.() || 'Gagal menulis data berkas ke penyimpanan perangkat.';
        return { ok: false, via: 'android_bridge', error: detail };
      }
      offset = end;
      chunkCount += 1;
      // Beri jeda singkat setiap 4 chunk agar WebView UI Android tidak membeku saat unduh video besar
      if (chunkCount % 4 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const finished = bridge.finishFile(sessionId);
    if (!finished) {
      const detail = bridge.getLastError?.() || 'Gagal menyelesaikan penulisan berkas.';
      return { ok: false, via: 'android_bridge', error: detail };
    }

    const savedPath = bridge.getLastSavedPath?.() || `Download/SurveyJalanMentawai/${filename}`;
    return {
      ok: true,
      via: 'android_bridge',
      location: savedPath,
    };
  } catch (err) {
    try {
      bridge.abortFile(sessionId);
    } catch {
      // ignore
    }
    return {
      ok: false,
      via: 'android_bridge',
      error: err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan berkas di Android.',
    };
  }
}

export async function triggerBlobDownloadAsync(
  blob: Blob,
  filename: string
): Promise<BlobDownloadResult> {
  if (!blob || blob.size === 0) {
    return {
      ok: false,
      via: 'browser',
      error: 'Berkas kosong atau tidak tersedia.',
    };
  }

  const win = window as Window & {
    MentawaiAndroidDownloader?: NativeAndroidDownloaderBridge;
  };

  if (win.MentawaiAndroidDownloader) {
    return saveBlobViaAndroidApkBridge(win.MentawaiAndroidDownloader, blob, filename);
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 600);

  return {
    ok: true,
    via: 'browser',
    location: filename,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  void triggerBlobDownloadAsync(blob, filename);
}
