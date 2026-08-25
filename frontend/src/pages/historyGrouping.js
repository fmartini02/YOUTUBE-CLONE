// Il giorno di un timestamp, come etichetta da mostrare in testa al gruppo.
function etichettaGiorno(ts) {
  const d = new Date(ts * 1000);
  const oggi = new Date();
  const ieri = new Date();
  ieri.setDate(oggi.getDate() - 1);
  const stessoGiorno = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (stessoGiorno(d, oggi)) return "Oggi";
  if (stessoGiorno(d, ieri)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function raggruppaPerGiorno(voci) {
  const gruppi = [];
  for (const v of voci) {
    const label = etichettaGiorno(v.watched_at || 0);
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.label === label) ultimo.voci.push(v);
    else gruppi.push({ label, voci: [v] });
  }
  return gruppi;
}
