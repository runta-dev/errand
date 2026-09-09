import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNTA_API_URL,
  DEFAULT_RUNTA_DASHBOARD_URL,
  deviceAuthorizationRequest,
  deviceAuthorizationUrl,
  deviceTokenRequest,
  deviceTokenUrl,
  normalizeRuntaApiUrl,
  normalizeRuntaDashboardUrl,
} from "./runtaEndpoints";

describe("Runta public endpoints", () => {
  it("uses the public Runta API and dashboard hosts", () => {
    expect(DEFAULT_RUNTA_API_URL).toBe("https://api.runta.me");
    expect(DEFAULT_RUNTA_DASHBOARD_URL).toBe("https://dashboard.runta.me");
    expect(deviceAuthorizationUrl(DEFAULT_RUNTA_API_URL)).toBe("https://api.runta.me/v2/auth/device/authorization");
    expect(deviceTokenUrl(DEFAULT_RUNTA_API_URL)).toBe("https://api.runta.me/v2/auth/device/token");
    expect(deviceAuthorizationRequest("Runta Crew on darwin", `${DEFAULT_RUNTA_DASHBOARD_URL}/`)).toEqual({ client_id: "runta_crew", device_name: "Runta Crew on darwin", app_url: "https://dashboard.runta.me" });
    expect(deviceTokenRequest("device-code")).toEqual({ device_code: "device-code" });
  });

  it("preserves explicit development hosts and normalizes the legacy API alias", () => {
    expect(normalizeRuntaApiUrl("https://api.forge")).toBe("https://api.forge");
    expect(normalizeRuntaApiUrl("https://app.forge/api/")).toBe("https://api.forge");
    expect(normalizeRuntaDashboardUrl("https://app.forge/")).toBe("https://app.forge");
    expect(normalizeRuntaApiUrl(" https://api.runta.com/ ")).toBe("https://api.runta.com");
    expect(normalizeRuntaApiUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
    expect(normalizeRuntaDashboardUrl("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173");
  });

  it("uses the public defaults for missing or empty configuration", () => {
    for (const value of [undefined, "", "   "]) {
      expect(normalizeRuntaApiUrl(value)).toBe(DEFAULT_RUNTA_API_URL);
      expect(normalizeRuntaDashboardUrl(value)).toBe(DEFAULT_RUNTA_DASHBOARD_URL);
    }
  });

  it("retains a configured API path prefix for both device requests", () => {
    expect(deviceAuthorizationUrl("https://example.test/api/")).toBe("https://example.test/api/v2/auth/device/authorization");
    expect(deviceTokenUrl("https://example.test/api/")).toBe("https://example.test/api/v2/auth/device/token");
  });
});
