export const DEFAULT_RUNTA_API_URL = "https://api.runta.com";
export const DEFAULT_RUNTA_DASHBOARD_URL = "https://dashboard.runta.com";

export function normalizeRuntaApiUrl(value: string | undefined): string {
  const configured = value?.trim().replace(/\/+$/, "") ?? "";
  if (configured === "https://app.forge/api") return "https://api.forge";
  return configured || DEFAULT_RUNTA_API_URL;
}

export function normalizeRuntaDashboardUrl(value: string | undefined): string {
  const configured = value?.trim().replace(/\/+$/, "") ?? "";
  return configured || DEFAULT_RUNTA_DASHBOARD_URL;
}

export function deviceAuthorizationUrl(apiUrl: string): string {
  return new URL("v2/auth/device/authorization", `${apiUrl.replace(/\/+$/, "")}/`).toString();
}

export function deviceTokenUrl(apiUrl: string): string {
  return new URL("v2/auth/device/token", `${apiUrl.replace(/\/+$/, "")}/`).toString();
}

export function deviceAuthorizationRequest(deviceName: string, dashboardUrl: string) {
  return { client_id: "runta_crew" as const, device_name: deviceName, app_url: dashboardUrl.replace(/\/+$/, "") };
}

export function deviceTokenRequest(deviceCode: string) {
  return { device_code: deviceCode };
}
