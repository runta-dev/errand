import { Cloud, File, FileText, Globe2, LoaderCircle, Monitor, Paperclip, Terminal, X } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { ActivityEvent, Agent, Attachment, Message } from "@/domain/types";
import { AgentAvatar } from "./AgentAvatar";
import "../conversation-skeleton.css";

const Streamdown = lazy(async () => ({ default: (await import("streamdown")).Streamdown }));

const activityIcon = { browser: Globe2, terminal: Terminal, file: FileText, handoff: Cloud, status: Cloud };
function textOf(message: Message) { return message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""); }
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function SubmitArrowIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>; }
function StopIcon() { return <svg className="stop-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="currentColor" /></svg>; }
export function MessageView({ message, agent, activities, entering = false }: { message: Message; agent?: Pick<Agent, "id" | "name">; activities: ActivityEvent[]; entering?: boolean }) {
  const text = textOf(message);
  const relevant = message.parts.flatMap((part) => part.type === "activity" ? activities.filter((activity) => activity.id === part.activityId) : []);
  const activeActivity = [...activities].reverse().find((activity) => activity.status === "running");
  const attachments = message.parts.flatMap((part) => part.type === "attachment" ? [part.attachment] : []);
  return <div className={`message ${message.role} ${entering ? "message-entering" : ""}`}>
    {(text || message.streaming) && <div className="message-body">{message.role === "agent" ? <Suspense fallback={<span className="agent-markdown-fallback">{text}</span>}><Streamdown className="agent-markdown" mode={message.streaming ? "streaming" : "static"} parseIncompleteMarkdown={message.streaming} animated={message.streaming} controls={{ code: { copy: true, download: false }, table: false, image: false }} linkSafety={{ enabled: true }} skipHtml>{text}</Streamdown></Suspense> : text}</div>}
    {message.role === "agent" && message.streaming && <div className="agent-working-indicator" role="status" aria-label={`${agent?.name ?? "Agent"} is working: ${activeActivity?.title ?? "Working"}`}><span className="agent-working-avatar"><AgentAvatar agent={agent ?? { id: message.conversationId, name: "Agent" }} size={38} /></span><span className="agent-working-progress">{activeActivity?.title ?? "Working"}</span></div>}
    {attachments.length > 0 && <div className="message-attachments">{attachments.map((attachment) => <div key={attachment.id}><File size={15} /><span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)} · {attachment.mediaType}</small></span></div>)}</div>}
    {relevant.map((activity) => { const Icon = activityIcon[activity.kind]; return <div className="activity-card" key={activity.id}><div className="activity-summary"><span className={`activity-icon ${activity.status}`}><Icon size={15} /></span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><span className={`activity-state ${activity.status}`}>{activity.status === "running" ? <LoaderCircle className="spin" size={15} /> : "Done"}</span></div></div>; })}
  </div>;
}
export function Conversation({ agent, messages, activities, loading = false, focusRequest = 0, onSend, onToggleDetails }: { agent: Agent; messages: Message[]; activities: ActivityEvent[]; loading?: boolean; focusRequest?: number; onSend(text: string, attachments?: Attachment[]): Promise<void>; onToggleDetails(): void }) {
  const [draft, setDraft] = useState(""); const [attachments, setAttachments] = useState<Attachment[]>([]); const [sending, setSending] = useState(false); const [isScrolled, setIsScrolled] = useState(false); const scrollRef = useRef<HTMLDivElement>(null); const composerRef = useRef<HTMLTextAreaElement>(null); const sendingRef = useRef(false);
  const knownMessageIds = useRef(new Set<string>()); const knownAgentId = useRef(agent.id); const wasLoading = useRef(loading); const [enteringMessageIds, setEnteringMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  useLayoutEffect(() => {
    const reset = knownAgentId.current !== agent.id || wasLoading.current;
    knownAgentId.current = agent.id; wasLoading.current = loading;
    if (loading || reset) { knownMessageIds.current = new Set(messages.map((message) => message.id)); setEnteringMessageIds(new Set()); return; }
    const added = messages.filter((message) => !knownMessageIds.current.has(message.id)).map((message) => message.id);
    for (const id of added) knownMessageIds.current.add(id);
    setEnteringMessageIds(new Set(added));
  }, [agent.id, loading, messages]);
  useEffect(() => { const element = scrollRef.current; if (element && typeof element.scrollTo === "function") element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (focusRequest > 0) composerRef.current?.focus(); }, [agent.id, focusRequest]);
  async function submit(event: FormEvent) { event.preventDefault(); const text = draft.trim(); if ((!text && attachments.length === 0) || sendingRef.current) return; sendingRef.current = true; setDraft(""); setSending(true); try { await onSend(text, attachments); setAttachments([]); } finally { sendingRef.current = false; setSending(false); } }
  async function chooseAttachments() { const selected = await window.runtaCrew?.attachments.choose() ?? []; setAttachments((current) => [...current, ...selected.filter((next) => !current.some((item) => item.id === next.id)).map((item) => ({ ...item, source: "local-selection" as const }))].slice(0, 8)); }
  return <main className="conversation">
    <header className={`conversation-header ${isScrolled ? "scrolled" : ""}`}><h1>{agent.name}</h1><div className="header-actions"><button className="computer-trigger" aria-label="Open agent computer" onClick={onToggleDetails}><Monitor size={18} /></button></div></header>
    {loading ? <div className="conversation-skeleton" role="status" aria-label="Loading conversation history"><div className="skeleton-message skeleton-agent"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div><div className="skeleton-message skeleton-user"><span className="skeleton-bubble" /></div><div className="skeleton-message skeleton-agent"><span className="skeleton-line skeleton-line-short" /></div></div> : <div className="message-scroll" ref={scrollRef} onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}>{messages.length === 0 && <div className="conversation-intro"><AgentAvatar agent={agent} size={54} /><h2>{agent.name}</h2></div>}{messages.map((message) => <MessageView key={message.id} message={message} agent={agent} activities={activities} entering={enteringMessageIds.has(message.id)} />)}</div>}
    <form className="composer" onSubmit={submit}><textarea ref={composerRef} aria-label={`Message ${agent.name}`} placeholder={`Message ${agent.name}…`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />{attachments.length > 0 && <div className="composer-attachments">{attachments.map((attachment) => <div key={attachment.id}><File size={14} /><span>{attachment.name}</span><small>{formatBytes(attachment.size)}</small><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X size={13} /></button></div>)}</div>}<div className="composer-bottom"><button type="button" className="attach-button" aria-label="Attach files" onClick={() => void chooseAttachments()}><Paperclip size={15} /></button><button className="submit-button" data-state={sending ? "stopping" : "send"} aria-label={sending ? "Stop generating" : "Send message"} disabled={(!draft.trim() && attachments.length === 0) || sending}>{sending ? <StopIcon /> : <SubmitArrowIcon />}</button></div></form>
  </main>;
}
