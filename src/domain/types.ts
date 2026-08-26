export type AgentStatus = "working" | "idle" | "waiting_for_approval" | "offline";
export type ConnectionState = "connected" | "connecting" | "disconnected" | "error";
export type MessageRole = "user" | "agent" | "system";

export interface Agent {
  id: string; name: string; role: string; goal: string; status: AgentStatus;
  avatar: string; lastActiveAt: string; unreadCount: number; computerId: string;
}
export interface TextPart { type: "text"; text: string }
export interface ActivityPart { type: "activity"; activityId: string }
export type MessagePart = TextPart | ActivityPart;
export interface Message { id: string; conversationId: string; role: MessageRole; parts: MessagePart[]; createdAt: string; streaming?: boolean }
export interface Conversation { id: string; agentId: string; title: string; updatedAt: string }
export type ActivityStatus = "running" | "completed" | "failed";
export interface ActivityEvent { id: string; conversationId: string; kind: "browser" | "terminal" | "file" | "handoff" | "status"; title: string; detail: string; status: ActivityStatus; createdAt: string }
export interface ApprovalRequest { id: string; agentId: string; conversationId: string; title: string; description: string; scope: string[]; status: "pending" | "allowed" | "denied"; createdAt: string; responseNote?: string }
export interface CloudComputer { id: string; agentId: string; runtimeName: string; status: "online" | "starting" | "offline"; activeApp?: string; previewKind: "mock" | "remote"; capabilities: Array<"open" | "takeover"> }
export interface CreateAgentInput { name: string; role: string; goal: string }
export interface SendMessageInput { conversationId: string; text: string; signal?: AbortSignal }
export interface RespondApprovalInput { requestId: string; decision: "allow" | "deny"; note?: string }
export type ConversationEvent =
  | { type: "message.created"; message: Message }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "message.completed"; messageId: string }
  | { type: "activity.updated"; activity: ActivityEvent }
  | { type: "approval.updated"; approval: ApprovalRequest }
  | { type: "connection.changed"; state: ConnectionState };
export interface Subscription { unsubscribe(): void }

export class CrewError extends Error {
  constructor(public readonly code: "network" | "unauthorized" | "not_found" | "contract_pending" | "unknown", message: string, public readonly retryable = false) { super(message); this.name = "CrewError"; }
}
