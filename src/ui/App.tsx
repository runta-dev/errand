import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { RuntaCloudAgentsClient } from "@/clients/http/RuntaCloudAgentsClient";
import { useCrewController } from "@/state/useCrewController";
import { AgentList, type AgentAction } from "./components/AgentList";
import { Conversation } from "./components/Conversation";
import { DetailPanel } from "./components/DetailPanel";
import { CreateAgentDialog, DeleteAgentDialog, EditAgentDialog, SettingsDialog } from "./components/Dialogs";
import { CommandPalette } from "./components/CommandPalette";
import { LoginPage } from "./components/LoginPage";
import { AgentAvatar } from "./components/AgentAvatar";
import { accountDisplayName } from "./accountDisplayName";
import type { Agent } from "@/domain/types";

export function App() {
  const [client, setClient] = useState<RuntaCloudAgentsClient>(() => new RuntaCloudAgentsClient()); const crew = useCrewController(client);
  const [authReady, setAuthReady] = useState(false); const [signedIn, setSignedIn] = useState(false); const [authPending, setAuthPending] = useState(false); const [authError, setAuthError] = useState<string>(); const [userName, setUserName] = useState(""); const [userEmail, setUserEmail] = useState("");
  const crewAgents = crew.agents; const selectAgent = crew.setSelectedAgentId;
  const [search, setSearch] = useState(""); const [detailsOpen, setDetailsOpen] = useState(false); const [detailsMounted, setDetailsMounted] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [paletteOpen, setPaletteOpen] = useState(false); const [editingAgent, setEditingAgent] = useState<Agent>(); const [deletingAgent, setDeletingAgent] = useState<Agent>();
  const agents = crew.agents.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(search.toLowerCase()));
  function readableAuthError(reason: unknown) {
    const raw = reason instanceof Error ? reason.message : "";
    if (/Device authorization failed \(401\)/.test(raw)) return "This Runta environment does not support Crew sign-in yet.";
    if (/Device authorization failed \(502|fetch failed/i.test(raw)) return "Runta Cloud Agents is unavailable. Try again shortly.";
    return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, "") || "Authorization failed. Try again.";
  }
  async function connectAuthenticatedAccount() {
    const response = await window.runtaCrew?.cloud?.request({ method: "GET", path: "/v1/me" }).catch(() => undefined);
    if (!response) { setSignedIn(false); setUserName(""); setAuthError("Runta session validation did not return a response."); return false; }
    if (response.status !== 200) { setSignedIn(false); setUserName(""); setAuthError(`Runta session validation failed (${response.status}).`); return false; }
    const profile = response.body as { data?: { display_name?: string | null; email?: string } } | undefined;
    setUserName(accountDisplayName(profile?.data));
    setUserEmail(profile?.data?.email ?? "");
    setClient(new RuntaCloudAgentsClient()); setSignedIn(true);
    setAuthReady(true); setAuthError(undefined);
    return true;
  }
  async function signIn() {
    setAuthPending(true); setAuthError(undefined);
    try {
      const started = await window.runtaCrew?.auth?.start();
      if (!started) throw new Error("OAuth is unavailable in this environment.");
      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const status = await window.runtaCrew?.auth?.status();
        if (status === "pending") continue;
        if (status === "authorized") {
          await connectAuthenticatedAccount();
          return;
        }
        throw new Error(status === "denied" ? "Authorization was denied." : status === "expired" ? "Authorization expired. Try again." : "Authorization failed. Try again.");
      }
    } catch (reason) { setAuthError(readableAuthError(reason)); }
    finally { setAuthPending(false); }
  }
  async function logout() {
    setAuthError(undefined);
    try {
      await window.runtaCrew?.auth?.logout();
      setClient(new RuntaCloudAgentsClient()); setSignedIn(false); setAuthReady(true); setUserName(""); setUserEmail("");
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : "Could not revoke the Runta key. Try again.");
    }
  }
  useEffect(() => {
    void Promise.all([window.runtaCrew?.settings.get(), window.runtaCrew?.credentials.has()]).then(async ([settings, hasCredential]) => {
      if (!settings) { setAuthReady(true); return; }
      document.documentElement.dataset.theme = settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : settings.theme;
      if (!settings.endpoint) { setAuthReady(true); return; }
      if (settings.endpoint && hasCredential) {
        await connectAuthenticatedAccount();
      } else setAuthReady(true);
    });
  }, []);
  useEffect(() => { void window.runtaCrew?.notifications.setBadge(crew.agents.reduce((total, agent) => total + agent.unreadCount, 0)); }, [crew.agents]);
  useEffect(() => window.runtaCrew?.deepLinks.onOpenAgent((agentId) => { if (crewAgents.some((agent) => agent.id === agentId)) selectAgent(agentId); }), [crewAgents, selectAgent]);
  useEffect(() => { if (crew.selectedAgent?.status === "waiting_for_approval") setDetailsOpen(true); }, [crew.selectedAgent?.status]);
  useEffect(() => {
    if (detailsOpen) { setDetailsMounted(true); return; }
    const timer = window.setTimeout(() => setDetailsMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [detailsOpen]);
  function handleAgentAction(agent: Agent, action: AgentAction) {
    if (action === "edit") setEditingAgent(agent);
    if (action === "delete") setDeletingAgent(agent);
    if (action === "pin") void crew.updateAgent(agent.id, { pinned: !agent.pinned });
    if (action === "duplicate") void crew.duplicateAgent(agent.id);
    if (action === "toggle-unread") void crew.setAgentUnread(agent.id, agent.unreadCount === 0);
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((value) => !value); }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  if (!authReady || crew.loading) return <div className="loading-screen"><div className="loading-avatar" aria-hidden="true"><AgentAvatar agent={{ id: "runta-crew-loading", name: "Runta Crew" }} size={56} /></div><span>Loading Runta Crew…</span></div>;
  if (!signedIn) return <><LoginPage status={authPending ? "pending" : "idle"} error={authError} allowConnectionSettings={import.meta.env.DEV} onSignIn={() => void signIn()} onSettings={() => setSettingsOpen(true)} />{import.meta.env.DEV && settingsOpen && <SettingsDialog mode="connection" onClose={() => setSettingsOpen(false)} />}</>;
  return <div className={`app-shell ${detailsOpen ? "details-open" : ""}`}>
    <AgentList agents={agents} selectedId={crew.selectedAgentId} search={search} signedIn={signedIn} userName={userName} onSearch={setSearch} onSelect={crew.setSelectedAgentId} onAction={handleAgentAction} onCreate={() => setCreateOpen(true)} onSettings={() => setSettingsOpen(true)} onSignIn={() => setSettingsOpen(true)} onLogout={() => void logout()} />
    {crew.selectedAgent ? <Conversation agent={crew.selectedAgent} messages={crew.messages} activities={client.getActivities(`conversation-${crew.selectedAgent.id}`)} onSend={crew.sendMessage} onReact={crew.reactToMessage} onToggleDetails={() => setDetailsOpen((value) => !value)} /> : <main className="empty-state">No agent selected</main>}
    {detailsMounted && crew.selectedAgent && <DetailPanel open={detailsOpen} agentName={crew.selectedAgent.name} computer={crew.computer} approvals={crew.approvals} onApproval={crew.respondToApproval} onComputerAction={crew.openComputer} onClose={() => setDetailsOpen(false)} />}
    {(crew.error || authError) && <div className="error-toast"><AlertCircle size={17} /><span>{crew.error || authError}</span><button onClick={() => { crew.dismissError(); setAuthError(undefined); }}>Dismiss</button></div>}
    {createOpen && <CreateAgentDialog providers={crew.modelProviders} onClose={() => setCreateOpen(false)} onCreate={crew.createAgent} />}
    {editingAgent && <EditAgentDialog agent={editingAgent} onClose={() => setEditingAgent(undefined)} onSave={(input) => crew.updateAgent(editingAgent.id, input)} />}
    {deletingAgent && <DeleteAgentDialog agent={deletingAgent} onClose={() => setDeletingAgent(undefined)} onDelete={() => crew.deleteAgent(deletingAgent.id)} />}
    {settingsOpen && <SettingsDialog accountName={userName} accountEmail={userEmail} onLogout={() => { setSettingsOpen(false); void logout(); }} onClose={() => setSettingsOpen(false)} />}
    <CommandPalette open={paletteOpen} agents={crew.agents} onClose={() => setPaletteOpen(false)} onSelectAgent={crew.setSelectedAgentId} onCreateAgent={() => setCreateOpen(true)} onSettings={() => setSettingsOpen(true)} onComputer={() => setDetailsOpen(true)} />
  </div>;
}
