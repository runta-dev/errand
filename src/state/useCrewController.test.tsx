import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import type { Agent, ConversationEvent, Message } from "@/domain/types";
import { useCrewController } from "./useCrewController";

const agent = (id: string, name: string): Agent => ({ id, name, role: "Cloud coding agent", goal: name, status: "idle", avatar: name[0]!, lastActiveAt: new Date(0).toISOString(), unreadCount: 0, computerId: id });

describe("useCrewController", () => {
  it("never lets the previous agent overwrite a newly selected conversation", async () => {
    let resolveAtlas!: (value: { conversation: { id: string; agentId: string; title: string; updatedAt: string }; messages: Message[] }) => void;
    const atlasConversation = new Promise<Parameters<typeof resolveAtlas>[0]>((resolve) => { resolveAtlas = resolve; });
    const listeners = new Map<string, (event: ConversationEvent) => void>();
    const client: CloudAgentsClient = {
      listModelProviders: async () => [], listAgents: async () => [agent("atlas", "Atlas"), agent("scout", "Scout")],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date(0).toISOString() }],
      getConversation: async (id) => id === "conversation-atlas" ? atlasConversation : { conversation: { id, agentId: "scout", title: "Scout", updatedAt: new Date(0).toISOString() }, messages: [] },
      sendMessage: async (input) => ({ id: "sent", conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date(0).toISOString() }), reactToMessage: async () => { throw new Error("unused"); },
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
      listModelProviders: async () => [], listAgents: async () => [agent("atlas", "Atlas"), agent("scout", "Scout")],
      getAgent: async (id) => agent(id, id), createAgent: async () => agent("new", "New"), updateAgent: async (id) => agent(id, id), deleteAgent: async () => undefined, duplicateAgent: async (id) => agent(`${id}-copy`, id), setAgentUnread: async (id) => agent(id, id),
      listConversations: async (id) => [{ id: `conversation-${id}`, agentId: id, title: id, updatedAt: new Date(0).toISOString() }], getConversation,
      sendMessage: async (input) => ({ id: "sent", conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date(0).toISOString() }), reactToMessage: async () => { throw new Error("unused"); }, subscribeToConversationEvents: () => ({ unsubscribe: () => undefined }), listApprovalRequests: async () => [], respondToApproval: async () => { throw new Error("unused"); }, getComputer: async (id) => ({ id, agentId: id, runtimeName: id, status: "online", capabilities: ["open"] }), openComputer: async () => ({ mode: "remote", url: "https://example.test" }), takeOverComputer: async () => ({ mode: "remote", url: "https://example.test" }), reconnect: async () => undefined,
    };
    const { result } = renderHook(() => useCrewController(client));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Atlas cached" }));
    act(() => result.current.setSelectedAgentId("scout"));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Scout cached" }));
    act(() => result.current.setSelectedAgentId("atlas"));
    await waitFor(() => expect(result.current.messages[0]?.parts[0]).toEqual({ type: "text", text: "Atlas cached" }));
    expect(getConversation.mock.calls.map(([id]) => id)).toEqual(["conversation-atlas", "conversation-scout"]);
  });
});
