import { useEffect, useRef } from "react";
import { formatDuration, proxyImg } from "../../api";

function PanelItem({ v, indice, corrente, onOpen }) {
  return (
    <div className={`playlist-panel-item${corrente ? " corrente" : ""}`} onClick={() => onOpen(v)} data-corrente={corrente || undefined}>
      <div className="playlist-panel-index">
        {corrente ? <span className="material-symbols-outlined">play_arrow</span> : indice + 1}
      </div>
      <div className="related-thumb playlist-panel-thumb">
        <img src={proxyImg(v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)} alt={v.title} />
        {v.duration && <span className="related-duration">{formatDuration(v.duration)}</span>}
      </div>
      <div className="related-meta">
        <div className="related-title">{v.title}</div>
        <div className="related-channel">{v.channel}</div>
      </div>
    </div>
  );
}

// Porta la voce corrente in vista DENTRO il pannello, a ogni cambio di video.
// Non scrollIntoView: scorrerebbe anche la pagina, portando via il player.
// `trovato`: la voce può comparire dopo qualche pagina (video in fondo a una
// playlist lunga), e anche allora va portata in vista. offsetTop è relativo
// alla lista perché nel CSS è lei il `position: relative` più vicino.
function useVoceCorrenteInVista(listaRef, videoId, trovato) {
  useEffect(() => {
    const lista = listaRef.current;
    const voce = lista?.querySelector("[data-corrente]");
    if (!lista || !voce) return;
    lista.scrollTop = voce.offsetTop - lista.clientHeight / 3;
  }, [videoId, trovato]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Carica la pagina successiva quando si scorre in fondo al pannello: lo
// scroll infinito della pagina non vede dentro un riquadro che scorre da sé.
function alFondo(e, caricaAltri) {
  const el = e.currentTarget;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) caricaAltri();
}

/**
 * Pannello della playlist sopra i correlati, come su YouTube: titolo (porta
 * alla pagina della playlist), posizione "3 / 25" e l'elenco, con il video in
 * riproduzione evidenziato. Toccare una voce apre quel video nella stessa
 * playlist, sostituendo la voce di cronologia (vedi App/navHistory.js).
 */
export default function PlaylistPanel({ coda, videoId, navigate }) {
  const listaRef = useRef(null);
  useVoceCorrenteInVista(listaRef, videoId, coda.attiva && coda.indice >= 0);
  if (!coda.attiva) return null;
  const { playlist, videos, indice } = coda;
  // Durante il primo caricamento non si sa ancora niente: meglio non dire
  // nulla che "0 video".
  const totale = playlist?.count ?? (videos.length || null);
  const apri = v => navigate("video", { videoId: v.id, listId: coda.listId });

  return (
    <section className="playlist-panel">
      <div className="playlist-panel-head">
        <div className="playlist-panel-title" onClick={() => navigate("playlist", { listId: coda.listId })}>
          {playlist?.title || "Playlist"}
        </div>
        <div className="playlist-panel-sub">
          {[playlist?.channel, totale && (indice >= 0 ? `${indice + 1} / ${totale}` : `${totale} video`)].filter(Boolean).join(" • ")}
        </div>
      </div>
      <div className="playlist-panel-list" ref={listaRef} onScroll={e => alFondo(e, coda.caricaAltri)}>
        {videos.map((v, i) => <PanelItem key={v.id} v={v} indice={i} corrente={v.id === videoId} onOpen={apri} />)}
        {coda.loading && <div className="playlist-panel-loading">Caricamento…</div>}
      </div>
    </section>
  );
}
