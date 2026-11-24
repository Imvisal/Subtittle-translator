package com.visal.sinsubz;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps the app alive while a subtitle is being translated (so Android does not
 * cut the network when the app goes to the background) and owns the single
 * "Translating subtitle... 20%" notification. The percentage is updated in
 * place, the notification is never removed and re-created.
 */
public class TranslationService extends Service {

    static final String ACTION_STOP = "com.visal.sinsubz.STOP_TRANSLATION";
    static final String EXTRA_PERCENT = "percent";
    static final String EXTRA_COMPLETED = "completed";
    static final String EXTRA_TOTAL = "total";

    static final String CHANNEL_ID = "translation-live";
    static final int NOTIFICATION_ID = 4101;

    // long subtitles can take a while, never hold the CPU longer than this
    private static final long MAX_WAKE_MS = 3L * 60L * 60L * 1000L;

    private PowerManager.WakeLock wakeLock;

    static Notification build(Context ctx, int percent, int completed, int total) {
        ensureChannel(ctx);

        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent open = PendingIntent.getActivity(
            ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Bitmap logo = BitmapFactory.decodeResource(ctx.getResources(), R.drawable.ic_logo_large);

        String body = total > 0 ? completed + " / " + total + " lines" : "Starting...";

        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sinsubz)
            .setLargeIcon(logo)
            .setColor(0xFF7C7CFF)
            .setContentTitle("Translating subtitle... " + percent + "%")
            .setContentText(body)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Translation progress", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Shown while a subtitle is being translated");
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        int percent = intent != null ? intent.getIntExtra(EXTRA_PERCENT, 0) : 0;
        int completed = intent != null ? intent.getIntExtra(EXTRA_COMPLETED, 0) : 0;
        int total = intent != null ? intent.getIntExtra(EXTRA_TOTAL, 0) : 0;

        Notification notification = build(this, percent, completed, total);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sinsubz:translation");
                wakeLock.acquire(MAX_WAKE_MS);
            }
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
