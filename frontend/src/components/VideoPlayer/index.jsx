import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { isCapacitor } from "../../api/device";
import { useTouchDevice } from "../../hooks/useMediaQuery";
import { formatTime, isBuffered, isSeekable, qualityForScreen, labelForHeight } from "./videoPlayerHelpers";
import { SKIP_SECONDS, VOLUME_STEP, DOUBLE_TAP_MS, SEEK_BURST_MS, TAP_SLOP_PX, TAP_SIDE_RATIO, REBUFFER_MARGIN_S, FINE_VERA_S } from "./playerConstants";
import { HOLD_SPEED, HOLD_MS } from "./speedMath";
import { useStreamSource } from "./useStreamSource";
import PlayerOverlays from "./PlayerOverlays";
import PlayerButtonsBar from "./PlayerButtonsBar";
import PlayerSettingsMenu from "./PlayerSettingsMenu";
import MiniPlayerOverlay from "./MiniPlayerOverlay";
import { usePipBridge } from "./usePipBridge";

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
  // Solo per l'icona Chromecast nella barra dei comandi: il player non
  // trasmette nulla da sé, li inoltra a CastButton (vedi PlayerButtonsBar).
  cast,
  castMedia,
  // Salto chiesto da fuori: un capitolo o una riga della trascrizione nel
  // pannello descrizione. `{ t, n }` — il contatore serve perché due tocchi
  // sullo stesso capitolo devono valere come due richieste (vedi
  // useSeekRequest in pages/VideoPage/useVideoPageState.js).
  seekRequest,
  // Preferenza "Autoplay video" (Impostazioni): decide solo se un video appena
  // aperto parte da solo. Le riaperture del flusso dovute a un salto o a un
  // cambio di qualità mantengono invece lo stato di prima.
  autoplay = true,
  // Preferenza "Adatta la qualità allo schermo" (Impostazioni): con "Migliore
  // qualità" selezionata, non chiede al server più della risoluzione che il
  // pannello regge davvero. Vedi qualityForScreen in videoPlayerHelpers.
  fitScreen = true,
  // Mini-player (widget sopra un'altra pagina, vedi pages/VideoPage): stesso
  // player, stesso <video>, stesso flusso — cambiano solo i comandi mostrati.
  mini = false,
  onExpand,
  onClose,
  // Fine VERA del video (playlist: si passa al successivo). Non ogni `ended`:
  // il flusso si chiude con endOfStream() anche quando rinuncia dopo troppi
  // errori di rete (vedi riapriOrinuncia in useStreamSource.js), e lì la
  // posizione è ancora a metà — si passa oltre solo a meno di FINE_VERA_S
  // dalla durata nota.
  onEnded,
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
  const [bufferedStart, setBufferedStart] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  // Altezza reale del flusso decodificato (evento `resize` del <video>): con
  // "Migliore qualità" non c'è altro modo di sapere quale definizione sta
  // arrivando davvero. Solo per il menu impostazioni, vedi labelForHeight.
  const [actualHeight, setActualHeight] = useState(0);
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

  // ── Qualità effettiva del flusso ───────────────────────────────────────
  // `quality` è la scelta (anche "best"); `sorgente` è quella che si chiede
  // davvero al server, dopo qualityForScreen. Sta nello stato e si ricalcola
  // SOLO quando cambia la scelta (quality, fitScreen) o il video — mai ad ogni
  // render: qualityForScreen legge anche window.screen e devicePixelRatio, che
  // cambiano da soli (finestra spostata su un altro monitor, forse il PiP di
  // Android) e, letti ad ogni render, riaprirebbero il flusso a metà video.
  const [sorgente, setSorgente] = useState(() => qualityForScreen(quality, fitScreen));
  const [prevScelta, setPrevScelta] = useState({ quality, fitScreen });
  if (prevId !== videoId) {
    setPrevId(videoId);
    // Video nuovo: la sorgente si ricalcola (lo schermo si legge quando si apre
    // un video, come sempre) ma senza riaprire niente — parte comunque da 0.
    // Vince su un eventuale cambio di qualità nella stessa passata.
    setPrevScelta({ quality, fitScreen });
    setSorgente(qualityForScreen(quality, fitScreen));
    setStream({ start: 0, n: 0 });
    setPosition(0);
    setBufferedStart(0);
    setBufferedEnd(0);
    setActualHeight(0);
    setSettingsOpen(false);
    setSettingsPage("main");
  } else if (prevScelta.quality !== quality || prevScelta.fitScreen !== fitScreen) {
    // Scelta cambiata: dal menu del player (handleQuality) o dalle
    // Impostazioni, che col widget si aprono a video in corso. Il flusso si
    // riapre DA DOVE SI È ARRIVATI: l'effetto di caricamento da solo lo
    // riaprirebbe da `stream.start`, cioè dall'ultimo salto (o da 0), e il
    // video tornerebbe indietro. Se la sorgente non cambia (es. "best" che già
    // valeva 1080) non si riapre niente.
    setPrevScelta({ quality, fitScreen });
    const nuova = qualityForScreen(quality, fitScreen);
    if (nuova !== sorgente) {
      setSorgente(nuova);
      setStream(s => ({ start: position, n: s.n + 1 }));
    }
  }

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

  // Apre/segue il flusso: MediaSource quando possibile (barra di buffering
  // vera anche da fermo), <video src> come ripiego — vedi useStreamSource.js.
  // Alla fine vera (smontaggio, cambio pagina) va chiuso esplicitamente: a
  // differenza di <video src>, un fetch() nostro non lo annulla da sé il
  // browser solo perché il <video> è stato rimosso dal DOM.
  const flusso = useStreamSource();
  // Deps vuote e non `[flusso]`: l'oggetto ritornato dall'hook cambia
  // identità ad ogni render (non è memoizzato), quindi con `[flusso]` questo
  // effect si "pulirebbe" (chiudendo il flusso, revocando l'URL del blob)
  // dopo OGNI render invece che al vero smontaggio — `chiudi` legge comunque
  // lo stato più recente da un ref stabile, quindi eseguirlo una volta sola
  // qui dentro resta corretto.
  useEffect(() => () => flusso.chiudi(), []);
  // Durata sempre aggiornata per chi la legge DOPO l'apertura del flusso
  // (onEnd in useStreamSource.js): `duration` arriva da /api/watch di solito
  // dopo il flusso, e l'effetto di caricamento sotto non si riesegue per lei.
  const durataRef = useRef(duration);
  durataRef.current = duration;

  // Serve già qui (non solo nell'effetto "Velocità" sotto): l'apertura del
  // flusso deve impostare la velocità scelta fin da subito, non aspettare un
  // secondo effetto che nel frattempo un salto potrebbe già aver reso stantio.
  const rate = holding ? HOLD_SPEED : speed;

  // ── Caricamento / riapertura del flusso ────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Ogni salto o riapertura per errore di rete riapre il flusso (vedi
    // seekTo e useStreamSource.js), e prima qui c'era un play() incondizionato,
    // o un ref che restava vero anche dopo una pausa dell'utente: in entrambi
    // i casi spostare la barra — o una riapertura automatica — su un video in
    // pausa lo faceva ripartire da solo. `playing` (aggiornato solo dai veri
    // eventi `onPlay`/`onPause` del `<video>`, mai da una riapertura) è la
    // guardia giusta: un video in pausa deve restare in pausa dove l'utente lo
    // ha portato, uno in riproduzione deve continuare.
    const nuovo = caricatoRef.current !== videoId;
    const deveAndare = nuovo ? autoplayRef.current : playing;
    caricatoRef.current = videoId;

    setBuffering(true);
    setPosition(stream.start);
    setBufferedStart(stream.start);
    setBufferedEnd(stream.start);
    setActualHeight(0);
    // Il primo caricamento di un flusso appena aperto non è uno stallo: lo è
    // solo se il buffering torna DOPO che il video ha già iniziato a scorrere
    // davvero (vedi "Recupero da uno stallo di rete" più sotto).
    hasPlayedRef.current = false;

    // apri() decide da sé MediaSource-o-ripiego, chiama load() nel punto
    // giusto in entrambi i casi e applica subito `rate`/autoplay/preload —
    // niente di tutto questo lo fa più index.jsx direttamente (vedi
    // useStreamSource.js). `onFineAnticipata`: un flusso che finisce prima
    // della durata attesa (URL scaduto dopo una pausa lunghissima) riapre da
    // dove si era arrivati, non dall'inizio.
    flusso.apri(v, {
      videoId, quality: sorgente, start: stream.start,
      durata: duration, durataOra: () => durataRef.current, rate, autoplay: deveAndare, muxUrl: api.muxUrl,
      // `onProgress` sul <video> (sotto) copre il ripiego <video src>, ma con
      // MediaSource l'evento nativo "progress" non è garantito ad ogni
      // append: questa callback, chiamata dalla pompa dopo ogni scrittura
      // nel SourceBuffer, è l'unica fonte affidabile per quel ramo.
      onBuffer: () => {
        const [inizio, fine] = flusso.intervalloBuffer(v);
        setBufferedStart(inizio);
        setBufferedEnd(fine);
      },
      onFineAnticipata: t => setStream(s => ({ start: t, n: s.n + 1 })),
      // Se play() si rifiuta (vedi useStreamSource.js) lo spinner restava
      // acceso all'infinito: nessun evento successivo lo spegneva perché il
      // video non aveva mai davvero cominciato a scorrere. Qui si spegne a
      // mano, così resta il grande tasto play al posto dello spinner — un
      // tocco dell'utente è un gesto genuino e ha più probabilità di riuscire.
      onAutoplayFailed: () => setBuffering(false),
    });
    if (!deveAndare) setBuffering(false);
    // `sorgente` e non `quality`/`fitScreen`: è l'unica parte della qualità
    // che entra nell'URL, e cambia solo nei punti visti in cima — un cambio di
    // `quality` che non la sposta non deve riaprire niente. Le Impostazioni
    // NON smontano più il player (il widget resta vivo sopra di loro), quindi
    // una qualità cambiata lì arriva a player aperto. `flusso`/`rate`/
    // `duration`/`playing` NON ci sono di proposito: `flusso.apri` è stabile e
    // legge `rate` al momento dell'apertura (non deve riaprire il flusso
    // quando cambia la sola velocità, ci pensa l'effetto "Velocità" sotto), e
    // `duration` arriva da `/api/watch` poco dopo il flusso stesso — se
    // cambiasse a player già aperto non deve riaprirlo. `playing` si legge
    // solo per decidere `deveAndare` al momento della riapertura, non deve
    // farne scattare una nuova quando cambia da sé (altrimenti ogni singolo
    // play/pausa riaprirebbe il flusso).
  }, [videoId, sorgente, stream]);

  // ── Velocità ───────────────────────────────────────────────────────────
  // Dipende anche da `stream` perché `load()` riporta `playbackRate` a
  // `defaultPlaybackRate`: senza questo, ogni salto (che riapre il flusso)
  // rimetteva il video a velocità normale. Impostiamo entrambe le proprietà e
  // teniamo l'effetto DOPO quello del caricamento, così l'ordine è: nuovo
  // src → load() → velocità riapplicata. (`rate` è dichiarata più sopra,
  // prima dell'effetto di caricamento: la usa anche useStreamSource.apri()
  // per la velocità iniziale di un flusso appena aperto.)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate, videoId, sorgente, stream]);

  // ── Recupero da uno stallo di rete ───────────────────────────────────────
  // Lasciato a sé, il browser riprende non appena arriva un filo di dati:
  // con una connessione più lenta del bitrate del video il risultato sono
  // scatti continui invece di una pausa sola e pulita. Qui si prende il
  // controllo di quel momento: a un vero stallo durante la riproduzione
  // (`onWaiting` mentre `playing` è vero, cioè si stava ancora cercando di
  // andare avanti) si mette in pausa esplicitamente e si aspetta che il
  // buffer sia avanti di `REBUFFER_MARGIN_S` secondi rispetto alla posizione
  // attuale prima di far ripartire da sé il video. `playing` è la guardia
  // giusta anche qui, per lo stesso motivo dell'effetto di caricamento sopra:
  // se l'utente ha già messo in pausa lui stesso, un `waiting` residuo non
  // deve far ripartire nulla da solo.
  //
  // Non è uno stallo nemmeno il `waiting` di un salto dentro al buffer (→, ←,
  // doppio tocco: con MSE `seekable` copre tutto il video e seekTo sposta solo
  // `currentTime`): il browser lo emette mentre `seeking` è vero, con
  // `playing` e `hasPlayedRef` ancora veri. Preso per uno stallo, metteva in
  // pausa il video, e la ripresa qui sotto — che riparte solo quando cambiano
  // `bufferedEnd`/`position` — poteva non scattare più: `position` era già
  // stata portata al punto chiesto da seekTo, e a download finito (o in pausa)
  // il buffer non cresce. Il video restava fermo dopo un salto corto. Per
  // questo `attesaSaltoRef` si legge al momento dell'evento, non dopo: a
  // effect eseguito il salto potrebbe già essere concluso. Un vero stallo
  // successivo al salto emette un `waiting` nuovo, a `seeking` falso.
  const rebufferingRef = useRef(false);
  const attesaSaltoRef = useRef(false);
  const [rebuffering, setRebuffering] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !buffering || !hasPlayedRef.current || !playing || rebufferingRef.current) return;
    if (attesaSaltoRef.current) return;
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
  }, [videoId, sorgente, stream]);

  // ── Salto nel tempo ────────────────────────────────────────────────────
  const seekTo = useCallback((target) => {
    const v = videoRef.current;
    if (!v) return;
    const max = duration ? duration - 0.5 : Infinity;
    const t = Math.max(0, Math.min(max, target));
    const local = flusso.tempoLocale(t);
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

  // Salto chiesto da fuori (capitoli/trascrizione nel pannello descrizione).
  // Deps SOLO [seekRequest]: seekTo cambia identità ad ogni duration/
  // stream.start, e includerlo rieseguirebbe l'ULTIMA richiesta ad ogni
  // riapertura del flusso — un salto che si ripete da solo all'infinito.
  useEffect(() => { if (seekRequest) seekTo(seekRequest.t); }, [seekRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Comandi espliciti per il widget (e la finestra PiP di Android): lì l'icona
  // mostra "in riproduzione" anche durante uno stallo, quando il video è in
  // realtà fermo — `togglePlay`, che guarda `v.paused`, al tocco su "pausa" lo
  // farebbe ripartire. Qui "pausa" annulla l'attesa del buffer e resta fermo.
  const riproduci = useCallback(() => {
    rebufferingRef.current = false;
    setRebuffering(false);
    videoRef.current?.play().catch(() => {});
  }, []);
  const pausa = useCallback(() => {
    rebufferingRef.current = false;
    setRebuffering(false);
    videoRef.current?.pause();
  }, []);
  // PiP di Android: stato e comandi della finestra (no-op fuori dall'APK).
  usePipBridge(videoRef, playing || rebuffering, actualHeight, riproduci, pausa);

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
  // La riapertura dal punto corrente la fa il confronto in fase di render
  // (vedi "Qualità effettiva" in cima): farla anche qui aprirebbe il flusso due volte.
  function handleQuality(q) {
    setSettingsOpen(false);
    if (q === quality) return;
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

  // ── Entrata nel widget ─────────────────────────────────────────────────
  // Quello che era aperto sul player intero non deve restare a metà: menu
  // impostazioni, "tieni premuto" al 2x, doppio tocco in attesa di diventare un
  // salto, schermo intero (Indietro del browser o del mouse mentre si è a
  // schermo intero: il widget finirebbe a tutto schermo).
  useEffect(() => {
    if (!mini) return;
    setSettingsOpen(false);
    endHold();
    clearTimeout(tapRef.current.timer);
    clearTimeout(seekBurstRef.current.timer);
    seekBurstRef.current.delta = 0;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [mini]); // eslint-disable-line react-hooks/exhaustive-deps

  function flashSeek(side, seconds) {
    setSeekFlash({ side, seconds });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSeekFlash(null), 600);
  }

  function onVideoPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;   // solo tasto sinistro
    if (touch) tapRef.current.start = { x: e.clientX, y: e.clientY };
    // Senza cattura, un dito che scivola sotto la barra dei controlli (o, a
    // schermo intero, sulle bande nere del letterboxing) cambia bersaglio:
    // pointermove/pointerup smettono di arrivare qui e pointerleave scatta,
    // interrompendo il "tieni premuto" come se il dito fosse stato sollevato.
    // Con la cattura, questo elemento resta il bersaglio di tutto il gesto
    // indipendentemente da cosa c'è visivamente sopra nel punto in cui si trova
    // il dito ora.
    e.currentTarget.setPointerCapture?.(e.pointerId);
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
    const burst = seekBurstRef.current;
    // La prima coppia deve essere un doppio tocco vero e proprio (finestra
    // stretta, DOUBLE_TAP_MS): altrimenti un tocco singolo lento verrebbe
    // scambiato per l'inizio di un salto. Ma se un salto è già in corso
    // (`burst.delta` non a zero: il primo doppio tocco è già scattato), i
    // tocchi che lo continuano hanno la finestra più larga SEEK_BURST_MS —
    // vedi il commento in playerConstants.js sul perché serve.
    const finestra = burst.delta !== 0 ? SEEK_BURST_MS : DOUBLE_TAP_MS;
    const doubleTap = side !== "center" && side === t.side && now - t.time < finestra;
    t.time = now;
    t.side = side;

    if (doubleTap) {
      clearTimeout(t.timer);            // il tocco singolo in attesa non vale più
      burst.delta += side === "left" ? -SKIP_SECONDS : SKIP_SECONDS;
      flashSeek(side, Math.abs(burst.delta));
      clearTimeout(burst.timer);
      burst.timer = setTimeout(() => {
        const delta = burst.delta;
        burst.delta = 0;
        skip(delta);
      }, SEEK_BURST_MS);
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
      // Nel widget la pagina sotto è un'altra (home, ricerca…): spazio e frecce
      // devono farla scorrere, non comandare il video. Restano k (play/pausa)
      // e m (muto), come nel mini-player di YouTube.
      if (mini && key !== "k" && key !== "m") return;
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
  }, [togglePlay, toggleFullscreen, skip, nudgeVolume, toggleMute, toggleSubtitles, onToggleTheater, bumpControls, mini]);

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
  // `bufferedStart` (non `stream.start`): con MSE il buffer può iniziare
  // anche oltre `stream.start` se il flusso ha appena aperto e non ha ancora
  // ricevuto il primo pezzo — vedi `intervalloBuffer` in useStreamSource.js.
  const bufFromPct = duration ? Math.min(100, (bufferedStart / duration) * 100) : 0;
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
        // Dichiarato e non solo impostato a runtime (era condizionale, solo
        // sul ramo "non deve partire da sé"): senza, su un flusso senza
        // Content-Length il browser può smettere di scaricare oltre il primo
        // pezzetto già col video in pausa, e la barretta grigia del buffer
        // resta ferma anche aspettando a lungo.
        preload="auto"
        onResize={() => setActualHeight(videoRef.current?.videoHeight || 0)}
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
        onWaiting={() => {
          // Letto qui e non nell'effect: vedi "Recupero da uno stallo di rete".
          attesaSaltoRef.current = !!videoRef.current?.seeking;
          setBuffering(true);
        }}
        onPlaying={() => { setBuffering(false); hasPlayedRef.current = true; }}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={applyTextTrack}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v || scrub != null) return;
          setPosition(flusso.tempo(v));
        }}
        onProgress={() => {
          const v = videoRef.current;
          if (!v) return;
          const [inizio, fine] = flusso.intervalloBuffer(v);
          setBufferedStart(inizio);
          setBufferedEnd(fine);
        }}
        onVolumeChange={() => {
          const v = videoRef.current;
          if (!v) return;
          setVolume(v.volume);
          setMuted(v.muted);
        }}
        onEnded={() => {
          setPlaying(false); setControlsVisible(true);
          const v = videoRef.current;
          if (v && duration > 0 && flusso.tempo(v) >= duration - FINE_VERA_S) onEnded?.();
        }}
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

      {/* Strato dei gesti col dito: copre TUTTA l'area del player (video +
          eventuali bande nere del letterboxing a schermo intero), non solo il
          rettangolo del <video> — su YouTube il doppio tocco e il "tieni
          premuto" valgono ovunque sullo schermo, non solo sull'immagine.
          Sta sotto la barra dei controlli e il menu impostazioni (z-index),
          quindi un tocco che parte davvero su un bottone li raggiunge intatto;
          la cattura del puntatore (vedi onVideoPointerDown) fa sì che un gesto
          iniziato qui resti suo anche se il dito finisce sotto di loro. Solo
          col dito: col mouse i gesti restano sul <video>, invariati. */}
      {touch && (
        <div
          className="player-touch-layer"
          onPointerDown={onVideoPointerDown}
          onPointerMove={onVideoPointerMove}
          onPointerUp={onVideoPointerUp}
          onPointerCancel={() => { tapRef.current.start = null; endHold(); }}
          onPointerLeave={() => endHold()}
          onContextMenu={e => e.preventDefault()}
        />
      )}

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
          cast={cast}
          castMedia={castMedia}
          onNotice={onNotice}
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
          actualHeight={actualHeight}
          subtitleLang={subtitleLang}
          subtitleLangs={subtitleLangs}
          onSubtitleLangChange={onSubtitleLangChange}
          subtitleSize={subtitleSize}
          onSubtitleSizeChange={onSubtitleSizeChange}
        />
      )}

      {/* Ultimo fratello del <video>, mai un contenitore attorno: vedi
          MiniPlayerOverlay. Barra, menu e strato dei tocchi restano montati e
          li nasconde il CSS (App.css, "MINI-PLAYER"), così passare da widget a
          pagina intera non tocca nessun elemento prima di questo. */}
      {mini && (
        <MiniPlayerOverlay
          inRiproduzione={playing || rebuffering} onPlay={riproduci} onPause={pausa}
          onClose={onClose} onExpand={onExpand} pct={pct}
        />
      )}
    </div>
  );
}
