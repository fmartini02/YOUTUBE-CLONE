package com.ytproxy.app;

import android.net.Uri;

import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.mediarouter.media.MediaRouteSelector;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaSeekOptions;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.MediaTrack;
import com.google.android.gms.cast.TextTrackStyle;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.images.WebImage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * YtCast — il Cast SDK nativo di Android esposto al frontend come un plugin
 * Capacitor. È l'equivalente, per l'APK, del Cast Web Sender SDK di Google che
 * gira solo su Chrome/Edge/Brave desktop (vedi {@code hooks/useCast.jsx}): nella
 * WebView di Android quel componente non esiste, quindi finora il cast era
 * disattivato del tutto ({@code castSdk.js} → {@code "app-android"}).
 *
 * A differenza del ramo web — "manda un video sulla TV e basta", si comanda dal
 * telecomando — qui il telefono resta un telecomando completo: play/pausa, seek,
 * ±10s, doppio tocco, e (fasi successive) qualità, sottotitoli, coda. Lato JS lo
 * consuma {@code hooks/nativeCast.js}, che riespone la stessa interfaccia di
 * {@code useCast()} più un oggetto {@code remote}.
 *
 * ── Thread ────────────────────────────────────────────────────────────────────
 * I {@code @PluginMethod} di Capacitor girano su un thread di lavoro, ma quasi
 * tutte le API del Cast SDK vogliono il main thread. Ogni corpo che tocca l'SDK
 * passa quindi da {@link #onMain(Runnable)}. {@code call.resolve()/reject()} si
 * possono invece chiamare da qualunque thread.
 *
 * ── Sessione ─────────────────────────────────────────────────────────────────
 * {@code showDevicePicker} apre solo il selettore dei dispositivi; è il
 * {@link #sessionListener} che, a connessione avvenuta, avvisa il frontend con
 * {@code castStateChanged}. Il JS aspetta quell'evento prima di chiamare
 * {@code loadMedia}. Non registriamo la sessione a mano: ci pensa il framework
 * via {@code SessionManager}.
 */
@CapacitorPlugin(name = "YtCast")
public class CastBridgePlugin extends Plugin {

    private CastContext castContext;
    private RemoteMediaClient.Callback mediaCallback;
    private RemoteMediaClient.ProgressListener progressListener;

    /** Registrato sul {@code SessionManager}: connessione/disconnessione della TV. */
    private final SessionManagerListener<CastSession> sessionListener = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarted(CastSession s, String id) { attachMedia(s); emitState("connected"); }
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { attachMedia(s); emitState("connected"); }
        @Override public void onSessionEnded(CastSession s, int error) { detachMedia(s); emitState("ended"); }
        @Override public void onSessionSuspended(CastSession s, int reason) { emitState("suspended"); }
        @Override public void onSessionStarting(CastSession s) { emitState("connecting"); }
        @Override public void onSessionResuming(CastSession s, String id) { emitState("connecting"); }
        @Override public void onSessionStartFailed(CastSession s, int error) { emitState("failed"); }
        @Override public void onSessionResumeFailed(CastSession s, int error) { emitState("failed"); }
        @Override public void onSessionEnding(CastSession s) { }
    };

    @Override
    public void load() {
        onMain(() -> {
            try {
                castContext = CastContext.getSharedInstance(getContext().getApplicationContext());
                castContext.getSessionManager().addSessionManagerListener(sessionListener, CastSession.class);
                CastSession existing = castContext.getSessionManager().getCurrentCastSession();
                if (existing != null && existing.isConnected()) attachMedia(existing);
            } catch (Exception e) {
                // Play Services assente o troppo vecchio: il cast resta non
                // disponibile, isAvailable() lo dirà al frontend.
                castContext = null;
            }
        });
    }

    // ── Disponibilità / stato ────────────────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int gp = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", gp == ConnectionResult.SUCCESS && castContext != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        onMain(() -> call.resolve(snapshot()));
    }

    // ── Sessione ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void showDevicePicker(PluginCall call) {
        onMain(() -> {
            try {
                MediaRouteSelector selector = new MediaRouteSelector.Builder()
                        .addControlCategory(CastMediaControlIntent.categoryForCast(
                                getContext().getString(R.string.cast_receiver_app_id)))
                        .build();
                MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
                dialog.setRouteSelector(selector);
                dialog.show();
                call.resolve();
            } catch (Exception e) {
                call.reject("picker-failed", e);
            }
        });
    }

    @PluginMethod
    public void endSession(PluginCall call) {
        onMain(() -> {
            if (castContext != null) castContext.getSessionManager().endCurrentSession(true);
            call.resolve();
        });
    }

    // ── Caricamento e comandi di riproduzione ────────────────────────────────

    @PluginMethod
    public void loadMedia(PluginCall call) {
        onMain(() -> {
            RemoteMediaClient rmc = remoteMediaClient();
            if (rmc == null) { call.reject("no-session"); return; }
            try {
                rmc.load(buildRequest(call));
                call.resolve();
            } catch (Exception e) {
                call.reject("load-failed", e);
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) { withMedia(call, RemoteMediaClient::play); }

    @PluginMethod
    public void pause(PluginCall call) { withMedia(call, RemoteMediaClient::pause); }

    @PluginMethod
    public void seek(PluginCall call) {
        double time = call.getDouble("time", 0.0);
        withMedia(call, rmc -> rmc.seek(new MediaSeekOptions.Builder()
                .setPosition((long) (time * 1000)).build()));
    }

    @PluginMethod
    public void setPlaybackRate(PluginCall call) {
        double rate = call.getDouble("rate", 1.0);
        withMedia(call, rmc -> rmc.setPlaybackRate(rate));
    }

    // ── Costruzione della richiesta di load ──────────────────────────────────

    /**
     * {@link MediaLoadRequestData} dal payload JS. La firma è già quella
     * completa: {@code tracks}/{@code activeTrackIds}/{@code playbackRate} sono
     * gli agganci per qualità e sottotitoli via cast (fase 2), qui vengono
     * onorati se presenti e ignorati altrimenti.
     */
    private MediaLoadRequestData buildRequest(PluginCall call) throws Exception {
        MediaMetadata meta = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
        meta.putString(MediaMetadata.KEY_TITLE, call.getString("title", ""));
        meta.putString(MediaMetadata.KEY_SUBTITLE, call.getString("subtitle", ""));
        String thumb = call.getString("thumbnail", null);
        if (thumb != null && !thumb.isEmpty()) meta.addImage(new WebImage(Uri.parse(thumb)));

        JSONObject customData = new JSONObject();
        customData.put("videoId", call.getString("videoId", ""));

        MediaInfo.Builder info = new MediaInfo.Builder(call.getString("url", ""))
                .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                .setContentType(call.getString("contentType", "video/mp4"))
                .setMetadata(meta)
                .setCustomData(customData);
        List<MediaTrack> tracks = parseTracks(call.getArray("tracks", null));
        if (!tracks.isEmpty()) {
            info.setMediaTracks(tracks);
            TextTrackStyle style = new TextTrackStyle();
            style.setFontScale((float) call.getDouble("subtitleFontScale", 1.0));
            info.setTextTrackStyle(style);
        }

        MediaLoadRequestData.Builder req = new MediaLoadRequestData.Builder()
                .setMediaInfo(info.build())
                .setAutoplay(call.getBoolean("autoplay", true))
                .setCurrentTime((long) (call.getDouble("currentTime", 0.0) * 1000));
        long[] active = parseActiveTrackIds(call.getArray("activeTrackIds", null));
        if (active != null) req.setActiveTrackIds(active);
        Double rate = call.getDouble("playbackRate", null);
        if (rate != null && rate > 0) req.setPlaybackRate(rate);
        return req.build();
    }

    private List<MediaTrack> parseTracks(JSArray arr) throws Exception {
        List<MediaTrack> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject t = arr.getJSONObject(i);
            out.add(new MediaTrack.Builder(t.getLong("trackId"), MediaTrack.TYPE_TEXT)
                    .setSubtype(MediaTrack.SUBTYPE_SUBTITLES)
                    .setContentId(t.getString("url"))
                    .setContentType("text/vtt")
                    .setName(t.optString("name", t.optString("lang", "")))
                    .setLanguage(t.optString("lang", null))
                    .build());
        }
        return out;
    }

    private long[] parseActiveTrackIds(JSArray arr) throws Exception {
        if (arr == null) return null;
        long[] ids = new long[arr.length()];
        for (int i = 0; i < arr.length(); i++) ids[i] = arr.getLong(i);
        return ids;
    }

    // ── Eventi verso il frontend ─────────────────────────────────────────────

    private void attachMedia(CastSession session) {
        RemoteMediaClient rmc = session == null ? null : session.getRemoteMediaClient();
        if (rmc == null) return;
        detachMedia(session);
        mediaCallback = new RemoteMediaClient.Callback() {
            @Override public void onStatusUpdated() { emitMedia(); }
            @Override public void onMetadataUpdated() { emitMedia(); }
        };
        progressListener = (progressMs, durationMs) -> emitProgress(progressMs, durationMs);
        rmc.registerCallback(mediaCallback);
        rmc.addProgressListener(progressListener, 1000);
        emitMedia();
    }

    private void detachMedia(CastSession session) {
        RemoteMediaClient rmc = session == null ? null : session.getRemoteMediaClient();
        if (rmc == null) return;
        if (mediaCallback != null) rmc.unregisterCallback(mediaCallback);
        if (progressListener != null) rmc.removeProgressListener(progressListener);
        mediaCallback = null;
        progressListener = null;
    }

    private void emitState(String phase) {
        JSObject ev = snapshot();
        ev.put("phase", phase);
        notifyListeners("castStateChanged", ev);
    }

    private void emitMedia() {
        notifyListeners("mediaStatusChanged", snapshot());
    }

    private void emitProgress(long progressMs, long durationMs) {
        JSObject ev = snapshot();
        ev.put("position", progressMs / 1000.0);
        if (durationMs > 0) ev.put("duration", durationMs / 1000.0);
        notifyListeners("mediaStatusChanged", ev);
    }

    /** Stato completo della sessione + del media, nel formato che il JS si aspetta. */
    private JSObject snapshot() {
        JSObject s = new JSObject();
        CastSession session = castContext == null ? null
                : castContext.getSessionManager().getCurrentCastSession();
        boolean connected = session != null && session.isConnected();
        s.put("connected", connected);
        s.put("deviceName", session != null && session.getCastDevice() != null
                ? session.getCastDevice().getFriendlyName() : "");
        RemoteMediaClient rmc = connected ? session.getRemoteMediaClient() : null;
        if (rmc != null) {
            s.put("playerState", playerStateName(rmc.getPlayerState()));
            s.put("position", rmc.getApproximateStreamPosition() / 1000.0);
            s.put("duration", rmc.getStreamDuration() / 1000.0);
            s.put("videoId", currentVideoId(rmc));
            MediaStatus ms = rmc.getMediaStatus();
            s.put("playbackRate", ms != null ? ms.getPlaybackRate() : 1.0);
        } else {
            s.put("playerState", "idle");
        }
        return s;
    }

    private String currentVideoId(RemoteMediaClient rmc) {
        try {
            MediaInfo info = rmc.getMediaInfo();
            JSONObject cd = info == null ? null : info.getCustomData();
            return cd == null ? "" : cd.optString("videoId", "");
        } catch (Exception e) {
            return "";
        }
    }

    private static String playerStateName(int state) {
        switch (state) {
            case MediaStatus.PLAYER_STATE_PLAYING: return "playing";
            case MediaStatus.PLAYER_STATE_PAUSED: return "paused";
            case MediaStatus.PLAYER_STATE_BUFFERING:
            case MediaStatus.PLAYER_STATE_LOADING: return "buffering";
            default: return "idle";
        }
    }

    // ── Utilità ──────────────────────────────────────────────────────────────

    private interface MediaAction { void run(RemoteMediaClient rmc); }

    private void withMedia(PluginCall call, MediaAction action) {
        onMain(() -> {
            RemoteMediaClient rmc = remoteMediaClient();
            if (rmc == null) { call.reject("no-session"); return; }
            try {
                action.run(rmc);
                call.resolve();
            } catch (Exception e) {
                call.reject("command-failed", e);
            }
        });
    }

    private RemoteMediaClient remoteMediaClient() {
        CastSession session = castContext == null ? null
                : castContext.getSessionManager().getCurrentCastSession();
        return session == null ? null : session.getRemoteMediaClient();
    }

    private void onMain(Runnable r) {
        if (getActivity() != null) getActivity().runOnUiThread(r); else r.run();
    }
}
