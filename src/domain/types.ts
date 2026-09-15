export type AgentStatus = "working" | "idle" | "waiting_for_approval" | "offline";
export type ConnectionState = "connected" | "connecting" | "disconnected" | "error";
export type MessageRole = "user" | "agent" | "system";

export interface Agent {
  id: string; name: string; role: string; goal: string; status: AgentStatus;
  avatar: string; lastActiveAt: string; unreadCount: number; computerId: string; pinned?: boolean; lastMessagePreview?: string;
}
export interface TextPart { type: "text"; text: string }
export interface ActivityPart { type: "activity"; activityId: string }
export interface Attachment { id: string; name: string; size: number; mediaType: string; source: "local-selection" | "cloud"; agentId?: string }
export interface AttachmentPart { type: "attachment"; attachment: Attachment }
export type MessagePart = TextPart | ActivityPart | AttachmentPart;
export interface Message { id: string; conversationId: string; role: MessageRole; parts: MessagePart[]; createdAt: string; streaming?: boolean; interrupted?: boolean }
export interface Conversation { id: string; agentId: string; title: string; updatedAt: string }
export type ActivityStatus = "running" | "completed" | "failed";
export interface ActivityEvent { id: string; conversationId: string; kind: "browser" | "terminal" | "file" | "handoff" | "status"; title: string; detail: string; output?: string; status: ActivityStatus; createdAt: string; updatedAt?: string }
export interface ApprovalRequest { id: string; agentId: string; conversationId: string; title: string; description: string; scope: string[]; status: "pending" | "allowed" | "denied"; createdAt: string; responseNote?: string }
export interface CloudComputer { id: string; agentId: string; runtimeName: string; status: "online" | "starting" | "offline"; activeApp?: string; previewUrl?: string; capabilities: Array<"open" | "takeover"> }
export interface CloudComputerSession { url: string; protocols: string[]; mode: "remote" }
export interface ModelProviderOption { id: string; name: string; protocol: string; defaultModel?: string; baseUrl?: string }
export interface ModelProviderCatalog { organizationId: string; providers: ModelProviderOption[] }
export interface CreateAgentInput { name: string; modelProviderId: string; systemPrompt?: string }
export interface UpdateAgentInput { name?: string; role?: string; goal?: string; pinned?: boolean }
export interface SendMessageInput { conversationId: string; text: string; attachments?: Attachment[]; signal?: AbortSignal }
export interface RespondApprovalInput { requestId: string; decision: "allow" | "deny"; note?: string }
export type ConversationEvent =
  | { type: "message.created"; message: Message }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "message.completed"; messageId: string; notify?: boolean }
  | { type: "message.updated"; message: Message }
  | { type: "activity.updated"; activity: ActivityEvent }
  | { type: "approval.updated"; approval: ApprovalRequest }
  | { type: "connection.changed"; state: ConnectionState };
export interface Subscription { unsubscribe(): void }

export class CrewError extends Error {
  constructor(public readonly code: "network" | "unauthorized" | "not_found" | "conflict" | "contract_pending" | "unknown", message: string, public readonly retryable = false) { super(message); this.name = "CrewError"; }
}
