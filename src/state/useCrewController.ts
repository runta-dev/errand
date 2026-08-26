import { useCallback, useEffect, useMemo, useState } from "react";
import type { CloudAgentsClient } from "@/domain/CloudAgentsClient";
import type { Agent, ApprovalRequest, CloudComputer, ConnectionState, ConversationEvent, CreateAgentInput, Message } from "@/domain/types";

export function useCrewController(client: CloudAgentsClient) {
  const [agents, setAgents] = useState<Agent[]>([]); const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]); const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [computer, setComputer] = useState<CloudComputer>(); const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const conversationId = selectedAgentId ? `conversation-${selectedAgentId}` : "";

  const refreshAgents = useCallback(async () => { const next = await client.listAgents(); setAgents(next); setSelectedAgentId((current) => current || next[0]?.id || ""); }, [client]);
  useEffect(() => { let alive = true; void refreshAgents().then(() => { if (alive) { setConnection("connected"); setLoading(false); } }).catch((reason: unknown) => { if (alive) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Could not load agents"); setLoading(false); } }); return () => { alive = false; }; }, [refreshAgents]);
  useEffect(() => {
    if (!selectedAgentId) return; const controller = new AbortController(); let alive = true;
    Promise.all([client.listConversations(selectedAgentId, controller.signal), client.listApprovalRequests(selectedAgentId, controller.signal), client.getComputer(selectedAgentId, controller.signal)]).then(async ([conversations, nextApprovals, nextComputer]) => {
      const conversation = conversations[0]; const data = conversation ? await client.getConversation(conversation.id, controller.signal) : undefined;
      if (alive) { setMessages(data?.messages ?? []); setApprovals(nextApprovals); setComputer(nextComputer); }
    }).catch((reason: unknown) => { if (alive && !(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Could not load agent"); });
    return () => { alive = false; controller.abort(); };
  }, [client, selectedAgentId]);
  useEffect(() => {
    if (!conversationId) return; const subscription = client.subscribeToConversationEvents(conversationId, (event: ConversationEvent) => {
      if (event.type === "message.created") setMessages((current) => current.some((message) => message.id === event.message.id) ? current : [...current, event.message]);
      if (event.type === "message.delta") setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, parts: message.parts.map((part, index) => index === 0 && part.type === "text" ? { ...part, text: part.text + event.delta } : part) } : message));
      if (event.type === "message.completed") setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, streaming: false } : message));
      if (event.type === "approval.updated") setApprovals((current) => current.map((approval) => approval.id === event.approval.id ? event.approval : approval));
      if (event.type === "connection.changed") setConnection(event.state);
    }); return () => subscription.unsubscribe();
  }, [client, conversationId]);

  return {
    agents, selectedAgent, selectedAgentId, setSelectedAgentId, messages, approvals, computer, connection, loading, error,
    dismissError: () => setError(undefined),
    createAgent: async (input: CreateAgentInput) => { const agent = await client.createAgent(input); await refreshAgents(); setSelectedAgentId(agent.id); },
    sendMessage: async (text: string) => { if (!conversationId) return; await client.sendMessage({ conversationId, text }); },
    respondToApproval: async (requestId: string, decision: "allow" | "deny", note?: string) => { const next = await client.respondToApproval({ requestId, decision, note }); setApprovals((current) => current.map((item) => item.id === next.id ? next : item)); },
    reconnect: async () => { setConnection("connecting"); try { await client.reconnect(); await refreshAgents(); setConnection("connected"); } catch (reason) { setConnection("error"); setError(reason instanceof Error ? reason.message : "Reconnect failed"); } },
  };
}
