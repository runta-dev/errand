import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntaCloudAgentsClient } from "./RuntaCloudAgentsClient";
import type { CloudRequest, DesktopBridge } from "@/shared/desktop";
import type { CloudStreamEvent } from "@/shared/desktop";
import type { ConversationEvent } from "@/domain/types";

afterEach(() => { delete window.runtaCrew; });

describe("RuntaCloudAgentsClient", () => {
  it("maps a missing local token to a normal authentication error", async () => {
    window.runtaCrew = { cloud: { request: async () => { throw new Error("Error invoking remote method 'cloud:request': Error: Runta API token is not configured"); }, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    await expect(new RuntaCloudAgentsClient().listAgents()).rejects.toMatchObject({ code: "unauthorized", message: "Authentication is required" });
  });

  it("maps the current Cloud Agents envelope and uses the managed provider for creation", async () => {
    const request = vi.fn(async ({ method, path }: CloudRequest) => {
      if (path.startsWith("/v1/agents?")) return { status: 200, body: { agents: [{ id: "agent-1", runtime_id: "agent-1", name: "Builder", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 2, latest_reply: { run_id: "run-1", text: "Latest agent reply", created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" } }] } };
      if (path === "/v1/model-providers") return { status: 200, body: { model_providers: [{ id: "provider-1", display_name: "Kimi", protocol: "openai_responses", default_model: "k3" }] } };
      if (method === "GET" && path === "/v1/agents/agent-1/runs?limit=100") return { status: 200, body: [
        { id: "run-2", agent_id: "agent-1", status: "failed", prompt: "Break it", result: null, error: "Tool failed", created_at: "2026-08-26T02:00:00Z", updated_at: "2026-08-26T02:00:01Z" },
        { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Build it", result: "Done", error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" },
      ] };
      if (method === "POST" && path === "/v1/agents") return { status: 201, body: { id: "agent-2", runtime_id: "agent-2", name: "Reviewer", status: "pending", created_at_unix_seconds: 3, updated_at_unix_seconds: 3 } };
      if (method === "PATCH" && path === "/v1/agents/agent-1") return { status: 200, body: { id: "agent-1", runtime_id: "agent-1", name: "Atlas", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 4 } };
      return { status: 404 };
    });
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const client = new RuntaCloudAgentsClient();
    expect((await client.listAgents())[0]).toEqual(expect.objectContaining({ id: "agent-1", name: "Builder", status: "idle", lastMessagePreview: "Latest agent reply", lastActiveAt: "2026-08-26T01:00:01Z" }));
    expect(await client.listModelProviders()).toEqual([{ id: "provider-1", name: "Kimi", protocol: "openai_responses", defaultModel: "k3" }]);
    expect((await client.getConversation("conversation-agent-1")).messages).toEqual([
      expect.objectContaining({ id: "run-1:user", role: "user", parts: [{ type: "text", text: "Build it" }] }),
      expect.objectContaining({ id: "run-1:agent", role: "agent", parts: [{ type: "text", text: "Done" }], streaming: false }),
      expect.objectContaining({ id: "run-2:user", role: "user", parts: [{ type: "text", text: "Break it" }] }),
      expect.objectContaining({ id: "run-2:agent", role: "system", parts: [{ type: "text", text: "Tool failed" }] }),
    ]);
    expect(await client.createAgent({ name: "Reviewer", modelProviderId: "provider-1" })).toEqual(expect.objectContaining({ id: "agent-2", status: "working" }));
    expect(await client.updateAgent("agent-1", { name: "Atlas" })).toEqual(expect.objectContaining({ id: "agent-1", name: "Atlas" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v1/agents", body: expect.objectContaining({ model_provider: { type: "managed", id: "provider-1" } }) }));
    expect(request).toHaveBeenCalledWith({ method: "PATCH", path: "/v1/agents/agent-1", body: { name: "Atlas" } });
  });

  it("translates the authenticated run SSE stream without exposing credentials", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "run-1", agent_id: "agent-1", status: "running", prompt: "Hello", result: null, error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" }] }));
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledWith("/v1/agents/agent-1/runs/run-1/events?after=-1", expect.any(Function)));
    streamListener?.({ event: "acp.event", id: "4", data: { params: { update: { sessionUpdate: "agent_message_chunk", content: { text: "Hi" } } } } });
    streamListener?.({ event: "acp.event", id: "5", data: { params: { update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Read", kind: "read", status: "in_progress" } } } });
    streamListener?.({ event: "acp.event", id: "6", data: { params: { update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", title: "Read", kind: "read", status: "completed" } } } });
    streamListener?.({ event: "run.status", id: "status:finished", data: { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "Hi", error: null } });
    expect(events).toContainEqual({ type: "message.delta", messageId: "run-1:agent", delta: "Hi" });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", title: "Reading file", kind: "file", status: "running" }) });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", status: "completed" }) });
    expect(events).toContainEqual(expect.objectContaining({ type: "message.updated", message: expect.objectContaining({ id: "run-1:agent", streaming: false }) }));
    expect(events).toContainEqual({ type: "message.completed", messageId: "run-1:agent" });
    subscription.unsubscribe();
  });
});
