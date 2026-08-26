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
});
