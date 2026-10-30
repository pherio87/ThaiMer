package thaimer.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
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
import java.util.Locale;

/**
 * Ponte tra l'app web e Android: voce, priorità audio (ducking della musica), servizio in primo
 * piano con notifica, schermo sempre acceso.
 *
 * Voce: nella WebView di Android speechSynthesis non parla, quindi gli annunci passano dal motore
 * di sintesi vocale del telefono (TextToSpeech).
 *
 * Priorità audio: l'audio dei bip resta quello di Web Audio, qui si chiede solo ad Android di far
 * abbassare le altre app. La finestra di abbassamento resta aperta finché c'è un suono in arrivo
 * (duckAt) o la voce sta parlando, ed è gestita da un Handler nativo: non dipende dai timer della
 * pagina, che in background possono essere rallentati.
 */
@CapacitorPlugin(
    name = "ThaimerNative",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class ThaimerNativePlugin extends Plugin {

    private static ThaimerNativePlugin instance;

    // dopo la fine della voce la musica resta bassa ancora un attimo: niente rialzi tra un annuncio e il bip successivo
    private static final long DUCK_PAD_MS = 500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Runnable> pending = new ArrayList<>();
    private final Runnable recheck = this::updateFocus;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> { /* siamo noi a chiedere: ignoriamo */ };

    // tutto lo stato qui sotto si tocca solo dal thread principale
    private long windowEnd = 0;
    private boolean focused = false;
    private AudioFocusRequest focusRequest;

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean ttsFailed = false;
    private PendingSpeech pendingSpeech; // annuncio arrivato prima che il motore fosse pronto
    private int utteranceSeq = 0;
    private String currentUtterance; // l'annuncio in corso
    private boolean speechDucks = false;
    private final Runnable speechWatchdog = () -> endSpeech(currentUtterance, false);

    private static class PendingSpeech {
        final String text;
        final float volume;
        final boolean duck;

        PendingSpeech(String text, float volume, boolean duck) {
            this.text = text;
            this.volume = volume;
            this.duck = duck;
        }
    }

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        handler.post(() -> {
            cancelWindows();
            endSpeech(currentUtterance, false);
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
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

    /* ---------------- voce ---------------- */

    /** Pronuncia un annuncio al posto di quello in corso. Risponde {ok:false} se il telefono non ha un motore vocale. */
    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final float volume = (float) call.getData().optDouble("volume", 1.0);
        final boolean duck = call.getBoolean("duck", false);
        handler.post(() -> {
            JSObject res = new JSObject();
            if (text.isEmpty()) {
                res.put("ok", true);
            } else if (ttsFailed) {
                res.put("ok", false);
            } else if (ttsReady) {
                speakNow(text, volume, duck);
                res.put("ok", true);
            } else {
                pendingSpeech = new PendingSpeech(text, volume, duck);
                if (tts == null) initTts();
                res.put("ok", true);
            }
            call.resolve(res);
        });
    }

    /** Interrompe l'annuncio in corso (e quello in attesa del motore). */
    @PluginMethod
    public void speakStop(PluginCall call) {
        handler.post(() -> {
            pendingSpeech = null;
            if (tts != null && ttsReady) tts.stop();
            endSpeech(currentUtterance, false);
            call.resolve();
        });
    }

    private void initTts() {
        tts = new TextToSpeech(getContext(), status -> handler.post(() -> {
            if (tts == null) return;
            if (status != TextToSpeech.SUCCESS) {
                ttsFailed = true;
                tts.shutdown();
                tts = null;
                pendingSpeech = null;
                return;
            }
            // se l'italiano non c'è resta la lingua di sistema
            tts.setLanguage(Locale.ITALY);
            tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
            tts.setSpeechRate(1.05f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) { /* la finestra di abbassamento si apre già in speakNow */ }

                @Override
                public void onDone(String utteranceId) {
                    handler.post(() -> endSpeech(utteranceId, true));
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onError(String utteranceId) {
                    handler.post(() -> endSpeech(utteranceId, true));
                }

                @Override
                public void onStop(String utteranceId, boolean interrupted) {
                    handler.post(() -> endSpeech(utteranceId, true));
                }
            });
            ttsReady = true;
            PendingSpeech p = pendingSpeech;
            pendingSpeech = null;
            if (p != null) speakNow(p.text, p.volume, p.duck);
        }));
    }

    private void speakNow(String text, float volume, boolean duck) {
        String id = "u" + (++utteranceSeq);
        currentUtterance = id;
        speechDucks = duck;
        handler.removeCallbacks(speechWatchdog);
        // la musica si abbassa subito, prima che la sintesi inizi a parlare
        updateFocus();
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
        int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id);
        if (r != TextToSpeech.SUCCESS) {
            endSpeech(id, false);
            return;
        }
        // rete di sicurezza se onDone non arrivasse mai: non lasciamo la musica bassa per sempre
        handler.postDelayed(speechWatchdog, 4000 + text.length() * 120L);
    }

    /** Fine di un annuncio; ignora quelli già sostituiti da uno più recente. */
    private void endSpeech(String id, boolean keepPad) {
        if (id == null || !id.equals(currentUtterance)) return;
        currentUtterance = null;
        handler.removeCallbacks(speechWatchdog);
        if (speechDucks && keepPad) windowEnd = Math.max(windowEnd, SystemClock.elapsedRealtime() + DUCK_PAD_MS);
        updateFocus();
    }

    /* ---------------- priorità audio ---------------- */

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

    /** Annulla le finestre già programmate (non la voce in corso: la gestisce speakStop). */
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
        windowEnd = 0;
        updateFocus();
    }

    private void updateFocus() {
        handler.removeCallbacks(recheck);
        long now = SystemClock.elapsedRealtime();
        boolean speaking = currentUtterance != null && speechDucks;
        if (speaking || now < windowEnd) {
            acquireFocus();
            if (!speaking) handler.postDelayed(recheck, windowEnd - now + 1);
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
