export function useCast() {
  return {
    available: false,
    connected: false,
    deviceName: "",
    castState: "idle",
    currentMedia: null,
    castVideo: async () => false,
    pauseResume: () => {},
    seek: () => {},
    stopCast: () => {},
    openDialog: () => {},
  };
}
