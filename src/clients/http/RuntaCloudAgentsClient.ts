import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type ActivityEvent, type Agent, type ApprovalRequest, type Attachment, type CloudComputer, type CloudComputerSession, type ConversationEvent, type CreateAgentInput, type Message, type ModelProviderCatalog, type RespondApprovalInput, type SendMessageInput, type Subscription, type UpdateAgentInput } from "@/domain/types";
import type { CloudRequest, CloudStreamEvent } from "@/shared/desktop";

interface RuntaAgent { id: string; runtime_id: string; name: string; status: string; created_at_unix_seconds: number; updated_at_unix_seconds: number; latest_reply?: { run_id: string; text: string; created_at?: string | null; updated_at?: string | null } | null }
interface RuntaRun { id: string; agent_id: string; status: string; prompt?: string | null; result?: string | null; error?: string | null; dsh_session_id?: string | null; created_at?: string | null; updated_at?: string | null }
interface ModelProvider { id: string; display_name: string; protocol: string; default_model?: string | null }
interface RuntaArtifact { id: string; run_id: string; name: string; media_type: string; size: number }
interface RuntaComputerSession { channels: { vnc: { websocket_url: string; protocols: string[] } } }

const conversationId = (agentId: string) => `conversation-${agentId}`;
const agentIdFromConversation = (id: string) => id.startsWith("conversation-") ? id.slice("conversation-".length) : id;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const status = (value: string): Agent["status"] => value === "running" ? "idle" : value === "pending" ? "working" : "offline";
const terminalRunStatuses = new Set(["finished", "failed", "cancelled"]);
const RUN_FALLBACK_REFRESH_MS = 30_000;
const AGENT_READY_TIMEOUT_MS = 30_000;
const AGENT_READY_POLL_MS = 100;
const LEGACY_INITIAL_MESSAGE = "Introduce yourself briefly to the user. Do not use tools or ask a question.";
const LEGACY_IDENTITY_INITIAL_MESSAGE = "Introduce yourself briefly using only the Runta Crew identity and name from your system instructions. Do not mention any model, provider, Pi, harness, runtime, or implementation details. Do not use tools or ask a question.";
const INITIAL_MESSAGE_PREFIX = "[Runta Crew bootstrap] ";
const initialMessage = (name: string) => `${INITIAL_MESSAGE_PREFIX}Introduce yourself briefly as ${JSON.stringify(name)}, the user's Runta Crew agent. Begin with ${JSON.stringify(`Hi, I'm ${name}.`)} Do not mention any model, provider, Pi, harness, runtime, or implementation details. Do not use tools or ask a question.`;
const crewSystemPrompt = (name: string) => `You are ${JSON.stringify(name)}, the user's Runta Crew agent. Introduce yourself by this name. Help with coding, research, files, and computer tasks. Be concise, practical, and honest about unavailable capabilities. Do not use emoji unless the user explicitly asks for them. Do not proactively mention any underlying model, provider, Pi, harness, runtime, or implementation details; if the user explicitly asks, answer honestly.`;
const isInitialMessage = (prompt: string | null | undefined) => prompt === LEGACY_INITIAL_MESSAGE || prompt === LEGACY_IDENTITY_INITIAL_MESSAGE || prompt?.startsWith(INITIAL_MESSAGE_PREFIX) === true;
const visiblePrompt = (prompt: string | null | undefined) => {
  if (!prompt) return "";
  const legacyMarker = "\n\nAttached files are available in the workspace:\n";
  const marker = "\n\n[Runta Crew attachment context]\n";
  const value = prompt.split(prompt.includes(marker) ? marker : legacyMarker, 1)[0]?.trim() ?? "";
  return value === "Please review the attached file(s)." ? "" : value;
};

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function toolActivityKind(value: string): ActivityEvent["kind"] {
  const normalized = value.toLowerCase();
  if (/browser|web|fetch|url/.test(normalized)) return "browser";
  if (/terminal|command|shell|bash|exec|run/.test(normalized)) return "terminal";
  if (/file|read|write|edit|patch|search|grep|glob/.test(normalized)) return "file";
  if (/agent|task|handoff/.test(normalized)) return "handoff";
  return "status";
}
function toolResultText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : undefined;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content.flatMap((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []).join("\n").trim();
  return text || undefined;
}
function runMessages(run: RuntaRun, id: string): Message[] {
  const createdAt = run.created_at ?? new Date().toISOString();
  const updatedAt = run.updated_at ?? createdAt;
  const prompt = visiblePrompt(run.prompt); const user = prompt && !isInitialMessage(run.prompt) ? [{ id: `${run.id}:user`, conversationId: id, role: "user" as const, parts: [{ type: "text" as const, text: prompt }], createdAt }] : [];
  if (run.status === "failed" || run.status === "cancelled") {
    const detail = run.error?.trim() || (run.status === "cancelled" ? "Run cancelled." : "Run failed.");
    return [...user, { id: `${run.id}:agent`, conversationId: id, role: "system", parts: [{ type: "text", text: detail }], createdAt: updatedAt }];
  }
  return [...user, { id: `${run.id}:agent`, conversationId: id, role: "agent", parts: [{ type: "text", text: run.result ?? "" }], createdAt: updatedAt, streaming: !terminalRunStatuses.has(run.status) }];
}

function assistantChunk(event: CloudStreamEvent): { sourceId: string; text: string } | undefined {
  if (event.event !== "pi.event" || !event.data || typeof event.data !== "object") return undefined;
  const payload = event.data as { type?: string; message?: { id?: string }; assistantMessageEvent?: { type?: string; delta?: string } };
  if (payload.type !== "message_update" || payload.assistantMessageEvent?.type !== "text_delta" || !payload.assistantMessageEvent.delta) return undefined;
  return { sourceId: stringValue(payload.message?.id) ?? "active", text: payload.assistantMessageEvent.delta };
}
function activityFromPiEvent(value: Record<string, unknown>, conversationIdValue: string, previous?: ActivityEvent): ActivityEvent | undefined {
  if (!/^tool_execution_(?:start|update|end)$/.test(String(value.type ?? ""))) return undefined;
  const id = stringValue(value.toolCallId); if (!id) return undefined;
  const name = stringValue(value.toolName) ?? previous?.detail ?? "Tool";
  const args = value.args && typeof value.args === "object" ? value.args as Record<string, unknown> : {};
  const subject = stringValue(args.path) ?? stringValue(args.file_path) ?? (name === "bash" ? stringValue(args.command) : undefined);
  const rawTitle = subject ? `${name === "bash" ? "" : `${name} `}${subject}` : name;
  const title = rawTitle.slice(0, 500); const timestamp = new Date().toISOString();
  const status: ActivityEvent["status"] = value.type === "tool_execution_end" ? value.isError === true ? "failed" : "completed" : "running";
  return { id: `tool:${id}`, conversationId: conversationIdValue, kind: toolActivityKind(name), title, detail: rawTitle, output: toolResultText(value.result) ?? previous?.output, status, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
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
  private readonly conversationRefreshListeners = new Map<string, Set<() => void>>();
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
    if (response.status === 409) throw new CrewError("conflict", "Cloud Agent is completing a lifecycle operation", true);
    if (response.status < 200 || response.status >= 300) throw new CrewError("unknown", `Cloud Agents request failed (${response.status})`, response.status >= 500);
    return response.body as T;
  }

  private mapAgent(value: RuntaAgent): Agent {
    return { id: value.id, name: value.name, role: "Cloud coding agent", goal: value.name, status: status(value.status), avatar: value.name.slice(0, 1).toUpperCase(), lastActiveAt: value.latest_reply?.updated_at ?? iso(value.updated_at_unix_seconds), unreadCount: 0, computerId: value.runtime_id, lastMessagePreview: value.latest_reply?.text };
  }

  async listModelProviders(_signal?: AbortSignal): Promise<ModelProviderCatalog> {
    void _signal;
    const response = await this.request<{ organization_id: string; model_providers: ModelProvider[] }>({ method: "GET", path: "/v2/model-providers" });
    return { organizationId: response.organization_id, providers: response.model_providers.map((provider) => ({ id: provider.id, name: provider.display_name, protocol: provider.protocol, defaultModel: provider.default_model ?? undefined })) };
  }

  async listAgents(_signal?: AbortSignal) {
    void _signal;
    const response = await this.request<{ agents: RuntaAgent[] }>({ method: "GET", path: "/v2/agents?limit=250&include_latest_reply=true" });
    return response.agents.map((agent) => this.mapAgent(agent));
  }
  async getAgent(agentId: string, _signal?: AbortSignal) { void _signal; return this.mapAgent(await this.request<RuntaAgent>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}` })); }
  async createAgent(input: CreateAgentInput, _signal?: AbortSignal) {
    if (!input.modelProviderId) throw new CrewError("contract_pending", "Select a managed model provider before creating a Crew agent");
    const created = await this.request<RuntaAgent>({ method: "POST", path: "/v2/agents", body: { name: input.name, system_prompt: crewSystemPrompt(input.name), initial_message: initialMessage(input.name), model_provider: { type: "managed", id: input.modelProviderId } } });
    const ready = await this.waitForAgentRunning(created.id, _signal);
    return this.mapAgent(ready);
  }
  private async waitForAgentRunning(agentId: string, signal?: AbortSignal): Promise<RuntaAgent> {
    const deadline = Date.now() + AGENT_READY_TIMEOUT_MS;
    for (;;) {
      if (signal?.aborted) throw new DOMException("Agent creation was cancelled", "AbortError");
      const agent = await this.request<RuntaAgent>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}` });
      if (agent.status === "running") return agent;
      if (agent.status === "failed") throw new CrewError("unknown", "The new Agent failed to start", true);
      if (Date.now() >= deadline) throw new CrewError("network", "The new Agent is still starting", true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, AGENT_READY_POLL_MS));
    }
  }
  async waitForInitialReply(agentId: string, signal?: AbortSignal): Promise<Message[]> {
    const deadline = Date.now() + 3 * 60_000;
    for (;;) {
      if (signal?.aborted) throw new DOMException("Agent creation was cancelled", "AbortError");
      const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/runs?limit=1` });
      const run = runs[0];
      if (run && terminalRunStatuses.has(run.status)) {
        if (run.status !== "finished") throw new CrewError("unknown", run.error?.trim() || "The Agent introduction failed", true);
        if (run.result?.trim()) return runMessages(run, conversationId(agentId)).filter((message) => message.role === "agent");
      }
      if (Date.now() >= deadline) throw new CrewError("network", "The Agent introduction is still pending", true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    }
  }
  async updateAgent(agentId: string, input: UpdateAgentInput, _signal?: AbortSignal): Promise<Agent> {
    void _signal;
    if (!input.name || Object.keys(input).some((key) => key !== "name")) throw new CrewError("contract_pending", "Only the Agent name can be updated");
    return this.mapAgent(await this.request<RuntaAgent>({ method: "PATCH", path: `/v2/agents/${encodeURIComponent(agentId)}`, body: { name: input.name } }));
  }
  async deleteAgent(agentId: string, _signal?: AbortSignal) { void _signal; await this.request<void>({ method: "DELETE", path: `/v2/agents/${encodeURIComponent(agentId)}?delete_runtime=true` }); }
  async duplicateAgent(_agentId: string, _signal?: AbortSignal): Promise<Agent> { void _agentId; void _signal; throw new CrewError("contract_pending", "Agent duplication requires the Cloud Agents duplication contract"); }
  async setAgentUnread(agentId: string, _unread: boolean, signal?: AbortSignal) { return this.getAgent(agentId, signal); }
  async listConversations(agentId: string, _signal?: AbortSignal) {
    void _signal;
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const latest = runs[0];
    return [{ id: conversationId(agentId), agentId, title: "Agent conversation", updatedAt: latest?.updated_at ?? new Date().toISOString() }];
  }
  private async listRunArtifacts(agentId: string, runId: string): Promise<Attachment[]> {
    try {
      const artifacts = await this.request<RuntaArtifact[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/artifacts?run_id=${encodeURIComponent(runId)}` });
      return artifacts.filter((artifact) => typeof artifact.id === "string" && typeof artifact.name === "string" && typeof artifact.media_type === "string" && typeof artifact.size === "number").map((artifact) => ({ id: artifact.id, name: artifact.name, size: artifact.size, mediaType: artifact.media_type, source: "cloud", agentId }));
    } catch {
      return [];
    }
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
      unsubscribe = bridge.subscribe(`/v2/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}/events?after=-1`, (event) => {
        if (event.event === "stream.closed" || event.event === "error") { finish(); return; }
        if (event.event === "pi.event" && event.data && typeof event.data === "object") {
          const payload = event.data as { type?: string };
          if (payload.type === "tool_execution_start") { current = undefined; return; }
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
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
    const messageGroups = await mapWithConcurrency(runs.slice().reverse(), 8, async (run) => {
      const [runMessagesValue, artifacts] = await Promise.all([this.replayRunMessages(agentId, run, id, _signal), terminalRunStatuses.has(run.status) ? this.listRunArtifacts(agentId, run.id) : Promise.resolve([])]);
      if (!artifacts.length) return runMessagesValue;
      const target = [...runMessagesValue].reverse().find((message) => message.role === "agent");
      if (target) target.parts.push(...artifacts.map((attachment) => ({ type: "attachment" as const, attachment })));
      return runMessagesValue;
    });
    const messages = messageGroups.flat();
    return { conversation: { id, agentId, title: "Agent conversation", updatedAt: runs[0]?.updated_at ?? new Date().toISOString() }, messages };
  }
  async sendMessage(input: SendMessageInput): Promise<Message> {
    const agentId = agentIdFromConversation(input.conversationId);
    const preparedImages = await Promise.all((input.attachments ?? []).map(async (attachment) => {
      if (attachment.source !== "local-selection") throw new CrewError("contract_pending", "Only local attachments can be sent");
      const content = await window.runtaCrew?.attachments.read(attachment.id); if (!content) throw new CrewError("unknown", "Attachment is no longer available");
      if (!/^image\/(?:gif|jpeg|png|webp)$/i.test(content.mediaType)) throw new CrewError("contract_pending", "This attachment type is not supported as native Agent input");
      return { type: "image" as const, data: content.base64, mime_type: content.mediaType };
    }));
    const prompt = input.text.trim();
    const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/runs?limit=1` });
    const latest = runs[0];
    const run = await this.request<RuntaRun>({ method: "POST", path: latest ? `/v2/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(latest.id)}/follow-ups` : `/v2/agents/${encodeURIComponent(agentId)}/runs`, body: { prompt, ...(preparedImages.length ? { images: preparedImages } : {}) } });
    for (const refresh of this.conversationRefreshListeners.get(input.conversationId) ?? []) refresh();
    return { id: `${run.id}:user:${crypto.randomUUID()}`, conversationId: input.conversationId, role: "user", parts: [...(input.text ? [{ type: "text" as const, text: input.text }] : []), ...(input.attachments ?? []).map((attachment) => ({ type: "attachment" as const, attachment }))], createdAt: new Date().toISOString() };
  }
  subscribeToConversationEvents(id: string, listener: (event: ConversationEvent) => void): Subscription {
    const agentId = agentIdFromConversation(id);
    const observed = new Map<string, string>();
    const streams = new Map<string, () => void>();
    const assistantStreams = new Map<string, { current?: string; seen: Set<string> }>();
    let baselineReady = false;
    const bridge = window.runtaCrew?.cloud;
    const subscribeToRun = (run: RuntaRun) => {
      if (!bridge?.subscribe || streams.has(run.id) || terminalRunStatuses.has(run.status)) return;
      let terminal = false;
      const assistant = { seen: new Set<string>() } as { current?: string; seen: Set<string> };
      const toolActivities = new Map<string, ActivityEvent>();
      assistantStreams.set(run.id, assistant);
      const completeCurrentAssistant = (notify = false) => {
        if (!assistant.current) return;
        listener({ type: "message.completed", messageId: assistant.current, notify });
        assistant.current = undefined;
      };
      const unsubscribe = bridge.subscribe(`/v2/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}/events?after=-1`, (event: CloudStreamEvent) => {
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
        if (event.event !== "pi.event" || terminal || !event.data || typeof event.data !== "object") return;
        const update = event.data as Record<string, unknown>;
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
        if (update.type === "tool_execution_start") completeCurrentAssistant();
        const activityId = stringValue(update.toolCallId);
        const activity = activityFromPiEvent(update, id, activityId ? toolActivities.get(`tool:${activityId}`) : undefined);
        if (activity) { toolActivities.set(activity.id, activity); listener({ type: "activity.updated", activity }); }
      });
      streams.set(run.id, unsubscribe);
    };
    let polling = false; let pollAgain = false;
    const poll = async () => {
      if (polling) { pollAgain = true; return; }
      polling = true;
      try {
        const runs = await this.request<RuntaRun[]>({ method: "GET", path: `/v2/agents/${encodeURIComponent(agentId)}/runs?limit=100` });
        const establishingBaseline = !baselineReady;
        for (const run of runs.slice().reverse()) {
          const signature = `${run.status}\u0000${run.result ?? ""}\u0000${run.error ?? ""}`;
          const previous = observed.get(run.id); observed.set(run.id, signature);
          subscribeToRun(run);
          if (previous === undefined && !establishingBaseline) {
            for (const message of runMessages(run, id)) listener({ type: "message.created", message });
          } else if (!establishingBaseline && previous !== signature && (assistantStreams.get(run.id)?.seen.size ?? 0) === 0) {
            const agentMessage = runMessages(run, id).find((message) => message.id === `${run.id}:agent`);
            if (agentMessage) listener({ type: "message.updated", message: agentMessage });
          }
          if (!establishingBaseline && previous !== signature && terminalRunStatuses.has(run.status) && (assistantStreams.get(run.id)?.seen.size ?? 0) === 0) listener({ type: "message.completed", messageId: `${run.id}:agent` });
        }
        baselineReady = true;
        listener({ type: "connection.changed", state: "connected" });
      } catch { listener({ type: "connection.changed", state: "error" }); }
      finally { polling = false; if (pollAgain) { pollAgain = false; void poll(); } }
    };
    const refreshWhenActive = () => { if (document.visibilityState !== "hidden" && navigator.onLine) void poll(); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refreshWhenActive(); };
    const refreshListeners = this.conversationRefreshListeners.get(id) ?? new Set<() => void>(); refreshListeners.add(refreshWhenActive); this.conversationRefreshListeners.set(id, refreshListeners);
    void poll(); const timer = window.setInterval(refreshWhenActive, RUN_FALLBACK_REFRESH_MS);
    window.addEventListener("focus", refreshWhenActive); window.addEventListener("online", refreshWhenActive); document.addEventListener("visibilitychange", onVisibilityChange);
    return { unsubscribe: () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenActive); window.removeEventListener("online", refreshWhenActive); document.removeEventListener("visibilitychange", onVisibilityChange); refreshListeners.delete(refreshWhenActive); if (refreshListeners.size === 0) this.conversationRefreshListeners.delete(id); for (const unsubscribe of streams.values()) unsubscribe(); streams.clear(); assistantStreams.clear(); } };
  }
  async listApprovalRequests(_agentId?: string, _signal?: AbortSignal): Promise<ApprovalRequest[]> { void _agentId; void _signal; return []; }
  async respondToApproval(_input: RespondApprovalInput, _signal?: AbortSignal): Promise<ApprovalRequest> { void _input; void _signal; throw new CrewError("contract_pending", "ACP approvals require the Cloud Agents approval contract"); }
  async getComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputer> { const agent = await this.getAgent(agentId, signal); return { id: agent.computerId, agentId, runtimeName: agent.computerId, status: agent.status === "offline" ? "offline" : "online", capabilities: ["open", "takeover"] }; }
  async openComputer(agentId: string, _signal?: AbortSignal): Promise<CloudComputerSession> {
    void _signal;
    const session = await this.request<RuntaComputerSession>({ method: "POST", path: `/v2/agents/${encodeURIComponent(agentId)}/computer-sessions` });
    return { url: session.channels.vnc.websocket_url, protocols: session.channels.vnc.protocols, mode: "remote" };
  }
  async takeOverComputer(agentId: string, signal?: AbortSignal) { return this.openComputer(agentId, signal); }
  async reconnect(signal?: AbortSignal) { await this.listAgents(signal); }
  getActivities(_conversationId: string) { void _conversationId; return []; }
}
