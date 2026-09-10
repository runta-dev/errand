import type { Agent, ApprovalRequest, CloudComputer, CloudComputerSession, Conversation, ConversationEvent, CreateAgentInput, Message, ModelProviderCatalog, RespondApprovalInput, SendMessageInput, Subscription, UpdateAgentInput } from "./types";

export interface CloudAgentsClient {
  listModelProviders(signal?: AbortSignal): Promise<ModelProviderCatalog>;
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  getAgent(agentId: string, signal?: AbortSignal): Promise<Agent>;
  createAgent(input: CreateAgentInput, signal?: AbortSignal): Promise<Agent>;
  updateAgent(agentId: string, input: UpdateAgentInput, signal?: AbortSignal): Promise<Agent>;
  deleteAgent(agentId: string, signal?: AbortSignal): Promise<void>;
  duplicateAgent(agentId: string, signal?: AbortSignal): Promise<Agent>;
  setAgentUnread(agentId: string, unread: boolean, signal?: AbortSignal): Promise<Agent>;
  listConversations(agentId: string, signal?: AbortSignal): Promise<Conversation[]>;
  getConversation(conversationId: string, signal?: AbortSignal): Promise<{ conversation: Conversation; messages: Message[] }>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  subscribeToConversationEvents(conversationId: string, listener: (event: ConversationEvent) => void): Subscription;
  listApprovalRequests(agentId?: string, signal?: AbortSignal): Promise<ApprovalRequest[]>;
  respondToApproval(input: RespondApprovalInput, signal?: AbortSignal): Promise<ApprovalRequest>;
  getComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputer>;
  openComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputerSession>;
  takeOverComputer(agentId: string, signal?: AbortSignal): Promise<CloudComputerSession>;
  reconnect(signal?: AbortSignal): Promise<void>;
}
