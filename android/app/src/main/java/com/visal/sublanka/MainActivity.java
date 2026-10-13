package com.visal.sublanka;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DownloadsPlugin.class);
        super.onCreate(savedInstanceState);

        askNotificationPermission();
        scheduleReleaseChecks();
    }

    // Android 13+ needs a runtime permission before any notification can show.
    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }
    }

    // New movie / series + Sinhala subtitle alerts: check now, then every 3 hours,
    // even when the app is closed (survives reboots).
    private void scheduleReleaseChecks() {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        WorkManager wm = WorkManager.getInstance(getApplicationContext());

        wm.enqueueUniquePeriodicWork(
            "release-check",
            ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(ReleaseCheckWorker.class, 3, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()
        );

        wm.enqueueUniqueWork(
            "release-check-now",
            ExistingWorkPolicy.REPLACE,
            new OneTimeWorkRequest.Builder(ReleaseCheckWorker.class)
                .setConstraints(constraints)
                .build()
        );
    }
}
