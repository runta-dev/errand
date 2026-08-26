import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, shell } from "electron";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { AppSettings } from "../../src/shared/desktop";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const credentialFile = () => join(app.getPath("userData"), "credentials.bin");
const settingsFile = () => join(app.getPath("userData"), "settings.json");
let settings: AppSettings = { endpoint: "", theme: "light", notifications: true };
const selectedAttachmentPaths = new Map<string, string>();

function mediaTypeForPath(path: string): string {
  const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json", ".csv": "text/csv" };
  return types[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function loadSettings(): AppSettings {
  if (!existsSync(settingsFile())) return settings;
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<AppSettings>;
    const theme = value.theme === "dark" || value.theme === "system" ? value.theme : "light";
    return { endpoint: typeof value.endpoint === "string" ? value.endpoint : "", notifications: value.notifications !== false, theme };
  } catch { return settings; }
}

function createWindow() {
  const requestedSize = process.env.RUNTA_CREW_WINDOW_SIZE?.match(/^(\d+)x(\d+)$/);
  const width = requestedSize ? Math.max(960, Number(requestedSize[1])) : 1440;
  const height = requestedSize ? Math.max(640, Number(requestedSize[2])) : 920;
  const window = new BrowserWindow({
    width, height, minWidth: 960, minHeight: 640,
    title: "Runta Crew", backgroundColor: "#f7f6f3",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  if (isDev && process.env.VITE_DEV_SERVER_URL) void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void window.loadFile(join(__dirname, "../renderer/index.html"));
  window.webContents.setWindowOpenHandler(({ url }) => {
    try { const parsed = new URL(url); if (parsed.protocol === "https:" || parsed.protocol === "http:") void shell.openExternal(parsed.toString()); } catch { /* deny malformed URLs */ }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
  window.webContents.once("did-finish-load", () => {
    const smokeMarker = process.env.RUNTA_CREW_SMOKE_MARKER;
    if (smokeMarker) { writeFileSync(smokeMarker, "ready\n"); app.quit(); return; }
    const screenshotPath = process.env.RUNTA_CREW_SCREENSHOT_PATH;
    if (screenshotPath) globalThis.setTimeout(() => { void window.webContents.capturePage().then((image) => { writeFileSync(screenshotPath, image.toPNG()); app.quit(); }); }, 1200);
  });
}

app.whenReady().then(() => {
  settings = loadSettings();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Runta Crew", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
  ]));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("desktop:version", () => app.getVersion());
ipcMain.handle("desktop:openExternal", (_event, url: string) => {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error("Only HTTP(S) links are allowed");
  return shell.openExternal(parsed.toString());
});
ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:set", (_event, next: AppSettings) => { settings = next; writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), { mode: 0o600 }); return settings; });
ipcMain.handle("credentials:has", () => existsSync(credentialFile()));
ipcMain.handle("credentials:set", (_event, token: string | null) => {
  if (!token) { if (existsSync(credentialFile())) writeFileSync(credentialFile(), Buffer.alloc(0)); return false; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS credential encryption is unavailable");
  writeFileSync(credentialFile(), safeStorage.encryptString(token), { mode: 0o600 });
  return true;
});
ipcMain.handle("attachments:choose", async () => {
  const result = await dialog.showOpenDialog({ title: "Attach files to your message", properties: ["openFile", "multiSelections"], filters: [{ name: "Supported files", extensions: ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "md", "json", "csv"] }] });
  if (result.canceled) return [];
  const attachments = result.filePaths.flatMap((path) => {
    const size = statSync(path).size;
    if (size > 25 * 1024 * 1024) return [];
    const id = randomUUID(); selectedAttachmentPaths.set(id, path);
    return [{ id, name: basename(path), size, mediaType: mediaTypeForPath(path) }];
  });
  if (attachments.length !== result.filePaths.length) await dialog.showMessageBox({ type: "warning", title: "Some files were not attached", message: "Runta Crew supports files up to 25 MB in this preview." });
  return attachments;
});
ipcMain.handle("notifications:show", (event, value: { title?: unknown; body?: unknown }) => {
  const title = typeof value?.title === "string" ? value.title.slice(0, 120) : "";
  const body = typeof value?.body === "string" ? value.body.slice(0, 500) : "";
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!settings.notifications || !title || !body || !Notification.isSupported() || sourceWindow?.isFocused()) return false;
  new Notification({ title, body }).show(); return true;
});
ipcMain.handle("notifications:setBadge", (_event, count: number) => {
  if (process.platform === "darwin" && app.dock) app.dock.setBadge(Number.isSafeInteger(count) && count > 0 ? String(Math.min(count, 99)) : "");
});
