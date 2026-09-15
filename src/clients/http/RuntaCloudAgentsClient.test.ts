import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntaCloudAgentsClient } from "./RuntaCloudAgentsClient";
import type { CloudRequest, DesktopBridge } from "@/shared/desktop";
import type { CloudStreamEvent } from "@/shared/desktop";
import type { ConversationEvent } from "@/domain/types";

afterEach(() => { delete window.runtaCrew; });

describe("RuntaCloudAgentsClient", () => {
  it("creates an authenticated VNC session with the server-provided websocket protocols", async () => {
    const request = vi.fn(async () => ({ status: 201, body: { channels: { vnc: { websocket_url: "wss://vnc.example.test/", protocols: ["binary", "vnc-ticket.ticket"] } } } }));
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined } } as unknown as DesktopBridge;

    await expect(new RuntaCloudAgentsClient().openComputer("agent/one")).resolves.toEqual({ url: "wss://vnc.example.test/", protocols: ["binary", "vnc-ticket.ticket"], mode: "remote" });
    expect(request).toHaveBeenCalledWith({ method: "POST", path: "/v2/agents/agent%2Fone/computer-sessions" });
  });

  it("maps a missing local token to a normal authentication error", async () => {
    window.runtaCrew = { cloud: { request: async () => { throw new Error("Error invoking remote method 'cloud:request': Error: Runta API token is not configured"); }, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    await expect(new RuntaCloudAgentsClient().listAgents()).rejects.toMatchObject({ code: "unauthorized", message: "Authentication is required" });
  });

  it("uses neutral cloud availability copy for transport failures", async () => {
    window.runtaCrew = { cloud: { request: async () => { throw new Error("fetch failed"); }, subscribe: () => () => undefined } } as unknown as DesktopBridge;
    await expect(new RuntaCloudAgentsClient().listAgents()).rejects.toMatchObject({ code: "network", message: "Cloud agents are unavailable" });
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
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents", body: expect.objectContaining({ name: "Reviewer", system_prompt: expect.stringContaining("the user's Errand agent"), initial_message: expect.stringContaining("Hi, I'm Reviewer, your Errand agent."), model_provider: { type: "managed", id: "provider-1" } }) }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/v2/agents", body: expect.objectContaining({ initial_message: expect.stringMatching(/^\[Runta Crew bootstrap\] \[Errand\] "Reviewer"\n/) }) }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/v2/agents", body: expect.objectContaining({ system_prompt: expect.stringContaining("available files, terminal, browser, and computer tools") }) }));
    expect(request).toHaveBeenCalledWith({ method: "PATCH", path: "/v2/agents/agent-1", body: { name: "Atlas" } });
  });

  it("sends the saved prompt with literal, quoted agent names", async () => {
    const agent = { id: "agent-custom", runtime_id: "agent-custom", name: '$& "Atlas"', status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 1 };
    const request = vi.fn(async () => ({ status: 200, body: agent }));
    window.runtaCrew = { cloud: { request } } as unknown as DesktopBridge;
    await new RuntaCloudAgentsClient().createAgent({ name: agent.name, modelProviderId: "provider-1", systemPrompt: "You are {agent_name}. Verify your work, {agent_name}." });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents", body: expect.objectContaining({ system_prompt: `You are ${JSON.stringify(agent.name)}. Verify your work, ${JSON.stringify(agent.name)}.` }) }));
  });

  it("translates the authenticated run SSE stream without exposing credentials", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "run-1", agent_id: "agent-1", status: "running", prompt: "Hello", result: null, error: null, created_at: "2026-08-26T01:00:00Z", updated_at: "2026-08-26T01:00:01Z" }] }));
    window.runtaCrew = { cloud: { request, subscribe }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledWith("/v2/agents/agent-1/runs/run-1/events?after=-1", expect.any(Function)));
    streamListener?.({ event: "pi.event", id: "4", data: { type: "message_update", message: { id: "assistant-1" }, assistantMessageEvent: { type: "text_delta", delta: "Checking." } } });
    streamListener?.({ event: "pi.event", id: "5", data: { type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" } } });
    streamListener?.({ event: "pi.event", id: "6", data: { type: "tool_execution_end", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" }, result: { content: [{ type: "text", text: "README contents" }] }, isError: false } });
    streamListener?.({ event: "pi.event", id: "7", data: { type: "message_update", message: { id: "assistant-2" }, assistantMessageEvent: { type: "text_delta", delta: "Hi" } } });
    streamListener?.({ event: "pi.event", id: "8", data: { type: "message_update", message: { id: "assistant-2" }, assistantMessageEvent: { type: "text_delta", delta: " there" } } });
    streamListener?.({ event: "run.status", id: "status:finished", data: { id: "run-1", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "Hi there", error: null } });
    streamListener?.({ event: "stream.closed" });
    expect(events).toContainEqual({ type: "message.created", message: expect.objectContaining({ id: "run-1:agent:assistant-1", parts: [{ type: "text", text: "Checking." }], streaming: true }) });
    expect(events).toContainEqual({ type: "message.completed", messageId: "run-1:agent:assistant-1", notify: false });
    expect(events).toContainEqual({ type: "message.created", message: expect.objectContaining({ id: "run-1:agent:assistant-2", parts: [{ type: "text", text: "Hi" }], streaming: true }) });
    expect(events).toContainEqual({ type: "message.delta", messageId: "run-1:agent:assistant-2", delta: " there" });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", title: "read README.md", kind: "file", status: "running" }) });
    expect(events).toContainEqual({ type: "activity.updated", activity: expect.objectContaining({ id: "tool:tool-1", title: "read README.md", output: "README contents", kind: "file", status: "completed" }) });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "message.updated", message: expect.objectContaining({ id: "run-1:agent" }) }));
    expect(events).toContainEqual({ type: "message.completed", messageId: "run-1:agent:assistant-2", notify: true });
    subscription.unsubscribe();
  });

  it("shows an upstream assistant error when a finished status precedes the Pi error event", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    let finished = false;
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "run-error", agent_id: "agent-1", status: finished ? "finished" : "running", prompt: "Hello", result: finished ? "" : null, error: null }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());

    finished = true;
    streamListener?.({ event: "run.status", data: { status: "finished", result: "", error: null } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: '404 {"error":{"message":"The requested resource was not found","type":"resource_not_found_error"}}' } } });
    streamListener?.({ event: "stream.closed" });

    const failure = { id: "run-error:agent", role: "system", parts: [{ type: "text", text: 'Agent reply failed: 404 {"error":{"message":"The requested resource was not found","type":"resource_not_found_error"}}' }] };
    expect(events.filter((event) => event.type === "message.updated").at(-1)).toMatchObject({ type: "message.updated", message: failure });
    expect(events.at(-1)).toEqual({ type: "message.completed", messageId: "run-error:agent" });

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(events.filter((event) => event.type === "message.updated").at(-1)).toMatchObject({ type: "message.updated", message: failure });
    subscription.unsubscribe();
  });

  it.each([false, true])("keeps a retry working and shows its successful reply, with terminal-first replay=%s", async (terminalFirst) => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "retry", agent_id: "agent-1", status: "running", prompt: "Hello", result: null, error: null }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    if (terminalFirst) streamListener?.({ event: "run.status", data: { status: "finished", result: "", error: null } });
    streamListener?.({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Failed partial" } } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 status code (no body)" } } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "aborted", errorMessage: "Request aborted" } } });
    streamListener?.({ event: "pi.event", data: { type: "agent_settled" } });
    expect(events.some((event) => event.type === "message.completed")).toBe(false);
    expect(events.some((event) => event.type === "message.updated" && event.message.role === "system")).toBe(false);
    streamListener?.({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Recovered" } } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Recovered" }] } } });
    if (!terminalFirst) streamListener?.({ event: "run.status", data: { status: "finished", result: "Recovered", error: null } });
    expect(events.some((event) => event.type === "message.completed")).toBe(false);
    streamListener?.({ event: "stream.closed" });
    expect(events).toContainEqual({ type: "message.updated", message: expect.objectContaining({ id: "retry:agent:active", parts: [{ type: "text", text: "Recovered" }], streaming: true }) });
    expect(events).toContainEqual({ type: "message.completed", messageId: "retry:agent:active", notify: true });
    expect(events.some((event) => event.type === "message.updated" && event.message.role === "system")).toBe(false);
    subscription.unsubscribe();
  });

  it("does not finish a retry on network EOF and uses the final polling result", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    let finished = false;
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "retry", agent_id: "agent-1", status: finished ? "finished" : "running", prompt: "Hello", result: finished ? "Recovered from polling" : null, error: null }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 temporary" } } });
    streamListener?.({ event: "error", data: "network interrupted" });
    streamListener?.({ event: "stream.closed" });
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(events.some((event) => event.type === "message.completed" || (event.type === "message.updated" && event.message.role === "system"))).toBe(false);
    finished = true;
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(events).toContainEqual({ type: "message.updated", message: expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "Recovered from polling" }], streaming: false }) });
    expect(events).toContainEqual({ type: "message.completed", messageId: "retry:agent" });
    expect(events.some((event) => event.type === "message.updated" && event.message.role === "system")).toBe(false);
    subscription.unsubscribe();
  });

  it("finishes from an authoritative polled reply when the SSE connection stays open", async () => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    let finished = false;
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "retry", agent_id: "agent-1", status: finished ? "finished" : "running", prompt: "Hello", result: finished ? "Final polled answer" : null, error: null }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    streamListener?.({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Old partial" } } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 earlier attempt" } } });
    finished = true;
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(events).toContainEqual({ type: "message.updated", message: expect.objectContaining({ id: "retry:agent", role: "agent", parts: [{ type: "text", text: "Final polled answer" }], streaming: false }) }));
    expect(events).toContainEqual({ type: "message.completed", messageId: "retry:agent" });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 stale replay" } } });
    expect(events.some((event) => event.type === "message.updated" && event.message.role === "system")).toBe(false);
    subscription.unsubscribe();
  });

  it.each(["failed", "cancelled"])("preserves authoritative live %s state over a pending attempt error", async (status) => {
    let streamListener: ((event: CloudStreamEvent) => void) | undefined;
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "terminal", agent_id: "agent-1", status: "running", prompt: "Hello" }] }));
    const subscribe = vi.fn((_path: string, listener: (event: CloudStreamEvent) => void) => { streamListener = listener; return () => undefined; });
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const events: ConversationEvent[] = [];
    const subscription = new RuntaCloudAgentsClient().subscribeToConversationEvents("conversation-agent-1", (event) => events.push(event));
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 earlier attempt" } } });
    streamListener?.({ event: "run.status", data: { status, result: "", error: status === "failed" ? "Final supervisor failure" : null } });
    streamListener?.({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "stop" } } });
    streamListener?.({ event: "stream.closed" });
    expect(events.filter((event) => event.type === "message.updated").at(-1)).toMatchObject({ message: { role: "system", parts: [{ type: "text", text: status === "failed" ? "Final supervisor failure" : "Run cancelled." }] } });
    subscription.unsubscribe();
  });

  it.each(["", "Old partial plus final aggregate"])("clears a retry error in historical replay with persisted result %j", async (result) => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [] : [{ id: "retry", agent_id: "agent-1", status: "finished", prompt: "Hello", result, error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "run.status", data: { status: "finished", result } });
        listener({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Failed partial" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 temporary" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "aborted" } } });
        listener({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Recovered reply" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "stop" } } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");
    expect(messages).toEqual([expect.objectContaining({ role: "user" }), expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "Recovered reply" }] })]);
  });

  it.each(["error", "stream.closed"])("protects a saved successful result from an earlier replay error ending with %s", async (endEvent) => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [] : [{ id: "retry", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "Saved final answer", error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 earlier attempt" } } });
        listener({ event: endEvent });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");
    expect(messages.at(-1)).toMatchObject({ role: "agent", parts: [{ type: "text", text: "Saved final answer" }] });
  });

  it.each(["failed", "cancelled"])("preserves historical terminal %s state after later successful assistant replay", async (status) => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [] : [{ id: "retry", agent_id: "agent-1", status, prompt: "Hello", result: "", error: status === "failed" ? "Final supervisor failure" : null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "502 earlier attempt" } } });
        listener({ event: "pi.event", data: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Earlier successful output" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", stopReason: "stop" } } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;
    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");
    expect(messages.at(-1)).toMatchObject({ role: "system", parts: [{ type: "text", text: status === "failed" ? "Final supervisor failure" : "Run cancelled." }] });
  });

  it("recovers a persisted Pi assistant failure when replaying an empty finished run", async () => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [] : [{ id: "run-error", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "", error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "run.status", data: { status: "finished", result: "", error: null } });
        listener({ event: "pi.event", data: { type: "message_start", message: { role: "assistant", content: [] } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "404: The requested resource was not found" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role: "assistant", content: [], stopReason: "aborted", errorMessage: "Request aborted" } } });
        listener({ event: "pi.event", data: { type: "agent_settled" } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;

    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(messages).toEqual([
      expect.objectContaining({ role: "user", parts: [{ type: "text", text: "Hello" }] }),
      expect.objectContaining({ id: "run-error:agent", role: "system", parts: [{ type: "text", text: "Agent reply failed: 404: The requested resource was not found" }] }),
    ]);
  });

  it("explains an empty finished reply and preserves its output attachments", async () => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [{ id: "artifact-1", run_id: "run-empty", name: "result.png", media_type: "image/png", size: 42 }] : [{ id: "run-empty", agent_id: "agent-1", status: "finished", prompt: "Render it", result: "", error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => { queueMicrotask(() => listener({ event: "stream.closed" })); return () => undefined; };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;

    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(messages[1]).toMatchObject({ role: "system", parts: [{ type: "text", text: "The Agent finished without returning a reply." }, { type: "attachment", attachment: { id: "artifact-1" } }] });
  });

  it.each(["user", "tool"])("recovers a real reply from events without an empty-result warning or a %s error", async (role) => {
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.includes("/artifacts?") ? [] : [{ id: "run-recovered", agent_id: "agent-1", status: "finished", prompt: "Hello", result: "", error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        listener({ event: "run.status", data: { status: "finished", result: "", error: null } });
        listener({ event: "pi.event", data: { type: "message_update", message: { id: "assistant-1", role: "assistant" }, assistantMessageEvent: { type: "text_delta", delta: "Recovered reply" } } });
        listener({ event: "pi.event", data: { type: "message_end", message: { role, stopReason: "error", errorMessage: "Not an assistant reply failure" } } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;

    const { messages } = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(messages).toEqual([
      expect.objectContaining({ role: "user", parts: [{ type: "text", text: "Hello" }] }),
      expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "Recovered reply" }], streaming: false }),
    ]);
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

  it("does not expose workspace attachment context in replayed user messages", async () => {
    const request = vi.fn(async ({ path }: CloudRequest) => path.includes("/artifacts?")
      ? ({ status: 200, body: [{ id: "artifact-1", run_id: "image-run", name: "runta-crew-input-1-one.png", media_type: "image/png", size: 3 }] })
      : ({ status: 200, body: [{ id: "image-run", agent_id: "agent-1", status: "finished", prompt: "Compare these images\n\n[Runta Crew attachment context]\n- .runta-crew/attachments/one.png\n- .runta-crew/attachments/two.png", result: "They differ.", error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => { queueMicrotask(() => listener({ event: "stream.closed" })); return () => undefined; };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;

    const conversation = await new RuntaCloudAgentsClient().getConversation("conversation-agent-1");

    expect(conversation.messages[0]).toEqual(expect.objectContaining({ role: "user", parts: [{ type: "text", text: "Compare these images" }, { type: "attachment", attachment: expect.objectContaining({ id: "artifact-1", name: "one.png", source: "cloud" }) }] }));
    expect(conversation.messages[1]?.parts).toEqual([{ type: "text", text: "They differ." }]);
    expect(JSON.stringify(conversation.messages)).not.toContain(".runta-crew/attachments");
  });

  it("waits for the complete initial Agent reply before focusing", async () => {
    const request = vi.fn(async () => ({ status: 200, body: [{ id: "greeting-run", agent_id: "agent-1", status: "finished", result: "I am Atlas." }] }));
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined }, settings: {} as DesktopBridge["settings"], credentials: {} as DesktopBridge["credentials"], attachments: {} as DesktopBridge["attachments"], notifications: {} as DesktopBridge["notifications"], deepLinks: {} as DesktopBridge["deepLinks"], getVersion: async () => "test", openExternal: async () => undefined };

    const messages = await new RuntaCloudAgentsClient().waitForInitialReply("agent-1");

    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/v2/agents/agent-1/runs?limit=1" });
    expect(messages).toEqual([expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "I am Atlas." }], streaming: false })]);
  });

  it("returns the deterministic Errand greeting without another cloud request", async () => {
    const request = vi.fn();
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined } } as unknown as DesktopBridge;

    const messages = await new RuntaCloudAgentsClient().waitForInitialReply("agent-1", "Atlas");

    expect(request).not.toHaveBeenCalled();
    expect(messages).toEqual([expect.objectContaining({ role: "agent", parts: [{ type: "text", text: "Hello, I'm Atlas, and I'm all set.\nWhat can I help you tackle?" }], streaming: false })]);
    expect(messages[0]?.parts[0]?.type === "text" ? messages[0].parts[0].text.split("\n") : []).toHaveLength(2);
  });

  it("uses Errand in newly generated branded greetings", async () => {
    const request = vi.fn();
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined } } as unknown as DesktopBridge;

    const messages = await new RuntaCloudAgentsClient().waitForInitialReply("agent-0", "Atlas");

    expect(messages[0]?.parts).toEqual([{ type: "text", text: "Hi, I'm Atlas, your Errand agent.\nPoint me at a task and I'll get started." }]);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["new synthetic", "legacy synthetic", "genuine model", "unconfirmed"] as const)("preserves the correct brand when replaying a %s bootstrap", async (kind) => {
    const legacyReply = "Hi, I'm Atlas, your Runta Crew agent.";
    const newPrompt = `[Runta Crew bootstrap] [Errand] "Atlas"\nReply with exactly these two short sentences: "Hi, I'm Atlas, your Errand agent." "Tell me what you're working on and I'll jump in." Do not add anything else.`;
    const prompt = kind === "legacy synthetic" ? `[Runta Crew bootstrap] Reply with exactly these two short sentences: "Hi, I'm Atlas, your Runta Crew agent." "Tell me what you're working on and I'll jump in." Do not add anything else.` : newPrompt;
    const request = vi.fn(async ({ path }: CloudRequest) => ({ status: 200, body: path.startsWith("/v2/agents?") ? { agents: [{ id: "agent-0", runtime_id: "agent-0", name: "Atlas", status: "running", created_at_unix_seconds: 1, updated_at_unix_seconds: 2, latest_reply: { run_id: "bootstrap-run", text: legacyReply } }] } : path.includes("/artifacts?") ? [] : [{ id: "bootstrap-run", agent_id: "agent-0", status: "finished", prompt, result: legacyReply, error: null }] }));
    const subscribe = (_path: string, listener: (event: CloudStreamEvent) => void) => {
      queueMicrotask(() => {
        // The REST response omits stop_reason; only this run's SSE snapshot proves it was synthetic.
        if (kind !== "unconfirmed") listener({ event: "run.status", data: { id: "bootstrap-run", status: "finished", stop_reason: kind === "genuine model" ? "end_turn" : "synthetic" } });
        if (kind === "genuine model") listener({ event: "pi.event", data: { type: "message_update", message: { id: "original-reply" }, assistantMessageEvent: { type: "text_delta", delta: legacyReply } } });
        listener({ event: "stream.closed" });
      });
      return () => undefined;
    };
    window.runtaCrew = { cloud: { request, subscribe } } as unknown as DesktopBridge;

    const client = new RuntaCloudAgentsClient();
    expect((await client.listAgents())[0].lastMessagePreview).toBe(legacyReply);
    const { messages } = await client.getConversation("conversation-agent-0");

    const text = kind === "new synthetic" ? "Hi, I'm Atlas, your Errand agent.\nPoint me at a task and I'll get started." : legacyReply;
    expect(messages).toEqual([expect.objectContaining({ role: "agent", parts: [{ type: "text", text }], streaming: false })]);
    expect((await client.listAgents())[0].lastMessagePreview).toBe(text);
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

  it("sends multiple images as native prompt input without workspace upload", async () => {
    const request = vi.fn(async ({ method, path, body }: CloudRequest) => {
      if (method === "GET") return { status: 200, body: [] };
      if (path.endsWith("/artifacts")) { const value = body as { name: string; media_type: string; content_base64: string }; return { status: 201, body: { id: `artifact-${value.name}`, run_id: "run-image", name: value.name, media_type: value.media_type, size: atob(value.content_base64).length } }; }
      return { status: 201, body: { id: "run-image", agent_id: "agent-1", status: "pending", prompt: "Describe it", result: null, error: null } };
    });
    window.runtaCrew = { cloud: { request, subscribe: () => () => undefined }, attachments: { choose: async () => [], addImage: async () => ({ id: "unused", name: "unused.png", size: 3, mediaType: "image/png" }), read: async (id: string) => id === "image-1" ? ({ name: "image.png", mediaType: "image/png", base64: "YWJj" }) : ({ name: "second.jpg", mediaType: "image/jpeg", base64: "ZGVm" }) } } as unknown as DesktopBridge;

    const message = await new RuntaCloudAgentsClient().sendMessage({ conversationId: "conversation-agent-1", text: "Compare them", attachments: [{ id: "image-1", name: "image.png", size: 3, mediaType: "image/png", source: "local-selection" }, { id: "image-2", name: "second.jpg", size: 3, mediaType: "image/jpeg", source: "local-selection" }] });

    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "PUT" }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents/agent-1/runs", body: expect.objectContaining({ prompt: expect.stringContaining("Compare them"), images: [{ type: "image", data: "YWJj", mime_type: "image/png" }, { type: "image", data: "ZGVm", mime_type: "image/jpeg" }] }) }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents/agent-1/artifacts", body: expect.objectContaining({ run_id: "run-image", name: "runta-crew-input-1-image.png", content_base64: "YWJj" }) }));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/v2/agents/agent-1/artifacts", body: expect.objectContaining({ run_id: "run-image", name: "runta-crew-input-2-image.jpg", content_base64: "ZGVm" }) }));
    expect(message.parts.filter((part) => part.type === "attachment").every((part) => part.attachment.source === "cloud")).toBe(true);
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
        listener({ event: "pi.event", id: "1", data: { type: "message_update", message: { id: "assistant-1" }, assistantMessageEvent: { type: "text_delta", delta: "Checking." } } });
        listener({ event: "pi.event", id: "2", data: { type: "tool_execution_start", toolCallId: "tool-1", toolName: "read", args: { path: "README.md" } } });
        listener({ event: "pi.event", id: "3", data: { type: "message_update", message: { id: "assistant-2" }, assistantMessageEvent: { type: "text_delta", delta: "Done" } } });
        listener({ event: "pi.event", id: "4", data: { type: "message_update", message: { id: "assistant-2" }, assistantMessageEvent: { type: "text_delta", delta: " now." } } });
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
