import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import { CrewError, type ActivityEvent, type Agent, type ApprovalRequest, type Attachment, type CloudComputer, type ConnectionState, type ConversationEvent, type CreateAgentInput, type Message, type ModelProviderOption, type UpdateAgentInput } from "@/domain/types";

function agentMessagePreview(message?: Message): string {
  if (!message || message.role !== "agent") return "";
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
}

function messageText(message: Message): string {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
}

interface AgentSnapshot { messages: Message[]; approvals: ApprovalRequest[]; computer?: CloudComputer; cachedAt: number }
const SNAPSHOT_TTL_MS = 60_000;
const isTransientGatewayError = (message?: string) => /^Cloud Agents request failed \((?:502|503|504)\)$/.test(message ?? "");
const OPTIMISTIC_USER_PREFIX = "optimistic-user:";
const OPTIMISTIC_AGENT_PREFIX = "optimistic-agent:";

export function useCrewController(client: CloudAgentsClient, enabled = true) {
  const [agents, setAgents] = useState<Agent[]>([]); const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]); const [activities, setActivities] = useState<ActivityEvent[]>([]); const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [computer, setComputer] = useState<CloudComputer>(); const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [modelProviders, setModelProviders] = useState<ModelProviderOption[]>([]);
  const [loading, setLoading] = useState(enabled); const [error, setError] = useState<string>();
  const [loadedAgentIds, setLoadedAgentIds] = useState<ReadonlySet<string>>(() => new Set());
  const [liveAgentId, setLiveAgentId] = useState(""); const [revalidateVersion, setRevalidateVersion] = useState(0);
  const snapshots = useRef(new Map<string, AgentSnapshot>()); const selectedAgentIdRef = useRef(selectedAgentId); const deletingAgentIds = useRef(new Set<string>()); const sendingAgentIds = useRef(new Set<string>());
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const conversationId = selectedAgentId ? `conversation-${selectedAgentId}` : "";
  const conversationLoading = Boolean(selectedAgentId && !loadedAgentIds.has(selectedAgentId));
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);

  const refreshAgents = useCallback(async () => {
    const fetched = await client.listAgents();
    for (const agentId of deletingAgentIds.current) if (!fetched.some((agent) => agent.id === agentId)) deletingAgentIds.current.delete(agentId);
    const next = fetched.filter((agent) => !deletingAgentIds.current.has(agent.id));
    const selectedId = selectedAgentIdRef.current; const selected = next.find((agent) => agent.id === selectedId); const snapshot = snapshots.current.get(selectedId);
    if (selected?.lastMessagePreview && snapshot && !snapshot.messages.some((message) => message.streaming)) {
      const cachedPreview = agentMessagePreview([...snapshot.messages].reverse().find((message) => message.role === "agent"));
      if (cachedPreview !== selected.lastMessagePreview) { snapshots.current.set(selectedId, { ...snapshot, cachedAt: 0 }); setRevalidateVersion((value) => value + 1); }
    }
    setAgents((current) => next.map((agent) => ({ ...agent, lastMessagePreview: agent.lastMessagePreview ?? current.find((item) => item.id === agent.id)?.lastMessagePreview })));
    setSelectedAgentId((current) => current && next.some((agent) => agent.id === current) ? current : next[0]?.id || ""); return next;
  }, [client]);
  useEffect(() => {
    if (!enabled) { setAgents([]); setModelProviders([]); setSelectedAgentId(""); setMessages([]); setActivities([]); setApprovals([]); setComputer(undefined); setConnection("disconnected"); setLoading(false); setError(undefined); return; }
    let alive = true; setLoading(true);
    void Promise.all([refreshAgents(), client.listModelProviders()]).then(([, providers]) => { if (alive) { setModelProviders(providers); setConnection("connected"); setLoading(false); } }).catch((reason: unknown) => { if (alive) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Could not load agents"); setLoading(false); } });
    return () => { alive = false; };
  }, [client, enabled, refreshAgents]);
  useEffect(() => { if (!enabled) return; const timer = window.setInterval(() => { void refreshAgents().then(() => setError((current) => isTransientGatewayError(current) ? undefined : current)).catch(() => undefined); }, 5_000); return () => window.clearInterval(timer); }, [enabled, refreshAgents]);
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
        const nextMessages = data?.messages ?? [];
        const preview = agentMessagePreview([...nextMessages].reverse().find((message) => message.role === "agent"));
        snapshots.current.set(selectedAgentId, { messages: nextMessages, approvals: nextApprovals, computer: nextComputer, cachedAt: Date.now() });
        setLoadedAgentIds((current) => new Set(current).add(selectedAgentId));
        setMessages(nextMessages); setApprovals(nextApprovals); setComputer(nextComputer);
        setLiveAgentId(selectedAgentId);
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: preview || undefined } : agent));
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
          const withoutPlaceholder = event.message.role === "agent" ? current.filter((message) => !message.id.startsWith(OPTIMISTIC_AGENT_PREFIX)) : current;
          if (event.message.role === "user" && sendingAgentIds.current.has(selectedAgentId)) {
            const optimisticIndex = withoutPlaceholder.findIndex((message) => message.id.startsWith(OPTIMISTIC_USER_PREFIX) && messageText(message) === messageText(event.message));
            if (optimisticIndex >= 0) return withoutPlaceholder.map((message, index) => index === optimisticIndex ? event.message : message);
          }
          return withoutPlaceholder.some((message) => message.id === event.message.id) ? withoutPlaceholder : [...withoutPlaceholder, event.message];
        });
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "message.delta") {
        updateMessages((current) => {
          const withoutPlaceholder = current.filter((message) => !message.id.startsWith(OPTIMISTIC_AGENT_PREFIX));
          if (!withoutPlaceholder.some((message) => message.id === event.messageId)) return [...withoutPlaceholder, { id: event.messageId, conversationId, role: "agent", parts: [{ type: "text", text: event.delta }], createdAt: new Date().toISOString(), streaming: true }];
          return withoutPlaceholder.map((message) => message.id === event.messageId ? { ...message, parts: message.parts.map((part, index) => index === 0 && part.type === "text" ? { ...part, text: part.text + event.delta } : part) } : message);
        });
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: `${agent.lastMessagePreview ?? ""}${event.delta}` } : agent));
      }
      if (event.type === "message.completed") { updateMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, streaming: false } : message)); void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} finished`, body: "New work is ready to review in Runta Crew." }); }
      if (event.type === "message.updated") {
        updateMessages((current) => { const withoutPlaceholder = event.message.role === "agent" ? current.filter((message) => !message.id.startsWith(OPTIMISTIC_AGENT_PREFIX)) : current; return withoutPlaceholder.some((message) => message.id === event.message.id) ? withoutPlaceholder.map((message) => message.id === event.message.id ? event.message : message) : [...withoutPlaceholder, event.message]; });
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "approval.updated") { setApprovals((current) => { const next = current.map((approval) => approval.id === event.approval.id ? event.approval : approval); const snapshot = snapshots.current.get(selectedAgentId); snapshots.current.set(selectedAgentId, { messages: snapshot?.messages ?? [], approvals: next, computer: snapshot?.computer, cachedAt: Date.now() }); return next; }); if (event.approval.status === "pending") void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} needs approval`, body: event.approval.title }); }
      if (event.type === "activity.updated") setActivities((current) => current.some((activity) => activity.id === event.activity.id) ? current.map((activity) => activity.id === event.activity.id ? event.activity : activity) : [...current, event.activity]);
      if (event.type === "connection.changed") setConnection(event.state);
    }); return () => { active = false; subscription.unsubscribe(); };
  }, [client, conversationId, enabled, liveAgentId, selectedAgent?.name, selectedAgentId]);

  return {
    agents, modelProviders, selectedAgent, selectedAgentId, setSelectedAgentId, messages, activities, approvals, computer, connection, loading, conversationLoading, error,
    dismissError: () => setError(undefined),
    createAgent: async (input: CreateAgentInput) => { const agent = await client.createAgent(input); snapshots.current.set(agent.id, { messages: [], approvals: [], cachedAt: 0 }); setLoadedAgentIds((current) => new Set(current).add(agent.id)); await refreshAgents(); setSelectedAgentId(agent.id); return agent; },
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
      if (sendingAgentIds.current.has(targetAgentId)) return;
      sendingAgentIds.current.add(targetAgentId);
      const optimisticUserId = `${OPTIMISTIC_USER_PREFIX}${nonce}`; const optimisticAgentId = `${OPTIMISTIC_AGENT_PREFIX}${nonce}`; const createdAt = new Date().toISOString();
      const optimisticUser: Message = { id: optimisticUserId, conversationId: targetConversationId, role: "user", parts: [...(text ? [{ type: "text" as const, text }] : []), ...attachments.map((attachment) => ({ type: "attachment" as const, attachment }))], createdAt };
      const optimisticAgent: Message = { id: optimisticAgentId, conversationId: targetConversationId, role: "agent", parts: [{ type: "text", text: "" }], createdAt, streaming: true };
      const snapshot = snapshots.current.get(targetAgentId) ?? { messages: [], approvals: [], cachedAt: Date.now() };
      const optimisticMessages = [...snapshot.messages, optimisticUser, optimisticAgent];
      snapshots.current.set(targetAgentId, { ...snapshot, messages: optimisticMessages, cachedAt: Date.now() });
      if (selectedAgentIdRef.current === targetAgentId) { setMessages(optimisticMessages); setLiveAgentId(targetAgentId); }
      try {
        const message = await client.sendMessage({ conversationId: targetConversationId, text, attachments });
        const latest = snapshots.current.get(targetAgentId) ?? snapshot;
        const reconciled = latest.messages.map((item) => item.id === optimisticUserId ? message : item).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
        snapshots.current.set(targetAgentId, { ...latest, messages: reconciled, cachedAt: Date.now() });
        if (selectedAgentIdRef.current === targetAgentId) setMessages(reconciled);
      } catch (reason) {
        const latest = snapshots.current.get(targetAgentId) ?? snapshot;
        const rolledBack = latest.messages.filter((message) => message.id !== optimisticUserId && message.id !== optimisticAgentId);
        snapshots.current.set(targetAgentId, { ...latest, messages: rolledBack, cachedAt: Date.now() });
        if (selectedAgentIdRef.current === targetAgentId) setMessages(rolledBack);
        setError(reason instanceof Error ? reason.message : "Could not send message");
        throw reason;
      } finally {
        sendingAgentIds.current.delete(targetAgentId);
      }
    },
    respondToApproval: async (requestId: string, decision: "allow" | "deny", note?: string) => { const targetAgentId = selectedAgentId; const next = await client.respondToApproval({ requestId, decision, note }); const snapshot = snapshots.current.get(targetAgentId); const nextApprovals = (snapshot?.approvals ?? []).map((item) => item.id === next.id ? next : item); if (snapshot) snapshots.current.set(targetAgentId, { ...snapshot, approvals: nextApprovals, cachedAt: Date.now() }); if (selectedAgentIdRef.current === targetAgentId) setApprovals(nextApprovals); },
    openComputer: async (action: "open" | "takeover") => { if (!selectedAgentId) throw new Error("No agent is selected"); try { return await (action === "open" ? client.openComputer(selectedAgentId) : client.takeOverComputer(selectedAgentId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open cloud computer"); throw reason; } },
    reconnect: async () => { setConnection("connecting"); try { await client.reconnect(); await refreshAgents(); setConnection("connected"); } catch (reason) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Reconnect failed"); } },
  };
}
