import { ArrowDown, ChevronDown, Cloud, FileText, Globe2, LoaderCircle, Monitor, Paperclip, Terminal } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { ActivityEvent, Agent, Attachment, Message } from "@/domain/types";
import { AgentAvatar } from "./AgentAvatar";
import { AttachmentCards } from "./AttachmentPreview";
import "../conversation-skeleton.css";

const Streamdown = lazy(async () => ({ default: (await import("streamdown")).Streamdown }));

const activityIcon = { browser: Globe2, terminal: Terminal, file: FileText, handoff: Cloud, status: Cloud };
function textOf(message: Message) { return message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""); }
const elapsedLabel = (milliseconds: number) => { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };
function SubmitArrowIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>; }
function StopIcon() { return <svg className="stop-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="currentColor" /></svg>; }
function openExternalLink(event: MouseEvent<HTMLDivElement>) {
  if (!(event.target instanceof Element)) return;
  const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || !event.currentTarget.contains(anchor)) return;
  try {
    const url = new URL(anchor.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    event.preventDefault();
    void window.runtaCrew?.openExternal(url.toString());
  } catch { /* Ignore malformed Agent output instead of navigating the webview. */ }
}
function WorkingActivity({ agent, label, activities, startedAt }: { agent?: Pick<Agent, "id" | "name">; label: string; activities: ActivityEvent[]; startedAt: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  return <details className="agent-working-details" open><summary role="status" aria-label={`${agent?.name ?? "Agent"} is working: ${label}`}><span className="agent-working-avatar"><AgentAvatar agent={agent ?? { id: "working", name: "Agent" }} size={38} /></span><span className="agent-working-progress">{label}</span><time>{elapsedLabel(now - Date.parse(startedAt))}</time><ChevronDown className="agent-working-chevron" size={15} /></summary>{activities.length > 0 && <div className="agent-working-tools">{activities.map((activity) => { const Icon = activityIcon[activity.kind]; return <details className={`agent-tool-detail ${activity.status}`} key={activity.id}><summary><Icon size={14} /><span>{activity.title}</span><small>{activity.status === "running" ? "Running" : activity.status === "failed" ? "Failed" : "Done"}</small><ChevronDown size={13} /></summary><div>{activity.detail}</div></details>; })}</div>}</details>;
}
export function MessageView({ message, agent, activities, entering = false }: { message: Message; agent?: Pick<Agent, "id" | "name">; activities: ActivityEvent[]; entering?: boolean }) {
  const text = textOf(message);
  const rootRef = useRef<HTMLDivElement>(null); const entryAnimated = useRef(false); const previousStreaming = useRef(Boolean(message.streaming));
  const relevant = message.parts.flatMap((part) => part.type === "activity" ? activities.filter((activity) => activity.id === part.activityId) : []);
  const conversationActivities = activities.filter((activity) => activity.conversationId === message.conversationId);
  const latestActivity = conversationActivities.at(-1);
  const activeActivity = [...conversationActivities].reverse().find((activity) => activity.status === "running") ?? latestActivity;
  const agentWorking = message.role === "agent" && Boolean(message.streaming);
  const workingLabel = text.trim() || activeActivity?.title || "Working";
  const attachments = message.parts.flatMap((part) => part.type === "attachment" ? [part.attachment] : []);
  useLayoutEffect(() => {
    const root = rootRef.current; const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (root && typeof root.animate === "function" && entering && !entryAnimated.current && !reducedMotion) {
      entryAnimated.current = true;
      const fromX = message.role === "user" ? 14 : -8;
      root.animate([{ opacity: 0, transform: `translate3d(${fromX}px,7px,0) scale(.97)` }, { opacity: 1, transform: "translate3d(0,0,0) scale(1)", offset: .72 }, { opacity: 1, transform: "translate3d(0,0,0) scale(1)" }], { duration: message.role === "user" ? 320 : 280, easing: "cubic-bezier(.18,.82,.28,1)" });
    }
    if (root && message.role === "agent" && previousStreaming.current && !message.streaming && !reducedMotion) {
      const body = root.querySelector<HTMLElement>(".message-body");
      if (body && typeof body.animate === "function") body.animate([{ opacity: 0, transform: "translate3d(-6px,4px,0)" }, { opacity: 1, transform: "translate3d(0,0,0)" }], { duration: 260, easing: "cubic-bezier(.2,.82,.3,1)" });
    }
    previousStreaming.current = Boolean(message.streaming);
  }, [entering, message.role, message.streaming]);
  return <div className={`message ${message.role}`} ref={rootRef}>
    {!agentWorking && (text || message.streaming) && <div className="message-body" onClick={message.role === "agent" ? openExternalLink : undefined}>{message.role === "agent" ? <Suspense fallback={<span className="agent-markdown-fallback">{text}</span>}><Streamdown className="agent-markdown" mode={message.streaming ? "streaming" : "static"} parseIncompleteMarkdown={message.streaming} animated={message.streaming} controls={{ code: { copy: true, download: false }, table: false, image: false }} tableMaxHeight="none" linkSafety={{ enabled: false }} skipHtml>{text}</Streamdown></Suspense> : text}</div>}
    {agentWorking && <WorkingActivity agent={agent} label={workingLabel} activities={conversationActivities} startedAt={message.createdAt} />}
    {attachments.length > 0 && <div className="message-attachments"><AttachmentCards attachments={attachments} /></div>}
    {relevant.map((activity) => { const Icon = activityIcon[activity.kind]; return <div className="activity-card" key={activity.id}><div className="activity-summary"><span className={`activity-icon ${activity.status}`}><Icon size={15} /></span><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><span className={`activity-state ${activity.status}`}>{activity.status === "running" ? <LoaderCircle className="spin" size={15} /> : "Done"}</span></div></div>; })}
  </div>;
}
export function Conversation({ agent, messages, activities, loading = false, focusRequest = 0, onSend, onToggleDetails }: { agent: Agent; messages: Message[]; activities: ActivityEvent[]; loading?: boolean; focusRequest?: number; onSend(text: string, attachments?: Attachment[]): Promise<void>; onToggleDetails(): void }) {
  const [draft, setDraft] = useState(""); const [attachments, setAttachments] = useState<Attachment[]>([]); const [sending, setSending] = useState(false); const [isScrolled, setIsScrolled] = useState(false); const [showScrollToBottom, setShowScrollToBottom] = useState(false); const [scrollbarVisible, setScrollbarVisible] = useState(false); const scrollRef = useRef<HTMLDivElement>(null); const contentRef = useRef<HTMLDivElement>(null); const composerRef = useRef<HTMLTextAreaElement>(null); const sendingRef = useRef(false); const pinnedToBottomRef = useRef(true); const programmaticScrollRef = useRef(false); const lastScrollTopRef = useRef(0); const programmaticScrollTimer = useRef<number | undefined>(undefined); const scrollHideTimer = useRef<number | undefined>(undefined);
  const knownMessageIds = useRef(new Set<string>()); const knownAgentId = useRef(agent.id); const wasLoading = useRef(loading); const [enteringMessageIds, setEnteringMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  useLayoutEffect(() => {
    const reset = knownAgentId.current !== agent.id || wasLoading.current;
    knownAgentId.current = agent.id; wasLoading.current = loading;
    if (loading || reset) { knownMessageIds.current = new Set(messages.map((message) => message.id)); setEnteringMessageIds(new Set()); return; }
    const added = messages.filter((message) => !knownMessageIds.current.has(message.id)).map((message) => message.id);
    for (const id of added) knownMessageIds.current.add(id);
    setEnteringMessageIds(new Set(added));
  }, [agent.id, loading, messages]);
  function scrollToBottom(behavior: ScrollBehavior) {
    const element = scrollRef.current;
    if (!element || typeof element.scrollTo !== "function") return;
    pinnedToBottomRef.current = true; programmaticScrollRef.current = true; setShowScrollToBottom(false);
    if (programmaticScrollTimer.current) window.clearTimeout(programmaticScrollTimer.current);
    element.scrollTo({ top: element.scrollHeight, behavior });
    programmaticScrollTimer.current = window.setTimeout(() => { programmaticScrollTimer.current = undefined; programmaticScrollRef.current = false; }, behavior === "smooth" ? 400 : 0);
  }
  useEffect(() => { pinnedToBottomRef.current = true; programmaticScrollRef.current = false; lastScrollTopRef.current = 0; setShowScrollToBottom(false); requestAnimationFrame(() => scrollToBottom("auto")); }, [agent.id]);
  useEffect(() => { if (pinnedToBottomRef.current) scrollToBottom("smooth"); }, [messages]);
  useEffect(() => {
    const element = scrollRef.current; const content = contentRef.current;
    if (!element || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (pinnedToBottomRef.current) scrollToBottom("auto"); });
    observer.observe(content); return () => observer.disconnect();
  }, [agent.id, loading]);
  useEffect(() => () => { if (scrollHideTimer.current) window.clearTimeout(scrollHideTimer.current); if (programmaticScrollTimer.current) window.clearTimeout(programmaticScrollTimer.current); }, []);
  useEffect(() => { if (focusRequest > 0) composerRef.current?.focus(); }, [agent.id, focusRequest]);
  function revealScrollbarBriefly() { setScrollbarVisible(true); if (scrollHideTimer.current) window.clearTimeout(scrollHideTimer.current); scrollHideTimer.current = window.setTimeout(() => { scrollHideTimer.current = undefined; setScrollbarVisible(false); }, 700); }
  async function submit(event: FormEvent) { event.preventDefault(); const text = draft.trim(); if ((!text && attachments.length === 0) || sendingRef.current) return; sendingRef.current = true; setDraft(""); setSending(true); try { await onSend(text, attachments); setAttachments([]); } finally { sendingRef.current = false; setSending(false); } }
  async function chooseAttachments() { const selected = await window.runtaCrew?.attachments.choose() ?? []; setAttachments((current) => [...current, ...selected.filter((next) => !current.some((item) => item.id === next.id)).map((item) => ({ ...item, source: "local-selection" as const }))].slice(0, 8)); }
  return <main className="conversation">
    <header className={`conversation-header ${isScrolled ? "scrolled" : ""}`}><h1>{agent.name}</h1><div className="header-actions"><button className="computer-trigger" aria-label="Open agent computer" onClick={onToggleDetails}><Monitor size={18} /></button></div></header>
    <div className="conversation-scroll-shell">{loading ? <div className="conversation-skeleton" role="status" aria-label="Loading conversation history"><div className="skeleton-message skeleton-agent"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div><div className="skeleton-message skeleton-user"><span className="skeleton-bubble" /></div><div className="skeleton-message skeleton-agent"><span className="skeleton-line skeleton-line-short" /></div></div> : <><div className={`message-scroll ${scrollbarVisible ? "scrollbar-visible" : ""}`} ref={scrollRef} onWheelCapture={(event) => { if (event.deltaY < 0) { pinnedToBottomRef.current = false; programmaticScrollRef.current = false; setShowScrollToBottom(true); } }} onScroll={(event) => { const element = event.currentTarget; const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 48; const scrollingUp = element.scrollTop < lastScrollTopRef.current - 1; lastScrollTopRef.current = element.scrollTop; setIsScrolled(element.scrollTop > 0); if (scrollingUp) { programmaticScrollRef.current = false; pinnedToBottomRef.current = false; setShowScrollToBottom(true); } else if (!programmaticScrollRef.current) { pinnedToBottomRef.current = atBottom; setShowScrollToBottom(!atBottom); } revealScrollbarBriefly(); }} onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.right - event.clientX <= 14) setScrollbarVisible(true); else if (!scrollHideTimer.current) setScrollbarVisible(false); }} onPointerLeave={() => setScrollbarVisible(false)}><div className="message-content" ref={contentRef}>{messages.length === 0 && <div className="conversation-intro"><AgentAvatar agent={agent} size={54} /><h2>{agent.name}</h2></div>}{messages.map((message) => <MessageView key={message.id} message={message} agent={agent} activities={activities} entering={enteringMessageIds.has(message.id) || message.id.startsWith("optimistic-user:")} />)}</div></div>{showScrollToBottom && <button type="button" className="scroll-to-bottom" aria-label="Scroll to latest message" onClick={() => scrollToBottom("smooth")}><ArrowDown size={20} /></button>}</>}</div>
    <form className="composer" onSubmit={submit}><textarea ref={composerRef} aria-label={`Message ${agent.name}`} placeholder={`Message ${agent.name}…`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />{attachments.length > 0 && <div className="composer-attachments"><AttachmentCards attachments={attachments} onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))} /></div>}<div className="composer-bottom"><button type="button" className="attach-button" aria-label="Attach files" onClick={() => void chooseAttachments()}><Paperclip size={15} /></button><button className="submit-button" data-state={sending ? "stopping" : "send"} aria-label={sending ? "Stop generating" : "Send message"} disabled={(!draft.trim() && attachments.length === 0) || sending}>{sending ? <StopIcon /> : <SubmitArrowIcon />}</button></div></form>
  </main>;
}
