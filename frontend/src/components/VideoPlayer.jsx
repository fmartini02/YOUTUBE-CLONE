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

// Averlo in buffer però non basta: il browser sposta `currentTime` solo dentro
// `seekable`, e sul flusso di /api/mux (niente Content-Length, `Accept-Ranges:
// none`) Chrome dichiara `seekable` = [0,0]. Lì ogni assegnazione veniva
// schiacciata a zero — misurato: `v.currentTime = 7.36` si rilegge `0`, cioè il
// video tornava all'inizio invece di andare avanti. Succedeva a ogni salto
// corto: barra spostata di poco, tasti ← →, doppio tocco sul telefono.
function isSeekable(video, t) {
  for (let i = 0; i < video.seekable.length; i++) {
    if (t >= video.seekable.start(i) && t <= video.seekable.end(i)) return true;
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

// ── Velocità di riproduzione ────────────────────────────────────────────
// La barra si muove a tacche da 0.05. Le tacche vere sono quindi cinquanta:
// troppe da etichettare, e le scritte sotto la barra sono ogni mezza velocità
// (SPEED_LABEL_STEP) solo per dare il riferimento.
const SPEED_MIN = 0.5;
const SPEED_MAX = 3;
const SPEED_STEP = 0.05;
const SPEED_LABEL_STEP = 0.5;
const SPEED_PRESETS = [1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
// Velocità del "tieni premuto", e quanto va tenuto premuto prima che parta.
// Sotto i ~350ms scattava per sbaglio sui tocchi lenti (che devono mettere in
// pausa), sopra i ~600ms sembra che il video non risponda.
const HOLD_SPEED = 2;
const HOLD_MS = 450;

// 1 e non 1.0, 1.25 e non 1.25 troncato: niente zeri inutili.
function formatSpeed(s) {
  return String(Number(s.toFixed(2)));
}

// Le somme in virgola mobile danno 1.5000000000000002: si arrotonda sempre a
// due decimali, che è la precisione di tutto quello che mostriamo.
function roundSpeed(s) {
  return Number(Math.min(SPEED_MAX, Math.max(SPEED_MIN, s)).toFixed(2));
}

/**
 * Barra della velocità: trascinamento e frecce si spostano di una tacca
 * (`SPEED_STEP`) alla volta. È disegnata a mano, come quella di avanzamento,
 * per avere le etichette sotto e lo stesso aspetto dentro il player.
 */
function SpeedSlider({ value, onChange }) {
  const ref = useRef(null);
  const draggingRef = useRef(false);
  const pct = ((value - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;

  // I riferimenti scritti sotto la barra, uno ogni mezza velocità.
  const ticks = [];
  for (let s = SPEED_MIN; s <= SPEED_MAX + 0.001; s += SPEED_LABEL_STEP) ticks.push(roundSpeed(s));

  function speedFromPointer(e) {
    const rect = ref.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const raw = SPEED_MIN + ratio * (SPEED_MAX - SPEED_MIN);
    return roundSpeed(Math.round(raw / SPEED_STEP) * SPEED_STEP);
  }

  return (
    <div className="player-speed-slider">
      {/* Col dito la barra è imprecisa: una tacca sono ~4px, e i due tasti sono
          l'unico modo per centrare 1.35x invece di 1.3x o 1.4x. */}
      <button
        className="player-speed-step"
        onClick={() => onChange(roundSpeed(value - SPEED_STEP))}
        disabled={value <= SPEED_MIN}
        aria-label={`Riduci di ${formatSpeed(SPEED_STEP)}`}
        title={`- ${formatSpeed(SPEED_STEP)}`}
      >
        <span className="material-symbols-outlined">remove</span>
      </button>

      <div className="player-speed-bar">
        <div
          className="player-speed-track"
          ref={ref}
          tabIndex={0}
          role="slider"
          aria-label="Velocità di riproduzione"
          aria-valuemin={SPEED_MIN}
          aria-valuemax={SPEED_MAX}
          aria-valuenow={value}
          aria-valuetext={`${formatSpeed(value)}x`}
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId);
            draggingRef.current = true;
            onChange(speedFromPointer(e));
          }}
          onPointerMove={e => { if (draggingRef.current) onChange(speedFromPointer(e)); }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          onKeyDown={e => {
            const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? SPEED_STEP
              : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -SPEED_STEP
              : 0;
            if (!step) return;
            e.preventDefault();
            onChange(roundSpeed(value + step));
          }}
        >
          <div className="player-speed-fill" style={{ width: `${pct}%` }} />
          <div className="player-speed-handle" style={{ left: `${pct}%` }} />
        </div>
        <div className="player-speed-ticks">
          {ticks.map(t => (
            <span key={t} className={t === value ? "on" : undefined}>{formatSpeed(t)}x</span>
          ))}
        </div>
      </div>

      <button
        className="player-speed-step"
        onClick={() => onChange(roundSpeed(value + SPEED_STEP))}
        disabled={value >= SPEED_MAX}
        aria-label={`Aumenta di ${formatSpeed(SPEED_STEP)}`}
        title={`+ ${formatSpeed(SPEED_STEP)}`}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
}

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
  // Il menu impostazioni ha due schermate: l'elenco e la "finestrina" della
  // velocità. Una sola alla volta, come nel menu di YouTube.
  const [settingsPage, setSettingsPage] = useState("main");
  const [speed, setSpeed] = useState(1);
  // Velocità temporanea del "tieni premuto": non tocca `speed`, così al
  // rilascio si torna esattamente alla velocità scelta dall'utente.
  const [holding, setHolding] = useState(false);
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
    setSettingsPage("main");
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

  // ── Velocità ───────────────────────────────────────────────────────────
  // Dipende anche da `stream` perché `load()` riporta `playbackRate` a
  // `defaultPlaybackRate`: senza questo, ogni salto (che riapre il flusso)
  // rimetteva il video a velocità normale. Impostiamo entrambe le proprietà e
  // teniamo l'effetto DOPO quello del caricamento, così l'ordine è: nuovo
  // src → load() → velocità riapplicata.
  const rate = holding ? HOLD_SPEED : speed;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate, videoId, quality, stream]);

  // ── Salto nel tempo ────────────────────────────────────────────────────
  const seekTo = useCallback((target) => {
    const v = videoRef.current;
    if (!v) return;
    const max = duration ? duration - 0.5 : Infinity;
    const t = Math.max(0, Math.min(max, target));
    const local = t - stream.start;
    // Già scaricato *e* dichiarato cercabile: salto istantaneo, il flusso non
    // si tocca. Il risultato si verifica subito rileggendo `currentTime`: se il
    // browser lo ha spostato altrove (di norma a 0) il salto non è avvenuto e
    // si passa alla riapertura, invece di lasciare il video all'inizio con la
    // barra che dice un'altra cosa.
    if (local >= 0 && isBuffered(v, local) && isSeekable(v, local)) {
      v.currentTime = local;
      if (Math.abs(v.currentTime - local) < 0.5) {
        setPosition(t);
        return;
      }
    }
    // Altrimenti si riapre il flusso dal secondo richiesto: è l'unico modo di
    // spostarsi davvero su uno stream generato al volo.
    setStream(s => ({ start: t, n: s.n + 1 }));
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

  // ── Tieni premuto = 2x ─────────────────────────────────────────────────
  // Vale sia col dito che col mouse. Il tocco singolo (pausa) e il click
  // arrivano comunque al rilascio: se la pressione lunga è scattata vanno
  // annullati, altrimenti ogni "tieni premuto" finisce con una pausa.
  const holdRef = useRef({ timer: null, active: false, from: null, heldAt: 0 });

  function startHold(e) {
    const h = holdRef.current;
    h.from = { x: e.clientX, y: e.clientY };
    clearTimeout(h.timer);
    h.timer = setTimeout(() => {
      h.timer = null;
      // Solo a video in movimento: accelerare un video fermo non vuol dire nulla,
      // e la pressione lunga su un video in pausa serve a farlo ripartire.
      if (videoRef.current?.paused) return;
      h.active = true;
      setHolding(true);
    }, HOLD_MS);
  }

  // Restituisce true se la pressione lunga era attiva, cioè se il gesto era un
  // "tieni premuto" e non un tocco.
  function endHold() {
    const h = holdRef.current;
    clearTimeout(h.timer);
    h.timer = null;
    h.from = null;
    if (!h.active) return false;
    h.active = false;
    // Momento della fine, non un sì/no: se il mouse viene rilasciato fuori dal
    // video il click non arriva mai, e un flag booleano resterebbe alzato a
    // mangiarsi il click successivo.
    h.heldAt = Date.now();
    setHolding(false);
    return true;
  }

  function onVideoPointerMove(e) {
    const h = holdRef.current;
    if (!h.timer || !h.from) return;
    // Dito che scorre o mouse che trascina: non è una pressione ferma.
    if (Math.hypot(e.clientX - h.from.x, e.clientY - h.from.y) > TAP_SLOP_PX) {
      clearTimeout(h.timer);
      h.timer = null;
    }
  }

  function onVideoClick() {
    const h = holdRef.current;
    if (Date.now() - h.heldAt < 400) { h.heldAt = 0; return; }
    togglePlay();
  }

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
    clearTimeout(holdRef.current.timer);
  }, []);

  function flashSeek(side, seconds) {
    setSeekFlash({ side, seconds });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSeekFlash(null), 600);
  }

  function onVideoPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;   // solo tasto sinistro
    if (touch) tapRef.current.start = { x: e.clientX, y: e.clientY };
    startHold(e);
  }

  function onVideoPointerUp(e) {
    const held = endHold();
    const t = tapRef.current;
    const start = t.start;
    t.start = null;
    // Col mouse il resto lo fa il click; col dito, se era una pressione lunga,
    // il tocco non deve più valere come pausa.
    if (held || !touch || !start) return;
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
      // Il menu impostazioni ha comandi suoi — la barra della velocità si muove
      // con le frecce, che qui sotto varrebbero come salto di 10 secondi. E il
      // blur poco più giù toglierebbe comunque il fuoco alla barra al primo tasto.
      if (el?.closest?.(".player-settings-menu")) return;
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
        onClick={touch ? undefined : onVideoClick}
        onDoubleClick={touch ? undefined : toggleFullscreen}
        // La pressione lunga (2x) vale per entrambi, quindi questi handler ci
        // sono sempre; dentro, la parte dei tocchi si attiva solo col dito.
        onPointerDown={onVideoPointerDown}
        onPointerMove={onVideoPointerMove}
        onPointerUp={onVideoPointerUp}
        onPointerCancel={() => { tapRef.current.start = null; endHold(); }}
        onPointerLeave={() => endHold()}
        // Col dito, la pressione lunga su un video fa comparire il menu del
        // browser ("salva video…"), che coprirebbe proprio il gesto del 2x.
        onContextMenu={touch ? e => e.preventDefault() : undefined}
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

      {/* Riscontro del "tieni premuto": senza, il 2x è invisibile finché non si
          sente l'audio accelerato. */}
      {holding && (
        <div className="player-hold-flash">
          <span>{formatSpeed(HOLD_SPEED)}x</span>
          <span className="material-symbols-outlined">fast_forward</span>
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
              className={`player-btn player-settings-btn${settingsOpen ? " on" : ""}`}
              onClick={() => { setSettingsPage("main"); setSettingsOpen(o => !o); }}
              title="Impostazioni"
            >
              <span className="material-symbols-outlined">settings</span>
              {/* La velocità non si vede da nessun'altra parte a menu chiuso:
                  senza questa targhetta ci si dimentica il video a 2x. */}
              {speed !== 1 && <span className="player-speed-badge">{formatSpeed(speed)}x</span>}
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
            {settingsPage === "speed" ? (
              /* La "finestrina" della velocità: prende il posto dell'elenco
                 invece di aprirsi accanto, che su telefono uscirebbe dallo
                 schermo. */
              <div className="player-speed-panel">
                <div className="player-settings-head">
                  <button
                    className="player-settings-back"
                    onClick={() => setSettingsPage("main")}
                    aria-label="Indietro"
                  >
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <span>Riproduzione veloce</span>
                  <strong className="player-speed-current">{formatSpeed(speed)}x</strong>
                </div>

                <SpeedSlider value={speed} onChange={setSpeed} />

                <div className="player-settings-label">Velocità preimpostate</div>
                <div className="player-speed-presets">
                  {SPEED_PRESETS.map(s => (
                    <button
                      key={s}
                      className={`player-speed-preset${speed === s ? " active" : ""}`}
                      onClick={() => setSpeed(s)}
                    >
                      {formatSpeed(s)}x
                    </button>
                  ))}
                </div>

                {speed !== 1 && (
                  <div className="player-settings-item" onClick={() => setSpeed(1)}>
                    Torna a velocità normale
                  </div>
                )}

                <div className="player-speed-hint">
                  Tieni premuto sul video per andare a {formatSpeed(HOLD_SPEED)}x finché non lasci.
                </div>
              </div>
            ) : (
              <>
                <div className="player-settings-section">
                  <div className="player-settings-label">Riproduzione</div>
                  <div
                    className="player-settings-item player-settings-row"
                    onClick={() => setSettingsPage("speed")}
                  >
                    <span>Riproduzione veloce</span>
                    <span className="player-settings-value">
                      {formatSpeed(speed)}x
                      <span className="material-symbols-outlined">chevron_right</span>
                    </span>
                  </div>
                </div>

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
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
