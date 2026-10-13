package com.visal.sublanka;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves a text file (the translated / synced .srt) straight into the
 * public Downloads folder: Download/SubLanka AI/<filename>.
 *
 * Android 10+ : MediaStore (no permission needed)
 * Android 7-9 : direct write, needs WRITE_EXTERNAL_STORAGE
 */
@CapacitorPlugin(
    name = "Downloads",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class DownloadsPlugin extends Plugin {

    private static final String FOLDER = "SubLanka AI";

    @PluginMethod
    public void saveText(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermsCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storagePermsCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            doSave(call);
        } else {
            call.reject("Storage permission was denied.");
        }
    }

    private void doSave(PluginCall call) {
        String text = call.getString("text");
        String filename = call.getString("filename");

        if (text == null || filename == null || filename.trim().isEmpty()) {
            call.reject("text and filename are required.");
            return;
        }

        // no path tricks, no characters Android does not allow in file names
        filename = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();

        // UTF-8 BOM so Sinhala opens correctly in every player
        byte[] data = ("﻿" + text).getBytes(StandardCharsets.UTF_8);

        try {
            String shownPath;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
                values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER
                );

                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Could not create the file in Downloads.");
                    return;
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) {
                        call.reject("Could not open the file for writing.");
                        return;
                    }
                    out.write(data);
                }
                shownPath = "Download/" + FOLDER + "/" + filename;
            } else {
                File dir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    FOLDER
                );
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Could not create the Downloads folder.");
                    return;
                }

                File file = new File(dir, filename);
                int n = 1;
                while (file.exists()) {
                    int dot = filename.lastIndexOf('.');
                    String base = dot > 0 ? filename.substring(0, dot) : filename;
                    String ext = dot > 0 ? filename.substring(dot) : "";
                    file = new File(dir, base + " (" + n + ")" + ext);
                    n++;
                }
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(data);
                }
                shownPath = "Download/" + FOLDER + "/" + file.getName();
            }

            JSObject result = new JSObject();
            result.put("path", shownPath);
            call.resolve(result);

        } catch (IOException e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }

    // ---- Full-screen layout helpers ------------------------------------

    /** Height of the status bar / navigation bar in CSS pixels (dp). */
    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            int top = 0;
            int bottom = 0;
            try {
                View web = getBridge().getWebView();
                WindowInsetsCompat wi = web == null ? null : ViewCompat.getRootWindowInsets(web);
                if (wi != null) {
                    Insets bars = wi.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                    );
                    float density = getContext().getResources().getDisplayMetrics().density;
                    top = Math.round(bars.top / density);
                    bottom = Math.round(bars.bottom / density);
                }
            } catch (Exception ignored) {
                // fall back to 0, the page then relies on env(safe-area-inset-*)
            }
            result.put("top", top);
            result.put("bottom", bottom);
            call.resolve(result);
        });
    }

    /** light = true  -> light page background, so dark status / navigation bar icons. */
    @PluginMethod
    public void setSystemBarsLight(PluginCall call) {
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }

    /** Opens a link (e.g. the new APK) in the phone's browser. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("A valid http(s) url is required.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the link: " + e.getMessage());
        }
    }

    // ---- Translation notification + keep-alive service ------------------

    private boolean translationRunning = false;

    private void startTranslationService(int percent, int completed, int total) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, TranslationService.class);
        intent.putExtra(TranslationService.EXTRA_PERCENT, percent);
        intent.putExtra(TranslationService.EXTRA_COMPLETED, completed);
        intent.putExtra(TranslationService.EXTRA_TOTAL, total);
        ContextCompat.startForegroundService(ctx, intent);
        translationRunning = true;
    }

    /** Called when a translation begins: starts the service + first notification. */
    @PluginMethod
    public void startTranslation(PluginCall call) {
        try {
            startTranslationService(0, 0, 0);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start the translation service: " + e.getMessage());
        }
    }

    /** Called on every progress step: updates the SAME notification in place. */
    @PluginMethod
    public void updateTranslation(PluginCall call) {
        int percent = call.getInt("percent", 0);
        int completed = call.getInt("completed", 0);
        int total = call.getInt("total", 0);
        try {
            if (!translationRunning) {
                startTranslationService(percent, completed, total);
            } else {
                try {
                    NotificationManagerCompat.from(getContext()).notify(
                        TranslationService.NOTIFICATION_ID,
                        TranslationService.build(getContext(), percent, completed, total)
                    );
                } catch (SecurityException ignored) {
                    // notification permission not granted: the service still keeps running
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not update the notification: " + e.getMessage());
        }
    }

    /** Called when the translation ends (finished or failed). */
    @PluginMethod
    public void stopTranslation(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, TranslationService.class);
            intent.setAction(TranslationService.ACTION_STOP);
            ctx.startService(intent);
        } catch (Exception ignored) {
            try {
                getContext().stopService(new Intent(getContext(), TranslationService.class));
            } catch (Exception ignored2) {
                // nothing else to do
            }
        }
        translationRunning = false;
        call.resolve();
    }
}
