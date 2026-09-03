import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import type { Agent, ConversationEvent, Message } from "@/domain/types";
import { useCrewController } from "./useCrewController";

const agent = (id: string, name: string): Agent => ({ id, name, role: "Cloud coding agent", goal: name, status: "idle", avatar: name[0]!, lastActiveAt: new Date(0).toISOString(), unreadCount: 0, computerId: id });

describe("useCrewController", () => {
  it("refreshes the model-provider catalog on demand", async () => {
    let providers = [] as Awaited<ReturnType<CloudAgentsClient["listModelProviders"]>>["providers"];
    const listModelProviders = vi.fn(async () => ({ organizationId: "org-test", providers }));
    const client = { listModelProviders, listAgents: async () => [] } as unknown as CloudAgentsClient;
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    providers = [{ id: "provider-1", name: "OpenAI", protocol: "openai_responses" }];
    await act(async () => { await result.current.refreshModelProviders(); });
    expect(result.current.modelProviders).toEqual(providers);
    expect(listModelProviders).toHaveBeenCalledTimes(2);
  });

  it("does not start Cloud Agents requests until authentication is enabled", async () => {
    const listAgents = vi.fn(); const listModelProviders = vi.fn();
    const client = { listAgents, listModelProviders } as unknown as CloudAgentsClient;
    const { result } = renderHook(() => useCrewController(client, false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listAgents).not.toHaveBeenCalled();
    expect(listModelProviders).not.toHaveBeenCalled();
    expect(result.current.connection).toBe("disconnected");
  });

  it("never lets the previous agent overwrite a newly selected conversation", async () => {
    let resolveAtlas!: (value: { conversation: { id: string; agentId: string; title: string; updatedAt: string }; messages: Message[] }) => void;
    const atlasConversation = new Promise<Parameters<typeof resolveAtlas>[0]>((resolve) => { resolveAtlas = resolve; });
    const listeners = new Map<string, (event: ConversationEvent) => void>();
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => [agent("atlas", "Atlas"), agent("scout", "Scout")],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date(0).toISOString() }],
      getConversation: async (id) => id === "conversation-atlas" ? atlasConversation : { conversation: { id, agentId: "scout", title: "Scout", updatedAt: new Date(0).toISOString() }, messages: [] },
      sendMessage: async (input) => ({ id: "sent", conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date(0).toISOString() }),
      subscribeToConversationEvents: (id, listener) => { listeners.set(id, listener); return { unsubscribe: () => undefined }; },
      listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); },
      getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("atlas"));
    act(() => result.current.setSelectedAgentId("scout"));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("scout"));
    expect(result.current.messages).toEqual([]);

    act(() => listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "late", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Atlas reply" }], createdAt: new Date(0).toISOString() } }));
    act(() => resolveAtlas({ conversation: { id: "conversation-atlas", agentId: "atlas", title: "Atlas", updatedAt: new Date(0).toISOString() }, messages: [{ id: "late-fetch", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Atlas fetch" }], createdAt: new Date(0).toISOString() }] }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages).toEqual([]);
  });

  it("restores a fresh per-agent snapshot without fetching the conversation again", async () => {
    const getConversation = vi.fn(async (id: string) => ({ conversation: { id, agentId: id.endsWith("atlas") ? "atlas" : "scout", title: id, updatedAt: new Date(0).toISOString() }, messages: [{ id: `${id}-message`, conversationId: id, role: "agent" as const, parts: [{ type: "text" as const, text: id.endsWith("atlas") ? "Atlas cached" : "Scout cached" }], createdAt: new Date(0).toISOString() }] }));
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => [agent("atlas", "Atlas"), agent("scout", "Scout")],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date(0).toISOString() }], getConversation,
      sendMessage: async (input) => ({ id: "sent", conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date(0).toISOString() }), subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Atlas cached" }));
    act(() => result.current.setSelectedAgentId("scout"));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Scout cached" }));
    act(() => result.current.setSelectedAgentId("atlas"));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Atlas cached" }));
    expect(getConversation.mock.calls.map(([id]) => id)).toEqual(["conversation-atlas", "conversation-scout"]);
  });

  it("optimistically renders the user message and working agent before the request resolves", async () => {
    let resolveSend!: (message: Message) => void;
    const pendingSend = new Promise<Message>((resolve) => { resolveSend = resolve; });
    const sendMessage = vi.fn(async () => pendingSend);
    const listeners = new Map<string, (event: ConversationEvent) => void>();
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => [{ ...agent("atlas", "Atlas"), lastMessagePreview: "Old server reply" }],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date(0).toISOString() }], getConversation: async (id) => ({ conversation: { id, agentId: "atlas", title: "Atlas", updatedAt: new Date(0).toISOString() }, messages: [] }),
      sendMessage, subscribeToConversationEvents: (id, listener) => { listeners.set(id, listener); return { unsubscribe: () => undefined }; }, listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("atlas"));
    await waitFor(() => expect(listeners.has("conversation-atlas")).toBe(true));
    let send!: Promise<void>;
    act(() => { send = result.current.sendMessage("hello"); });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: "user", parts: [{ type: "text", text: "hello" }] });
    expect(result.current.messages[1]).toMatchObject({ role: "agent", streaming: true });
    const visualIds = result.current.messages.map((message) => message.id);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    act(() => listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "run-1:user", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "hello" }], createdAt: new Date(0).toISOString() } }));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.map((message) => message.id)).toEqual(visualIds);

    await act(async () => { resolveSend({ id: "run-1:user", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "hello" }], createdAt: new Date(0).toISOString() }); await send; });
    expect(result.current.messages.map((message) => message.id)).toEqual(visualIds);
    act(() => listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Hi" }], createdAt: new Date(0).toISOString(), streaming: true } }));
    expect(result.current.messages.map((message) => message.id)).toEqual(visualIds);
    expect(result.current.messages[1]?.parts).toEqual([{ type: "text", text: "Hi" }]);
    act(() => listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "run-1:agent:first", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Checking" }], createdAt: new Date(0).toISOString(), streaming: true } }));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({ id: visualIds[1], parts: [{ type: "text", text: "Checking" }], streaming: true });
    await act(async () => { await result.current.reconnect(); });
    expect(result.current.agents[0]?.lastMessagePreview).toBe("Old server reply");
    act(() => listeners.get("conversation-atlas")?.({ type: "message.completed", messageId: "run-1:agent:first", notify: false }));
    expect(result.current.messages).toHaveLength(1);
    act(() => listeners.get("conversation-atlas")?.({ type: "message.delta", messageId: "run-1:agent:second", delta: "Final answer after the tool" }));
    expect(result.current.messages[1]).toMatchObject({ id: visualIds[1], parts: [{ type: "text", text: "Final answer after the tool" }], streaming: true });
    expect(result.current.agents[0]?.lastMessagePreview).toBe("Old server reply");
    act(() => listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "stale-working", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date(0).toISOString(), streaming: true } }));
    expect(result.current.messages.filter((message) => message.role === "agent" && message.streaming)).toHaveLength(2);
    act(() => listeners.get("conversation-atlas")?.({ type: "message.completed", messageId: "run-1:agent:second", notify: true }));
    expect(result.current.messages[1]).toMatchObject({ streaming: false });
    expect(result.current.messages.filter((message) => message.role === "agent" && message.streaming)).toEqual([]);
    expect(result.current.agents[0]?.lastMessagePreview).toBe("Final answer after the tool");
    act(() => {
      listeners.get("conversation-atlas")?.({ type: "message.created", message: { id: "run-2:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "I'm" }], createdAt: new Date(0).toISOString(), streaming: true } });
      listeners.get("conversation-atlas")?.({ type: "message.delta", messageId: "run-2:agent", delta: " Atlas, ready to help." });
      listeners.get("conversation-atlas")?.({ type: "message.completed", messageId: "run-2:agent", notify: true });
    });
    expect(result.current.agents[0]?.lastMessagePreview).toBe("I'm Atlas, ready to help.");
  });

  it("treats a newly created agent as a known empty conversation", async () => {
    let created = false;
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => created ? [agent("new-agent", "Atlas")] : [],
      getAgent: async (id) => agent(id, id), createAgent: async (input) => { created = true; return agent("new-agent", input.name); }, updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async () => [], getConversation: async () => { throw new Error("unused"); }, sendMessage: async () => { throw new Error("unused"); }, subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.createAgent({ name: "Atlas", modelProviderId: "provider" }); });
    expect(result.current.selectedAgentId).toBe("new-agent");
    expect(result.current.conversationLoading).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("removes a deleted agent immediately and rolls back when deletion fails", async () => {
    let rejectDelete!: (reason: Error) => void;
    const pendingDelete = new Promise<void>((_resolve, reject) => { rejectDelete = reject; });
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => [agent("atlas", "Atlas"), agent("scout", "Scout")],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => pendingDelete, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async () => [], getConversation: async () => { throw new Error("unused"); }, sendMessage: async () => { throw new Error("unused"); }, subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("atlas"));
    let deletion!: Promise<void>;
    act(() => { deletion = result.current.deleteAgent("atlas"); });
    expect(result.current.agents.map((item) => item.id)).toEqual(["scout"]);
    expect(result.current.selectedAgentId).toBe("scout");
    rejectDelete(new Error("Delete failed"));
    await act(async () => { await expect(deletion).rejects.toThrow("Delete failed"); });
    expect(result.current.agents.map((item) => item.id)).toEqual(["atlas", "scout"]);
    expect(result.current.selectedAgentId).toBe("scout");
    expect(result.current.error).toBe("Delete failed");
  });

  it("keeps an accepted deletion tombstoned until the server list confirms removal", async () => {
    let serverAgents = [agent("atlas", "Atlas"), agent("scout", "Scout")];
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => serverAgents,
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async () => [], getConversation: async () => { throw new Error("unused"); }, sendMessage: async () => { throw new Error("unused"); }, subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("atlas"));
    await act(async () => { await result.current.deleteAgent("atlas"); });
    expect(result.current.agents.map((item) => item.id)).toEqual(["scout"]);
    await act(async () => { await result.current.reconnect(); });
    expect(result.current.agents.map((item) => item.id)).toEqual(["scout"]);
    serverAgents = [agent("scout", "Scout")];
    await act(async () => { await result.current.reconnect(); });
    expect(result.current.agents.map((item) => item.id)).toEqual(["scout"]);
  });

  it("revalidates the selected conversation when the Agent preview is newer than its snapshot", async () => {
    const server = { latestReply: undefined as string | undefined };
    const getConversation = vi.fn(async (id: string) => ({ conversation: { id, agentId: "atlas", title: "Atlas", updatedAt: new Date().toISOString() }, messages: server.latestReply ? [{ id: "reply", conversationId: id, role: "agent" as const, parts: [{ type: "text" as const, text: server.latestReply }], createdAt: new Date().toISOString() }] : [] }));
    const client: CloudAgentsClient = {
      listModelProviders: async () => ({ organizationId: "org-test", providers: [] }), listAgents: async () => [{ ...agent("atlas", "Atlas"), lastMessagePreview: server.latestReply }],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date().toISOString() }], getConversation, sendMessage: async () => { throw new Error("unused"); }, subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.selectedAgentId).toBe("atlas"));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1));
    server.latestReply = "Server reply";
    await act(async () => { await result.current.reconnect(); });
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Server reply" }));
    expect(getConversation).toHaveBeenCalledTimes(2);
  });
});
