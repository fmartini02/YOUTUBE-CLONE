package com.ytproxy.app;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Schermo intero dell'app Android: video su tutto lo schermo, barre di sistema
 * nascoste.
 *
 * Nell'apk lo schermo intero del player (`requestFullscreen()` sul contenitore,
 * vedi VideoPlayer.jsx) non arrivava mai a coprire davvero lo schermo: restavano
 * la barra di stato in alto (ora, notifiche, wifi, batteria) e quella di
 * navigazione in basso.
 *
 * Il motivo sta in `BridgeWebChromeClient` di Capacitor. La WebView concede lo
 * schermo intero solo se il WebChromeClient dichiara di gestirlo — Android lo
 * controlla via reflection, cercando `onShowCustomView`/`onHideCustomView` fra i
 * metodi ridefiniti dal client. Capacitor li ridefinisce entrambi proprio per
 * quello, ma dentro `onShowCustomView` chiama subito `onCustomViewHidden()`: la
 * vista a schermo intero che la WebView le passa non viene mai attaccata a
 * niente, e la richiesta rientra all'istante. Da lì il risultato che si vede sul
 * telefono — l'app resta la stessa finestra di sempre, con le sue barre.
 *
 * Qui `onShowCustomView` fa il suo mestiere: attacca quella vista sopra il
 * contenuto dell'activity e nasconde le barre finché lo schermo intero dura.
 * Non si chiama `super`, che è appunto la versione che annulla tutto; tutto il
 * resto di `BridgeWebChromeClient` (dialoghi, permessi, selezione file) resta
 * quello di Capacitor perché la classe lo estende.
 *
 * Le barre non spariscono per sempre: `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` le
 * fa ricomparire con una passata di dito dal bordo, e dopo qualche secondo se ne
 * tornano via da sole. È il comportamento delle app video di Android.
 */
public class FullscreenWebChromeClient extends BridgeWebChromeClient {

    private final Activity activity;

    private View customView;
    private CustomViewCallback customViewCallback;

    public FullscreenWebChromeClient(Bridge bridge) {
        super(bridge);
        this.activity = bridge.getActivity();
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        // Una richiesta mentre siamo già a schermo intero non si può servire:
        // rifiutarla è meglio che perdere il riferimento alla vista precedente,
        // che resterebbe attaccata per sempre sopra l'app.
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }

        customView = view;
        customViewCallback = callback;

        // Nero sotto al video: il contenitore del player è più largo o più alto
        // del fotogramma (rapporti diversi da 16/9) e senza sfondo si vedrebbe
        // in trasparenza quello che c'è dietro.
        view.setBackgroundColor(0xFF000000);
        FrameLayout content = activity.findViewById(android.R.id.content);
        content.addView(
            view,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );

        setSystemBarsHidden(true);
    }

    @Override
    public void onHideCustomView() {
        if (customView == null) return;

        ViewGroup parent = (ViewGroup) customView.getParent();
        if (parent != null) parent.removeView(customView);
        customView = null;

        setSystemBarsHidden(false);

        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
    }

    /**
     * Rimette le barre come devono stare.
     *
     * Serve al ritorno da un'altra app o dal pannello delle notifiche: Android
     * in quei passaggi ripristina le barre, e senza questo giro chi torna
     * sull'app si ritrova il video a schermo intero con l'ora sopra — cioè
     * esattamente il problema di partenza. La chiama MainActivity quando la
     * finestra riprende il fuoco.
     */
    void reapplySystemBars() {
        if (customView != null) setSystemBarsHidden(true);
    }

    private void setSystemBarsHidden(boolean hidden) {
        Window window = activity.getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (hidden) controller.hide(WindowInsetsCompat.Type.systemBars());
        else controller.show(WindowInsetsCompat.Type.systemBars());

        // Con le barre nascoste il ritaglio della fotocamera resta l'unica cosa
        // che tiene il video lontano dal bordo: in orizzontale diventa una banda
        // nera su un lato. SHORT_EDGES lascia disegnare anche lì.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = window.getAttributes();
            attrs.layoutInDisplayCutoutMode = hidden
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
            window.setAttributes(attrs);
        }
    }
}
