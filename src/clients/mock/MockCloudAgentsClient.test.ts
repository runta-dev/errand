import { describe, expect, it, vi } from "vitest";
import { MockCloudAgentsClient } from "./MockCloudAgentsClient";

describe("MockCloudAgentsClient", () => {
  it("creates an isolated agent, conversation, and computer", async () => {
    const client = new MockCloudAgentsClient();
    const agent = await client.createAgent({ name: "Scout", role: "Researcher", goal: "Track customer signals" });
    expect(agent.name).toBe("Scout");
    expect((await client.listConversations(agent.id))[0]?.agentId).toBe(agent.id);
    expect((await client.getComputer(agent.id)).previewKind).toBe("mock");
  });

  it("streams a response through conversation events", async () => {
    vi.useFakeTimers(); const client = new MockCloudAgentsClient(); const events: string[] = [];
    client.subscribeToConversationEvents("conversation-atlas", (event) => events.push(event.type));
    const promise = client.sendMessage({ conversationId: "conversation-atlas", text: "Start" });
    await vi.advanceTimersByTimeAsync(2200); await promise;
    expect(events).toContain("message.created"); expect(events).toContain("message.delta"); expect(events).toContain("message.completed");
    vi.useRealTimers();
  });

  it("records the explicit approval decision and note", async () => {
    const client = new MockCloudAgentsClient();
    const response = await client.respondToApproval({ requestId: "approval-1", decision: "deny", note: "Use the sandbox first" });
    expect(response).toMatchObject({ status: "denied", responseNote: "Use the sandbox first" });
  });

  it("keeps selected attachments as typed message parts", async () => {
    const client = new MockCloudAgentsClient();
    const message = await client.sendMessage({ conversationId: "conversation-atlas", text: "Review this", attachments: [{ id: "attachment-1", name: "brief.pdf", size: 4200, mediaType: "application/pdf", source: "local-selection" }] });
    expect(message.parts).toContainEqual({ type: "attachment", attachment: expect.objectContaining({ id: "attachment-1", name: "brief.pdf" }) });
  });

  it("toggles a reaction and publishes the updated message", async () => {
    const client = new MockCloudAgentsClient(); const updated: string[] = [];
    client.subscribeToConversationEvents("conversation-atlas", (event) => { if (event.type === "message.updated") updated.push(event.message.id); });
    const selected = await client.reactToMessage({ conversationId: "conversation-atlas", messageId: "m2", reaction: "useful" });
    expect(selected.reactions).toContainEqual({ kind: "useful", count: 1, selected: true });
    const cleared = await client.reactToMessage({ conversationId: "conversation-atlas", messageId: "m2", reaction: "useful" });
    expect(cleared.reactions).toContainEqual({ kind: "useful", count: 0, selected: false });
    expect(updated).toEqual(["m2", "m2"]);
  });

  it("supports the complete local agent lifecycle", async () => {
    const client = new MockCloudAgentsClient();
    const updated = await client.updateAgent("patch", { name: "Patch Prime", pinned: true });
    expect(updated).toMatchObject({ name: "Patch Prime", avatar: "P", pinned: true });
    const duplicate = await client.duplicateAgent("patch");
    expect(duplicate).toMatchObject({ name: "Patch Prime copy", role: "Software engineer" });
    expect((await client.setAgentUnread("patch", true)).unreadCount).toBe(1);
    await client.deleteAgent(duplicate.id);
    await expect(client.getAgent(duplicate.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
