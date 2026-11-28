package id.go.mentawaikab.dpupr.surveijalan;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final int STORAGE_PERMISSION_REQUEST_CODE = 1002;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Jaga layar tetap menyala selama aktivitas survey di lapangan
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (this.bridge != null) {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                final AndroidDownloadBridge downloadBridge = new AndroidDownloadBridge();
                webView.addJavascriptInterface(downloadBridge, "MentawaiAndroidDownloader");
                webView.setDownloadListener(new DownloadListener() {
                    @Override
                    public void onDownloadStart(
                        String url,
                        String userAgent,
                        String contentDisposition,
                        String mimetype,
                        long contentLength
                    ) {
                        if (url == null) return;
                        if (url.startsWith("http://") || url.startsWith("https://")) {
                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                                startActivity(intent);
                            } catch (Exception ignored) {
                                // ignore missing browser handler
                            }
                        }
                    }
                });
            }
        }

        requestSurveyPermissions();
    }

    private boolean hasStorageWritePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return true;
        }
        return (
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        );
    }

    private void requestStorageWritePermissionOnly() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && !hasStorageWritePermission()) {
            ActivityCompat.requestPermissions(
                this,
                new String[] {
                    Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                },
                STORAGE_PERMISSION_REQUEST_CODE
            );
        }
    }

    private void requestSurveyPermissions() {
        List<String> needed = new ArrayList<>();
        String[] basePermissions = new String[] {
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        };

        for (String perm : basePermissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && !hasStorageWritePermission()) {
            needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private static class DownloadSession {
        final OutputStream outputStream;
        final Uri mediaUri;
        final File legacyFile;
        final String filename;
        final String mimeType;
        final String savedLabel;
        final boolean usedAppFallback;

        DownloadSession(
            OutputStream outputStream,
            Uri mediaUri,
            File legacyFile,
            String filename,
            String mimeType,
            String savedLabel,
            boolean usedAppFallback
        ) {
            this.outputStream = outputStream;
            this.mediaUri = mediaUri;
            this.legacyFile = legacyFile;
            this.filename = filename;
            this.mimeType = mimeType;
            this.savedLabel = savedLabel;
            this.usedAppFallback = usedAppFallback;
        }
    }

    private class AndroidDownloadBridge {

        private final Map<String, DownloadSession> sessions = new ConcurrentHashMap<>();
        private volatile String lastError = "";
        private volatile String lastSavedPath = "";

        private String sanitizeFilename(String rawName) {
            if (rawName == null || rawName.trim().isEmpty()) {
                return "survey_mentawai_" + System.currentTimeMillis();
            }
            String base = rawName.replaceAll("[^a-zA-Z0-9._-]", "_");
            base = base.replaceAll("^\\.+", "");
            if (base.isEmpty()) {
                return "survey_mentawai_" + System.currentTimeMillis();
            }
            return base;
        }

        private String normalizeMimeType(String rawMime, String filename) {
            String mime = rawMime != null ? rawMime.trim() : "";
            int semiIdx = mime.indexOf(';');
            if (semiIdx > 0) {
                mime = mime.substring(0, semiIdx).trim();
            }
            if (!mime.isEmpty() && !mime.equalsIgnoreCase("application/octet-stream")) {
                return mime;
            }
            String lower = filename.toLowerCase();
            if (lower.endsWith(".webm")) return "video/webm";
            if (lower.endsWith(".mp4")) return "video/mp4";
            if (lower.endsWith(".mov")) return "video/quicktime";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".pdf")) return "application/pdf";
            return "application/octet-stream";
        }

        private File createFallbackDownloadFile(String filename) {
            File appDownloads = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File baseDir = appDownloads != null ? appDownloads : getCacheDir();
            File targetDir = new File(baseDir, "SurveyJalanMentawai");
            if (!targetDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                targetDir.mkdirs();
            }
            return new File(targetDir, filename);
        }

        @JavascriptInterface
        public String getLastError() {
            return lastError != null ? lastError : "";
        }

        @JavascriptInterface
        public String getLastSavedPath() {
            return lastSavedPath != null ? lastSavedPath : "";
        }

        @JavascriptInterface
        public boolean hasStoragePermission() {
            return hasStorageWritePermission();
        }

        @JavascriptInterface
        public void requestStoragePermission() {
            runOnUiThread(MainActivity.this::requestStorageWritePermissionOnly);
        }

        @JavascriptInterface
        public String beginFile(String rawFilename, String mimeType) {
            lastError = "";
            lastSavedPath = "";
            String filename = sanitizeFilename(rawFilename);
            String safeMime = normalizeMimeType(mimeType, filename);

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        ContentResolver resolver = getContentResolver();
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                        values.put(
                            MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + File.separator + "SurveyJalanMentawai"
                        );
                        values.put(MediaStore.Downloads.IS_PENDING, 1);

                        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri != null) {
                            OutputStream rawOs = resolver.openOutputStream(uri);
                            if (rawOs != null) {
                                OutputStream buffered = new BufferedOutputStream(rawOs, 64 * 1024);
                                String id = UUID.randomUUID().toString();
                                String label = "Download/SurveyJalanMentawai/" + filename;
                                sessions.put(id, new DownloadSession(buffered, uri, null, filename, safeMime, label, false));
                                return id;
                            }
                        }
                    } catch (Exception mediaStoreErr) {
                        lastError = mediaStoreErr.getMessage() != null ? mediaStoreErr.getMessage() : "MediaStore gagal";
                    }

                    // Fallback ke folder Downloads khusus aplikasi bila MediaStore gagal
                    File fallbackFile = createFallbackDownloadFile(filename);
                    OutputStream buffered = new BufferedOutputStream(new FileOutputStream(fallbackFile, false), 64 * 1024);
                    String id = UUID.randomUUID().toString();
                    sessions.put(
                        id,
                        new DownloadSession(
                            buffered,
                            null,
                            fallbackFile,
                            filename,
                            safeMime,
                            fallbackFile.getAbsolutePath(),
                            true
                        )
                    );
                    return id;
                } else {
                    boolean canTryPublic =
                        hasStorageWritePermission() &&
                        Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState());

                    if (canTryPublic) {
                        try {
                            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                            if (downloadsDir != null) {
                                if (!downloadsDir.exists()) {
                                    //noinspection ResultOfMethodCallIgnored
                                    downloadsDir.mkdirs();
                                }
                                File targetDir = new File(downloadsDir, "SurveyJalanMentawai");
                                if (targetDir.exists() || targetDir.mkdirs()) {
                                    File outFile = new File(targetDir, filename);
                                    OutputStream buffered = new BufferedOutputStream(
                                        new FileOutputStream(outFile, false),
                                        64 * 1024
                                    );
                                    String id = UUID.randomUUID().toString();
                                    String label = "Download/SurveyJalanMentawai/" + filename;
                                    sessions.put(
                                        id,
                                        new DownloadSession(buffered, null, outFile, filename, safeMime, label, false)
                                    );
                                    return id;
                                }
                            }
                        } catch (Exception pubErr) {
                            lastError = pubErr.getMessage() != null ? pubErr.getMessage() : "Gagal menulis ke folder Download publik";
                        }
                    } else {
                        lastError = "Izin penyimpanan publik belum aktif; menggunakan penyimpanan aplikasi";
                        runOnUiThread(MainActivity.this::requestStorageWritePermissionOnly);
                    }

                    // Fallback otomatis untuk Android 8.1 (Vivo Y93) agar unduhan tetap berhasil meski izin storage ditolak
                    File fallbackFile = createFallbackDownloadFile(filename);
                    OutputStream buffered = new BufferedOutputStream(new FileOutputStream(fallbackFile, false), 64 * 1024);
                    String id = UUID.randomUUID().toString();
                    sessions.put(
                        id,
                        new DownloadSession(
                            buffered,
                            null,
                            fallbackFile,
                            filename,
                            safeMime,
                            fallbackFile.getAbsolutePath(),
                            true
                        )
                    );
                    return id;
                }
            } catch (Exception e) {
                lastError = e.getMessage() != null ? e.getMessage() : "Gagal membuka berkas unduhan di perangkat";
                return "";
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String sessionId, String base64Chunk) {
            if (sessionId == null || base64Chunk == null) return false;
            if (base64Chunk.isEmpty()) return true;
            DownloadSession session = sessions.get(sessionId);
            if (session == null) return false;

            synchronized (session) {
                try {
                    byte[] decoded = Base64.decode(base64Chunk, Base64.DEFAULT);
                    session.outputStream.write(decoded);
                    return true;
                } catch (Exception e) {
                    lastError = e.getMessage() != null ? e.getMessage() : "Gagal menulis potongan data unduhan";
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean finishFile(String sessionId) {
            if (sessionId == null) return false;
            DownloadSession session = sessions.remove(sessionId);
            if (session == null) return false;

            synchronized (session) {
                try {
                    session.outputStream.flush();
                    session.outputStream.close();

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && session.mediaUri != null) {
                        ContentValues updateValues = new ContentValues();
                        updateValues.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(session.mediaUri, updateValues, null, null);
                    } else if (session.legacyFile != null && !session.usedAppFallback) {
                        MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[] { session.legacyFile.getAbsolutePath() },
                            new String[] { session.mimeType },
                            null
                        );
                    }

                    lastSavedPath = session.savedLabel;

                    runOnUiThread(() -> {
                        if (session.usedAppFallback && session.legacyFile != null) {
                            Toast.makeText(
                                MainActivity.this,
                                "Video disimpan. Pilih aplikasi atau File Manager untuk menyimpan ke galeri/folder.",
                                Toast.LENGTH_LONG
                            ).show();
                            try {
                                Uri contentUri = FileProvider.getUriForFile(
                                    MainActivity.this,
                                    getPackageName() + ".fileprovider",
                                    session.legacyFile
                                );
                                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                                shareIntent.setType(session.mimeType);
                                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                                shareIntent.putExtra(Intent.EXTRA_SUBJECT, session.filename);
                                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(Intent.createChooser(shareIntent, "Simpan / Bagikan " + session.filename));
                            } catch (Exception ignored) {
                                // Tetap tersimpan di fallbackFile bila chooser tidak tersedia
                            }
                        } else {
                            Toast.makeText(
                                MainActivity.this,
                                "Tersimpan: " + session.savedLabel,
                                Toast.LENGTH_SHORT
                            ).show();
                        }
                    });
                    return true;
                } catch (IOException e) {
                    lastError = e.getMessage() != null ? e.getMessage() : "Gagal menutup berkas unduhan";
                    return false;
                }
            }
        }

        @JavascriptInterface
        public void abortFile(String sessionId) {
            if (sessionId == null) return;
            DownloadSession session = sessions.remove(sessionId);
            if (session == null) return;
            synchronized (session) {
                try {
                    session.outputStream.close();
                } catch (IOException ignored) {
                    // ignore
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && session.mediaUri != null) {
                    try {
                        getContentResolver().delete(session.mediaUri, null, null);
                    } catch (Exception ignored) {
                        // ignore
                    }
                } else if (session.legacyFile != null && session.legacyFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    session.legacyFile.delete();
                }
            }
        }
    }
}
