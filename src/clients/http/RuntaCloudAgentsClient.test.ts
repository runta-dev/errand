import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntaCloudAgentsClient } from "./RuntaCloudAgentsClient";
import type { DesktopBridge } from "@/shared/desktop";

afterEach(() => { delete window.runtaCrew; });

describe("RuntaCloudAgentsClient", () => {
  it("maps the current Cloud Agents envelope and uses the managed provider for creation", async () => {
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => {
      if (path.startsWith("/v1/agents?")) return { status: 200, body: { agents: [{ id: "agent-1", runtime_id: "agent-1", name: "Builder", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 2 }] } };
      if (path === "/v1/model-providers") return { status: 200, body: { model_providers: [{ id: "provider-1", display_name: "Kimi", protocol: "openai_responses", default_model: "k3" }] } };
      if (method === "GET" && path === "/v1/agents/agent-1/runs?limit=100") return { status: 200, body: [
        { id: "run-2", agent_id: "agent-1", status: "failed", prompt: "Break it", result: null, error: "Tool failed", created_at: "2026-08-26T02:00:00Z", updated_at: "2026-08-26T02:00:01Z" },
        { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Build it", result: "Done", error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" },
      ] };
      if (method === "POST" && path === "/v1/agents") return { status: 201, body: { id: "agent-2", runtime_id: "agent-2", name: "Reviewer", status: "pending", created_at_unix_seconds: 3, updated_at_unix_seconds: 3 } };
      return { status: 404 };
    });
    window.runtaCrew = { cloud: { request }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const client = new RuntaCloudAgentsClient();
    expect((await client.listAgents())[0]).toEqual(expect.objectContaining({ id: "agent-1", name: "Builder", status: "idle" }));
    expect(await client.listModelProviders()).toEqual([{ id: "provider-1", name: "Kimi", protocol: "openai_responses", defaultModel: "k3" }]);
    expect((await client.getConversation("conversation-agent-1")).messages).toEqual([
      expect.objectContaining({ id: "run-1:user", role: "user", parts: [{ type: "text", text: "Build it" }] }),
      expect.objectContaining({ id: "run-1:agent", role: "agent", parts: [{ type: "text", text: "Done" }], streaming: false }),
      expect.objectContaining({ id: "run-2:user", role: "user", parts: [{ type: "text", text: "Break it" }] }),
      expect.objectContaining({ id: "run-2:agent", role: "system", parts: [{ type: "text", text: "Tool failed" }] }),
    ]);
    expect(await client.createAgent({ name: "Reviewer", modelProviderId: "provider-1" })).toEqual(expect.objectContaining({ id: "agent-2", status: "working" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v1/agents", body: expect.objectContaining({ model_provider: { type: "managed", id: "provider-1" } }) }));
  });
});
