import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { MockCloudAgentsClient } from "@/clients/mock/MockCloudAgentsClient";
import { useCrewController } from "@/state/useCrewController";
import { AgentList } from "./components/AgentList";
import { Conversation } from "./components/Conversation";
import { DetailPanel } from "./components/DetailPanel";
import { CreateAgentDialog, SettingsDialog } from "./components/Dialogs";
import runtaLogo from "@/assets/runta-logo-icon.png";

export function App() {
  const client = useMemo(() => new MockCloudAgentsClient(), []); const crew = useCrewController(client);
  const [search, setSearch] = useState(""); const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth >= 1120); const [createOpen, setCreateOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false);
  const agents = crew.agents.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    void window.runtaCrew?.settings.get().then((settings) => {
      document.documentElement.dataset.theme = settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : settings.theme;
    });
  }, []);
  if (crew.loading) return <div className="loading-screen"><img className="loading-logo" src={runtaLogo} alt="" /><span>Loading your crew…</span></div>;
  return <div className={`app-shell ${detailsOpen ? "details-open" : ""}`}>
    <AgentList agents={agents} selectedId={crew.selectedAgentId} search={search} onSearch={setSearch} onSelect={crew.setSelectedAgentId} onCreate={() => setCreateOpen(true)} onSettings={() => setSettingsOpen(true)} />
    {crew.selectedAgent ? <Conversation agent={crew.selectedAgent} messages={crew.messages} activities={client.getActivities(`conversation-${crew.selectedAgent.id}`)} connection={crew.connection} onSend={crew.sendMessage} onReconnect={() => void crew.reconnect()} onToggleDetails={() => setDetailsOpen((value) => !value)} /> : <main className="empty-state">No agent selected</main>}
    {detailsOpen && crew.selectedAgent && <DetailPanel agent={crew.selectedAgent} computer={crew.computer} approvals={crew.approvals} onApproval={crew.respondToApproval} onClose={() => setDetailsOpen(false)} />}
    {crew.error && <div className="error-toast"><AlertCircle size={17} /><span>{crew.error}</span><button onClick={crew.dismissError}>Dismiss</button></div>}
    {createOpen && <CreateAgentDialog onClose={() => setCreateOpen(false)} onCreate={crew.createAgent} />}
    {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
  </div>;
}
