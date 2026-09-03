import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type ActivityEvent, type Agent, type ApprovalRequest, type Attachment, type CloudComputer, type ConnectionState, type ConversationEvent, type CreateAgentInput, type Message, type ModelProviderOption, type UpdateAgentInput } from "@/domain/types";

function agentMessagePreview(message?: Message): string {
  if (!message || message.role !== "agent") return "";
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
}

function latestCompletedAgentPreview(messages: Message[]): string {
  return agentMessagePreview([...messages].reverse().find((message) => message.role === "agent" && !message.streaming));
}

function messageText(message: Message): string {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
}

interface AgentSnapshot { messages: Message[]; approvals: ApprovalRequest[]; computer?: CloudComputer; cachedAt: number }
const SNAPSHOT_TTL_MS = 60_000;
const AGENT_FALLBACK_REFRESH_MS = 30_000;
const isTransientGatewayError = (message?: string) => /^Cloud Agents request failed \((?:502|503|504)\)$/.test(message ?? "");
const OPTIMISTIC_USER_PREFIX = "optimistic-user:";
const OPTIMISTIC_AGENT_PREFIX = "optimistic-agent:";

export function useCrewController(client: CloudAgentsClient, enabled = true) {
  const [agents, setAgents] = useState<Agent[]>([]); const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]); const [activities, setActivities] = useState<ActivityEvent[]>([]); const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [computer, setComputer] = useState<CloudComputer>(); const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [modelProviders, setModelProviders] = useState<ModelProviderOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(enabled); const [error, setError] = useState<string>();
  const [loadedAgentIds, setLoadedAgentIds] = useState<ReadonlySet<string>>(() => new Set());
  const [liveAgentId, setLiveAgentId] = useState(""); const [revalidateVersion, setRevalidateVersion] = useState(0);
  const snapshots = useRef(new Map<string, AgentSnapshot>()); const selectedAgentIdRef = useRef(selectedAgentId); const deletingAgentIds = useRef(new Set<string>()); const sendingAgentRequests = useRef(new Map<string, number>()); const visualMessageIds = useRef(new Map<string, string>());
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const conversationId = selectedAgentId ? `conversation-${selectedAgentId}` : "";
  const conversationLoading = Boolean(selectedAgentId && !loadedAgentIds.has(selectedAgentId));
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);

  const refreshAgents = useCallback(async (preserveSelection = false) => {
    const fetched = await client.listAgents();
    for (const agentId of deletingAgentIds.current) if (!fetched.some((agent) => agent.id === agentId)) deletingAgentIds.current.delete(agentId);
    const next = fetched.filter((agent) => !deletingAgentIds.current.has(agent.id));
    const selectedId = selectedAgentIdRef.current; const selected = next.find((agent) => agent.id === selectedId); const snapshot = snapshots.current.get(selectedId);
    if (selected?.lastMessagePreview && snapshot && !snapshot.messages.some((message) => message.streaming)) {
      const cachedPreview = latestCompletedAgentPreview(snapshot.messages);
      if (cachedPreview !== selected.lastMessagePreview) { snapshots.current.set(selectedId, { ...snapshot, cachedAt: 0 }); setRevalidateVersion((value) => value + 1); }
    }
    const selectedIsStreaming = Boolean(snapshot?.messages.some((message) => message.streaming));
    setAgents((current) => next.map((agent) => {
      const existing = current.find((item) => item.id === agent.id);
      const localPreview = latestCompletedAgentPreview(snapshots.current.get(agent.id)?.messages ?? []);
      const preserveLocalPreview = Boolean(localPreview) || (agent.id === selectedId && selectedIsStreaming);
      return { ...agent, lastMessagePreview: preserveLocalPreview ? localPreview || existing?.lastMessagePreview : agent.lastMessagePreview ?? existing?.lastMessagePreview };
    }));
    setSelectedAgentId((current) => current && next.some((agent) => agent.id === current) ? current : preserveSelection ? current : next[0]?.id || ""); return next;
  }, [client]);
  const refreshModelProviders = useCallback(async () => {
    const catalog = await client.listModelProviders();
    setModelProviders(catalog.providers); setOrganizationId(catalog.organizationId);
    return catalog.providers;
  }, [client]);
  useEffect(() => {
    if (!enabled) { setAgents([]); setModelProviders([]); setOrganizationId(""); setSelectedAgentId(""); setMessages([]); setActivities([]); setApprovals([]); setComputer(undefined); setConnection("disconnected"); setLoading(false); setError(undefined); return; }
    let alive = true; setLoading(true);
    void Promise.all([refreshAgents(), refreshModelProviders()]).then(() => { if (alive) { setConnection("connected"); setLoading(false); } }).catch((reason: unknown) => { if (alive) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Could not load agents"); setLoading(false); } });
    return () => { alive = false; };
  }, [enabled, refreshAgents, refreshModelProviders]);
  useEffect(() => {
    if (!enabled) return;
    const refreshWhenActive = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      void refreshAgents().then(() => setError((current) => isTransientGatewayError(current) ? undefined : current)).catch(() => undefined);
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refreshWhenActive(); };
    const timer = window.setInterval(refreshWhenActive, AGENT_FALLBACK_REFRESH_MS);
    window.addEventListener("focus", refreshWhenActive); window.addEventListener("online", refreshWhenActive); document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenActive); window.removeEventListener("online", refreshWhenActive); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [enabled, refreshAgents]);
  useEffect(() => {
    if (!enabled) return;
    const cached = snapshots.current.get(selectedAgentId);
    setActivities([]);
    if (cached) { setMessages(cached.messages); setApprovals(cached.approvals); setComputer(cached.computer); }
    else { setMessages([]); setApprovals([]); setComputer(undefined); }
    setLiveAgentId("");
    if (!selectedAgentId) return;
    const cacheAge = cached ? Date.now() - cached.cachedAt : Number.POSITIVE_INFINITY;
    if (cached && cacheAge < SNAPSHOT_TTL_MS) {
      if (cached.messages.some((message) => message.streaming)) setLiveAgentId(selectedAgentId);
      const timer = window.setTimeout(() => setRevalidateVersion((value) => value + 1), SNAPSHOT_TTL_MS - cacheAge);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController(); let alive = true;
    Promise.all([client.listConversations(selectedAgentId, controller.signal), client.listApprovalRequests(selectedAgentId, controller.signal), client.getComputer(selectedAgentId, controller.signal)]).then(async ([conversations, nextApprovals, nextComputer]) => {
      const conversation = conversations[0]; const data = conversation ? await client.getConversation(conversation.id, controller.signal) : undefined;
      if (alive && !deletingAgentIds.current.has(selectedAgentId)) {
        const hydratedMessages = (data?.messages ?? []).map((message) => { const visualId = visualMessageIds.current.get(message.id); return visualId ? { ...message, id: visualId } : message; });
        const optimisticMessages = (snapshots.current.get(selectedAgentId)?.messages ?? []).filter((message) => message.id.startsWith(OPTIMISTIC_USER_PREFIX) || message.id.startsWith(OPTIMISTIC_AGENT_PREFIX));
        const nextMessages = [...hydratedMessages, ...optimisticMessages.filter((message) => !hydratedMessages.some((item) => item.id === message.id))];
        const preview = latestCompletedAgentPreview(nextMessages);
        snapshots.current.set(selectedAgentId, { messages: nextMessages, approvals: nextApprovals, computer: nextComputer, cachedAt: Date.now() });
        setLoadedAgentIds((current) => new Set(current).add(selectedAgentId));
        setMessages(nextMessages); setApprovals(nextApprovals); setComputer(nextComputer);
        setLiveAgentId(selectedAgentId);
        if (preview) setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: preview } : agent));
      }
    }).catch((reason: unknown) => { if (alive && !deletingAgentIds.current.has(selectedAgentId) && !(reason instanceof DOMException && reason.name === "AbortError")) { snapshots.current.set(selectedAgentId, { messages: [], approvals: [], cachedAt: Date.now() }); setLoadedAgentIds((current) => new Set(current).add(selectedAgentId)); setMessages([]); setError(reason instanceof Error ? reason.message : "Could not load agent"); } });
    return () => { alive = false; controller.abort(); };
  }, [client, enabled, revalidateVersion, selectedAgentId]);
  useEffect(() => {
    if (!enabled || !conversationId || liveAgentId !== selectedAgentId) return; let active = true;
    const updateMessages = (updater: (current: Message[]) => Message[]) => setMessages((current) => {
      const next = updater(current); const snapshot = snapshots.current.get(selectedAgentId);
      snapshots.current.set(selectedAgentId, { messages: next, approvals: snapshot?.approvals ?? [], computer: snapshot?.computer, cachedAt: Date.now() });
      return next;
    });
    const subscription = client.subscribeToConversationEvents(conversationId, (event: ConversationEvent) => {
      if (!active) return;
      if (event.type === "message.created") {
        updateMessages((current) => {
          let nextMessage = event.message; let knownVisualId = visualMessageIds.current.get(event.message.id);
          if (!knownVisualId && event.message.role === "agent") {
            const canonicalRunMessageId = event.message.id.replace(/:agent:.+$/, ":agent");
            const canonicalVisualId = canonicalRunMessageId === event.message.id ? undefined : visualMessageIds.current.get(canonicalRunMessageId);
            if (canonicalVisualId) {
              knownVisualId = canonicalVisualId;
              visualMessageIds.current.set(event.message.id, canonicalVisualId);
            }
          }
          if (knownVisualId) nextMessage = { ...event.message, id: knownVisualId };
          if (event.message.role === "user") {
            const claimedVisualIds = new Set(visualMessageIds.current.values());
            const optimistic = current.find((message) => message.id.startsWith(OPTIMISTIC_USER_PREFIX) && !claimedVisualIds.has(message.id) && messageText(message) === messageText(event.message));
            if (optimistic) { visualMessageIds.current.set(event.message.id, optimistic.id); nextMessage = { ...event.message, id: optimistic.id }; }
          }
          if (event.message.role === "agent" && !knownVisualId) {
            const claimedVisualIds = new Set(visualMessageIds.current.values());
            const optimistic = current.find((message) => message.id.startsWith(OPTIMISTIC_AGENT_PREFIX) && !claimedVisualIds.has(message.id));
            if (optimistic) { visualMessageIds.current.set(event.message.id, optimistic.id); nextMessage = { ...event.message, id: optimistic.id }; }
          }
          return current.some((message) => message.id === nextMessage.id) ? current.map((message) => message.id === nextMessage.id ? nextMessage : message) : [...current, nextMessage];
        });
      }
      if (event.type === "message.delta") {
        updateMessages((current) => {
          let visualId = visualMessageIds.current.get(event.messageId);
          if (!visualId) {
            const canonicalRunMessageId = event.messageId.replace(/:agent:.+$/, ":agent");
            if (canonicalRunMessageId !== event.messageId) {
              visualId = visualMessageIds.current.get(canonicalRunMessageId);
              if (visualId) visualMessageIds.current.set(event.messageId, visualId);
            }
          }
          if (!visualId) { const claimedVisualIds = new Set(visualMessageIds.current.values()); const optimistic = current.find((message) => message.id.startsWith(OPTIMISTIC_AGENT_PREFIX) && !claimedVisualIds.has(message.id)); if (optimistic) { visualId = optimistic.id; visualMessageIds.current.set(event.messageId, visualId); } }
          visualId ??= event.messageId;
          if (!current.some((message) => message.id === visualId)) return [...current, { id: visualId, conversationId, role: "agent", parts: [{ type: "text", text: event.delta }], createdAt: new Date().toISOString(), streaming: true }];
          return current.map((message) => message.id === visualId ? { ...message, parts: message.parts.map((part, index) => index === 0 && part.type === "text" ? { ...part, text: part.text + event.delta } : part) } : message);
        });
      }
      if (event.type === "message.completed") {
        const visualId = visualMessageIds.current.get(event.messageId) ?? event.messageId;
        if (event.notify === false) {
          updateMessages((current) => current.flatMap((message) => {
            if (message.id !== visualId) return [message];
            if (!message.id.startsWith(OPTIMISTIC_AGENT_PREFIX)) return [];
            return [{ ...message, parts: message.parts.map((part) => part.type === "text" ? { ...part, text: "" } : part), streaming: true }];
          }));
        } else {
          updateMessages((current) => {
            const completed = current.filter((message) => message.id === visualId || message.role !== "agent" || !message.streaming).map((message) => message.id === visualId ? { ...message, streaming: false } : message);
            const completedPreview = latestCompletedAgentPreview(completed);
            if (completedPreview) setAgents((agents) => agents.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: completedPreview } : agent));
            return completed;
          });
          void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} finished`, body: "New work is ready to review in Runta Crew." });
        }
      }
      if (event.type === "message.updated") {
        updateMessages((current) => { let visualId = visualMessageIds.current.get(event.message.id); if (!visualId && event.message.role === "agent") { const claimedVisualIds = new Set(visualMessageIds.current.values()); const optimistic = current.find((message) => message.id.startsWith(OPTIMISTIC_AGENT_PREFIX) && !claimedVisualIds.has(message.id)); if (optimistic) { visualId = optimistic.id; visualMessageIds.current.set(event.message.id, visualId); } } const nextMessage = visualId ? { ...event.message, id: visualId } : event.message; const settled = event.message.role === "agent" && !event.message.streaming ? current.filter((message) => message.id === nextMessage.id || message.role !== "agent" || !message.streaming) : current; return settled.some((message) => message.id === nextMessage.id) ? settled.map((message) => message.id === nextMessage.id ? nextMessage : message) : [...settled, nextMessage]; });
        if (event.message.role === "agent" && !event.message.streaming) setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "approval.updated") { setApprovals((current) => { const next = current.map((approval) => approval.id === event.approval.id ? event.approval : approval); const snapshot = snapshots.current.get(selectedAgentId); snapshots.current.set(selectedAgentId, { messages: snapshot?.messages ?? [], approvals: next, computer: snapshot?.computer, cachedAt: Date.now() }); return next; }); if (event.approval.status === "pending") void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} needs approval`, body: event.approval.title }); }
      if (event.type === "activity.updated") setActivities((current) => current.some((activity) => activity.id === event.activity.id) ? current.map((activity) => activity.id === event.activity.id ? event.activity : activity) : [...current, event.activity]);
      if (event.type === "connection.changed") setConnection(event.state);
    }); return () => { active = false; subscription.unsubscribe(); };
  }, [client, conversationId, enabled, liveAgentId, selectedAgent?.name, selectedAgentId]);

  return {
    agents, modelProviders, organizationId, refreshModelProviders, selectedAgent, selectedAgentId, setSelectedAgentId, messages, activities, approvals, computer, connection, loading, conversationLoading, error,
    focusAgentWithMessages: (agentId: string, initialMessages: Message[]) => { const preview = latestCompletedAgentPreview(initialMessages); snapshots.current.set(agentId, { messages: initialMessages, approvals: [], cachedAt: Date.now() }); setLoadedAgentIds((current) => new Set(current).add(agentId)); if (preview) setAgents((current) => current.map((agent) => agent.id === agentId ? { ...agent, lastMessagePreview: preview } : agent)); setSelectedAgentId(agentId); },
    dismissError: () => setError(undefined),
    createAgent: async (input: CreateAgentInput) => { const agent = await client.createAgent(input); await refreshAgents(true); return agent; },
    updateAgent: async (agentId: string, input: UpdateAgentInput) => { await client.updateAgent(agentId, input); await refreshAgents(); },
    deleteAgent: async (agentId: string) => {
      const removedAgent = agents.find((agent) => agent.id === agentId); const previousSelectedAgentId = selectedAgentId;
      if (!removedAgent || deletingAgentIds.current.has(agentId)) return;
      const removedIndex = agents.findIndex((agent) => agent.id === agentId);
      const nextAgents = agents.filter((agent) => agent.id !== agentId);
      const nextSelectedAgentId = previousSelectedAgentId === agentId ? nextAgents[Math.min(Math.max(removedIndex, 0), Math.max(nextAgents.length - 1, 0))]?.id ?? "" : previousSelectedAgentId;
      deletingAgentIds.current.add(agentId); setAgents(nextAgents); setSelectedAgentId(nextSelectedAgentId);
      try {
        try { await client.deleteAgent(agentId); }
        catch (reason) { if (!(reason instanceof CrewError && reason.code === "not_found")) throw reason; }
        snapshots.current.delete(agentId);
        setLoadedAgentIds((current) => { const next = new Set(current); next.delete(agentId); return next; });
        await refreshAgents(); setError((current) => current === "Resource not found" ? undefined : current);
      } catch (reason) {
        deletingAgentIds.current.delete(agentId);
        setAgents((current) => { if (current.some((agent) => agent.id === agentId)) return current; const next = [...current]; next.splice(Math.min(removedIndex, next.length), 0, removedAgent); return next; });
        setSelectedAgentId((current) => current || (previousSelectedAgentId === agentId ? agentId : current));
        setError(reason instanceof Error ? reason.message : "Could not delete agent"); throw reason;
      }
    },
    duplicateAgent: async (agentId: string) => { const agent = await client.duplicateAgent(agentId); await refreshAgents(); setSelectedAgentId(agent.id); },
    setAgentUnread: async (agentId: string, unread: boolean) => { await client.setAgentUnread(agentId, unread); await refreshAgents(); },
    sendMessage: async (text: string, attachments: Attachment[] = []) => {
      if (!conversationId || !selectedAgentId) return;
      const targetAgentId = selectedAgentId; const targetConversationId = conversationId; const nonce = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
      sendingAgentRequests.current.set(targetAgentId, (sendingAgentRequests.current.get(targetAgentId) ?? 0) + 1);
      const optimisticUserId = `${OPTIMISTIC_USER_PREFIX}${nonce}`; const optimisticAgentId = `${OPTIMISTIC_AGENT_PREFIX}${nonce}`; const createdAt = new Date().toISOString();
      const optimisticUser: Message = { id: optimisticUserId, conversationId: targetConversationId, role: "user", parts: [...(text ? [{ type: "text" as const, text }] : []), ...attachments.map((attachment) => ({ type: "attachment" as const, attachment }))], createdAt };
      const optimisticAgent: Message = { id: optimisticAgentId, conversationId: targetConversationId, role: "agent", parts: [{ type: "text", text: "" }], createdAt, streaming: true };
      const snapshot = snapshots.current.get(targetAgentId) ?? { messages: [], approvals: [], cachedAt: Date.now() };
      const existingWorking = [...snapshot.messages].reverse().find((message) => message.role === "agent" && message.streaming);
      const interruptedMessages = existingWorking ? snapshot.messages.map((message) => message.id === existingWorking.id ? { ...message, streaming: false, interrupted: true } : message) : snapshot.messages;
      const optimisticMessages = [...interruptedMessages, optimisticUser, optimisticAgent];
      if (selectedAgentIdRef.current === targetAgentId) setActivities([]);
      snapshots.current.set(targetAgentId, { ...snapshot, messages: optimisticMessages, cachedAt: Date.now() });
      if (selectedAgentIdRef.current === targetAgentId) { setMessages(optimisticMessages); setLiveAgentId(targetAgentId); }
      try {
        const message = await client.sendMessage({ conversationId: targetConversationId, text, attachments });
        visualMessageIds.current.set(message.id, optimisticUserId);
        const runId = message.id.match(/^(.+):user(?:$|:)/)?.[1];
        if (runId) {
          visualMessageIds.current.set(`${runId}:user`, optimisticUserId);
          visualMessageIds.current.set(`${runId}:agent`, existingWorking?.id ?? optimisticAgentId);
        }
        const latest = snapshots.current.get(targetAgentId) ?? snapshot;
        const visualMessage = { ...message, id: optimisticUserId };
        const reconciled = latest.messages.map((item) => item.id === optimisticUserId ? visualMessage : item).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
        snapshots.current.set(targetAgentId, { ...latest, messages: reconciled, cachedAt: Date.now() });
        if (selectedAgentIdRef.current === targetAgentId) setMessages(reconciled);
      } catch (reason) {
        const latest = snapshots.current.get(targetAgentId) ?? snapshot;
        const withoutEmptyAgent = latest.messages.filter((message) => message.id !== optimisticAgentId);
        const retained = withoutEmptyAgent.some((message) => message.id === optimisticUserId) ? withoutEmptyAgent : [...withoutEmptyAgent, optimisticUser];
        snapshots.current.set(targetAgentId, { ...latest, messages: retained, cachedAt: Date.now() });
        if (selectedAgentIdRef.current === targetAgentId) setMessages(retained);
        if (!existingWorking) setError(reason instanceof Error ? reason.message : "Could not send message");
        throw reason;
      } finally {
        const pending = (sendingAgentRequests.current.get(targetAgentId) ?? 1) - 1;
        if (pending > 0) sendingAgentRequests.current.set(targetAgentId, pending);
        else sendingAgentRequests.current.delete(targetAgentId);
      }
    },
    respondToApproval: async (requestId: string, decision: "allow" | "deny", note?: string) => { const targetAgentId = selectedAgentId; const next = await client.respondToApproval({ requestId, decision, note }); const snapshot = snapshots.current.get(targetAgentId); const nextApprovals = (snapshot?.approvals ?? []).map((item) => item.id === next.id ? next : item); if (snapshot) snapshots.current.set(targetAgentId, { ...snapshot, approvals: nextApprovals, cachedAt: Date.now() }); if (selectedAgentIdRef.current === targetAgentId) setApprovals(nextApprovals); },
    openComputer: async (action: "open" | "takeover") => { if (!selectedAgentId) throw new Error("No agent is selected"); try { return await (action === "open" ? client.openComputer(selectedAgentId) : client.takeOverComputer(selectedAgentId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open cloud computer"); throw reason; } },
    reconnect: async () => { setConnection("connecting"); try { await client.reconnect(); await refreshAgents(); setConnection("connected"); } catch (reason) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Reconnect failed"); } },
  };
}
