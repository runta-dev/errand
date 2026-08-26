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
  attachments: { choose: () => ipcRenderer.invoke("attachments:choose") },
  notifications: {
    show: (notification) => ipcRenderer.invoke("notifications:show", notification),
    setBadge: (count) => ipcRenderer.invoke("notifications:setBadge", count),
  },
  deepLinks: {
    onOpenAgent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, agentId: string) => listener(agentId);
      ipcRenderer.on("deep-link:agent", handler); return () => ipcRenderer.removeListener("deep-link:agent", handler);
    },
  },
};

contextBridge.exposeInMainWorld("runtaCrew", bridge);
