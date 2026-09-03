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
      if (path.startsWith("/v2/agents?")) return { status: 200, body: { agents: [{ id: "agent-1", runtime_id: "agent-1", name: "Builder", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 2, latest_reply: { run_id: "run-1", text: "Latest agent reply", created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" } }] } };
      if (path === "/v2/model-providers") return { status: 200, body: { organization_id: "org-1", model_providers: [{ id: "provider-1", display_name: "Kimi", protocol: "openai_responses", default_model: "k3" }] } };
      if (method === "GET" && path === "/v2/agents/agent-1/runs?limit=100") return { status: 200, body: [
        { id: "run-2", agent_id: "agent-1", status: "failed", prompt: "Break it", result: null, error: "Tool failed", created_at: "2026-08-26T02:00:00Z", updated_at: "2026-08-26T02:00:01Z" },
        { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Build it", result: "Done", error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" },
      ] };
      if (method === "POST" && path === "/v2/agents") return { status: 201, body: { id: "agent-2", runtime_id: "agent-2", name: "Reviewer", status: "pending", created_at_unix_seconds: 3, updated_at_unix_seconds: 3 } };
      if (method === "GET" && path === "/v2/agents/agent-2") return { status: 200, body: { id: "agent-2", runtime_id: "agent-2", name: "Reviewer", status: "running", created_at_unix_seconds: 3, updated_at_unix_seconds: 4 } };
      if (method === "PATCH" && path === "/v2/agents/agent-1") return { status: 200, body: { id: "agent-1", runtime_id: "agent-1", name: "Atlas", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 4 } };
      return { status: 404 };
    });
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => { queueMicrotask(() => listener({ event: "stream.closed" })); return () => undefined; };
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const client = new RuntaCloudAgentsClient();
    expect((await client.listAgents())[0]).toEqual(expect.objectContaining({ id: "agent-1", name: "Builder", status: "idle", lastMessagePreview: "Latest agent reply", lastActiveAt: "2026-08-26T01:00:01Z" }));
    expect(await client.listModelProviders()).toEqual({ organizationId: "org-1", providers: [{ id: "provider-1", name: "Kimi", protocol: "openai_responses", defaultModel: "k3" }] });
    expect((await client.getConversation("conversation-agent-1")).messages).toEqual([
      expect.objectContaining({ id: "run-1:user", role: "user", parts: [{ type: "text", text: "Build it" }] }),
      expect.objectContaining({ id: "run-1:agent", role: "agent", parts: [{ type: "text", text: "Done" }], streaming: false }),
      expect.objectContaining({ id: "run-2:user", role: "user", parts: [{ type: "text", text: "Break it" }] }),
      expect.objectContaining({ id: "run-2:agent", role: "system", parts: [{ type: "text", text: "Tool failed" }] }),
    ]);
    expect(await client.createAgent({ name: "Reviewer", modelProviderId: "provider-1" })).toEqual(expect.objectContaining({ id: "agent-2", status: "idle" }));
    expect(await client.updateAgent("agent-1", { name: "Atlas" })).toEqual(expect.objectContaining({ id: "agent-1", name: "Atlas" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents", body: expect.objectContaining({ name: "Reviewer", system_prompt: expect.stringContaining("Do not proactively mention any underlying model, provider, Pi, harness, runtime, or implementation details"), initial_message: expect.stringContaining("Hi, I'm Reviewer."), model_provider: { type: "managed", id: "provider-1" } }) }));
    expect(request).toHaveBeenCalledWith({ method: "PATCH", path: "/v2/agents/agent-1", body: { name: "Atlas" } });
  });

  it("translates the authenticated run SSE stream without exposing credentials", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "run-1", agent_id: "agent-1", status: "running", prompt: "Hello", result: null, error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" }] }));
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledWith("/v2/agents/agent-1/runs/run-1/events?after=-1", expect.any(Function)));
    streamListener?.({ event: "acp.event", id: "4", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-1", content: { text: "Checking." } } } } });
    streamListener?.({ event: "acp.event", id: "5", data: { params: { update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Read", kind: "read", status: "in_progress" } } } });
    streamListener?.({ event: "acp.event", id: "6", data: { params: { update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", title: "Read", kind: "read", status: "completed" } } } });
    streamListener?.({ event: "acp.event", id: "7", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-2", content: { text: "Hi" } } } } });
    streamListener?.({ event: "acp.event", id: "8", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-2", content: { text: " there" } } } } });
    streamListener?.({ event: "run.status", id: "status:finished", data: { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "Hi there", error: null } });
    expect(events).toContainEqual({ type: "message.created", message: expect.objectContaining({ id: "run-1:agent:assistant-1", parts: [{ type: "text", text: "Checking." }], streaming: true }) });
    expect(events).toContainEqual({ type: "message.completed", messageId: "run-1:agent:assistant-1", notify: false });
    expect(events).toContainEqual({ type: "message.created", message: expect.objectContaining({ id: "run-1:agent:assistant-2", parts: [{ type: "text", text: "Hi" }], streaming: true }) });
    expect(events).toContainEqual({ type: "message.delta", messageId: "run-1:agent:assistant-2", delta: " there" });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", title: "Reading file", kind: "file", status: "running" }) });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", title: "Reading file", kind: "file", status: "completed" }) });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "message.updated", message: expect.objectContaining({ id: "run-1:agent" }) }));
    expect(events).toContainEqual({ type: "message.completed", messageId: "run-1:agent:assistant-2", notify: true });
    subscription.unsubscribe();
  });

  it("shows the initial greeting without exposing its internal prompt", async () => {
    const request = vi.fn(async () => ({ status: 200, body: [{
      id: "greeting-run", agent_id: "agent-1", status: "finished",
      prompt: "Introduce yourself briefly using only the Runta Crew identity and name from your system instructions. Do not mention any model, provider, Pi, harness, runtime, or implementation details. Do not use tools or ask a question.",
      result: "Hi, I’m ready to help.", error: null,
      created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:01Z",
    }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => { queueMicrotask(() => listener({ event: "stream.closed" })); return () => undefined; };
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };

    const conversation = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(conversation.messages).toEqual([
      expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "Hi, I’m ready to help." }] }),
    ]);
  });

  it("waits for the complete initial Agent reply before focusing", async () => {
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "greeting-run", agent_id: "agent-1", status: "finished", result: "I am Atlas." }] }));
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };

    const messages = await new RuntaCloudAgentsClient().waitForInitialReply("agent-1");

    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/v2/agents/agent-1/runs?limit=1" });
    expect(messages).toEqual([expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "I am Atlas." }], streaming: false })]);
  });

  it("discovers a locally created run immediately instead of waiting for fallback polling", async () => {
    let created = false;
    const subscribe = vi.fn(() => () => undefined);
    const request = vi.fn(async ({ method }: CloudRequest) => method === "POST"
      ? (created = true, { status: 201, body: { id: "run-new", agent_id: "agent-1", status: "pending", prompt: "Start", result: null, error: null } })
      : { status: 200, body: created ? [{ id: "run-new", agent_id: "agent-1", status: "pending", prompt: "Start", result: null, error: null }] : [] });
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const client = new RuntaCloudAgentsClient();
    const subscription = client.subscribeToConversationEvents("conversation-agent-1", () => undefined);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await client.sendMessage({ conversationId: "conversation-agent-1", text: "Start" });
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledWith("/v2/agents/agent-1/runs/run-new/events?after=-1", expect.any(Function)));
    await client.sendMessage({ conversationId: "conversation-agent-1", text: "Steer" });
    expect(request).toHaveBeenCalledWith({ method: "POST", path: "/v2/agents/agent-1/runs/run-new/follow-ups", body: { prompt: "Steer" } });
    subscription.unsubscribe();
  });

  it("establishes an initial run baseline without duplicating loaded history", async () => {
    const request = vi.fn(async () => ({ status: 200, body: [
      { id: "run-new", agent_id: "agent-1", status: "finished", prompt: "New prompt", result: "Newest reply", error: null, created_at: "2026-08-26T02:00:00Z", updated_at: "2026-08-26T02:00:01Z" },
      { id: "run-old", agent_id: "agent-1", status: "finished", prompt: "Old prompt", result: "Old reply", error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" },
    ] }));
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const replies: string[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => {
      if (event.type === "message.created" && event.message.role === "agent") replies.push(event.message.parts[0]?.type === "text" ? event.message.parts[0].text : "");
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(replies).toEqual([]);
    subscription.unsubscribe();
  });

  it("replays historical assistant messages by ACP message id instead of the aggregated run result", async () => {
    const request = vi.fn(async ({ path }: CloudRequest) => path.includes("/artifacts?") ? { status: 200, body: [{ id: "artifact-1", run_id: "run-history", name: "chart.png", media_type: "image/png", size: 42 }] } : ({ status: 200, body: [{
      id: "run-history", agent_id: "agent-1", status: "finished", prompt: "Research it",
      result: "Checking.Browsing.Done with a giant aggregate", error: null,
      created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z",
    }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "run.status", data: { status: "finished" } });
        listener({ event: "acp.event", id: "1", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-1", content: { text: "Checking." } } } } });
        listener({ event: "acp.event", id: "2", data: { params: { update: { sessionUpdate: "tool_call", toolCallId: "tool-1" } } } });
        listener({ event: "acp.event", id: "3", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-2", content: { text: "Done" } } } } });
        listener({ event: "acp.event", id: "4", data: { params: { update: { sessionUpdate: "agent_message_chunk", messageId: "assistant-2", content: { text: " now." } } } } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    });
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };

    const result = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(result.messages).toEqual([
      expect.objectContaining({ id: "run-history:user", role: "user", parts: [{ type: "text", text: "Research it" }] }),
      expect.objectContaining({ id: "run-history:agent:assistant-2", role: "agent", parts: [{ type: "text", text: "Done now." }, { type: "attachment", attachment: { id: "artifact-1", name: "chart.png", size: 42, mediaType: "image/png", source: "cloud", agentId: "agent-1" } }], streaming: false }),
    ]);
    expect(JSON.stringify(result.messages)).not.toContain("Checking.");
    expect(JSON.stringify(result.messages)).not.toContain("giant aggregate");
  });
});
