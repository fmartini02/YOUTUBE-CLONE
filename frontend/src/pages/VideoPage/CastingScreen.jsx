function CastingStatus({ cast }) {
  return (
    <div style={{ textAlign: "center", zIndex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>
        {cast.playerState === "buffering" ? "Caricamento su" : "In riproduzione su"}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#ff6060", marginTop: 4 }}>{cast.deviceName}</div>
      {/* Play/pausa e volume si comandano dal telecomando della TV o da
          Google Home: l'unico comando cast qui è "Interrompi" nelle azioni. */}
      <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 10 }}>
        Usa il telecomando della TV per mettere in pausa
      </div>
    </div>
  );
}

/** Schermata "in cast": il video va sulla TV, il player locale lascia il posto a uno stato. */
export default function CastingScreen({ cast, thumbnail }) {
  return (
    <div className="player-wrap">
      <div style={{
        aspectRatio: "16/9", background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        {thumbnail && (
          <img src={thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.15 }} />
        )}
        <svg width="56" height="56" viewBox="0 0 24 24" fill="#ff0000">
          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
        </svg>
        <CastingStatus cast={cast} />
      </div>
    </div>
  );
}
