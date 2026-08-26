import { useCallback, useEffect, useMemo, useState } from "react";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import type { Agent, ApprovalRequest, Attachment, CloudComputer, ConnectionState, ConversationEvent, CreateAgentInput, Message, ModelProviderOption, ReactionKind, UpdateAgentInput } from "@/domain/types";

function agentMessagePreview(message?: Message): string {
  if (!message || message.role !== "agent") return "";
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
}

export function useCrewController(client: CloudAgentsClient) {
  const [agents, setAgents] = useState<Agent[]>([]); const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]); const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [computer, setComputer] = useState<CloudComputer>(); const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [modelProviders, setModelProviders] = useState<ModelProviderOption[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const conversationId = selectedAgentId ? `conversation-${selectedAgentId}` : "";

  const refreshAgents = useCallback(async () => { const next = await client.listAgents(); setAgents(next); setSelectedAgentId((current) => current && next.some((agent) => agent.id === current) ? current : next[0]?.id || ""); return next; }, [client]);
  useEffect(() => { let alive = true; void Promise.all([refreshAgents(), client.listModelProviders()]).then(([, providers]) => { if (alive) { setModelProviders(providers); setConnection("connected"); setLoading(false); } }).catch((reason: unknown) => { if (alive) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Could not load agents"); setLoading(false); } }); return () => { alive = false; }; }, [client, refreshAgents]);
  useEffect(() => {
    if (!selectedAgentId) return; const controller = new AbortController(); let alive = true;
    Promise.all([client.listConversations(selectedAgentId, controller.signal), client.listApprovalRequests(selectedAgentId, controller.signal), client.getComputer(selectedAgentId, controller.signal)]).then(async ([conversations, nextApprovals, nextComputer]) => {
      const conversation = conversations[0]; const data = conversation ? await client.getConversation(conversation.id, controller.signal) : undefined;
      if (alive) {
        const nextMessages = data?.messages ?? [];
        const preview = agentMessagePreview([...nextMessages].reverse().find((message) => message.role === "agent"));
        setMessages(nextMessages); setApprovals(nextApprovals); setComputer(nextComputer);
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: preview || undefined } : agent));
      }
    }).catch((reason: unknown) => { if (alive && !(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Could not load agent"); });
    return () => { alive = false; controller.abort(); };
  }, [client, selectedAgentId]);
  useEffect(() => {
    if (!conversationId) return; const subscription = client.subscribeToConversationEvents(conversationId, (event: ConversationEvent) => {
      if (event.type === "message.created") {
        setMessages((current) => current.some((message) => message.id === event.message.id) ? current : [...current, event.message]);
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "message.delta") {
        setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, parts: message.parts.map((part, index) => index === 0 && part.type === "text" ? { ...part, text: part.text + event.delta } : part) } : message));
        setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: `${agent.lastMessagePreview ?? ""}${event.delta}` } : agent));
      }
      if (event.type === "message.completed") { setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, streaming: false } : message)); void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} finished`, body: "New work is ready to review in Runta Crew." }); }
      if (event.type === "message.updated") {
        setMessages((current) => current.map((message) => message.id === event.message.id ? event.message : message));
        if (event.message.role === "agent") setAgents((current) => current.map((agent) => agent.id === selectedAgentId ? { ...agent, lastMessagePreview: agentMessagePreview(event.message) || undefined } : agent));
      }
      if (event.type === "approval.updated") { setApprovals((current) => current.map((approval) => approval.id === event.approval.id ? event.approval : approval)); if (event.approval.status === "pending") void window.runtaCrew?.notifications.show({ title: `${selectedAgent?.name ?? "Agent"} needs approval`, body: event.approval.title }); }
      if (event.type === "connection.changed") setConnection(event.state);
    }); return () => subscription.unsubscribe();
  }, [client, conversationId, selectedAgent?.name, selectedAgentId]);

  return {
    agents, modelProviders, selectedAgent, selectedAgentId, setSelectedAgentId, messages, approvals, computer, connection, loading, error,
    dismissError: () => setError(undefined),
    createAgent: async (input: CreateAgentInput) => { const agent = await client.createAgent(input); await refreshAgents(); setSelectedAgentId(agent.id); },
    updateAgent: async (agentId: string, input: UpdateAgentInput) => { await client.updateAgent(agentId, input); await refreshAgents(); },
    deleteAgent: async (agentId: string) => { await client.deleteAgent(agentId); await refreshAgents(); },
    duplicateAgent: async (agentId: string) => { const agent = await client.duplicateAgent(agentId); await refreshAgents(); setSelectedAgentId(agent.id); },
    setAgentUnread: async (agentId: string, unread: boolean) => { await client.setAgentUnread(agentId, unread); await refreshAgents(); },
    sendMessage: async (text: string, attachments: Attachment[] = []) => { if (!conversationId) return; const message = await client.sendMessage({ conversationId, text, attachments }); setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); },
    reactToMessage: async (messageId: string, reaction: ReactionKind) => { if (!conversationId) return; const next = await client.reactToMessage({ conversationId, messageId, reaction }); setMessages((current) => current.map((message) => message.id === next.id ? next : message)); },
    respondToApproval: async (requestId: string, decision: "allow" | "deny", note?: string) => { const next = await client.respondToApproval({ requestId, decision, note }); setApprovals((current) => current.map((item) => item.id === next.id ? next : item)); },
    openComputer: async (action: "open" | "takeover") => { if (!selectedAgentId) throw new Error("No agent is selected"); try { return await (action === "open" ? client.openComputer(selectedAgentId) : client.takeOverComputer(selectedAgentId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open cloud computer"); throw reason; } },
    reconnect: async () => { setConnection("connecting"); try { await client.reconnect(); await refreshAgents(); setConnection("connected"); } catch (reason) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Reconnect failed"); } },
  };
}
