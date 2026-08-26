import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../../src/shared/desktop";

const bridge: DesktopBridge = {
  getVersion: () => ipcRenderer.invoke("desktop:version"),
  openExternal: (url) => ipcRenderer.invoke("desktop:openExternal", url),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (settings) => ipcRenderer.invoke("settings:set", settings),
  },
  credentials: {
    has: () => ipcRenderer.invoke("credentials:has"),
    set: (token) => ipcRenderer.invoke("credentials:set", token),
  },
};

contextBridge.exposeInMainWorld("runtaCrew", bridge);
