export interface NativeAndroidDownloaderBridge {
  beginFile: (filename: string, mimeType: string) => string;
  appendChunk: (sessionId: string, base64Chunk: string) => boolean;
  finishFile: (sessionId: string) => boolean;
  abortFile: (sessionId: string) => void;
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

async function saveBlobViaAndroidApkBridge(
  bridge: NativeAndroidDownloaderBridge,
  blob: Blob,
  filename: string
): Promise<boolean> {
  const mimeType = blob.type || 'application/octet-stream';
  const sessionId = bridge.beginFile(filename, mimeType);
  if (!sessionId) return false;

  try {
    // 384 KB raw binary -> ~512 KB base64 (aman di bawah batas 1 MB Android Binder IPC)
    const CHUNK_SIZE = 384 * 1024;
    let offset = 0;
    while (offset < blob.size) {
      const end = Math.min(offset + CHUNK_SIZE, blob.size);
      const buffer = await blob.slice(offset, end).arrayBuffer();
      const base64Chunk = uint8ArrayToBase64(new Uint8Array(buffer));
      const ok = bridge.appendChunk(sessionId, base64Chunk);
      if (!ok) {
        bridge.abortFile(sessionId);
        return false;
      }
      offset = end;
    }
    return bridge.finishFile(sessionId);
  } catch {
    bridge.abortFile(sessionId);
    return false;
  }
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const win = window as Window & {
    MentawaiAndroidDownloader?: NativeAndroidDownloaderBridge;
  };
  if (win.MentawaiAndroidDownloader) {
    void saveBlobViaAndroidApkBridge(win.MentawaiAndroidDownloader, blob, filename);
    return;
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
  }, 400);
}
