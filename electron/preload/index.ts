import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../../src/shared/desktop";

let nextCloudSubscriptionId = 1;

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
  auth: {
    start: () => ipcRenderer.invoke("auth:start"),
    status: () => ipcRenderer.invoke("auth:status"),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  cloud: {
    request: (request) => ipcRenderer.invoke("cloud:request", request),
    subscribe: (path, listener) => {
      const subscriptionId = String(nextCloudSubscriptionId++);
      const handler = (_event: Electron.IpcRendererEvent, value: { subscriptionId: string; event: string; id?: string; data?: unknown }) => { if (value.subscriptionId === subscriptionId) listener(value); };
      ipcRenderer.on("cloud:stream:event", handler);
      ipcRenderer.send("cloud:stream:subscribe", { subscriptionId, path });
      return () => { ipcRenderer.removeListener("cloud:stream:event", handler); ipcRenderer.send("cloud:stream:unsubscribe", subscriptionId); };
    },
  },
  attachments: { choose: () => ipcRenderer.invoke("attachments:choose"), read: (id) => ipcRenderer.invoke("attachments:read", id) },
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
