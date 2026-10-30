package thaimer.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

/**
 * Ponte tra l'app web e Android: priorità audio (ducking della musica), servizio in primo piano
 * con notifica, schermo sempre acceso.
 *
 * Priorità audio: l'audio dei bip resta quello di Web Audio, qui si chiede solo ad Android di far
 * abbassare le altre app. La finestra di abbassamento resta aperta finché c'è un suono in arrivo
 * (duckAt) o la voce sta parlando (duckSet), ed è gestita da un Handler nativo: non dipende dai
 * timer della pagina, che in background possono essere rallentati.
 */
@CapacitorPlugin(
    name = "ThaimerNative",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class ThaimerNativePlugin extends Plugin {

    private static ThaimerNativePlugin instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Runnable> pending = new ArrayList<>();
    private final Runnable recheck = this::updateFocus;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> { /* siamo noi a chiedere: ignoriamo */ };

    // tutto lo stato qui sotto si tocca solo dal thread principale
    private boolean voiceHold = false;
    private long windowEnd = 0;
    private boolean focused = false;
    private AudioFocusRequest focusRequest;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        handler.post(() -> {
            cancelWindows();
            getContext().stopService(new Intent(getContext(), ThaimerService.class));
        });
    }

    /** Chiamato dal servizio quando si tocca un pulsante della notifica. */
    static void dispatchAction(String action) {
        ThaimerNativePlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        p.notifyListeners("action", data);
    }

    /* ---------------- priorità audio ---------------- */

    /** La voce sta parlando (true) o ha finito (false). */
    @PluginMethod
    public void duckSet(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        handler.post(() -> {
            voiceHold = on;
            updateFocus();
            call.resolve();
        });
    }

    /** Apre una finestra di abbassamento tra delayMs, lunga holdMs. */
    @PluginMethod
    public void duckAt(PluginCall call) {
        final long delay = Math.max(0, call.getData().optLong("delayMs", 0));
        final long hold = Math.max(0, call.getData().optLong("holdMs", 0));
        handler.post(() -> {
            Runnable open = new Runnable() {
                @Override
                public void run() {
                    pending.remove(this);
                    windowEnd = Math.max(windowEnd, SystemClock.elapsedRealtime() + hold);
                    updateFocus();
                }
            };
            pending.add(open);
            handler.postDelayed(open, delay);
            call.resolve();
        });
    }

    /** Chiude tutto: finestre già programmate e priorità audio. */
    @PluginMethod
    public void duckCancel(PluginCall call) {
        handler.post(() -> {
            cancelWindows();
            call.resolve();
        });
    }

    private void cancelWindows() {
        for (Runnable r : pending) handler.removeCallbacks(r);
        pending.clear();
        voiceHold = false;
        windowEnd = 0;
        updateFocus();
    }

    private void updateFocus() {
        handler.removeCallbacks(recheck);
        long now = SystemClock.elapsedRealtime();
        if (voiceHold || now < windowEnd) {
            acquireFocus();
            if (!voiceHold) handler.postDelayed(recheck, windowEnd - now + 1);
        } else {
            releaseFocus();
        }
    }

    @SuppressWarnings("deprecation")
    private void acquireFocus() {
        if (focused) return;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(focusListener, handler)
                .build();
            result = am.requestAudioFocus(focusRequest);
        } else {
            result = am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        focused = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void releaseFocus() {
        if (!focused) return;
        focused = false;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) am.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        } else {
            am.abandonAudioFocus(focusListener);
        }
    }

    /* ---------------- schermo acceso ---------------- */

    @PluginMethod
    public void screenOn(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        getBridge().executeOnMainThread(() -> {
            Window window = getActivity().getWindow();
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /* ---------------- servizio in primo piano e notifica ---------------- */

    /** Chiede il permesso per mostrare la notifica (Android 13+). Il servizio parte comunque anche senza. */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            reportNotifications(call);
        } else {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        }
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        reportNotifications(call);
    }

    private void reportNotifications(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(res);
    }

    /** Avvia il servizio (o ne aggiorna la notifica): l'allenamento è in corso. */
    @PluginMethod
    public void serviceStart(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, ThaimerService.class)
            .putExtra(ThaimerService.EXTRA_TITLE, call.getString("title", "Thaimer"))
            .putExtra(ThaimerService.EXTRA_TEXT, call.getString("text", ""))
            .putExtra(ThaimerService.EXTRA_PAUSED, call.getBoolean("paused", false));
        try {
            ContextCompat.startForegroundService(ctx, intent);
            call.resolve();
        } catch (RuntimeException e) {
            // per esempio app in background su Android 12+: l'allenamento prosegue comunque, senza servizio
            call.reject("Servizio non avviabile: " + e.getMessage());
        }
    }

    /** Aggiorna testo e pulsanti della notifica senza toccare il servizio. */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void serviceUpdate(PluginCall call) {
        Context ctx = getContext();
        try {
            NotificationManagerCompat.from(ctx).notify(
                ThaimerService.NOTIFICATION_ID,
                ThaimerService.buildNotification(ctx, call.getString("title", "Thaimer"), call.getString("text", ""), call.getBoolean("paused", false))
            );
        } catch (RuntimeException e) { /* notifiche non disponibili: niente di grave */ }
        call.resolve();
    }

    @PluginMethod
    public void serviceStop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ThaimerService.class));
        call.resolve();
    }
}
