// Handler della pista trascinabile della velocità, isolati dal componente
// solo per restare sotto le 25 righe — nessuna logica è cambiata.
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, roundSpeed } from "./speedMath";

function speedFromPointer(e, trackRef) {
  const rect = trackRef.current.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const raw = SPEED_MIN + ratio * (SPEED_MAX - SPEED_MIN);
  return roundSpeed(Math.round(raw / SPEED_STEP) * SPEED_STEP);
}

export function handleTrackPointerDown(e, trackRef, draggingRef, onChange) {
  e.currentTarget.setPointerCapture(e.pointerId);
  draggingRef.current = true;
  onChange(speedFromPointer(e, trackRef));
}

export function handleTrackPointerMove(e, trackRef, draggingRef, onChange) {
  if (draggingRef.current) onChange(speedFromPointer(e, trackRef));
}

export function handleTrackKeyDown(e, value, onChange) {
  const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? SPEED_STEP
    : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -SPEED_STEP
    : 0;
  if (!step) return;
  e.preventDefault();
  onChange(roundSpeed(value + step));
}
