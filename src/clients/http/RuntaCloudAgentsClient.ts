import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type ActivityEvent, type Agent, type ApprovalRequest, type CloudComputer, type ConversationEvent, type CreateAgentInput, type Message, type ModelProviderOption, type RespondApprovalInput, type SendMessageInput, type Subscription, type UpdateAgentInput } from "@/domain/types";
import type { CloudRequest, CloudStreamEvent } from "@/shared/desktop";

interface RuntaAgent { id: string; runtime_id: string; name: string; status: string; created_at_unix_seconds: number; updated_at_unix_seconds: number; latest_reply?: { run_id: string; text: string; created_at?: string | null; updated_at?: string | null } | null }
interface RuntaRun { id: string; agent_id: string; status: string; prompt?: string | null; result?: string | null; error?: string | null; dsh_session_id?: string | null; created_at?: string | null; updated_at?: string | null }
interface ModelProvider { id: string; display_name: string; protocol: string; default_model?: string | null }

const conversationId = (agentId: string) => `conversation-${agentId}`;
const agentIdFromConversation = (id: string) => id.startsWith("conversation-") ? id.slice("conversation-".length) : id;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const status = (value: string): Agent["status"] => value === "running" ? "idle" : value === "pending" ? "working" : "offline";
const terminalRunStatuses = new Set(["finished", "failed", "cancelled"]);

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function toolActivityKind(value: string): ActivityEvent["kind"] {
  const normalized = value.toLowerCase();
  if (/browser|web|fetch|url/.test(normalized)) return "browser";
  if (/terminal|command|shell|bash|exec|run/.test(normalized)) return "terminal";
  if (/file|read|write|edit|patch|search|grep|glob/.test(normalized)) return "file";
  if (/agent|task|handoff/.test(normalized)) return "handoff";
  return "status";
}
function toolActivityTitle(value: string): string {
  const normalized = value.toLowerCase();
  if (/read|cat|view/.test(normalized)) return "Reading file";
  if (/write|edit|patch|create/.test(normalized)) return "Editing file";
  if (/search|grep|glob|find/.test(normalized)) return "Searching files";
  if (/terminal|command|shell|bash|exec|run/.test(normalized)) return "Running command";
  if (/browser|web|fetch|url/.test(normalized)) return "Browsing web";
  if (/agent|task|handoff/.test(normalized)) return "Running agent";
  return value.trim() || "Working";
}
function activityFromToolUpdate(update: Record<string, unknown>, conversationIdValue: string): ActivityEvent | undefined {
  if (typeof update.sessionUpdate !== "string" || !/tool[_-]?call(?:[_-]?update)?/i.test(update.sessionUpdate)) return undefined;
  const id = stringValue(update.toolCallId) ?? stringValue(update.tool_call_id) ?? stringValue(update.id);
  if (!id) return undefined;
  const rawTitle = stringValue(update.title) ?? stringValue(update.name) ?? stringValue(update.kind) ?? "Working";
  const rawStatus = stringValue(update.status)?.toLowerCase() ?? "running";
  const status: ActivityEvent["status"] = /fail|error/.test(rawStatus) ? "failed" : /complete|finish|done/.test(rawStatus) ? "completed" : "running";
  return { id: `tool:${id}`, conversationId: conversationIdValue, kind: toolActivityKind(`${stringValue(update.kind) ?? ""} ${rawTitle}`), title: toolActivityTitle(rawTitle), detail: rawTitle, status, createdAt: new Date().toISOString() };
}

function runMessages(run: RuntaRun, id: string): Message[] {
  const createdAt = run.created_at ?? new Date().toISOString();
  const updatedAt = run.updated_at ?? createdAt;
  const user = run.prompt ? [{ id: `${run.id}:user`, conversationId: id, role: "user" as const, parts: [{ type: "text" as const, text: run.prompt }], createdAt }] : [];
  if (run.status === "failed" || run.status === "cancelled") {
    const detail = run.error?.trim() || (run.status === "cancelled" ? "Run cancelled." : "Run failed.");
    return [...user, { id: `${run.id}:agent`, conversationId: id, role: "system", parts: [{ type: "text", text: detail }], createdAt: updatedAt }];
  }
  return [...user, { id: `${run.id}:agent`, conversationId: id, role: "agent", parts: [{ type: "text", text: run.result ?? "" }], createdAt: updatedAt, streaming: !terminalRunStatuses.has(run.status) }];
}

function assistantChunk(event: CloudStreamEvent): { sourceId: string; text: string } | undefined {
  if (event.event !== "acp.event" || !event.data || typeof event.data !== "object") return undefined;
  const payload = event.data as { params?: { update?: { sessionUpdate?: string; messageId?: string; content?: { text?: string } } } };
  const update = payload.params?.update;
  if (update?.sessionUpdate !== "agent_message_chunk" || typeof update.content?.text !== "string" || !update.content.text) return undefined;
  return { sourceId: stringValue(update.messageId) ?? "legacy", text: update.content.text };
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}

export class RuntaCloudAgentsClient implements CloudAgentsClient {
  private async request<T>(request: CloudRequest): Promise<T> {
    const bridge = window.runtaCrew?.cloud;
    if (!bridge) throw new CrewError("network", "Runta desktop cloud bridge is unavailable", true);
    let response;
    try { response = await bridge.request(request); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (/token is not configured/i.test(message)) throw new CrewError("unauthorized", "Authentication is required");
      throw new CrewError("network", "Runta Cloud Agents is unavailable", true);
    }
    if (response.status === 401) throw new CrewError("unauthorized", "Authentication is required");
    if (response.status === 404) throw new CrewError("not_found", "Resource not found");
    if (response.status < 200 || response.status >= 300) throw new CrewError("unknown", `Cloud Agents request failed (${response.status})`, response.status >= 500);
    return response.body as T;
  }

  private mapAgent(value: RuntaAgent): Agent {
    return { id: value.id, name: value.name, role: "Cloud coding agent", goal: value.name, status: status(value.status), avatar: value.name.slice(0, 1).toUpperCase(), lastActiveAt: value.latest_reply?.updated_at ?? iso(value.updated_at_unix_seconds), unreadCount: 0, computerId: value.runtime_id, lastMessagePreview: value.latest_reply?.text };
  }

  async listModelProviders(_signal?: AbortSignal): Promise<ModelProviderOption[]> {
    void _signal;
    const response = await this.request<{ model_providers: ModelProvider[] }>({ method: "GET", path: "/v1/model-providers" });
    return response.model_providers.map((provider) => ({ id: provider.id, name: provider.display_name, protocol: provider.protocol, defaultModel: provider.default_model ?? undefined }));
  }

  async listAgents(_signal?: AbortSignal) {
    void _signal;
    const response = await this.request<{ agents: RuntaAgent[] }>({ method: "GET", path: "/v1/agents?limit=250&include_latest_reply=true" });
    return response.agents.map((agent) => this.mapAgent(agent));
  }
  async getAgent(agentId: string, _signal?: AbortSignal) { void _signal; return this.mapAgent(await this.request<RuntaAgent>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}` })); }
  async createAgent(input: CreateAgentInput, _signal?: AbortSignal) {
    void _signal;
    if (!input.modelProviderId) throw new CrewError("contract_pending", "Select a managed model provider before creating a Crew agent");
    const created = await this.request<RuntaAgent>({ method: "POST", path: "/v1/agents", body: { name: input.name, model_provider: { type: "managed", id: input.modelProviderId } } });
    return this.mapAgent(created);
  }
  async updateAgent(agentId: string, input: UpdateAgentInput, _signal?: AbortSignal): Promise<Agent> {
    void _signal;
    if (!input.name || Object.keys(input).some((key) => key !== "name")) throw new CrewError("contract_pending", "Only the Agent name can be updated");
    return this.mapAgent(await this.request<RuntaAgent>({ method: "PATCH", path: `/v1/agents/${encodeURIComponent(agentId)}`, body: { name: input.name } }));
  }
  async deleteAgent(agentId: string, _signal?: AbortSignal) { void _signal; await this.request<void>({ method: "DELETE", path: `/v1/agents/${encodeURIComponent(agentId)}?delete_runtime=true` }); }
  async duplicateAgent(_agentId: string, _signal?: AbortSignal): Promise<Agent> { void _agentId; void _signal; throw new CrewError("contract_pending", "Agent duplication requires the Cloud Agents duplication contract"); }
  async setAgentUnread(agentId: string, _unread: boolean, signal?: AbortSignal) { return this.getAgent(agentId, signal); }
  async listConversations(agentId: string, _signal?: AbortSignal) {
    void _signal;
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const latest = runs[0];
    return [{ id: conversationId(agentId), agentId, title: "Agent conversation", updatedAt: latest?.updated_at ?? new Date().toISOString() }];
  }
  private replayRunMessages(agentId: string, run: RuntaRun, id: string, signal?: AbortSignal): Promise<Message[]> {
    const fallback = runMessages(run, id);
    const bridge = window.runtaCrew?.cloud;
    if (!bridge?.subscribe || !terminalRunStatuses.has(run.status) || signal?.aborted) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      let current: Message | undefined;
      let sawAssistant = false;
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", finish);
        unsubscribe();
        if (!sawAssistant) { resolve(fallback); return; }
        resolve([
          ...fallback.filter((message) => message.role === "user"),
          ...(current ? [current] : []),
          ...fallback.filter((message) => message.role === "system"),
        ]);
      };
      const timeout = window.setTimeout(finish, 10_000);
      signal?.addEventListener("abort", finish, { once: true });
      unsubscribe = bridge.subscribe(`/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}/events?after=-1`, (event) => {
        if (event.event === "stream.closed" || event.event === "error") { finish(); return; }
        if (event.event === "acp.event" && event.data && typeof event.data === "object") {
          const payload = event.data as { params?: { update?: { sessionUpdate?: string } } };
          if (payload.params?.update?.sessionUpdate === "tool_call") { current = undefined; return; }
        }
        const chunk = assistantChunk(event);
        if (!chunk) return;
        sawAssistant = true;
        const messageId = `${run.id}:agent:${chunk.sourceId}`;
        if (current?.id === messageId) {
          const part = current.parts[0];
          if (part?.type === "text") part.text += chunk.text;
          return;
        }
        current = {
          id: messageId,
          conversationId: id,
          role: "agent",
          parts: [{ type: "text", text: chunk.text }],
          createdAt: run.updated_at ?? run.created_at ?? new Date().toISOString(),
          streaming: false,
        };
      });
    });
  }
  async getConversation(id: string, _signal?: AbortSignal) {
    const agentId = agentIdFromConversation(id);
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const messageGroups = await mapWithConcurrency(runs.slice().reverse(), 8, (run) => this.replayRunMessages(agentId, run, id, _signal));
    const messages = messageGroups.flat();
    return { conversation: { id, agentId, title: "Agent conversation", updatedAt: runs[0]?.updated_at ?? new Date().toISOString() }, messages };
  }
  async sendMessage(input: SendMessageInput): Promise<Message> {
    if (input.attachments?.length) throw new CrewError("contract_pending", "Cloud attachment upload is not available yet");
    const agentId = agentIdFromConversation(input.conversationId);
    const run = await this.request<RuntaRun>({ method: "POST", path: `/v1/agents/${encodeURIComponent(agentId)}/runs`, body: { prompt: input.text } });
    return { id: `${run.id}:user`, conversationId: input.conversationId, role: "user", parts: [{ type: "text", text: input.text }], createdAt: new Date().toISOString() };
  }
  subscribeToConversationEvents(id: string, listener: (event: ConversationEvent) => void): Subscription {
    const agentId = agentIdFromConversation(id);
    const observed = new Map<string, string>();
    const streams = new Map<string, () => void>();
    const assistantStreams = new Map<string, { current?: string; seen: Set<string> }>();
    const bridge = window.runtaCrew?.cloud;
    const subscribeToRun = (run: RuntaRun) => {
      if (!bridge?.subscribe || streams.has(run.id) || terminalRunStatuses.has(run.status)) return;
      let terminal = false;
      const assistant = { seen: new Set<string>() } as { current?: string; seen: Set<string> };
      assistantStreams.set(run.id, assistant);
      const completeCurrentAssistant = (notify = false) => {
        if (!assistant.current) return;
        listener({ type: "message.completed", messageId: assistant.current, notify });
        assistant.current = undefined;
      };
      const unsubscribe = bridge.subscribe(`/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}/events?after=-1`, (event: CloudStreamEvent) => {
        if (event.event === "run.status" && event.data && typeof event.data === "object") {
          const data = event.data as Partial<RuntaRun> & { session_id?: string | null };
          if (typeof data.status !== "string") return;
          const next: RuntaRun = { ...run, ...data, prompt: data.prompt ?? run.prompt, dsh_session_id: data.session_id ?? data.dsh_session_id ?? run.dsh_session_id };
          terminal = terminalRunStatuses.has(next.status);
          if (terminal) completeCurrentAssistant(true);
          if (assistant.seen.size === 0) {
            const message = runMessages(next, id).find((candidate) => candidate.id === `${run.id}:agent`);
            if (message) listener({ type: "message.updated", message });
            if (terminal) listener({ type: "message.completed", messageId: `${run.id}:agent` });
          }
          return;
        }
        if (event.event !== "acp.event" || terminal || !event.data || typeof event.data !== "object") return;
        const payload = event.data as { params?: { update?: Record<string, unknown> & { sessionUpdate?: string; messageId?: string; content?: { text?: string } } } };
        const update = payload.params?.update;
        const chunk = assistantChunk(event);
        if (chunk) {
          const sourceId = chunk.sourceId;
          const messageId = `${run.id}:agent:${sourceId}`;
          if (!assistant.seen.has(messageId)) {
            completeCurrentAssistant();
            assistant.current = messageId;
            assistant.seen.add(messageId);
            listener({ type: "message.created", message: { id: messageId, conversationId: id, role: "agent", parts: [{ type: "text", text: chunk.text }], createdAt: new Date().toISOString(), streaming: true } });
          } else {
            assistant.current = messageId;
            listener({ type: "message.delta", messageId, delta: chunk.text });
          }
        }
        if (update?.sessionUpdate === "tool_call") completeCurrentAssistant();
        const activity = update ? activityFromToolUpdate(update, id) : undefined;
        if (activity) listener({ type: "activity.updated", activity });
      });
      streams.set(run.id, unsubscribe);
    };
    const poll = async () => {
      try {
        const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
        for (const run of runs) {
          const signature = `${run.status}\u0000${run.result ?? ""}\u0000${run.error ?? ""}`;
          const previous = observed.get(run.id); observed.set(run.id, signature);
          subscribeToRun(run);
          if (previous === undefined) {
            for (const message of runMessages(run, id)) listener({ type: "message.created", message });
          } else if (previous !== signature && (assistantStreams.get(run.id)?.seen.size ?? 0) === 0) {
            const agentMessage = runMessages(run, id).find((message) => message.id === `${run.id}:agent`);
            if (agentMessage) listener({ type: "message.updated", message: agentMessage });
          }
          if (previous !== signature && terminalRunStatuses.has(run.status) && (assistantStreams.get(run.id)?.seen.size ?? 0) === 0) listener({ type: "message.completed", messageId: `${run.id}:agent` });
        }
        listener({ type: "connection.changed", state: "connected" });
      } catch { listener({ type: "connection.changed", state: "error" }); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 1000);
    return { unsubscribe: () => { window.clearInterval(timer); for (const unsubscribe of streams.values()) unsubscribe(); streams.clear(); assistantStreams.clear(); } };
  }
  async listApprovalRequests(_agentId?: string, _signal?: AbortSignal): Promise<ApprovalRequest[]> { void _agentId; void _signal; return []; }
  async respondToApproval(_input: RespondApprovalInput, _signal?: AbortSignal): Promise<ApprovalRequest> { void _input; void _signal; throw new CrewError("contract_pending", "ACP approvals require the Cloud Agents approval contract"); }
  async getComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputer> { const agent = await this.getAgent(agentId, signal); return { id: agent.computerId, agentId, runtimeName: agent.computerId, status: agent.status === "offline" ? "offline" : "online", capabilities: ["open", "takeover"] }; }
  async openComputer(_agentId: string, _signal?: AbortSignal): Promise<{ url: string; mode: "remote" }> { void _agentId; void _signal; throw new CrewError("contract_pending", "Computer sessions are outside the current Crew scope"); }
  async takeOverComputer(agentId: string, signal?: AbortSignal) { return this.openComputer(agentId, signal); }
  async reconnect(signal?: AbortSignal) { await this.listAgents(signal); }
  getActivities(_conversationId: string) { void _conversationId; return []; }
}
