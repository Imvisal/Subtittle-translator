package com.visal.sinsubz;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
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
    private static final String PREFS = "sinsubz_releases";
    private static final int MAX_NOTIFICATIONS = 3;
    private static final int SUMMARY_ID = 2999;

    public ReleaseCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();

        // Without the notification permission (Android 13+) we still record the
        // new releases in the in-app bell list, we just cannot pop a notification.
        boolean canNotify = Build.VERSION.SDK_INT < 33
            || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;

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
            JSONArray inbox = new JSONArray(prefs.getString("inbox", "[]"));
            long now = System.currentTimeMillis();

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
                String poster = item.optString("poster", "");

                JSONObject known = state.optJSONObject(key);

                if (known == null) {
                    JSONObject entry = new JSONObject();
                    entry.put("sinhala", sinhala);
                    state.put(key, entry);

                    if (initialized) {
                        addInbox(inbox, key, "new", title, year, series, sinhala, source, poster, now);
                        toShow.add(new String[] {
                            key,
                            (series ? "New series available: " : "New movie available: ") + name,
                            sinhala
                                ? "Sinhala subtitle is already available" + (source.isEmpty() ? "." : " (" + source + ").")
                                : "Open SinSubz AI to find or translate subtitles.",
                            poster
                        });
                    }
                } else if (sinhala && !known.optBoolean("sinhala", false)) {
                    known.put("sinhala", true);

                    if (initialized) {
                        addInbox(inbox, key, "sinhala", title, year, series, true, source, poster, now);
                        toShow.add(new String[] {
                            key,
                            "Sinhala subtitle available: " + name,
                            "Found on " + (source.isEmpty() ? "a Sinhala subtitle site" : source) + ". Open SinSubz AI to get it.",
                            poster
                        });
                    }
                }
            }

            prefs.edit()
                .putBoolean("init", true)
                .putString("state", state.toString())
                .putString("inbox", inbox.toString())
                .apply();

            if (canNotify) {
                show(ctx, toShow);
            }
            return Result.success();

        } catch (Exception e) {
            return Result.retry();
        }
    }

    // In-app notification list (the bell). Newest first, newest 30 kept.
    // Read by DownloadsPlugin.getReleaseInbox().
    private static void addInbox(JSONArray inbox, String key, String kind, String title,
            String year, boolean series, boolean sinhala, String source, String poster, long now)
            throws Exception {
        // an older entry for the same title + kind is replaced, not duplicated
        for (int i = inbox.length() - 1; i >= 0; i--) {
            JSONObject o = inbox.getJSONObject(i);
            if (key.equals(o.optString("key")) && kind.equals(o.optString("kind"))) {
                inbox.remove(i);
            }
        }
        JSONObject e = new JSONObject();
        e.put("key", key);
        e.put("kind", kind);
        e.put("title", title);
        e.put("year", year);
        e.put("type", series ? "series" : "movie");
        e.put("sinhala", sinhala);
        e.put("source", source);
        e.put("poster", poster);
        e.put("t", now);

        JSONArray out = new JSONArray();
        out.put(e);
        for (int i = 0; i < inbox.length() && out.length() < 30; i++) {
            out.put(inbox.get(i));
        }
        while (inbox.length() > 0) {
            inbox.remove(0);
        }
        for (int i = 0; i < out.length(); i++) {
            inbox.put(out.get(i));
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
            nm.notify(Math.abs(n[1].hashCode()), build(ctx, open, n[1], n[2], n[3]));
        }

        if (list.size() > MAX_NOTIFICATIONS) {
            nm.notify(
                SUMMARY_ID,
                build(ctx, open, "SinSubz AI",
                    "+" + (list.size() - MAX_NOTIFICATIONS) + " more new releases. Open the app to see them.", ""));
        }
    }

    private android.app.Notification build(
            Context ctx, PendingIntent open, String title, String body, String posterUrl) {

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sinsubz)
            // our own logo instead of a generic icon
            .setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(), R.drawable.ic_logo_large))
            .setColor(0xFF7C7CFF)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        Bitmap poster = loadBitmap(posterUrl);
        if (poster != null) {
            // expanded notification shows the poster on a soft backdrop
            b.setStyle(new NotificationCompat.BigPictureStyle()
                .bigPicture(composePoster(poster))
                .bigLargeIcon((Bitmap) null)
                .setBigContentTitle(title)
                .setSummaryText(body));
        } else {
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        return b.build();
    }

    // Posters are portrait, notification pictures are wide: put the poster in the
    // middle of a darkened, blurred copy of itself so nothing gets cropped.
    private static Bitmap composePoster(Bitmap poster) {
        int w = 1024;
        int h = 512;
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);

        canvas.drawColor(0xFF0D0F1A);
        Bitmap tiny = Bitmap.createScaledBitmap(poster, 12, 18, true);
        canvas.drawBitmap(tiny, null, new Rect(0, 0, w, h), paint);
        canvas.drawColor(0xA6080A1B);

        int ph = h - 32;
        int pw = Math.round(poster.getWidth() * (ph / (float) poster.getHeight()));
        int left = (w - pw) / 2;
        canvas.drawBitmap(poster, null, new Rect(left, 16, left + pw, 16 + ph), paint);
        return out;
    }

    private static Bitmap loadBitmap(String address) {
        if (address == null || !address.startsWith("https://")) {
            return null;
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(address).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            if (conn.getResponseCode() != 200) {
                return null;
            }
            try (InputStream in = conn.getInputStream()) {
                return BitmapFactory.decodeStream(in);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
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
