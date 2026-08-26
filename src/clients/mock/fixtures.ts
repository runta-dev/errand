import type { ActivityEvent, Agent, ApprovalRequest, CloudComputer, Conversation, Message } from "@/domain/types";

const now = new Date("2026-08-26T09:42:00+08:00").toISOString();
export const agentsFixture: Agent[] = [
  { id: "atlas", name: "Atlas", role: "Product researcher", goal: "Turn customer signals into clear product decisions.", status: "working", avatar: "A", lastActiveAt: now, unreadCount: 2, computerId: "computer-atlas" },
  { id: "mira", name: "Mira", role: "Operations lead", goal: "Keep recurring operations moving and surface exceptions.", status: "waiting_for_approval", avatar: "M", lastActiveAt: now, unreadCount: 1, computerId: "computer-mira" },
  { id: "patch", name: "Patch", role: "Software engineer", goal: "Implement, test, and ship scoped engineering work.", status: "idle", avatar: "P", lastActiveAt: now, unreadCount: 0, computerId: "computer-patch" },
  { id: "lumen", name: "Lumen", role: "Growth analyst", goal: "Find and explain high-leverage growth opportunities.", status: "offline", avatar: "L", lastActiveAt: "2026-08-25T22:15:00+08:00", unreadCount: 0, computerId: "computer-lumen" },
];
export const conversationsFixture: Conversation[] = agentsFixture.map((agent) => ({ id: `conversation-${agent.id}`, agentId: agent.id, title: agent.goal, updatedAt: agent.lastActiveAt }));
export const messagesFixture: Message[] = [
  { id: "m1", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "Review this week's customer feedback and tell me what we should prioritize." }], createdAt: "2026-08-26T09:34:00+08:00" },
  { id: "m2", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "I’m grouping the feedback by job-to-be-done, frequency, and revenue impact. I’ll return with the strongest pattern and the evidence behind it." }, { type: "activity", activityId: "activity-1" }], createdAt: "2026-08-26T09:35:00+08:00" },
  { id: "m3", conversationId: "conversation-mira", role: "agent", parts: [{ type: "text", text: "The vendor portal requires permission before I submit the renewal form." }], createdAt: now },
  { id: "m4", conversationId: "conversation-patch", role: "agent", parts: [{ type: "text", text: "The release branch is clean and the test suite is green. What should I work on next?" }], createdAt: now },
];
export const activitiesFixture: ActivityEvent[] = [
  { id: "activity-1", conversationId: "conversation-atlas", kind: "browser", title: "Reviewing feedback workspace", detail: "Reading 24 tagged conversations in Linear", status: "completed", createdAt: "2026-08-26T09:36:00+08:00" },
  { id: "activity-2", conversationId: "conversation-atlas", kind: "file", title: "Building evidence table", detail: "Grouping feedback by theme and customer segment", status: "running", createdAt: "2026-08-26T09:39:00+08:00" },
];
export const approvalsFixture: ApprovalRequest[] = [{ id: "approval-1", agentId: "mira", conversationId: "conversation-mira", title: "Submit vendor renewal", description: "Mira wants to submit the renewal form to Acme Hosting.", scope: ["Submit one form", "Use the saved Acme Hosting session", "No payment will be made"], status: "pending", createdAt: now }];
export const computersFixture: CloudComputer[] = agentsFixture.map((agent) => ({ id: agent.computerId, agentId: agent.id, runtimeName: `crew-${agent.name.toLowerCase()}`, status: agent.status === "offline" ? "offline" : "online", activeApp: agent.id === "atlas" ? "Linear · Browser" : agent.id === "mira" ? "Acme Hosting · Browser" : "Terminal", previewKind: "mock", capabilities: ["open", "takeover"] }));
