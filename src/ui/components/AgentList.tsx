import { Plus, Search, Settings, UsersRound } from "lucide-react";
import type { Agent, AgentStatus } from "@/domain/types";
import runtaLogo from "@/assets/runta-logo-icon.png";

const statusLabel: Record<AgentStatus, string> = { working: "Working", idle: "Idle", waiting_for_approval: "Needs approval", offline: "Offline" };
export function AgentList({ agents, selectedId, search, onSearch, onSelect, onCreate, onSettings }: { agents: Agent[]; selectedId: string; search: string; onSearch(value: string): void; onSelect(id: string): void; onCreate(): void; onSettings(): void }) {
  return <aside className="agent-sidebar">
    <div className="brand"><img src={runtaLogo} alt="" aria-hidden="true" /><span className="brand-runta">Runta</span><span className="brand-product">Crew</span></div>
    <button className="primary-button create-button" onClick={onCreate}><Plus size={16} /> New agent</button>
    <label className="search"><Search size={15} /><input aria-label="Search agents" placeholder="Search your crew" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
    <div className="section-label"><span>Your crew</span><span>{agents.length}</span></div>
    <div className="agent-list">
      {agents.map((agent) => <button key={agent.id} className={`agent-row ${selectedId === agent.id ? "selected" : ""}`} onClick={() => onSelect(agent.id)}>
        <span className={`avatar avatar-${agent.id}`}>{agent.avatar}<i className={`presence ${agent.status}`} /></span>
        <span className="agent-copy"><strong>{agent.name}</strong><span>{agent.status === "working" ? "Working in cloud computer" : statusLabel[agent.status]}</span></span>
        {agent.unreadCount > 0 && <span className={`count ${agent.status === "waiting_for_approval" ? "attention" : ""}`}>{agent.unreadCount}</span>}
      </button>)}
    </div>
    <div className="sidebar-bottom"><button><UsersRound size={16} /> Workspace</button><button onClick={onSettings}><Settings size={16} /> Settings</button></div>
  </aside>;
}
