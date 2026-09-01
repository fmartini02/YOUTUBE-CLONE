package com.ytproxy.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.cast.framework.CastOptions;
import com.google.android.gms.cast.framework.OptionsProvider;
import com.google.android.gms.cast.framework.SessionProvider;

import java.util.List;

/**
 * Opzioni del Cast SDK nativo — l'equivalente Android di
 * {@code ctx.setOptions({ receiverApplicationId })} che il ramo web fa in
 * {@code hooks/useCast.jsx}.
 *
 * Il Cast SDK istanzia questa classe da sé (costruttore senza argomenti) leggendo
 * il nome completo dalla {@code <meta-data OPTIONS_PROVIDER_CLASS_NAME>} nel
 * manifest. {@code CastContext.getSharedInstance()} non parte senza.
 *
 * L'App ID del ricevitore non è cablato qui: {@code cast_receiver_app_id} è una
 * risorsa stringa generata a build time da {@code app/build.gradle}, che legge la
 * env {@code VITE_CAST_APP_ID} (la stessa del frontend) e ripiega su
 * {@code CC1AD845} — il Default Media Receiver di Google, che riproduce MP4
 * H.264+AAC e WebVTT side-loaded senza dover registrare (e pagare) un receiver
 * proprio. Vedi {@code pages/SettingsPage/ChromecastGuideSection.jsx}.
 */
public class CastOptionsProvider implements OptionsProvider {

    @NonNull
    @Override
    public CastOptions getCastOptions(@NonNull Context context) {
        return new CastOptions.Builder()
                .setReceiverApplicationId(context.getString(R.string.cast_receiver_app_id))
                .build();
    }

    @Nullable
    @Override
    public List<SessionProvider> getAdditionalSessionProviders(@NonNull Context context) {
        return null;
    }
}
