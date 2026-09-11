import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_LINK_SCHEMES, APP_DISPLAY_NAME, STORAGE_APPLICATION_NAME, agentIdFromDeepLink, nativeEnvironmentValue, storageDirectory } from "./appBranding";

describe("Errand native branding compatibility", () => {
  it("uses an independent Errand profile and keychain application name", () => {
    expect(APP_DISPLAY_NAME).toBe("Errand");
    expect(STORAGE_APPLICATION_NAME).toBe("Errand");
    expect(storageDirectory("/Users/example/Library/Application Support")).toBe("/Users/example/Library/Application Support/Errand");
    expect(storageDirectory("/Users/example/Library/Application Support", "/tmp/errand-smoke/profile")).toBe("/tmp/errand-smoke/profile");
    expect(storageDirectory("/Users/example/Library/Application Support", "custom-profile")).toBe(resolve("custom-profile"));
  });

  it.each(["WINDOW_SIZE", "SMOKE_MARKER", "SCREENSHOT_PATH"] as const)("supports the new and legacy %s environment option", (option) => {
    expect(nativeEnvironmentValue({ [`RUNTA_CREW_${option}`]: "legacy" }, option)).toBe("legacy");
    expect(nativeEnvironmentValue({ [`RUNTA_CREW_${option}`]: "legacy", [`ERRAND_${option}`]: "current" }, option)).toBe("current");
    expect(nativeEnvironmentValue({}, option)).toBeUndefined();
  });

  it.each(AGENT_LINK_SCHEMES)("opens the same agent through %s links", (scheme) => {
    expect(agentIdFromDeepLink(`${scheme}://agent/agent-1_default`)).toBe("agent-1_default");
    expect(agentIdFromDeepLink(`${scheme}://agent/agent%2Done`)).toBe("agent-one");
  });

  it.each([
    "https://agent/agent-1", "errand://settings/agent-1", "errand://agent/", "errand://agent//agent-1",
    "errand://agent/../agent-1", "errand://agent/agent-1/extra", "errand://agent/agent%2Fone", "errand://agent/%00",
    "errand://user@agent/agent-1", "errand://agent:443/agent-1", "errand://agent/agent-1?command=run", "errand://agent/agent-1#extra",
    "runta-crew://agent/agent%2Fone", "runta-crew://agent/agent-1?command=run", "not a url",
  ])("rejects links outside the narrow agent route: %s", (url) => {
    expect(agentIdFromDeepLink(url)).toBeUndefined();
  });
});
