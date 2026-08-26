import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type Agent, type ConversationEvent, type CreateAgentInput, type Message, type RespondApprovalInput, type SendMessageInput, type Subscription } from "@/domain/types";
import { activitiesFixture, agentsFixture, approvalsFixture, computersFixture, conversationsFixture, messagesFixture } from "./fixtures";

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});
const copy = <T>(value: T): T => structuredClone(value);

export class MockCloudAgentsClient implements CloudAgentsClient {
  private agents = copy(agentsFixture); private conversations = copy(conversationsFixture); private messages = copy(messagesFixture);
  private approvals = copy(approvalsFixture); private computers = copy(computersFixture);
  private listeners = new Map<string, Set<(event: ConversationEvent) => void>>();
  connectionState: "connected" | "disconnected" = "connected";

  private emit(conversationId: string, event: ConversationEvent) { this.listeners.get(conversationId)?.forEach((listener) => listener(copy(event))); }
  async listAgents(signal?: AbortSignal) { await wait(120, signal); return copy(this.agents); }
  async getAgent(agentId: string, signal?: AbortSignal) { await wait(60, signal); const agent = this.agents.find((item) => item.id === agentId); if (!agent) throw new CrewError("not_found", "Agent not found"); return copy(agent); }
  async createAgent(input: CreateAgentInput, signal?: AbortSignal) {
    await wait(240, signal); const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const agent: Agent = { id, ...input, status: "idle", avatar: input.name.slice(0, 1).toUpperCase(), lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: `computer-${id}` };
    this.agents.unshift(agent); this.conversations.push({ id: `conversation-${id}`, agentId: id, title: input.goal, updatedAt: agent.lastActiveAt });
    this.computers.push({ id: agent.computerId, agentId: id, runtimeName: `crew-${id}`, status: "starting", activeApp: "Preparing workspace", previewKind: "mock", capabilities: ["open", "takeover"] });
    return copy(agent);
  }
  async listConversations(agentId: string, signal?: AbortSignal) { await wait(60, signal); return copy(this.conversations.filter((item) => item.agentId === agentId)); }
  async getConversation(conversationId: string, signal?: AbortSignal) { await wait(80, signal); const conversation = this.conversations.find((item) => item.id === conversationId); if (!conversation) throw new CrewError("not_found", "Conversation not found"); return { conversation: copy(conversation), messages: copy(this.messages.filter((item) => item.conversationId === conversationId)) }; }
  async sendMessage(input: SendMessageInput) {
    await wait(90, input.signal); const message: Message = { id: crypto.randomUUID(), conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date().toISOString() };
    this.messages.push(message); this.emit(input.conversationId, { type: "message.created", message });
    const reply: Message = { id: crypto.randomUUID(), conversationId: input.conversationId, role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    window.setTimeout(() => { this.messages.push(reply); this.emit(input.conversationId, { type: "message.created", message: reply }); }, 240);
    const chunks = ["I’m on it. ", "I’ll work in the cloud computer ", "and keep you updated here."];
    chunks.forEach((delta, index) => window.setTimeout(() => {
      const part = reply.parts[0]; if (part?.type === "text") part.text += delta;
      this.emit(input.conversationId, { type: "message.delta", messageId: reply.id, delta });
      if (index === chunks.length - 1) { reply.streaming = false; this.emit(input.conversationId, { type: "message.completed", messageId: reply.id }); }
    }, 650 + index * 420));
    return copy(message);
  }
  subscribeToConversationEvents(conversationId: string, listener: (event: ConversationEvent) => void): Subscription { const set = this.listeners.get(conversationId) ?? new Set(); set.add(listener); this.listeners.set(conversationId, set); return { unsubscribe: () => set.delete(listener) }; }
  async listApprovalRequests(agentId?: string, signal?: AbortSignal) { await wait(60, signal); return copy(this.approvals.filter((item) => !agentId || item.agentId === agentId)); }
  async respondToApproval(input: RespondApprovalInput, signal?: AbortSignal) { await wait(220, signal); const approval = this.approvals.find((item) => item.id === input.requestId); if (!approval) throw new CrewError("not_found", "Approval not found"); approval.status = input.decision === "allow" ? "allowed" : "denied"; approval.responseNote = input.note; this.emit(approval.conversationId, { type: "approval.updated", approval }); return copy(approval); }
  async getComputer(agentId: string, signal?: AbortSignal) { await wait(80, signal); const computer = this.computers.find((item) => item.agentId === agentId); if (!computer) throw new CrewError("not_found", "Computer not found"); return copy(computer); }
  async openComputer(agentId: string, signal?: AbortSignal) { await this.getComputer(agentId, signal); return { mode: "mock" as const }; }
  async takeOverComputer(agentId: string, signal?: AbortSignal) { await this.getComputer(agentId, signal); return { mode: "mock" as const }; }
  async reconnect(signal?: AbortSignal) { this.connectionState = "disconnected"; await wait(500, signal); this.connectionState = "connected"; }
  getActivities(conversationId: string) { return copy(activitiesFixture.filter((item) => item.conversationId === conversationId)); }
}
