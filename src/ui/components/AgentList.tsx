import { Copy, Mail, MailOpen, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Settings, Trash2, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { Agent, AgentStatus } from "@/domain/types";
import runtaLogo from "@/assets/runta-logo-icon.png";

export type AgentAction = "edit" | "pin" | "duplicate" | "toggle-unread" | "delete";
const statusLabel: Record<AgentStatus, string> = { working: "Working", idle: "Idle", waiting_for_approval: "Needs approval", offline: "Offline" };

export function AgentList({ agents, selectedId, search, onSearch, onSelect, onAction, onCreate, onSettings }: { agents: Agent[]; selectedId: string; search: string; onSearch(value: string): void; onSelect(id: string): void; onAction(agent: Agent, action: AgentAction): void; onCreate(): void; onSettings(): void }) {
  const [menuAgentId, setMenuAgentId] = useState<string>();
  useEffect(() => { if (!menuAgentId) return; const close = () => setMenuAgentId(undefined); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, [menuAgentId]);
  const sortedAgents = [...agents].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const act = (agent: Agent, action: AgentAction) => { setMenuAgentId(undefined); onAction(agent, action); };
  return <aside className="agent-sidebar">
    <div className="brand"><img src={runtaLogo} alt="" aria-hidden="true" /><span className="brand-runta">Runta</span><span className="brand-product">Crew</span></div>
    <button className="primary-button create-button" onClick={onCreate}><Plus size={16} /> New agent</button>
    <label className="search"><Search size={15} /><input aria-label="Search agents" placeholder="Search your crew" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
    <div className="section-label"><span>Your crew</span><span>{agents.length}</span></div>
    <div className="agent-list">
      {sortedAgents.map((agent) => <div key={agent.id} className={`agent-row ${selectedId === agent.id ? "selected" : ""}`}>
        <button className="agent-select" onClick={() => onSelect(agent.id)}>
          <span className={`avatar avatar-${agent.id}`}>{agent.avatar}<i className={`presence ${agent.status}`} /></span>
          <span className="agent-copy"><strong>{agent.name}{agent.pinned && <Pin size={10} aria-label="Pinned" />}</strong><span>{agent.status === "working" ? "Working in cloud computer" : statusLabel[agent.status]}</span></span>
          {agent.unreadCount > 0 && <span className={`count ${agent.status === "waiting_for_approval" ? "attention" : ""}`}>{agent.unreadCount}</span>}
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
    <div className="sidebar-bottom"><button><UsersRound size={16} /> Workspace</button><button onClick={onSettings}><Settings size={16} /> Settings</button></div>
  </aside>;
}
