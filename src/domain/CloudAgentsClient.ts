import type { Agent, ApprovalRequest, CloudComputer, Conversation, ConversationEvent, CreateAgentInput, Message, RespondApprovalInput, SendMessageInput, Subscription } from "./types";

export interface CloudAgentsClient {
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  getAgent(agentId: string, signal?: AbortSignal): Promise<Agent>;
  createAgent(input: CreateAgentInput, signal?: AbortSignal): Promise<Agent>;
  listConversations(agentId: string, signal?: AbortSignal): Promise<Conversation[]>;
  getConversation(conversationId: string, signal?: AbortSignal): Promise<{ conversation: Conversation; messages: Message[] }>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  subscribeToConversationEvents(conversationId: string, listener: (event: ConversationEvent) => void): Subscription;
  listApprovalRequests(agentId?: string, signal?: AbortSignal): Promise<ApprovalRequest[]>;
  respondToApproval(input: RespondApprovalInput, signal?: AbortSignal): Promise<ApprovalRequest>;
  getComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputer>;
  openComputer(agentId: string, signal?: AbortSignal): Promise<{ url?: string; mode: "mock" | "remote" }>;
  takeOverComputer(agentId: string, signal?: AbortSignal): Promise<{ url?: string; mode: "mock" | "remote" }>;
  reconnect(signal?: AbortSignal): Promise<void>;
}
