const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__electron_ipc", {
  openVlc: (url, title) => ipcRenderer.invoke("open-vlc", url, title),
});
