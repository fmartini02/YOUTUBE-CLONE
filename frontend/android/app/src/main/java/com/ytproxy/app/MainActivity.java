package com.ytproxy.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Due cose che Capacitor da solo non fa: il tasto Indietro e lo schermo intero.
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
                        if (!"true".equals(value)) {
                            finish();
                        }
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
}
