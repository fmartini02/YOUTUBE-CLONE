package com.ytproxy.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * Tasto Indietro (e gesture di scorrimento dal bordo) di Android.
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
}
