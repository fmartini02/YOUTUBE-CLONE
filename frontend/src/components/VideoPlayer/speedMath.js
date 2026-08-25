// ── Velocità di riproduzione ────────────────────────────────────────────
// La barra si muove a tacche da 0.05. Le tacche vere sono quindi cinquanta:
// troppe da etichettare, e le scritte sotto la barra sono ogni mezza velocità
// (SPEED_LABEL_STEP) solo per dare il riferimento.
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const SPEED_STEP = 0.05;
export const SPEED_LABEL_STEP = 0.5;
export const SPEED_PRESETS = [1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
// Velocità del "tieni premuto", e quanto va tenuto premuto prima che parta.
// Sotto i ~350ms scattava per sbaglio sui tocchi lenti (che devono mettere in
// pausa), sopra i ~600ms sembra che il video non risponda.
export const HOLD_SPEED = 2;
export const HOLD_MS = 450;

// 1 e non 1.0, 1.25 e non 1.25 troncato: niente zeri inutili.
export function formatSpeed(s) {
  return String(Number(s.toFixed(2)));
}

// Le somme in virgola mobile danno 1.5000000000000002: si arrotonda sempre a
// due decimali, che è la precisione di tutto quello che mostriamo.
export function roundSpeed(s) {
  return Number(Math.min(SPEED_MAX, Math.max(SPEED_MIN, s)).toFixed(2));
}
