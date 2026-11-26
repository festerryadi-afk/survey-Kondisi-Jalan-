package id.go.mentawaikab.dpupr.surveijalan;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Jaga layar tetap menyala selama aktivitas survey di lapangan
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (this.bridge != null) {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new AndroidDownloadBridge(), "MentawaiAndroidDownloader");
            }
        }

        requestSurveyPermissions();
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

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
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

        DownloadSession(OutputStream outputStream, Uri mediaUri, File legacyFile, String filename) {
            this.outputStream = outputStream;
            this.mediaUri = mediaUri;
            this.legacyFile = legacyFile;
            this.filename = filename;
        }
    }

    private class AndroidDownloadBridge {

        private final Map<String, DownloadSession> sessions = new ConcurrentHashMap<>();

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

        @JavascriptInterface
        public String beginFile(String rawFilename, String mimeType) {
            String filename = sanitizeFilename(rawFilename);
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                ? mimeType
                : "application/octet-stream";

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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
                    if (uri == null) return "";
                    OutputStream os = resolver.openOutputStream(uri);
                    if (os == null) return "";

                    String id = UUID.randomUUID().toString();
                    sessions.put(id, new DownloadSession(os, uri, null, filename));
                    return id;
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    File targetDir = new File(downloadsDir, "SurveyJalanMentawai");
                    if (!targetDir.exists() && !targetDir.mkdirs()) {
                        return "";
                    }
                    File outFile = new File(targetDir, filename);
                    OutputStream os = new FileOutputStream(outFile, false);
                    String id = UUID.randomUUID().toString();
                    sessions.put(id, new DownloadSession(os, null, outFile, filename));
                    return id;
                }
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String sessionId, String base64Chunk) {
            if (sessionId == null || base64Chunk == null) return false;
            DownloadSession session = sessions.get(sessionId);
            if (session == null) return false;

            synchronized (session) {
                try {
                    byte[] decoded = Base64.decode(base64Chunk, Base64.DEFAULT);
                    session.outputStream.write(decoded);
                    return true;
                } catch (Exception e) {
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
                    } else if (session.legacyFile != null) {
                        MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[] { session.legacyFile.getAbsolutePath() },
                            null,
                            null
                        );
                    }
                    runOnUiThread(() ->
                        Toast.makeText(
                            MainActivity.this,
                            "Tersimpan: Download/SurveyJalanMentawai/" + session.filename,
                            Toast.LENGTH_SHORT
                        ).show()
                    );
                    return true;
                } catch (IOException e) {
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
