package it.thaimer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Servizio in primo piano che resta attivo per tutta la durata di un allenamento: Android non
 * ferma l'app né rallenta il processo mentre la musica gira in un'altra app o lo schermo è spento.
 * Mostra una notifica con i pulsanti Pausa/Riprendi e Termina.
 */
public class ThaimerService extends Service {

    static final int NOTIFICATION_ID = 1;
    static final String CHANNEL_ID = "workout";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_PAUSED = "paused";
    static final String ACTION_PAUSE = "it.thaimer.app.PAUSE";
    static final String ACTION_RESUME = "it.thaimer.app.RESUME";
    static final String ACTION_STOP = "it.thaimer.app.STOP";

    // rete di sicurezza: il blocco della CPU non resta mai attivo oltre questo limite
    private static final long WAKE_LOCK_MAX_MS = 6L * 60 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action != null) {
            // tocco su un pulsante della notifica: lo gestisce la pagina, il servizio resta com'è
            ThaimerNativePlugin.dispatchAction(ACTION_PAUSE.equals(action) ? "pause" : ACTION_RESUME.equals(action) ? "resume" : "stop");
            return START_NOT_STICKY;
        }
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = buildNotification(
            this,
            intent.getStringExtra(EXTRA_TITLE),
            intent.getStringExtra(EXTRA_TEXT),
            intent.getBooleanExtra(EXTRA_PAUSED, false)
        );
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        acquireWakeLock();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Thaimer:workout");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(WAKE_LOCK_MAX_MS);
    }

    static Notification buildNotification(Context ctx, @Nullable String title, @Nullable String text, boolean paused) {
        ensureChannel(ctx);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) open = new Intent();
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent openPi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_thaimer)
            .setContentTitle(title == null ? "Thaimer" : title)
            .setContentText(text == null ? "" : text)
            .setContentIntent(openPi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, paused ? "Riprendi" : "Pausa", actionIntent(ctx, paused ? ACTION_RESUME : ACTION_PAUSE))
            .addAction(0, "Termina", actionIntent(ctx, ACTION_STOP));
        return b.build();
    }

    private static PendingIntent actionIntent(Context ctx, String action) {
        Intent i = new Intent(ctx, ThaimerService.class).setAction(action);
        return PendingIntent.getService(ctx, action.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Allenamento in corso", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Tiene attivo il timer mentre usi altre app o lo schermo è spento");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
