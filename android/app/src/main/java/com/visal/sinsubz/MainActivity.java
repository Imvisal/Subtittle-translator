package com.visal.sinsubz;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.Window;
import android.view.WindowManager;
import android.graphics.drawable.ColorDrawable;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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

        configureKeyboard();
        goEdgeToEdge();
        askNotificationPermission();
        scheduleReleaseChecks();
    }

    // The keyboard must resize the page exactly ONCE. On Android 11+ we do it
    // ourselves (WebView bottom margin = keyboard height, see goEdgeToEdge), so
    // the system must not resize the window as well - doing both squeezed the
    // page into a thin strip with a grey gap above the keyboard.
    // On older Android the system resize is used and we add no margin.
    private void configureKeyboard() {
        getWindow().setSoftInputMode(Build.VERSION.SDK_INT >= 30
            ? WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
            : WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        // never show a grey window behind the page
        getWindow().setBackgroundDrawable(new ColorDrawable(0xFF07080D));
    }

    // Full-screen layout: the web page is drawn behind the status bar and the
    // navigation bar (transparent bars). The page keeps its own header / content
    // clear of the bars with CSS (see scripts/build-www.js + app-shim.js).
    private void goEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            window.setNavigationBarContrastEnforced(false);
        }

        // the app is dark by default: light icons on the bars
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        View web = getBridge().getWebView();
        if (web == null) {
            return;
        }

        // Remove any status-bar / navigation-bar padding or margin that the
        // parent views add, otherwise the page stays pushed below the status bar.
        ViewParent parent = web.getParent();
        while (parent instanceof View) {
            View v = (View) parent;
            ViewCompat.setOnApplyWindowInsetsListener(v, (view, insets) -> insets);
            v.setPadding(0, 0, 0, 0);
            if (v.getId() == android.R.id.content) {
                break;
            }
            parent = v.getParent();
        }

        // The only space the page leaves is the on-screen keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(web, (view, insets) -> {
            Insets ime = Build.VERSION.SDK_INT >= 30
                ? insets.getInsets(WindowInsetsCompat.Type.ime())
                : Insets.NONE;
            ViewGroup.LayoutParams lp = view.getLayoutParams();
            if (lp instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
                if (m.leftMargin != 0 || m.topMargin != 0 || m.rightMargin != 0
                        || m.bottomMargin != ime.bottom) {
                    m.setMargins(0, 0, 0, ime.bottom);
                    view.setLayoutParams(lp);
                }
            }
            // keep the WebView's own inset handling (safe-area values for CSS)
            return ViewCompat.onApplyWindowInsets(view, insets);
        });
        ViewCompat.requestApplyInsets(web);
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
