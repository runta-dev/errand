import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type Agent, type ApprovalRequest, type CloudComputer, type ConversationEvent, type CreateAgentInput, type Message, type ReactToMessageInput, type RespondApprovalInput, type SendMessageInput, type Subscription, type UpdateAgentInput } from "@/domain/types";
import type { CloudRequest } from "@/shared/desktop";

interface RuntaAgent { id: string; runtime_id: string; name: string; status: string; created_at_unix_seconds: number; updated_at_unix_seconds: number }
interface RuntaRun { id: string; agent_id: string; status: string; result?: string | null; error?: string | null; dsh_session_id?: string | null; created_at?: string; updated_at?: string }
interface ModelProvider { id: string }

const conversationId = (agentId: string) => `conversation-${agentId}`;
const agentIdFromConversation = (id: string) => id.startsWith("conversation-") ? id.slice("conversation-".length) : id;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const status = (value: string): Agent["status"] => value === "running" ? "idle" : value === "pending" ? "working" : "offline";

export class RuntaCloudAgentsClient implements CloudAgentsClient {
  private async request<T>(request: CloudRequest): Promise<T> {
    const bridge = window.runtaCrew?.cloud;
    if (!bridge) throw new CrewError("network", "Runta desktop cloud bridge is unavailable", true);
    const response = await bridge.request(request);
    if (response.status === 401) throw new CrewError("unauthorized", "Authentication is required");
    if (response.status === 404) throw new CrewError("not_found", "Resource not found");
    if (response.status < 200 || response.status >= 300) throw new CrewError("unknown", `Cloud Agents request failed (${response.status})`, response.status >= 500);
    return response.body as T;
  }

  private mapAgent(value: RuntaAgent): Agent {
    return { id: value.id, name: value.name, role: "Cloud coding agent", goal: value.name, status: status(value.status), avatar: value.name.slice(0, 1).toUpperCase(), lastActiveAt: iso(value.updated_at_unix_seconds), unreadCount: 0, computerId: value.runtime_id };
  }

  async listAgents(_signal?: AbortSignal) {
    void _signal;
    const response = await this.request<{ agents: RuntaAgent[] }>({ method: "GET", path: "/v1/agents?limit=250" });
    return response.agents.map((agent) => this.mapAgent(agent));
  }
  async getAgent(agentId: string, _signal?: AbortSignal) { void _signal; return this.mapAgent(await this.request<RuntaAgent>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}` })); }
  async createAgent(input: CreateAgentInput, _signal?: AbortSignal) {
    void _signal;
    const providers = await this.request<{ model_providers: ModelProvider[] }>({ method: "GET", path: "/v1/model-providers" });
    const provider = providers.model_providers[0];
    if (!provider) throw new CrewError("contract_pending", "Create a managed model provider before creating a Crew agent");
    const created = await this.request<RuntaAgent>({ method: "POST", path: "/v1/agents", body: { name: input.name, model_provider: { type: "managed", id: provider.id } } });
    return this.mapAgent(created);
  }
  async updateAgent(_agentId: string, _input: UpdateAgentInput, _signal?: AbortSignal): Promise<Agent> { void _agentId; void _input; void _signal; throw new CrewError("contract_pending", "Agent metadata updates require the Cloud Agents mutation contract"); }
  async deleteAgent(agentId: string, _signal?: AbortSignal) { void _signal; await this.request<void>({ method: "DELETE", path: `/v1/agents/${encodeURIComponent(agentId)}?delete_runtime=true` }); }
  async duplicateAgent(_agentId: string, _signal?: AbortSignal): Promise<Agent> { void _agentId; void _signal; throw new CrewError("contract_pending", "Agent duplication requires the Cloud Agents duplication contract"); }
  async setAgentUnread(agentId: string, _unread: boolean, signal?: AbortSignal) { return this.getAgent(agentId, signal); }
  async listConversations(agentId: string, _signal?: AbortSignal) {
    void _signal;
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const latest = runs[0];
    return [{ id: conversationId(agentId), agentId, title: "Agent conversation", updatedAt: latest?.updated_at ?? new Date().toISOString() }];
  }
  async getConversation(id: string, _signal?: AbortSignal) {
    void _signal;
    const agentId = agentIdFromConversation(id);
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const messages = runs.slice().reverse().flatMap<Message>((run) => run.result ? [{ id: `${run.id}:agent`, conversationId: id, role: "agent", parts: [{ type: "text", text: run.result }], createdAt: run.updated_at ?? new Date().toISOString(), streaming: !["finished", "failed", "cancelled"].includes(run.status) }] : []);
    return { conversation: { id, agentId, title: "Agent conversation", updatedAt: runs[0]?.updated_at ?? new Date().toISOString() }, messages };
  }
  async sendMessage(input: SendMessageInput): Promise<Message> {
    if (input.attachments?.length) throw new CrewError("contract_pending", "Cloud attachment upload is not available yet");
    const agentId = agentIdFromConversation(input.conversationId);
    const run = await this.request<RuntaRun>({ method: "POST", path: `/v1/agents/${encodeURIComponent(agentId)}/runs`, body: { prompt: input.text } });
    return { id: `${run.id}:user`, conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date().toISOString() };
  }
  async reactToMessage(_input: ReactToMessageInput, _signal?: AbortSignal): Promise<Message> { void _input; void _signal; throw new CrewError("contract_pending", "Message reactions require the Cloud Agents reaction contract"); }
  subscribeToConversationEvents(id: string, listener: (event: ConversationEvent) => void): Subscription {
    const agentId = agentIdFromConversation(id);
    const observed = new Map<string, string>();
    const poll = async () => {
      try {
        const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
        for (const run of runs) {
          const previous = observed.get(run.id); observed.set(run.id, run.status);
          if (previous === undefined && run.result) listener({ type: "message.created", message: { id: `${run.id}:agent`, conversationId: id, role: "agent", parts: [{ type: "text", text: run.result }], createdAt: run.updated_at ?? new Date().toISOString(), streaming: false } });
          if (previous && previous !== run.status && run.status === "finished") listener({ type: "message.completed", messageId: `${run.id}:agent` });
        }
        listener({ type: "connection.changed", state: "connected" });
      } catch { listener({ type: "connection.changed", state: "error" }); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 1000);
    return { unsubscribe: () => window.clearInterval(timer) };
  }
  async listApprovalRequests(_agentId?: string, _signal?: AbortSignal): Promise<ApprovalRequest[]> { void _agentId; void _signal; return []; }
  async respondToApproval(_input: RespondApprovalInput, _signal?: AbortSignal): Promise<ApprovalRequest> { void _input; void _signal; throw new CrewError("contract_pending", "ACP approvals require the Cloud Agents approval contract"); }
  async getComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputer> { const agent = await this.getAgent(agentId, signal); return { id: agent.computerId, agentId, runtimeName: agent.computerId, status: agent.status === "offline" ? "offline" : "online", activeApp: "DeepSeek Harness", previewKind: "remote", capabilities: ["open", "takeover"] }; }
  async openComputer(_agentId: string, _signal?: AbortSignal): Promise<{ url?: string; mode: "mock" | "remote" }> { void _agentId; void _signal; throw new CrewError("contract_pending", "Computer sessions require the Cloud Agents computer-session contract"); }
  async takeOverComputer(agentId: string, signal?: AbortSignal) { return this.openComputer(agentId, signal); }
  async reconnect(signal?: AbortSignal) { await this.listAgents(signal); }
  getActivities(_conversationId: string) { void _conversationId; return []; }
}
