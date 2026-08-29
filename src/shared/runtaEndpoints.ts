export const DEFAULT_RUNTA_API_URL = "https://api.runta.com";
export const DEFAULT_RUNTA_DASHBOARD_URL = "https://dashboard.runta.com";

const LEGACY_RUNTA_ENDPOINTS = new Set([
  "https://api.forge",
  "https://app.forge/api",
]);

const LEGACY_RUNTA_DASHBOARDS = new Set([
  "https://app.forge",
]);

export function normalizeRuntaApiUrl(value: string | undefined): string {
  const configured = value?.trim().replace(/\/+$/, "") ?? "";
  return !configured || LEGACY_RUNTA_ENDPOINTS.has(configured) ? DEFAULT_RUNTA_API_URL : configured;
}

export function normalizeRuntaDashboardUrl(value: string | undefined): string {
  const configured = value?.trim().replace(/\/+$/, "") ?? "";
  return !configured || LEGACY_RUNTA_DASHBOARDS.has(configured) ? DEFAULT_RUNTA_DASHBOARD_URL : configured;
}

export function deviceAuthorizationUrl(dashboardUrl: string): string {
  return new URL("api/device/authorization", `${dashboardUrl.replace(/\/+$/, "")}/`).toString();
}

export function deviceTokenUrl(dashboardUrl: string): string {
  return new URL("api/device/token", `${dashboardUrl.replace(/\/+$/, "")}/`).toString();
}

export function deviceAuthorizationRequest(deviceName: string) {
  return { clientId: "runta_cli" as const, deviceName };
}

export function deviceTokenRequest(deviceCode: string) {
  return { deviceCode };
}
