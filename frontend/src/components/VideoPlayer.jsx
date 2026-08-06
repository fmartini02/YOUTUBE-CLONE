import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { useTouchDevice } from "../hooks/useMediaQuery";

/**
 * Player con controlli propri, al posto di quelli nativi del browser.
 *
 * Il motivo non è estetico: il flusso di /api/mux è generato in tempo reale e
 * il browser non ne conosce la durata, quindi la barra nativa mostrava solo il
 * pezzo già scaricato e non permetteva di spostarsi. Qui la durata arriva dai
 * metadati (/api/watch) e il salto si fa riaprendo il flusso dal secondo
 * richiesto (`start`), cosa che i controlli nativi non sanno fare.
 *
 * Da qui a cascata: niente `controls`, quindi niente bottone schermo intero
 * nativo accanto al nostro e niente menu "tre puntini" accanto alla rotellina —
 * i doppioni erano proprio quelli. E i bottoni che il browser non offre
 * (sottotitoli sì/no, modalità cinema) trovano posto nella stessa barra.
 */

function formatTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Il tempo `t` (relativo al flusso corrente) è già scaricato? Se sì il salto è
// immediato e non serve riaprire lo stream.
function isBuffered(video, t) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (t >= video.buffered.start(i) && t <= video.buffered.end(i) - 0.3) return true;
  }
  return false;
}

const SKIP_SECONDS = 10;
const VOLUME_STEP = 0.05;

// Quanto si aspetta un secondo tocco prima di dare per buono il primo. È anche
// il ritardo con cui il tocco singolo mette in pausa: sotto i ~250ms i doppi
// tocchi veri sfuggono, sopra i ~400ms il player sembra lento a rispondere.
const DOUBLE_TAP_MS = 300;
// Oltre questa distanza il dito stava scorrendo la pagina, non toccando il
// video: senza il controllo, ogni scorrimento partito dal player lo metteva
// in pausa.
const TAP_SLOP_PX = 12;
// Terzo sinistro e terzo destro saltano avanti/indietro; la fascia centrale no,
// altrimenti un doppio tocco al centro (dove si mira per la pausa) muoverebbe
// il video invece di fermarlo.
const TAP_SIDE_RATIO = 0.35;

export default function VideoPlayer({
  videoId,
  quality,
  onQualityChange,
  duration,
  subtitleLangs = [],
  subtitleLang,
  onSubtitleLangChange,
  subtitleSize,
  onSubtitleSizeChange,
  theater,
  onToggleTheater,
  onError,
  onNotice,
}) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const barRef = useRef(null);
  // Dito o mouse: cambia proprio il modo di comandare il player (vedi la
  // sezione "Tocchi sullo schermo" più sotto), non solo l'aspetto.
  const touch = useTouchDevice();

  // `start` è il secondo da cui il flusso corrente è stato aperto; `n` serve a
  // forzare la riapertura anche quando si torna sullo stesso secondo.
  const [stream, setStream] = useState({ start: 0, n: 0 });
  const [position, setPosition] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrub, setScrub] = useState(null);   // secondi mentre si trascina
  const [hover, setHover] = useState(null);   // secondi sotto il puntatore

  // Cambio video: azzera il flusso subito, in fase di render. Farlo in un
  // effect lascerebbe partire l'effetto di caricamento con il vecchio `start`,
  // cioè un video nuovo aperto a metà.
  const [prevId, setPrevId] = useState(videoId);
  if (prevId !== videoId) {
    setPrevId(videoId);
    setStream({ start: 0, n: 0 });
    setPosition(0);
    setBufferedEnd(0);
    setSettingsOpen(false);
  }

  // ── Caricamento / riapertura del flusso ────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = api.muxUrl(videoId, quality, stream.start);
    v.load();
    setBuffering(true);
    setPosition(stream.start);
    setBufferedEnd(stream.start);
    v.play().catch(() => {});   // l'autoplay può essere bloccato: non è un errore
  }, [videoId, quality, stream]);

  // ── Salto nel tempo ────────────────────────────────────────────────────
  const seekTo = useCallback((target) => {
    const v = videoRef.current;
    if (!v) return;
    const max = duration ? duration - 0.5 : Infinity;
    const t = Math.max(0, Math.min(max, target));
    const local = t - stream.start;
    if (local >= 0 && isBuffered(v, local)) {
      // Già in buffer: salto istantaneo, il flusso non si tocca.
      v.currentTime = local;
      setPosition(t);
    } else {
      setStream(s => ({ start: t, n: s.n + 1 }));
    }
  }, [duration, stream.start]);

  const skip = useCallback((delta) => seekTo(position + delta), [seekTo, position]);

  // ── Play / pausa, volume, schermo intero ───────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }, []);

  // Alza/abbassa a passi, partendo dal volume vero dell'elemento: `volume`
  // nello stato può essere di un istante prima se si tiene premuto il tasto.
  const nudgeVolume = useCallback((delta) => {
    const v = videoRef.current;
    if (!v) return;
    changeVolume(Math.max(0, Math.min(1, (v.muted ? 0 : v.volume) + delta)));
  }, [changeVolume]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen().catch(() => {});
  }, []);

  // ── Sottotitoli ────────────────────────────────────────────────────────
  // Ricorda l'ultima lingua scelta, così il tasto "c" riaccende quella invece
  // di ripartire ogni volta dalla prima della lista.
  const lastSubRef = useRef("");
  useEffect(() => { if (subtitleLang) lastSubRef.current = subtitleLang; }, [subtitleLang]);

  const toggleSubtitles = useCallback(() => {
    if (subtitleLang) { onSubtitleLangChange(""); return; }
    if (!subtitleLangs.length) {
      onNotice?.("Nessun sottotitolo disponibile per questo video");
      return;
    }
    const available = code => subtitleLangs.some(l => l.code === code);
    const pick =
      (available(lastSubRef.current) && lastSubRef.current) ||
      subtitleLangs.find(l => l.code === "it")?.code ||
      subtitleLangs.find(l => l.code?.startsWith("it"))?.code ||
      subtitleLangs[0].code;
    onSubtitleLangChange(pick);
  }, [subtitleLang, subtitleLangs, onSubtitleLangChange, onNotice]);

  // I <track> vanno riaccesi a mano dopo ogni load(): senza `controls` il
  // browser non ha un menu sottotitoli e l'attributo `default` da solo non
  // basta a riportare la traccia su "showing" dopo la riapertura del flusso.
  const applyTextTrack = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    for (const tt of v.textTracks) tt.mode = subtitleLang ? "showing" : "disabled";
  }, [subtitleLang]);
  useEffect(() => { applyTextTrack(); }, [applyTextTrack, stream]);

  // ── Qualità (mantiene il punto in cui si stava guardando) ──────────────
  function handleQuality(q) {
    setSettingsOpen(false);
    if (q === quality) return;
    setStream(s => ({ start: position, n: s.n + 1 }));
    onQualityChange(q);
  }

  // ── Scomparsa automatica dei controlli ─────────────────────────────────
  const hideTimer = useRef(null);
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 3000);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  // Con il menu aperto i controlli non devono sparire da sotto il puntatore.
  useEffect(() => { if (settingsOpen) { clearTimeout(hideTimer.current); setControlsVisible(true); } }, [settingsOpen]);

  // ── Tocchi sullo schermo ───────────────────────────────────────────────
  // Col dito valgono regole diverse dal mouse, le stesse dell'app di YouTube:
  //
  //   un tocco    → mostra i comandi; SOLO se erano già visibili mette in
  //                 pausa o riparte. Prima bastava un tocco qualsiasi per
  //                 fermare il video, anche quando si voleva solo vedere a che
  //                 punto era — cioè quasi sempre.
  //   due tocchi  → a sinistra indietro di 10 secondi, a destra avanti di 10.
  //
  // I tocchi ravvicinati si sommano (10, 20, 30…) e il salto vero parte una
  // volta sola alla fine: ogni salto riapre il flusso da /api/mux, farne tre di
  // fila vorrebbe dire tre ffmpeg per niente.
  const tapRef = useRef({ time: 0, side: null, timer: null, start: null });
  const seekBurstRef = useRef({ delta: 0, timer: null });
  const [seekFlash, setSeekFlash] = useState(null);   // {side, seconds}
  const flashTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(tapRef.current.timer);
    clearTimeout(seekBurstRef.current.timer);
    clearTimeout(flashTimer.current);
  }, []);

  function flashSeek(side, seconds) {
    setSeekFlash({ side, seconds });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSeekFlash(null), 600);
  }

  function onVideoPointerDown(e) {
    tapRef.current.start = { x: e.clientX, y: e.clientY };
  }

  function onVideoPointerUp(e) {
    const t = tapRef.current;
    const start = t.start;
    t.start = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side = x < rect.width * TAP_SIDE_RATIO ? "left"
      : x > rect.width * (1 - TAP_SIDE_RATIO) ? "right"
      : "center";

    const now = Date.now();
    const doubleTap = side !== "center" && side === t.side && now - t.time < DOUBLE_TAP_MS;
    t.time = now;
    t.side = side;

    if (doubleTap) {
      clearTimeout(t.timer);            // il tocco singolo in attesa non vale più
      const burst = seekBurstRef.current;
      burst.delta += side === "left" ? -SKIP_SECONDS : SKIP_SECONDS;
      flashSeek(side, Math.abs(burst.delta));
      clearTimeout(burst.timer);
      burst.timer = setTimeout(() => {
        const delta = burst.delta;
        burst.delta = 0;
        skip(delta);
      }, DOUBLE_TAP_MS);
      bumpControls();
      return;
    }

    // Primo tocco: si decide solo dopo aver escluso il secondo. `controlsVisible`
    // è quello del momento del tocco, ed è giusto così: conta cosa vedeva
    // l'utente quando ha toccato.
    const wasVisible = controlsVisible;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      if (wasVisible) togglePlay();
      bumpControls();
    }, DOUBLE_TAP_MS);
  }

  // ── Schermo intero: stato + correzione ─────────────────────────────────
  // Su alcune piattaforme (iOS, o un doppio click intercettato dal browser) a
  // schermo intero va il solo <video>, e la barra dei controlli — che vive nel
  // contenitore attorno — sparisce. Se succede, si rimedia passando al
  // contenitore.
  useEffect(() => {
    function onFsChange() {
      const wrap = wrapRef.current;
      const v = videoRef.current;
      if (wrap && v && document.fullscreenElement === v) {
        document.exitFullscreen().then(() => wrap.requestFullscreen().catch(() => {}));
        return;
      }
      setFullscreen(document.fullscreenElement === wrap);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Scorciatoie da tastiera ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      // Mai rubare i tasti a chi sta scrivendo (barra di ricerca, commenti…).
      const el = document.activeElement;
      if (el?.isContentEditable) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Un bottone cliccato con il mouse resta col focus: da lì in poi lo
      // spazio "ripremeva" quel bottone invece di mettere in pausa — dopo un
      // click su schermo intero lo spazio entrava e usciva dallo schermo
      // intero. Togliamo il focus dai comandi del player prima di gestire il
      // tasto, così le scorciatoie valgono sempre le stesse.
      if (el && el !== document.body && wrapRef.current?.contains(el)) el.blur();

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
        case " ":
        case "k": togglePlay(); break;
        case "f": toggleFullscreen(); break;
        case "ArrowLeft": skip(-SKIP_SECONDS); break;
        case "ArrowRight": skip(SKIP_SECONDS); break;
        case "ArrowUp": nudgeVolume(VOLUME_STEP); break;
        case "ArrowDown": nudgeVolume(-VOLUME_STEP); break;
        case "m": toggleMute(); break;
        case "c": toggleSubtitles(); break;
        case "t": onToggleTheater?.(); break;
        default: return;
      }
      e.preventDefault();   // solo per i tasti gestiti: lo spazio non deve scorrere la pagina
      bumpControls();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFullscreen, skip, nudgeVolume, toggleMute, toggleSubtitles, onToggleTheater, bumpControls]);

  // ── Barra di avanzamento ───────────────────────────────────────────────
  function timeFromPointer(e) {
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * (duration || 0);
  }

  function onBarDown(e) {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(timeFromPointer(e));
  }
  function onBarMove(e) {
    if (!duration) return;
    const t = timeFromPointer(e);
    setHover(t);
    if (scrub != null) setScrub(t);
  }
  function onBarUp(e) {
    if (scrub == null) return;
    const t = timeFromPointer(e);
    setScrub(null);
    seekTo(t);
  }

  const shown = scrub != null ? scrub : position;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;
  // Il buffer parte da dove è stato aperto il flusso, non da zero: dopo un
  // salto in avanti la parte prima del punto di ripartenza non è scaricata.
  const bufFromPct = duration ? Math.min(100, (stream.start / duration) * 100) : 0;
  const bufPct = duration ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const hoverPct = duration && hover != null ? Math.min(100, (hover / duration) * 100) : 0;

  return (
    <div
      className={`player-wrap${controlsVisible ? "" : " hide-controls"}`}
      ref={wrapRef}
      // Solo il mouse fa comparire i comandi muovendosi: col dito un tocco
      // genera comunque un pointermove, e i comandi sarebbero già "visibili"
      // prima ancora che il tocco venga interpretato. Stesso motivo per
      // pointerleave, che al termine di ogni tocco li faceva sparire subito.
      onPointerMove={e => { if (e.pointerType === "mouse") bumpControls(); }}
      onPointerLeave={e => {
        if (e.pointerType === "mouse" && playing && !settingsOpen) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className={`subtitle-size-${subtitleSize}`}
        playsInline
        // Mouse e dito si escludono a vicenda: col dito il click arriverebbe
        // comunque dopo il pointerup e metterebbe in pausa due volte, e il
        // doppio click aprirebbe lo schermo intero al posto del salto di 10s.
        onClick={touch ? undefined : togglePlay}
        onDoubleClick={touch ? undefined : toggleFullscreen}
        onPointerDown={touch ? onVideoPointerDown : undefined}
        onPointerUp={touch ? onVideoPointerUp : undefined}
        onPointerCancel={touch ? () => { tapRef.current.start = null; } : undefined}
        onPlay={() => { setPlaying(true); bumpControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={applyTextTrack}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v || scrub != null) return;
          setPosition(stream.start + v.currentTime);
        }}
        onProgress={() => {
          const v = videoRef.current;
          if (!v || !v.buffered.length) return;
          setBufferedEnd(stream.start + v.buffered.end(v.buffered.length - 1));
        }}
        onVolumeChange={() => {
          const v = videoRef.current;
          if (!v) return;
          setVolume(v.volume);
          setMuted(v.muted);
        }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); }}
        onError={() => onError?.()}
      >
        {subtitleLang && (
          <track
            key={subtitleLang}
            kind="subtitles"
            src={api.subtitleUrl(videoId, subtitleLang)}
            srcLang={subtitleLang}
            label={subtitleLangs.find(l => l.code === subtitleLang)?.name || subtitleLang}
            default
          />
        )}
      </video>

      {buffering && <div className="player-spinner" />}

      {/* Riscontro del doppio tocco: senza, un salto che deve ancora riaprire
          il flusso sembra un tocco andato a vuoto. */}
      {seekFlash && (
        <div className={`player-seek-flash ${seekFlash.side}`}>
          <span className="material-symbols-outlined">
            {seekFlash.side === "left" ? "fast_rewind" : "fast_forward"}
          </span>
          <span>{seekFlash.seconds} s</span>
        </div>
      )}

      {!playing && !buffering && (
        <button className="player-big-play" onClick={togglePlay} aria-label="Riproduci">
          <span className="material-symbols-outlined">play_arrow</span>
        </button>
      )}

      {/* ── Barra dei controlli ──────────────────────────────────────── */}
      <div className="player-bar" onPointerMove={e => { if (e.pointerType === "mouse") bumpControls(); }}>
        <div
          className="player-progress"
          ref={barRef}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerLeave={() => setHover(null)}
          role="slider"
          aria-label="Avanzamento"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={Math.floor(shown)}
        >
          <div className="player-progress-track">
            <div className="player-progress-buffer" style={{ left: `${bufFromPct}%`, width: `${Math.max(0, bufPct - bufFromPct)}%` }} />
            <div className="player-progress-played" style={{ width: `${pct}%` }} />
            <div className="player-progress-handle" style={{ left: `${pct}%` }} />
          </div>
          {hover != null && duration > 0 && (
            <div className="player-progress-tip" style={{ left: `${hoverPct}%` }}>
              {formatTime(hover)}
            </div>
          )}
        </div>

        <div className="player-buttons">
          <button className="player-btn" onClick={togglePlay} title={playing ? "Pausa (k)" : "Riproduci (k)"}>
            <span className="material-symbols-outlined">{playing ? "pause" : "play_arrow"}</span>
          </button>

          <button className="player-btn" onClick={() => skip(-SKIP_SECONDS)} title="Indietro di 10 secondi (←)">
            <span className="material-symbols-outlined">replay_10</span>
          </button>
          <button className="player-btn" onClick={() => skip(SKIP_SECONDS)} title="Avanti di 10 secondi (→)">
            <span className="material-symbols-outlined">forward_10</span>
          </button>

          <div className="player-volume">
            <button className="player-btn" onClick={toggleMute} title={muted ? "Riattiva audio (m)" : "Disattiva audio (m)"}>
              <span className="material-symbols-outlined">
                {muted || volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"}
              </span>
            </button>
            <input
              className="player-volume-slider"
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={e => changeVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </div>

          <span className="player-time">
            {formatTime(shown)} / {duration ? formatTime(duration) : "--:--"}
          </span>

          <div className="player-buttons-right">
            <button
              className={`player-btn${subtitleLang ? " on" : ""}`}
              onClick={toggleSubtitles}
              title={subtitleLang ? "Disattiva sottotitoli (c)" : "Attiva sottotitoli (c)"}
            >
              <span className="material-symbols-outlined">closed_caption</span>
            </button>

            <button
              className={`player-btn${settingsOpen ? " on" : ""}`}
              onClick={() => setSettingsOpen(o => !o)}
              title="Impostazioni"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>

            {/* Icone disegnate a mano: il rettangolo largo/stretto della
                modalità cinema non ha un equivalente affidabile fra le
                Material Symbols. */}
            <button
              className="player-btn"
              onClick={() => onToggleTheater?.()}
              title={theater ? "Modalità predefinita (t)" : "Modalità cinema (t)"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                {theater
                  ? <rect x="6" y="7" width="12" height="10" rx="1.5" />
                  : <rect x="2.5" y="6" width="19" height="12" rx="1.5" />}
              </svg>
            </button>

            <button className="player-btn" onClick={toggleFullscreen} title={fullscreen ? "Esci da schermo intero (f)" : "Schermo intero (f)"}>
              <span className="material-symbols-outlined">{fullscreen ? "fullscreen_exit" : "fullscreen"}</span>
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <>
          <div className="player-settings-backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="player-settings-menu">
            <div className="player-settings-section">
              <div className="player-settings-label">Qualità</div>
              {[["best", "Migliore qualità"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]].map(([v, l]) => (
                <div
                  key={v}
                  className={`player-settings-item${quality === v ? " active" : ""}`}
                  onClick={() => handleQuality(v)}
                >
                  {l}
                </div>
              ))}
            </div>

            <div className="player-settings-section">
              <div className="player-settings-label">Sottotitoli</div>
              <div
                className={`player-settings-item${!subtitleLang ? " active" : ""}`}
                onClick={() => { onSubtitleLangChange(""); setSettingsOpen(false); }}
              >
                Off
              </div>
              {subtitleLangs.map(l => (
                <div
                  key={l.code}
                  className={`player-settings-item${subtitleLang === l.code ? " active" : ""}`}
                  onClick={() => { onSubtitleLangChange(l.code); setSettingsOpen(false); }}
                >
                  {l.name}{l.auto ? " (auto)" : ""}
                </div>
              ))}
              {subtitleLangs.length === 0 && (
                <div className="player-settings-item" style={{ color: "var(--text3)", cursor: "default" }}>
                  Nessun sottotitolo disponibile
                </div>
              )}
            </div>

            {subtitleLang && (
              <div className="player-settings-section">
                <div className="player-settings-label">Dimensione sottotitoli</div>
                {[["small", "Piccoli"], ["normal", "Normali"], ["large", "Grandi"]].map(([v, l]) => (
                  <div
                    key={v}
                    className={`player-settings-item${subtitleSize === v ? " active" : ""}`}
                    onClick={() => onSubtitleSizeChange(v)}
                  >
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
