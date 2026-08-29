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

describe("Runta production endpoints", () => {
  it("uses the public Runta API and dashboard hosts", () => {
    expect(DEFAULT_RUNTA_API_URL).toBe("https://api.runta.com");
    expect(DEFAULT_RUNTA_DASHBOARD_URL).toBe("https://dashboard.runta.com");
    expect(deviceAuthorizationUrl(DEFAULT_RUNTA_DASHBOARD_URL)).toBe("https://dashboard.runta.com/api/device/authorization");
    expect(deviceTokenUrl(DEFAULT_RUNTA_DASHBOARD_URL)).toBe("https://dashboard.runta.com/api/device/token");
    expect(deviceAuthorizationRequest("Runta Crew on darwin")).toEqual({ clientId: "runta_cli", deviceName: "Runta Crew on darwin" });
    expect(deviceTokenRequest("device-code")).toEqual({ deviceCode: "device-code" });
  });

  it("migrates the retired Forge defaults without overriding custom development hosts", () => {
    expect(normalizeRuntaApiUrl("https://api.forge")).toBe(DEFAULT_RUNTA_API_URL);
    expect(normalizeRuntaApiUrl("https://app.forge/api/")).toBe(DEFAULT_RUNTA_API_URL);
    expect(normalizeRuntaDashboardUrl("https://app.forge/")).toBe(DEFAULT_RUNTA_DASHBOARD_URL);
    expect(normalizeRuntaApiUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
    expect(normalizeRuntaDashboardUrl("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173");
  });
});
