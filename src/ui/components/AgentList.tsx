import { Copy, LogOut, Mail, MailOpen, MessageCircle, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Agent, AgentStatus } from "@/domain/types";
import { AgentAvatar } from "./AgentAvatar";

export type AgentAction = "edit" | "pin" | "duplicate" | "toggle-unread" | "delete";
const statusLabel: Record<AgentStatus, string> = { working: "Working", idle: "Idle", waiting_for_approval: "Needs approval", offline: "Offline" };

export function AgentList({ agents, selectedId, search, userName, onSearch, onSelect, onAction, onCreate, onSettings, onLogout }: { agents: Agent[]; selectedId: string; search: string; userName: string; onSearch(value: string): void; onSelect(id: string): void; onAction(agent: Agent, action: AgentAction): void; onCreate(): void; onSettings(): void; onLogout(): void }) {
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
  const sortedAgents = [...agents].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const act = (agent: Agent, action: AgentAction) => { setMenuAgentId(undefined); onAction(agent, action); };
  return <aside className="agent-sidebar">
    <div className="sidebar-titlebar"><button className="brand-add" aria-label="New agent" onClick={onCreate}><Plus size={18} /></button></div>
    <label className="search"><Search size={15} /><input aria-label="Search agents" placeholder="Search your crew" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
    <div className="agent-list">
      {sortedAgents.map((agent) => <div key={agent.id} className={`agent-row ${selectedId === agent.id ? "selected" : ""}`}>
        <button className="agent-select" onClick={() => onSelect(agent.id)}>
          <AgentAvatar agent={agent} />
          <span className="agent-copy"><strong><span>{agent.name}{agent.pinned && <Pin size={10} aria-label="Pinned" />}</span></strong><span>{agent.status === "working" ? "Working in cloud computer" : statusLabel[agent.status]}</span></span>
        </button>
        <button className="agent-more" aria-label={`More actions for ${agent.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setMenuAgentId((current) => current === agent.id ? undefined : agent.id)}><MoreHorizontal size={15} /></button>
        {menuAgentId === agent.id && <div className="agent-menu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => act(agent, "edit")}><Pencil size={13} /> Edit agent</button>
          <button role="menuitem" onClick={() => act(agent, "pin")}>{agent.pinned ? <PinOff size={13} /> : <Pin size={13} />}{agent.pinned ? "Unpin" : "Pin to top"}</button>
          <button role="menuitem" onClick={() => act(agent, "duplicate")}><Copy size={13} /> Duplicate</button>
          <button role="menuitem" onClick={() => act(agent, "toggle-unread")}>{agent.unreadCount ? <MailOpen size={13} /> : <Mail size={13} />}{agent.unreadCount ? "Mark as read" : "Mark as unread"}</button>
          <div />
          <button role="menuitem" className="danger-text" onClick={() => act(agent, "delete")}><Trash2 size={13} /> Delete agent</button>
        </div>}
      </div>)}
    </div>
    <div className="sidebar-bottom" onPointerDown={(event) => event.stopPropagation()}>
      {accountOpen && <div className="account-popover" role="menu">
        <button role="menuitem" onClick={() => { setAccountOpen(false); onSettings(); }}><Settings size={16} /> Settings</button>
        <button role="menuitem" onClick={() => { setAccountOpen(false); void window.runtaCrew?.openExternal("https://discord.com/invite/62d4bkaTnS"); }}><MessageCircle size={16} /> Join Discord</button>
        <div />
        <button role="menuitem" onClick={() => { setAccountOpen(false); onLogout(); }}><LogOut size={16} /> Logout</button>
      </div>}
      <button className="account-trigger" aria-label={userName} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}><span className="account-avatar">{userName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span>{userName}</span></button>
    </div>
  </aside>;
}
