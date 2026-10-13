package com.visal.sublanka;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

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
}
