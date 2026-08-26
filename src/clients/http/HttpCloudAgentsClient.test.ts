import { describe, expect, it, vi } from "vitest";
import { HttpCloudAgentsClient } from "./HttpCloudAgentsClient";

describe("HttpCloudAgentsClient", () => {
  it("refuses to invent routes before the backend contract is confirmed", async () => {
    const client = new HttpCloudAgentsClient({ endpoint: "https://api.example.test" });
    expect(() => client.listAgents()).toThrowError(expect.objectContaining({ code: "contract_pending" }));
  });

  it("applies endpoint, bearer authentication, and cancellation signal", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const client = new HttpCloudAgentsClient({ endpoint: "https://api.example.test/base/", routes: {
      listAgents: "agents", getAgent: (id) => `agents/${id}`, createAgent: "agents", listConversations: (id) => `agents/${id}/conversations`, getConversation: (id) => `conversations/${id}`, sendMessage: (id) => `conversations/${id}/messages`, approvals: "approvals", respondToApproval: (id) => `approvals/${id}`, computer: (id) => `agents/${id}/computer`, openComputer: (id) => `agents/${id}/computer/open`, takeOverComputer: (id) => `agents/${id}/computer/takeover`, conversationEvents: (id) => `conversations/${id}/events`,
    }, accessToken: async () => "secret", fetchImpl });
    const controller = new AbortController(); await client.listAgents(controller.signal);
    expect(fetchImpl).toHaveBeenCalledWith(new URL("https://api.example.test/base/agents"), expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret" }), signal: controller.signal }));
  });
});
