import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntaCloudAgentsClient } from "./RuntaCloudAgentsClient";
import type { DesktopBridge } from "@/shared/desktop";

afterEach(() => { delete window.runtaCrew; });

describe("RuntaCloudAgentsClient", () => {
  it("maps the current Cloud Agents envelope and uses the managed provider for creation", async () => {
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => {
      if (path.startsWith("/v1/agents?")) return { status: 200, body: { agents: [{ id: "agent-1", runtime_id: "agent-1", name: "Builder", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 2 }] } };
      if (path === "/v1/model-providers") return { status: 200, body: { model_providers: [{ id: "provider-1" }] } };
      if (method === "POST" && path === "/v1/agents") return { status: 201, body: { id: "agent-2", runtime_id: "agent-2", name: "Reviewer", status: "pending", created_at_unix_seconds: 3, updated_at_unix_seconds: 3 } };
      return { status: 404 };
    });
    window.runtaCrew = { cloud: { request }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const client = new RuntaCloudAgentsClient();
    expect((await client.listAgents())[0]).toEqual(expect.objectContaining({ id: "agent-1", name: "Builder", status: "idle" }));
    expect(await client.createAgent({ name: "Reviewer", role: "Review", goal: "Review code" })).toEqual(expect.objectContaining({ id: "agent-2", status: "working" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v1/agents", body: expect.objectContaining({ model_provider: { type: "managed", id: "provider-1" } }) }));
  });
});
