import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import type { ActivityEvent, Agent, ApprovalRequest, Attachment, CloudComputer, ConnectionState, ConversationEvent, CreateAgentInput, Message, ModelProviderOption, UpdateAgentInput } from "@/domain/types";

function agentMessagePreview(message?: Message): string {
  if (!message || message.role !== "agent") return "";
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
}

interface AgentSnapshot { messages: Message[]; approvals: ApprovalRequest[]; computer?: CloudComputer; cachedAt: number }
const SNAPSHOT_TTL_MS = 60_000;

export function useCrewController(client: CloudAgentsClient) {
  const [agents, setAgents] = useState<Agent[]>([]); const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]); const [activities, setActivities] = useState<ActivityEvent[]>([]); const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [computer, setComputer] = useState<CloudComputer>(); const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [modelProviders, setModelProviders] = useState<ModelProviderOption[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const [liveAgentId, setLiveAgentId] = useState(""); const [revalidateVersion, setRevalidateVersion] = useState(0);
  const snapshots = useRef(new Map<string, AgentSnapshot>()); const selectedAgentIdRef = useRef(selectedAgentId);
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const conversationId = selectedAgentId ? `conversation-${selectedAgentId}` : "";
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);

  const refreshAgents = useCallback(async () => { const next = await client.listAgents(); setAgents((current) => next.map((agent) => ({ ...agent, lastMessagePreview: agent.lastMessagePreview ?? current.find((item) => item.id === agent.id)?.lastMessagePreview }))); setSelectedAgentId((current) => current && next.some((agent) => agent.id === current) ? current : next[0]?.id || ""); return next; }, [client]);
  useEffect(() => { let alive = true; void Promise.all([refreshAgents(), client.listModelProviders()]).then(([, providers]) => { if (alive) { setModelProviders(providers); setConnection("connected"); setLoading(false); } }).catch((reason: unknown) => { if (alive) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Could not load agents"); setLoading(false); } }); return () => { alive = false; }; }, [client, refreshAgents]);
  useEffect(() => { const timer = window.setInterval(() => { void refreshAgents().catch(() => undefined); }, 5_000); return () => window.clearInterval(timer); }, [refreshAgents]);
  useEffect(() => {
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
      if (alive) {
        const nextMessages = data?.messages ?? [];
        const preview = agentMessagePreview([...nextMessages].reverse().find((message) => message.role === "agent"));
        snapshots.current.set(selectedAgentId, { messages: nextMessages, approvals: nextApprovals, computer: nextComputer, cachedAt: Date.now() });
        setMessages(nextMessages); setApprovals(nextApprovals); setComputer(nextComputer);
        setLiveAgentId(selectedAgentId);
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: preview || undefined } : agent));
      }
    }).catch((reason: unknown) => { if (alive && !(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Could not load agent"); });
    return () => { alive = false; controller.abort(); };
  }, [client, revalidateVersion, selectedAgentId]);
  useEffect(() => {
    if (!conversationId || liveAgentId !== selectedAgentId) return; let active = true;
    const updateMessages = (updater: (current: Message[]) => Message[]) => setMessages((current) => {
      const next = updater(current); const snapshot = snapshots.current.get(selectedAgentId);
      snapshots.current.set(selectedAgentId, { messages: next, approvals: snapshot?.approvals ?? [], computer: snapshot?.computer, cachedAt: Date.now() });
      return next;
    });
    const subscription = client.subscribeToConversationEvents(conversationId, (event: ConversationEvent) => {
      if (!active) return;
      if (event.type === "message.created") {
        updateMessages((current) => current.some((message) => message.id === event.message.id) ? current : [...current, event.message]);
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "message.delta") {
        updateMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, parts: message.parts.map((part, index) => index === 0 && part.type === "text" ? { ...part, text: part.text + event.delta } : part) } : message));
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: `${agent.lastMessagePreview ?? ""}${event.delta}` } : agent));
      }
      if (event.type === "message.completed") { updateMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, streaming: false } : message)); void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} finished`, body: "New work is ready to review in Runta Crew." }); }
      if (event.type === "message.updated") {
        updateMessages((current) => current.map((message) => message.id === event.message.id ? event.message : message));
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "approval.updated") { setApprovals((current) => { const next = current.map((approval) => approval.id === event.approval.id ? event.approval : approval); const snapshot = snapshots.current.get(selectedAgentId); snapshots.current.set(selectedAgentId, { messages: snapshot?.messages ?? [], approvals: next, computer: snapshot?.computer, cachedAt: Date.now() }); return next; }); if (event.approval.status === "pending") void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} needs approval`, body: event.approval.title }); }
      if (event.type === "activity.updated") setActivities((current) => current.some((activity) => activity.id === event.activity.id) ? current.map((activity) => activity.id === event.activity.id ? event.activity : activity) : [...current, event.activity]);
      if (event.type === "connection.changed") setConnection(event.state);
    }); return () => { active = false; subscription.unsubscribe(); };
  }, [client, conversationId, liveAgentId, selectedAgent?.name, selectedAgentId]);

  return {
    agents, modelProviders, selectedAgent, selectedAgentId, setSelectedAgentId, messages, activities, approvals, computer, connection, loading, error,
    dismissError: () => setError(undefined),
    createAgent: async (input: CreateAgentInput) => { const agent = await client.createAgent(input); await refreshAgents(); setSelectedAgentId(agent.id); },
    updateAgent: async (agentId: string, input: UpdateAgentInput) => { await client.updateAgent(agentId, input); await refreshAgents(); },
    deleteAgent: async (agentId: string) => { await client.deleteAgent(agentId); snapshots.current.delete(agentId); await refreshAgents(); },
    duplicateAgent: async (agentId: string) => { const agent = await client.duplicateAgent(agentId); await refreshAgents(); setSelectedAgentId(agent.id); },
    setAgentUnread: async (agentId: string, unread: boolean) => { await client.setAgentUnread(agentId, unread); await refreshAgents(); },
    sendMessage: async (text: string, attachments: Attachment[] = []) => { if (!conversationId || !selectedAgentId) return; const targetAgentId = selectedAgentId; const targetConversationId = conversationId; const message = await client.sendMessage({ conversationId: targetConversationId, text, attachments }); const snapshot = snapshots.current.get(targetAgentId) ?? { messages: [], approvals: [], cachedAt: Date.now() }; const nextMessages = snapshot.messages.some((item) => item.id === message.id) ? snapshot.messages : [...snapshot.messages, message]; snapshots.current.set(targetAgentId, { ...snapshot, messages: nextMessages, cachedAt: Date.now() }); if (selectedAgentIdRef.current === targetAgentId) { setMessages(nextMessages); setLiveAgentId(targetAgentId); } },
    respondToApproval: async (requestId: string, decision: "allow" | "deny", note?: string) => { const targetAgentId = selectedAgentId; const next = await client.respondToApproval({ requestId, decision, note }); const snapshot = snapshots.current.get(targetAgentId); const nextApprovals = (snapshot?.approvals ?? []).map((item) => item.id === next.id ? next : item); if (snapshot) snapshots.current.set(targetAgentId, { ...snapshot, approvals: nextApprovals, cachedAt: Date.now() }); if (selectedAgentIdRef.current === targetAgentId) setApprovals(nextApprovals); },
    openComputer: async (action: "open" | "takeover") => { if (!selectedAgentId) throw new Error("No agent is selected"); try { return await (action === "open" ? client.openComputer(selectedAgentId) : client.takeOverComputer(selectedAgentId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open cloud computer"); throw reason; } },
    reconnect: async () => { setConnection("connecting"); try { await client.reconnect(); await refreshAgents(); setConnection("connected"); } catch (reason) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Reconnect failed"); } },
  };
}
