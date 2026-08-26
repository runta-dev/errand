import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, safeStorage, shell } from "electron";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { AppSettings, CloudRequest, DeviceAuthorizationStatus } from "../../src/shared/desktop";

const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);
const credentialFile = () => join(app.getPath("userData"), "credentials.bin");
const settingsFile = () => join(app.getPath("userData"), "settings.json");
const defaultSettings: AppSettings = { endpoint: "https://api.forge", dashboardUrl: "https://app.forge", theme: "light", notifications: true };
let settings: AppSettings = defaultSettings;
let authorizationStatus: DeviceAuthorizationStatus = "idle";
const selectedAttachmentPaths = new Map<string, string>();
let mainWindow: BrowserWindow | undefined;
let pendingDeepLinkAgentId: string | undefined;

app.setName("Runta Crew");

function agentIdFromDeepLink(value: string): string | undefined {
  try { const url = new URL(value); const id = url.protocol === "runta-crew:" && url.hostname === "agent" ? decodeURIComponent(url.pathname.replace(/^\//, "")) : ""; return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) ? id : undefined; } catch { return undefined; }
}
function openAgentDeepLink(value: string) {
  const agentId = agentIdFromDeepLink(value); if (!agentId) return;
  pendingDeepLinkAgentId = agentId;
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send("deep-link:agent", agentId); pendingDeepLinkAgentId = undefined; }
}

function mediaTypeForPath(path: string): string {
  const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json", ".csv": "text/csv" };
  return types[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function loadSettings(): AppSettings {
  if (!existsSync(settingsFile())) return settings;
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<AppSettings>;
    const theme = value.theme === "dark" || value.theme === "system" ? value.theme : "light";
    const configuredEndpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
    const endpoint = configuredEndpoint === "https://app.forge/api" ? defaultSettings.endpoint : configuredEndpoint;
    return { endpoint: isDev && endpoint ? endpoint : defaultSettings.endpoint, dashboardUrl: isDev && typeof value.dashboardUrl === "string" && value.dashboardUrl.trim() ? value.dashboardUrl : defaultSettings.dashboardUrl, notifications: value.notifications !== false, theme };
  } catch { return settings; }
}

function createWindow() {
  const requestedSize = process.env.RUNTA_CREW_WINDOW_SIZE?.match(/^(\d+)x(\d+)$/);
  const width = requestedSize ? Math.max(960, Number(requestedSize[1])) : 1040;
  const height = requestedSize ? Math.max(640, Number(requestedSize[2])) : 760;
  const window = new BrowserWindow({
    width, height, minWidth: 960, minHeight: 640,
    title: "Runta Crew", backgroundColor: "#f7f6f3",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  mainWindow = window; window.on("closed", () => { if (mainWindow === window) mainWindow = undefined; });
  if (isDev && devServerUrl) void window.loadURL(devServerUrl);
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
    if (pendingDeepLinkAgentId) { window.webContents.send("deep-link:agent", pendingDeepLinkAgentId); pendingDeepLinkAgentId = undefined; }
    const smokeMarker = process.env.RUNTA_CREW_SMOKE_MARKER;
    if (smokeMarker) { writeFileSync(smokeMarker, "ready\n"); app.quit(); return; }
    const screenshotPath = process.env.RUNTA_CREW_SCREENSHOT_PATH;
    if (screenshotPath) globalThis.setTimeout(() => { void window.webContents.capturePage().then((image) => { writeFileSync(screenshotPath, image.toPNG()); app.quit(); }); }, 1200);
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on("second-instance", (_event, argv) => { const deepLink = argv.find((value) => value.startsWith("runta-crew://")); if (deepLink) openAgentDeepLink(deepLink); else { mainWindow?.show(); mainWindow?.focus(); } });
  app.on("open-url", (event, url) => { event.preventDefault(); openAgentDeepLink(url); });
}

app.whenReady().then(() => {
  settings = loadSettings();
  if (process.platform === "darwin" && app.dock && isDev) {
    const dockIconPath = join(process.cwd(), "build/icon.png");
    if (existsSync(dockIconPath)) app.dock.setIcon(nativeImage.createFromPath(dockIconPath));
  }
  if (app.isPackaged) app.setAsDefaultProtocolClient("runta-crew");
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
ipcMain.handle("settings:set", (_event, next: AppSettings) => {
  settings = { ...next, endpoint: isDev ? next.endpoint : defaultSettings.endpoint, dashboardUrl: isDev ? next.dashboardUrl : defaultSettings.dashboardUrl };
  writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), { mode: 0o600 }); return settings;
});
ipcMain.handle("credentials:has", () => existsSync(credentialFile()) && readFileSync(credentialFile()).length > 0);
ipcMain.handle("credentials:set", (_event, token: string | null) => {
  if (!token) { if (existsSync(credentialFile())) rmSync(credentialFile()); authorizationStatus = "idle"; return false; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS credential encryption is unavailable");
  writeFileSync(credentialFile(), safeStorage.encryptString(token), { mode: 0o600 });
  return true;
});
ipcMain.handle("auth:status", () => authorizationStatus);
ipcMain.handle("auth:logout", async () => {
  if (existsSync(credentialFile()) && readFileSync(credentialFile()).length > 0 && safeStorage.isEncryptionAvailable() && settings.endpoint) {
    const token = safeStorage.decryptString(readFileSync(credentialFile()));
    const apiBase = `${settings.endpoint.replace(/\/+$/, "")}/`;
    await net.fetch(new URL("v1/auth/token", apiBase).toString(), { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
  }
  if (existsSync(credentialFile())) rmSync(credentialFile());
  authorizationStatus = "idle";
  return true;
});
ipcMain.handle("auth:start", async () => {
  if (!settings.endpoint || !settings.dashboardUrl) throw new Error("API and Dashboard URLs are required");
  const apiBase = `${settings.endpoint.replace(/\/+$/, "")}/`;
  const response = await net.fetch(new URL("v1/auth/device/authorization", apiBase).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: "runta_crew", device_name: `Runta Crew on ${process.platform}`, app_url: settings.dashboardUrl.replace(/\/+$/, "") }),
  });
  if (!response.ok) throw new Error(`Device authorization failed (${response.status})`);
  const envelope = await response.json() as { data: { device_code: string; user_code: string; verification_uri_complete: string; expires_at: string; interval: number } };
  authorizationStatus = "pending";
  const poll = async () => {
    let interval = Math.max(5, envelope.data.interval || 5);
    while (authorizationStatus === "pending") {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      const tokenResponse = await net.fetch(new URL("v1/auth/device/token", apiBase).toString(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_code: envelope.data.device_code }) });
      if (tokenResponse.ok) {
        const token = await tokenResponse.json() as { access_token: string };
        if (!safeStorage.isEncryptionAvailable()) { authorizationStatus = "error"; return; }
        writeFileSync(credentialFile(), safeStorage.encryptString(token.access_token), { mode: 0o600 });
        authorizationStatus = "authorized";
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
        if (process.platform === "darwin") app.focus({ steal: true });
        return;
      }
      const error = await tokenResponse.json().catch(() => ({})) as { error?: string; interval?: number };
      if (error.error === "slow_down") interval = Math.max(interval + 5, error.interval ?? 0);
      else if (error.error === "access_denied") { authorizationStatus = "denied"; return; }
      else if (error.error === "expired_token") { authorizationStatus = "expired"; return; }
      else if (error.error !== "authorization_pending") { authorizationStatus = "error"; return; }
    }
  };
  void poll();
  await shell.openExternal(envelope.data.verification_uri_complete);
  return { verificationUrl: envelope.data.verification_uri_complete, userCode: envelope.data.user_code, expiresAt: envelope.data.expires_at };
});
ipcMain.handle("cloud:request", async (_event, request: CloudRequest) => {
  if (!settings.endpoint) throw new Error("Runta API endpoint is not configured");
  if (!existsSync(credentialFile()) || !safeStorage.isEncryptionAvailable()) throw new Error("Runta API token is not configured");
  const encrypted = readFileSync(credentialFile());
  if (!encrypted.length) throw new Error("Runta API token is not configured");
  const token = safeStorage.decryptString(encrypted);
  const endpoint = new URL(`${settings.endpoint.replace(/\/+$/, "")}/`);
  const url = new URL(request.path.replace(/^\/+/, ""), endpoint);
  const apiPrefix = `${endpoint.pathname.replace(/\/+$/, "")}/v1/`;
  if (url.origin !== endpoint.origin || !url.pathname.startsWith(apiPrefix)) throw new Error("Cloud request path is not allowed");
  const response = await net.fetch(url.toString(), {
    method: request.method,
    headers: { authorization: `Bearer ${token}`, ...(request.body === undefined ? {} : { "content-type": "application/json" }) },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await response.text();
  let body: unknown;
  if (text) { try { body = JSON.parse(text) as unknown; } catch { body = text; } }
  return { status: response.status, body };
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
  if (attachments.length !== result.filePaths.length) await dialog.showMessageBox({ type: "warning", title: "Some files were not attached", message: "Runta Crew supports files up to 25 MB." });
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
