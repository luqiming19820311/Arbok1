/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arbokDesktop", {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("arbok:get-version"),
  checkForUpdates: () => ipcRenderer.invoke("arbok:check-update"),
  setAutoDownload: (enabled) =>
    ipcRenderer.invoke("arbok:set-auto-download", Boolean(enabled)),
  quitAndInstall: () => ipcRenderer.invoke("arbok:quit-and-install"),
  onUpdateEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("arbok:update-event", wrapped);
    return () => ipcRenderer.removeListener("arbok:update-event", wrapped);
  },
});
