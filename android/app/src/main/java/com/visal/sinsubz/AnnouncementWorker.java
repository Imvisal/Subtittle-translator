package com.visal.sinsubz;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Tiny background job that only looks at /announcement.json (a few hundred bytes).
 * Android's shortest repeat time is 15 minutes, so a new announcement reaches
 * phones within about 15 minutes even when the app is closed. (Android may delay
 * it further in battery saver / Doze; the battery switch in Settings helps.)
 */
public class AnnouncementWorker extends Worker {

    public AnnouncementWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        ReleaseCheckWorker.runAnnouncementCheck(getApplicationContext());
        return Result.success();
    }
}
