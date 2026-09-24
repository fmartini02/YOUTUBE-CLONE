package com.ytproxy.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Log;
import android.util.Rational;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

/**
 * YtPip — Picture-in-Picture di Android: uscendo dall'app con un video in
 * riproduzione, il video continua in una finestrella sopra le altre app;
 * "Espandi" riporta nell'app sul video a pagina intera.
 *
 * In PiP va l'intera activity, cioè la WebView: la pagina (hooks/pipBridge.js,
 * App/usePipMode.js) mostra allora il solo player a tutta finestra
 * (`data-pip` su <html>) e i comandi li disegna Android.
 *
 * ── Chi decide ────────────────────────────────────────────────────────────
 * Solo la pagina sa se c'è un video e se sta andando: lo manda con
 * {@link #setStato}. Idoneo = player montato E in riproduzione (anche durante
 * uno stallo di rete, in cui il video è in pausa tecnica ma deve ripartire).
 * Mai durante il cast: lì il player non è montato, quindi la pagina manda
 * "non attivo". Con l'idoneità:
 * <ul>
 *   <li>API 31+: {@code setAutoEnterEnabled} — è il sistema a entrare in PiP
 *       da solo col gesto Home, senza chiedere niente all'app, quindi il flag va
 *       aggiornato AD OGNI cambio di stato (play, pausa, cast, widget chiuso);</li>
 *   <li>API 26-30: {@link #entraSeIdoneo()} da {@code onUserLeaveHint} (in
 *       MainActivity). Non anche su 31+: l'entrata sarebbe chiesta due volte;</li>
 *   <li>tasto Indietro senza più niente dietro: {@link #entraSeIdoneo()}
 *       direttamente, activity ancora in primo piano (MainActivity).</li>
 * </ul>
 *
 * ── X o Espandi ───────────────────────────────────────────────────────────
 * Entrambi arrivano come {@code onPictureInPictureModeChanged(false)}. Con la
 * X l'activity è GIÀ ferma quando arriva il callback (onStop viene prima),
 * con Espandi è avviata: si guarda lo stato del lifecycle DENTRO il callback,
 * come nell'esempio della documentazione Android. Un flag acceso nel callback
 * e letto in onStop non scatterebbe mai sulla X. I Log.d con tag "YtPip"
 * servono a confermare quest'ordine sul telefono (adb logcat -s YtPip).
 */
@CapacitorPlugin(name = "YtPip")
public class PipPlugin extends Plugin {

    private static final String TAG = "YtPip";
    private static final String AZIONE = "com.ytproxy.app.PIP_AZIONE";
    // Limiti di Android al rapporto d'aspetto della finestra: fuori da qui
    // setPictureInPictureParams lancia IllegalArgumentException.
    private static final double RAPPORTO_MAX = 2.39;

    // Scritti dal thread dei plugin, letti dal main thread (onUserLeaveHint,
    // tasto Indietro): volatile.
    private volatile boolean attivo = false;
    private volatile boolean inRiproduzione = false;
    private volatile int larghezza = 16;
    private volatile int altezza = 9;

    private final BroadcastReceiver ricevitore = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String azione = intent.getStringExtra("azione");
            Log.d(TAG, "pulsante nella finestra: " + azione);
            JSObject ev = new JSObject();
            ev.put("azione", azione);
            notifyListeners("pipAzione", ev);
        }
    };

    @Override
    public void load() {
        // RECEIVER_NOT_EXPORTED: con targetSdk 34+ un receiver registrato a
        // runtime senza flag fa crashare l'app (SecurityException). La versione
        // di ContextCompat vale anche sotto API 33, dove la costante di Context
        // non esiste.
        ContextCompat.registerReceiver(getContext(), ricevitore, new IntentFilter(AZIONE), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(ricevitore); } catch (IllegalArgumentException ignorata) { }
    }

    /** Dalla pagina: { attivo, playing, w, h } ad ogni cambio. */
    @PluginMethod
    public void setStato(PluginCall call) {
        attivo = Boolean.TRUE.equals(call.getBoolean("attivo", false));
        inRiproduzione = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Integer w = call.getInt("w");
        Integer h = call.getInt("h");
        if (w != null && h != null && w > 0 && h > 0) { larghezza = w; altezza = h; }
        onMain(this::aggiornaParametri);
        call.resolve();
    }

    /** Stato vero della finestra: la pagina lo chiede tornando visibile, se avesse perso un evento. */
    @PluginMethod
    public void getStato(PluginCall call) {
        onMain(() -> {
            Activity a = getActivity();
            JSObject ret = new JSObject();
            ret.put("pip", a != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && a.isInPictureInPictureMode());
            call.resolve(ret);
        });
    }

    boolean idoneo() {
        return attivo && inRiproduzione;
    }

    /**
     * Entra in PiP se c'è un video in riproduzione. Il valore restituito da
     * enterPictureInPictureMode va controllato: col PiP disattivato
     * dall'utente per quest'app NON lancia eccezioni, restituisce false — e
     * chi chiama (il tasto Indietro) deve allora chiudere l'app come prima.
     */
    boolean entraSeIdoneo() {
        Activity a = getActivity();
        if (a == null || !idoneo() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            boolean ok = a.enterPictureInPictureMode(parametri());
            Log.d(TAG, "enterPictureInPictureMode → " + ok);
            return ok;
        } catch (RuntimeException e) {
            Log.d(TAG, "enterPictureInPictureMode rifiutato: " + e);
            return false;
        }
    }

    /** Da MainActivity.onPictureInPictureModeChanged: avvisa la pagina (entrata, X o Espandi). */
    void modoCambiato(boolean inPip, Lifecycle.State stato) {
        JSObject ev = new JSObject();
        ev.put("attivo", inPip);
        if (!inPip) {
            boolean chiusa = !stato.isAtLeast(Lifecycle.State.STARTED);
            ev.put("esito", chiusa ? "chiudi" : "espandi");
            // Con la X il video va fermato: con KeepRunning la WebView non si
            // ferma da sola e l'audio continuerebbe senza niente di visibile.
            // Il comando vero lo dà la pagina (annulla anche l'attesa di un
            // buffer); questa pausa diretta è la rete di sicurezza se il suo
            // ascoltatore non girasse.
            if (chiusa) pausaDiretta();
        }
        Log.d(TAG, "modoCambiato pip=" + inPip + " lifecycle=" + stato + " → " + ev);
        notifyListeners("pipModo", ev);
    }

    private void pausaDiretta() {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null);
    }

    private void aggiornaParametri() {
        Activity a = getActivity();
        if (a == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            a.setPictureInPictureParams(parametri());
        } catch (RuntimeException e) {
            Log.d(TAG, "setPictureInPictureParams rifiutato: " + e);
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    private PictureInPictureParams parametri() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder()
            .setAspectRatio(rapporto())
            .setActions(Collections.singletonList(pulsante()));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setAutoEnterEnabled(idoneo());
        return b.build();
    }

    /** Proporzioni del video, portate dentro [1:2.39, 2.39:1]; 16:9 finché non si conoscono. */
    private Rational rapporto() {
        double r = (double) larghezza / altezza;
        if (r > RAPPORTO_MAX) return new Rational(239, 100);
        if (r < 1 / RAPPORTO_MAX) return new Rational(100, 239);
        return new Rational(larghezza, altezza);
    }

    /**
     * Un solo pulsante, quello che corrisponde all'icona mostrata: "pausa"
     * se il video va, "play" se è fermo. Manda l'azione esplicita, non un
     * "inverti": durante uno stallo il video è in pausa tecnica e un toggle
     * lo farebbe ripartire dentro un buffer vuoto.
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private RemoteAction pulsante() {
        boolean va = inRiproduzione;
        String azione = va ? "pause" : "play";
        Intent intent = new Intent(AZIONE).setPackage(getContext().getPackageName()).putExtra("azione", azione);
        PendingIntent pi = PendingIntent.getBroadcast(
            getContext(), va ? 1 : 2, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Icon icona = Icon.createWithResource(getContext(), va ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        String etichetta = va ? "Pausa" : "Riproduci";
        return new RemoteAction(icona, etichetta, etichetta, pi);
    }

    private void onMain(Runnable r) {
        if (getActivity() != null) getActivity().runOnUiThread(r); else r.run();
    }
}
