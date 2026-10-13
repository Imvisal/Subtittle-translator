package com.visal.sublanka;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Runs in the background (every ~3 hours, even when the app is closed) and
 * shows a notification when
 *   - a new movie / TV series appears in /api/new-releases, or
 *   - a Sinhala subtitle becomes available for a title we already announced.
 */
public class ReleaseCheckWorker extends Worker {

    private static final String API = "https://subtittle-translator.vercel.app/api/new-releases";
    private static final String CHANNEL_ID = "new-releases";
    private static final String PREFS = "sublanka_releases";
    private static final int MAX_NOTIFICATIONS = 3;
    private static final int SUMMARY_ID = 2999;

    public ReleaseCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();

        // Android 13+: no permission = nothing to show. Try again next time
        // (do not remember titles yet, so they are announced once allowed).
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            return Result.success();
        }

        try {
            JSONObject root = new JSONObject(download(API));
            JSONArray items = root.optJSONArray("items");
            if (items == null) {
                return Result.success();
            }

            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean initialized = prefs.getBoolean("init", false);
            JSONObject state = new JSONObject(prefs.getString("state", "{}"));

            List<String[]> toShow = new ArrayList<>();

            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                String key = item.optString("key", "");
                if (key.isEmpty()) {
                    continue;
                }

                String title = item.optString("title", "");
                String year = item.optString("year", "");
                boolean series = "series".equals(item.optString("type"));
                JSONObject sin = item.optJSONObject("sinhala");
                boolean sinhala = sin != null && sin.optBoolean("found", false);
                String source = sin != null ? sin.optString("source", "") : "";
                String name = year.isEmpty() ? title : title + " (" + year + ")";

                JSONObject known = state.optJSONObject(key);

                if (known == null) {
                    JSONObject entry = new JSONObject();
                    entry.put("sinhala", sinhala);
                    state.put(key, entry);

                    if (initialized) {
                        toShow.add(new String[] {
                            key,
                            (series ? "New series available: " : "New movie available: ") + name,
                            sinhala
                                ? "Sinhala subtitle is already available" + (source.isEmpty() ? "." : " (" + source + ").")
                                : "Open SubLanka AI to find or translate subtitles."
                        });
                    }
                } else if (sinhala && !known.optBoolean("sinhala", false)) {
                    known.put("sinhala", true);

                    if (initialized) {
                        toShow.add(new String[] {
                            key,
                            "Sinhala subtitle available: " + name,
                            "Found on " + (source.isEmpty() ? "a Sinhala subtitle site" : source) + ". Open SubLanka AI to get it."
                        });
                    }
                }
            }

            prefs.edit()
                .putBoolean("init", true)
                .putString("state", state.toString())
                .apply();

            show(ctx, toShow);
            return Result.success();

        } catch (Exception e) {
            return Result.retry();
        }
    }

    private void show(Context ctx, List<String[]> list) {
        if (list.isEmpty()) {
            return;
        }

        NotificationManager nm =
            (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "New releases", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("New movies, TV series and Sinhala subtitles");
            nm.createNotificationChannel(channel);
        }

        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent open = PendingIntent.getActivity(
            ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        int count = Math.min(list.size(), MAX_NOTIFICATIONS);
        for (int i = 0; i < count; i++) {
            String[] n = list.get(i);
            nm.notify(Math.abs(n[1].hashCode()), build(ctx, open, n[1], n[2]));
        }

        if (list.size() > MAX_NOTIFICATIONS) {
            nm.notify(
                SUMMARY_ID,
                build(ctx, open, "SubLanka AI",
                    "+" + (list.size() - MAX_NOTIFICATIONS) + " more new releases. Open the app to see them."));
        }
    }

    private android.app.Notification build(Context ctx, PendingIntent open, String title, String body) {
        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sublanka)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();
    }

    private static String download(String address) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(45000);
        conn.setRequestProperty("Accept", "application/json");

        try {
            if (conn.getResponseCode() != 200) {
                throw new Exception("HTTP " + conn.getResponseCode());
            }
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            conn.disconnect();
        }
    }
}
