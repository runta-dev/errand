import { ArrowUp, CircleStop, Cloud, FileText, Globe2, LoaderCircle, Terminal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ActivityEvent, Agent, ConnectionState, Message } from "@/domain/types";

const activityIcon = { browser: Globe2, terminal: Terminal, file: FileText, handoff: Cloud, status: Cloud };
function textOf(message: Message) { return message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""); }
function MessageView({ message, activities }: { message: Message; activities: ActivityEvent[] }) {
  const relevant = message.parts.flatMap((part) => part.type === "activity" ? activities.filter((activity) => activity.id === part.activityId) : []);
  return <div className={`message ${message.role}`}>
    {message.role !== "system" && <div className="message-author">{message.role === "user" ? "You" : "Agent"}</div>}
    <div className="message-body">{textOf(message)}{message.streaming && <span className="streaming-caret" />}</div>
    {relevant.map((activity) => { const Icon = activityIcon[activity.kind]; return <div className="activity-card" key={activity.id}><span className={`activity-icon ${activity.status}`}><Icon size={15} /></span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><span className="activity-state">{activity.status === "running" ? <LoaderCircle className="spin" size={15} /> : "Done"}</span></div>; })}
  </div>;
}
export function Conversation({ agent, messages, activities, connection, onSend, onReconnect, onToggleDetails }: { agent: Agent; messages: Message[]; activities: ActivityEvent[]; connection: ConnectionState; onSend(text: string): Promise<void>; onReconnect(): void; onToggleDetails(): void }) {
  const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false); const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (typeof bottomRef.current?.scrollIntoView === "function") bottomRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  async function submit(event: FormEvent) { event.preventDefault(); const text = draft.trim(); if (!text || sending) return; setDraft(""); setSending(true); try { await onSend(text); } finally { setSending(false); } }
  return <main className="conversation">
    <header className="conversation-header"><div><h1>{agent.name}</h1><p>{agent.role}</p></div><div className="header-actions"><span className={`connection ${connection}`}>{connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting" : "Connection lost"}</span>{connection !== "connected" && <button className="secondary-button" onClick={onReconnect}>Reconnect</button>}<button className="icon-button details-toggle" aria-label="Toggle agent details" onClick={onToggleDetails}><Cloud size={18} /></button></div></header>
    <div className="message-scroll"><div className="conversation-intro"><div className={`avatar avatar-${agent.id} large`}>{agent.avatar}</div><h2>{agent.name}</h2><p>{agent.goal}</p><span>Cloud agent · Persistent workspace</span></div>{messages.map((message) => <MessageView key={message.id} message={message} activities={activities} />)}<div ref={bottomRef} /></div>
    <form className="composer" onSubmit={submit}><textarea aria-label={`Message ${agent.name}`} placeholder={`Message ${agent.name}…`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><span>Agent keeps working when you close the app</span><button aria-label="Send message" disabled={!draft.trim() || sending}>{sending ? <CircleStop size={17} /> : <ArrowUp size={17} />}</button></div></form>
  </main>;
}
