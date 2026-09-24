package com.ytproxy.app;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

/**
 * Tre cose che Capacitor da solo non fa: il tasto Indietro, lo schermo intero e
 * il Picture-in-Picture (quest'ultimo è spiegato in {@link PipPlugin}; qui ci
 * sono solo gli agganci dell'activity: onUserLeaveHint,
 * onPictureInPictureModeChanged e il ripiego del tasto Indietro).
 *
 * ── Schermo intero ─────────────────────────────────────────────────────────
 * Il WebChromeClient di Capacitor annulla la richiesta di schermo intero della
 * pagina, quindi il video restava sotto la barra di stato e quella di
 * navigazione. Lo rimpiazza {@link FullscreenWebChromeClient}, che il docstring
 * lì spiega per esteso. Va messo dentro onCreate: la classe di Capacitor
 * registra dei launcher di activity result, e quelli si possono registrare solo
 * prima che l'activity parta.
 *
 * ── Tasto Indietro (e gesture di scorrimento dal bordo) ────────────────────
 *
 * Da Capacitor 7 in poi l'activity non gestisce più il tasto da sola: senza il
 * plugin @capacitor/app il comportamento predefinito è chiudere l'app, quindi
 * dentro l'app "Indietro" non tornava alla schermata precedente ma usciva —
 * o, con la gesture, non faceva niente.
 *
 * Qui il tasto viene passato al frontend: `ytproxyHandleBack()` (vedi App.jsx)
 * sa cosa c'è di aperto — un pannello, lo schermo intero del player, una
 * pagina precedente nella cronologia — e risponde se ha gestito lui il tasto.
 * Solo quando non c'è più niente da chiudere l'app si chiude davvero, come
 * dalla schermata iniziale di qualsiasi app Android.
 *
 * Si usa OnBackPressedDispatcher e non il vecchio onBackPressed() perché con
 * targetSdk 35+ Android instrada il tasto (e la gesture predittiva) solo
 * attraverso il dispatcher.
 */
public class MainActivity extends BridgeActivity {

    private FullscreenWebChromeClient chromeClient;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Il plugin del cast va registrato PRIMA che l'activity parta: come per i
        // launcher di activity result di Capacitor, a partita avviata non viene
        // più accettato. Sblocca il Chromecast nativo nell'APK, dove il Cast Web
        // Sender di Google non esiste (vedi CastBridgePlugin e hooks/nativeCast.js).
        registerPlugin(CastBridgePlugin.class);
        // Picture-in-Picture (vedi PipPlugin): stessa regola, prima di super.onCreate.
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            chromeClient = new FullscreenWebChromeClient(bridge);
            bridge.getWebView().setWebChromeClient(chromeClient);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                // evaluateJavascript restituisce il valore già in JSON: "true"
                // se il frontend ha gestito il tasto. Se la pagina non è
                // caricata la funzione non esiste, si ottiene "false" e l'app
                // si chiude — che in quel caso è il comportamento giusto.
                webView.evaluateJavascript(
                    "(function(){try{return !!(window.ytproxyHandleBack && window.ytproxyHandleBack());}catch(e){return false;}})()",
                    value -> {
                        if ("true".equals(value)) return;
                        // Niente più dove tornare (di solito la home) ma un
                        // video in riproduzione nel widget: invece di
                        // chiudere di colpo l'app e il video, lo si manda in
                        // PiP — come il tasto Home. Direttamente, con
                        // l'activity ancora in primo piano: dopo un
                        // moveTaskToBack() la chiamata fallirebbe. Se il PiP
                        // non parte (disattivato dall'utente, video in
                        // pausa) si chiude come prima.
                        PipPlugin pip = pip();
                        if (pip == null || !pip.entraSeIdoneo()) finish();
                    }
                );
            }
        });
    }

    /**
     * Al ritorno sull'app (da un'altra app, dal pannello delle notifiche, dal
     * blocco schermo) Android rimette le barre di sistema: se il video è ancora
     * a schermo intero vanno rinascoste.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && chromeClient != null) chromeClient.reapplySystemBars();
    }

    /**
     * Uscita dall'app (tasto o gesto Home) da API 26 a 30: si entra in PiP se
     * c'è un video in riproduzione. Da API 31 no — lì entra da solo il sistema
     * con setAutoEnterEnabled (vedi PipPlugin), e chiederlo anche qui
     * farebbe partire l'entrata due volte. Scatta anche quando l'app apre
     * un'altra activity (selettore file dei cookie, browser per il login):
     * con un video in riproduzione si va in PiP, come fa YouTube.
     */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            PipPlugin pip = pip();
            if (pip != null) pip.entraSeIdoneo();
        }
    }

    /** Entrata e uscita dal PiP → alla pagina. Chi lo interpreta (X o Espandi) è PipPlugin.modoCambiato. */
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        PipPlugin pip = pip();
        if (pip != null) pip.modoCambiato(isInPictureInPictureMode, getLifecycle().getCurrentState());
    }

    private PipPlugin pip() {
        Bridge bridge = getBridge();
        PluginHandle handle = bridge != null ? bridge.getPlugin("YtPip") : null;
        return handle != null ? (PipPlugin) handle.getInstance() : null;
    }
}
