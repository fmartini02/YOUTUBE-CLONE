import { useState } from "react";
import PlayerSettingsMenu from "../VideoPlayer/PlayerSettingsMenu";
import { useCastReload } from "./useCastReload";

const GEAR = {
  position: "absolute", top: 12, right: 12, zIndex: 2,
  background: "rgba(0,0,0,0.5)", border: "none", color: "#fff",
  fontSize: 20, width: 36, height: 36, borderRadius: "50%", cursor: "pointer",
};

/**
 * Menu impostazioni del telecomando cast: riusa il menu del player locale
 * (`PlayerSettingsMenu`, tutto presentazionale), ma qualità/sottotitoli
 * ricaricano il video sulla TV (useCastReload) e la velocità va a caldo. Le
 * scelte aggiornano anche lo stato della pagina, così il passaggio a player
 * locale quando il cast finisce è senza scatti.
 */
export default function CastRemoteSettings({ cast, player }) {
  const { videoId, castMedia, quality, cambiaQualita, subtitleLang, setSubtitleLang,
    subtitleLangs, subtitleSize, setSubtitleSize } = player;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState("main");
  const reload = useCastReload(cast, videoId, castMedia);

  const pickQuality = (q) => { cambiaQualita(q); reload(q, subtitleLang, subtitleSize); };
  const pickSub = (l) => { setSubtitleLang(l); reload(quality, l, subtitleSize); };
  const pickSize = (s) => { setSubtitleSize(s); reload(quality, subtitleLang, s); };

  if (!open) {
    return <button style={GEAR} onClick={() => setOpen(true)} aria-label="Impostazioni">⚙</button>;
  }
  return (
    <PlayerSettingsMenu
      settingsPage={page} speed={cast.playbackRate || 1}
      onGoSpeed={() => setPage("speed")} onBack={() => setPage("main")}
      onSpeedChange={(r) => cast.remote.setRate(r)}
      onClose={() => { setOpen(false); setPage("main"); }}
      quality={quality} onPickQuality={pickQuality}
      subtitleLang={subtitleLang} subtitleLangs={subtitleLangs} onSubtitleLangChange={pickSub}
      subtitleSize={subtitleSize} onSubtitleSizeChange={pickSize}
    />
  );
}
