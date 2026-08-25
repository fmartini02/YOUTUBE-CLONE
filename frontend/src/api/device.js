export function isCapacitor() {
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
}
