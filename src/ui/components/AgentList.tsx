import { LogIn, LogOut, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Agent } from "@/domain/types";
import { AgentAvatar } from "./AgentAvatar";

const Streamdown = lazy(async () => ({ default: (await import("streamdown")).Streamdown }));

export type AgentAction = "edit" | "delete";
export function AgentList({ agents, selectedId, search, creatingAgentName, signedIn, userName, onSearch, onSelect, onAction, onCreate, onSettings, onSignIn, onLogout }: { agents: Agent[]; selectedId: string; search: string; creatingAgentName?: string; signedIn: boolean; userName: string; onSearch(value: string): void; onSelect(id: string): void; onAction(agent: Agent, action: AgentAction): void; onCreate(): void; onSettings(): void; onSignIn(): void; onLogout(): void }) {
  const [menuAgentId, setMenuAgentId] = useState<string>(); const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { if (!menuAgentId) return; const close = () => setMenuAgentId(undefined); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, [menuAgentId]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = () => setAccountOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);
  const act = (agent: Agent, action: AgentAction) => { setMenuAgentId(undefined); onAction(agent, action); };
  return <aside className="agent-sidebar">
    <div className="sidebar-titlebar"><button className="brand-add" aria-label="New agent" disabled={Boolean(creatingAgentName)} onClick={onCreate}><Plus size={18} /></button></div>
    <label className="search"><Search size={15} /><input aria-label="Search agents" placeholder="Search your crew" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
    <div className="agent-list">
      {creatingAgentName && <div className="agent-row agent-creating" role="status" aria-live="polite">
        <div className="agent-select">
          <AgentAvatar agent={{ id: `creating-${creatingAgentName}`, name: creatingAgentName }} />
          <span className="agent-copy"><strong><span>{creatingAgentName}</span></strong><span className="agent-preview">Creating…</span></span>
        </div>
      </div>}
      {!creatingAgentName && agents.length === 0 && <div className="agent-list-empty">
        {search.trim() ? "No agents found" : "No agents yet"}
      </div>}
      {agents.map((agent) => <div key={agent.id} className={`agent-row ${selectedId === agent.id ? "selected" : ""}`}>
        <button className="agent-select" onClick={() => onSelect(agent.id)}>
          <AgentAvatar agent={agent} />
          <span className="agent-copy"><strong><span>{agent.name}</span></strong>{agent.lastMessagePreview && <span className="agent-preview"><Suspense fallback={agent.lastMessagePreview}><Streamdown className="agent-preview-markdown" mode="static" controls={false} linkSafety={{ enabled: true }} skipHtml>{agent.lastMessagePreview}</Streamdown></Suspense></span>}</span>
        </button>
        <button className="agent-more" aria-label={`More actions for ${agent.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setMenuAgentId((current) => current === agent.id ? undefined : agent.id)}><MoreHorizontal size={15} /></button>
        {menuAgentId === agent.id && <div className="agent-menu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => act(agent, "edit")}><Pencil size={13} /> Edit agent</button>
          <div />
          <button role="menuitem" className="danger-text" onClick={() => act(agent, "delete")}><Trash2 size={13} /> Delete agent</button>
        </div>}
      </div>)}
    </div>
    <div className="sidebar-bottom" onPointerDown={(event) => event.stopPropagation()}>
      {signedIn && accountOpen && <div className="account-popover" role="menu">
        <button role="menuitem" onClick={() => { setAccountOpen(false); onSettings(); }}><Settings size={16} /> Settings</button>
        <button role="menuitem" onClick={() => { setAccountOpen(false); void window.runtaCrew?.openExternal("https://discord.com/invite/62d4bkaTnS"); }}><MessageCircle size={16} /> Join Discord</button>
        <div />
        <button role="menuitem" onClick={() => { setAccountOpen(false); onLogout(); }}><LogOut size={16} /> Logout</button>
      </div>}
      {signedIn
        ? <button className="account-trigger" aria-label={userName} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}><span className="account-avatar">{userName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span>{userName}</span></button>
        : <button className="account-trigger" onClick={onSignIn}><span className="account-avatar"><LogIn size={15} /></span><span>Sign in to Runta</span></button>}
    </div>
  </aside>;
}
