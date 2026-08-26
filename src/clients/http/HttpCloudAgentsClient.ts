import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type Agent, type ApprovalRequest, type CloudComputer, type Conversation, type ConversationEvent, type CreateAgentInput, type Message, type RespondApprovalInput, type SendMessageInput, type Subscription } from "@/domain/types";

export interface CloudAgentsRoutes {
  listAgents: string; getAgent: (id: string) => string; createAgent: string;
  listConversations: (agentId: string) => string; getConversation: (id: string) => string;
  sendMessage: (conversationId: string) => string; approvals: string;
  respondToApproval: (id: string) => string; computer: (agentId: string) => string;
  openComputer: (agentId: string) => string; takeOverComputer: (agentId: string) => string;
  conversationEvents: (conversationId: string) => string;
}
export interface HttpClientOptions { endpoint: string; routes?: CloudAgentsRoutes; accessToken?: () => Promise<string | null>; fetchImpl?: typeof fetch }

export class HttpCloudAgentsClient implements CloudAgentsClient {
  private fetchImpl: typeof fetch;
  constructor(private options: HttpClientOptions) { this.fetchImpl = options.fetchImpl ?? fetch; }
  private route<T>(get: (routes: CloudAgentsRoutes) => T): T { if (!this.options.routes) throw new CrewError("contract_pending", "Runta Cloud Agents API routes have not been confirmed"); return get(this.options.routes); }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.accessToken?.();
    let response: Response;
    try { response = await this.fetchImpl(new URL(path, this.options.endpoint), { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } }); }
    catch { throw new CrewError("network", "Unable to reach Runta Cloud Agents", true); }
    if (response.status === 401) throw new CrewError("unauthorized", "Authentication is required");
    if (response.status === 404) throw new CrewError("not_found", "Resource not found");
    if (!response.ok) throw new CrewError("unknown", `Cloud Agents request failed (${response.status})`, response.status >= 500);
    return response.json() as Promise<T>;
  }
  listAgents(signal?: AbortSignal) { return this.request<Agent[]>(this.route((r) => r.listAgents), { signal }); }
  getAgent(id: string, signal?: AbortSignal) { return this.request<Agent>(this.route((r) => r.getAgent(id)), { signal }); }
  createAgent(input: CreateAgentInput, signal?: AbortSignal) { return this.request<Agent>(this.route((r) => r.createAgent), { method: "POST", body: JSON.stringify(input), signal }); }
  listConversations(id: string, signal?: AbortSignal) { return this.request<Conversation[]>(this.route((r) => r.listConversations(id)), { signal }); }
  getConversation(id: string, signal?: AbortSignal) { return this.request<{ conversation: Conversation; messages: Message[] }>(this.route((r) => r.getConversation(id)), { signal }); }
  sendMessage(input: SendMessageInput) { return this.request<Message>(this.route((r) => r.sendMessage(input.conversationId)), { method: "POST", body: JSON.stringify({ text: input.text }), signal: input.signal }); }
  subscribeToConversationEvents(id: string, listener: (event: ConversationEvent) => void): Subscription { void id; void listener; throw new CrewError("contract_pending", "SSE/WebSocket event framing is pending backend confirmation"); }
  listApprovalRequests(_agentId?: string, signal?: AbortSignal) { return this.request<ApprovalRequest[]>(this.route((r) => r.approvals), { signal }); }
  respondToApproval(input: RespondApprovalInput, signal?: AbortSignal) { return this.request<ApprovalRequest>(this.route((r) => r.respondToApproval(input.requestId)), { method: "POST", body: JSON.stringify(input), signal }); }
  getComputer(id: string, signal?: AbortSignal) { return this.request<CloudComputer>(this.route((r) => r.computer(id)), { signal }); }
  openComputer(id: string, signal?: AbortSignal) { return this.request<{ url?: string; mode: "mock" | "remote" }>(this.route((r) => r.openComputer(id)), { method: "POST", signal }); }
  takeOverComputer(id: string, signal?: AbortSignal) { return this.request<{ url?: string; mode: "mock" | "remote" }>(this.route((r) => r.takeOverComputer(id)), { method: "POST", signal }); }
  async reconnect(signal?: AbortSignal) { await this.listAgents(signal); }
}
