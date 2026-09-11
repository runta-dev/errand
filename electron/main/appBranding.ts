import { join, resolve } from "node:path";

export const APP_DISPLAY_NAME = "Errand";
// Electron derives its macOS safeStorage keychain service/account from this
// internal name. Keep it stable across the visible product rename.
export const STORAGE_APPLICATION_NAME = "Runta Crew";
export const AGENT_LINK_SCHEMES = ["errand", "runta-crew"] as const;

export function storageDirectory(appData: string, userDataOverride?: string): string {
  return userDataOverride ? resolve(userDataOverride) : join(appData, STORAGE_APPLICATION_NAME);
}

export function nativeEnvironmentValue(env: Readonly<Record<string, string | undefined>>, option: "WINDOW_SIZE" | "SMOKE_MARKER" | "SCREENSHOT_PATH"): string | undefined {
  return env[`ERRAND_${option}`] ?? env[`RUNTA_CREW_${option}`];
}

export function agentIdFromDeepLink(value: string): string | undefined {
  try {
    if (value !== value.trim()) return;
    const url = new URL(value);
    if (!AGENT_LINK_SCHEMES.some((scheme) => url.protocol === `${scheme}:`) || url.hostname !== "agent" || url.port || url.username || url.password || url.search || url.hash) return;
    const route = /^[a-z-]+:\/\/agent\/([^/?#]+)$/i.exec(value);
    if (!route) return;
    const id = decodeURIComponent(route[1]);
    return id === id.trim() && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) ? id : undefined;
  } catch { return; }
}
