/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arbokDesktop", {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("arbok:get-version"),
  getUpdateState: () => ipcRenderer.invoke("arbok:get-update-state"),
  checkForUpdates: (options) => ipcRenderer.invoke("arbok:check-update", options),
  downloadUpdate: () => ipcRenderer.invoke("arbok:download-update"),
  setAutoDownload: (enabled) =>
    ipcRenderer.invoke("arbok:set-auto-download", Boolean(enabled)),
  setUpdateChannel: (channel) =>
    ipcRenderer.invoke("arbok:set-update-channel", channel),
  setProxyConfig: (config) =>
    ipcRenderer.invoke("arbok:set-proxy-config", config),
  quitAndInstall: () => ipcRenderer.invoke("arbok:quit-and-install"),
  setPipMode: (enabled) => ipcRenderer.invoke("arbok:set-pip", Boolean(enabled)),
  onUpdateEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("arbok:update-event", wrapped);
    return () => ipcRenderer.removeListener("arbok:update-event", wrapped);
  },
});
