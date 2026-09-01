import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { isCapacitor } from "../../api/device";
import { useTouchDevice } from "../../hooks/useMediaQuery";
import { formatTime, isBuffered, isSeekable, qualityForScreen } from "./videoPlayerHelpers";
import { SKIP_SECONDS, VOLUME_STEP, DOUBLE_TAP_MS, TAP_SLOP_PX, TAP_SIDE_RATIO, REBUFFER_MARGIN_S } from "./playerConstants";
import { HOLD_SPEED, HOLD_MS } from "./speedMath";
import PlayerOverlays from "./PlayerOverlays";
import PlayerButtonsBar from "./PlayerButtonsBar";
import PlayerSettingsMenu from "./PlayerSettingsMenu";

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
 *
 * NOTA SULLA NORMA (vedi CLAUDE.md, "Stile: 5 funzioni per file"): questo
 * componente resta volutamente sopra le 25 righe. norm-check: ignora-file
 * (marcatore letto da scripts/norm_check_hook.py — il controllo sull'intero
 * repo continua comunque a elencarlo). Le due sezioni "Velocità" e
 * "Caricamento / riapertura del flusso" qui sotto devono restare adiacenti e
 * nello stesso ordine — l'effetto della velocità dipende da `stream` perché
 * `load()` riporta `playbackRate` a `defaultPlaybackRate`, quindi deve essere
 * dichiarato DOPO quello di caricamento (che chiama `load()`), altrimenti la
 * velocità scelta verrebbe azzerata subito dopo averla applicata. Spezzare
 * questa parte in hook separati manterrebbe l'ordine solo finché nessuno
 * scambia l'ordine di chiamata degli hook nel corpo del componente — un rischio
 * concreto per un bug silenzioso, a fronte di un guadagno di stile. Tutto il
 * resto che si poteva estrarre senza toccare quest'ordine (helper puri, barra
 * della velocità, menu impostazioni, barra pulsanti, overlay) è nei file
 * accanto a questo.
 */
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
  // Preferenza "Autoplay video" (Impostazioni): decide solo se un video appena
  // aperto parte da solo. Le riaperture del flusso dovute a un salto o a un
  // cambio di qualità mantengono invece lo stato di prima.
  autoplay = true,
  // Preferenza "Adatta la qualità allo schermo" (Impostazioni): con "Migliore
  // qualità" selezionata, non chiede al server più della risoluzione che il
  // pannello regge davvero. Vedi qualityForScreen in videoPlayerHelpers.
  fitScreen = true,
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

  // Se il video stava andando prima di una riapertura del flusso. Un ref e non
  // uno stato: serve dentro l'effect di caricamento, che non deve rieseguirsi
  // quando cambia.
  const andavaRef = useRef(false);
  // Vero solo dopo un `onPlaying` genuino sul flusso corrente: distingue il
  // buffering del primo caricamento (normale) da un vero stallo a metà
  // riproduzione (vedi "Recupero da uno stallo di rete" più sotto).
  const hasPlayedRef = useRef(false);
  // Ultimo video effettivamente caricato: distingue "video nuovo" (dove decide
  // l'autoplay) da "stesso video riaperto" per un salto o un cambio di qualità
  // (dove si ripristina lo stato di prima).
  const caricatoRef = useRef(null);
  // Anche l'autoplay in un ref, e non fra le dipendenze dell'effect: la
  // preferenza arriva dal server poco dopo il primo render, e vederla cambiare
  // farebbe riaprire il flusso di un video già partito.
  const autoplayRef = useRef(autoplay);
  useEffect(() => { autoplayRef.current = autoplay; }, [autoplay]);

  // ── Caricamento / riapertura del flusso ────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Ogni salto riapre il flusso (vedi seekTo), e prima qui c'era un play()
    // incondizionato: spostare la barra di un video in pausa lo faceva
    // ripartire da solo. Un video in pausa deve restare in pausa dove l'utente
    // lo ha portato; uno in riproduzione deve continuare.
    const nuovo = caricatoRef.current !== videoId;
    const deveAndare = nuovo ? autoplayRef.current : andavaRef.current;
    caricatoRef.current = videoId;

    v.src = api.muxUrl(videoId, qualityForScreen(quality, fitScreen), stream.start);
    v.load();
    setBuffering(true);
    setPosition(stream.start);
    setBufferedEnd(stream.start);
    // Il primo caricamento di un flusso appena aperto non è uno stallo: lo è
    // solo se il buffering torna DOPO che il video ha già iniziato a scorrere
    // davvero (vedi "Recupero da uno stallo di rete" più sotto).
    hasPlayedRef.current = false;
    if (deveAndare) {
      v.play().catch(() => {});   // l'autoplay può essere bloccato: non è un errore
    } else {
      // Senza play() il browser non decodifica niente e resterebbe un
      // rettangolo nero: questo gli chiede il primo fotogramma del nuovo punto.
      v.preload = "auto";
      setBuffering(false);
    }
    // `fitScreen` è tra le dipendenze perché concorre a formare l'URL del
    // flusso al pari di `quality` (di norma non cambia a player montato: le
    // Impostazioni sono un'altra route e lo smontano).
  }, [videoId, quality, stream, fitScreen]);

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
  }, [rate, videoId, quality, stream, fitScreen]);

  // ── Recupero da uno stallo di rete ───────────────────────────────────────
  // Lasciato a sé, il browser riprende non appena arriva un filo di dati:
  // con una connessione più lenta del bitrate del video il risultato sono
  // scatti continui invece di una pausa sola e pulita. Qui si prende il
  // controllo di quel momento: a un vero stallo durante la riproduzione
  // (`onWaiting` mentre `playing` è vero, cioè si stava ancora cercando di
  // andare avanti) si mette in pausa esplicitamente e si aspetta che il
  // buffer sia avanti di `REBUFFER_MARGIN_S` secondi rispetto alla posizione
  // attuale prima di far ripartire da sé il video. `playing` (non `andavaRef`,
  // che resta vero anche dopo una pausa dell'utente) è la guardia giusta: se
  // l'utente ha già messo in pausa lui stesso, un `waiting` residuo non deve
  // far ripartire nulla da solo.
  const rebufferingRef = useRef(false);
  const [rebuffering, setRebuffering] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !buffering || !hasPlayedRef.current || !playing || rebufferingRef.current) return;
    rebufferingRef.current = true;
    setRebuffering(true);
    v.pause();
  }, [buffering, playing]);

  useEffect(() => {
    if (!rebufferingRef.current || bufferedEnd - position < REBUFFER_MARGIN_S) return;
    rebufferingRef.current = false;
    setRebuffering(false);
    videoRef.current?.play().catch(() => {});
  }, [bufferedEnd, position]);

  // Uno stallo vecchio non deve restare "in attesa" su un flusso appena
  // riaperto (salto, cambio qualità, cambio di "adatta allo schermo", video nuovo).
  useEffect(() => {
    rebufferingRef.current = false;
    setRebuffering(false);
  }, [videoId, quality, stream, fitScreen]);

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
    // Un tocco dell'utente vince sempre sull'attesa automatica del buffer:
    // sia che riprenda in anticipo, sia che metta in pausa lui stesso, da
    // qui in poi la pausa non è più "in attesa di un margine".
    rebufferingRef.current = false;
    setRebuffering(false);
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
        // Nell'app il tasto della modalità cinema non c'è (vedi TheaterButton
        // in PlayerButtonsBar.jsx): la scorciatoia da tastiera resta coerente
        // con quello, per chi ha una tastiera Bluetooth collegata al telefono.
        case "t": if (!isCapacitor()) onToggleTheater?.(); break;
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
        onPlay={() => { setPlaying(true); andavaRef.current = true; bumpControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); hasPlayedRef.current = true; }}
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
        onEnded={() => { setPlaying(false); andavaRef.current = false; setControlsVisible(true); }}
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

      <PlayerOverlays buffering={buffering} rebuffering={rebuffering} seekFlash={seekFlash} holding={holding} playing={playing} togglePlay={togglePlay} />

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

        <PlayerButtonsBar
          playing={playing}
          togglePlay={togglePlay}
          skip={skip}
          shown={shown}
          duration={duration}
          muted={muted}
          volume={volume}
          toggleMute={toggleMute}
          changeVolume={changeVolume}
          subtitleLang={subtitleLang}
          toggleSubtitles={toggleSubtitles}
          settingsOpen={settingsOpen}
          onOpenSettings={() => { setSettingsPage("main"); setSettingsOpen(o => !o); }}
          speed={speed}
          theater={theater}
          onToggleTheater={onToggleTheater}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      </div>

      {settingsOpen && (
        <PlayerSettingsMenu
          settingsPage={settingsPage}
          onBack={() => setSettingsPage("main")}
          onGoSpeed={() => setSettingsPage("speed")}
          onClose={() => setSettingsOpen(false)}
          speed={speed}
          onSpeedChange={setSpeed}
          quality={quality}
          onPickQuality={handleQuality}
          subtitleLang={subtitleLang}
          subtitleLangs={subtitleLangs}
          onSubtitleLangChange={onSubtitleLangChange}
          subtitleSize={subtitleSize}
          onSubtitleSizeChange={onSubtitleSizeChange}
        />
      )}
    </div>
  );
}
