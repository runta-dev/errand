import { ModelProviderIcon } from "./ModelProviderIcon";
import { providerIconId } from "../providerIcon";
import { DEFAULT_AGENT_SYSTEM_PROMPT, normalizeSystemPrompt } from "@/domain/agentPrompt";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import type { Agent, ModelProviderOption, UpdateAgentInput } from "@/domain/types";
import type { AppSettings, ThemePreference } from "@/shared/desktop";
import { DEFAULT_RUNTA_API_URL, DEFAULT_RUNTA_DASHBOARD_URL } from "@/shared/runtaEndpoints";
import { Select } from "./Select";

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={18} /></button></header>{children}</section></div>; }
export function EditAgentDialog({ agent, onClose, onSave }: { agent: Agent; onClose(): void; onSave(input: UpdateAgentInput): Promise<void> }) {
  const [name, setName] = useState(agent.name); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onSave({ name }); onClose(); } finally { setSaving(false); } }
  return <DialogShell title={`Rename ${agent.name}`} onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div></form></DialogShell>;
}
export function DeleteAgentDialog({ agent, onClose, onDelete }: { agent: Agent; onClose(): void; onDelete(): Promise<void> }) {
  function remove() { onClose(); void onDelete().catch(() => undefined); }
  return <DialogShell title={`Delete ${agent.name}?`} onClose={onClose}><div className="delete-agent-copy"><p>This permanently removes the cloud agent and its runtime data.</p><strong>This action cannot be undone.</strong></div><div className="dialog-actions delete-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button destructive-button" onClick={remove}>Delete agent</button></div></DialogShell>;
}
export function SettingsDialog({ mode = "preferences", providers = [], organizationId = "", accountName = "Your account", accountEmail = "", onModelProviderOpen, onLogout, onClose }: { mode?: "connection" | "preferences"; providers?: ModelProviderOption[]; organizationId?: string; accountName?: string; accountEmail?: string; onModelProviderOpen?(): void; onLogout?(): void; onClose(): void }) {
  const [settings, setSettings] = useState<AppSettings>({ endpoint: DEFAULT_RUNTA_API_URL, dashboardUrl: DEFAULT_RUNTA_DASHBOARD_URL, theme: "light", notifications: true });
  const [promptDraft, setPromptDraft] = useState(DEFAULT_AGENT_SYSTEM_PROMPT);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptFeedback, setPromptFeedback] = useState<{ error: boolean; text: string }>();
  useEffect(() => { void window.runtaCrew?.settings.get().then((value) => { setSettings(value); setPromptDraft(value.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT); }); }, []);
  async function savePrompt() {
    setPromptSaving(true); setPromptFeedback(undefined);
    try {
      const bridge = window.runtaCrew?.settings;
      if (!bridge) throw new Error("Settings are unavailable.");
      const current = await bridge.get();
      const saved = await bridge.set({ ...current, systemPrompt: normalizeSystemPrompt(promptDraft) });
      setSettings(saved); setPromptDraft(saved.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT);
      setPromptFeedback({ error: false, text: "Saved. New agents will use this prompt." });
    } catch (reason) { setPromptFeedback({ error: true, text: reason instanceof Error ? reason.message : "Could not save the system prompt." }); }
    finally { setPromptSaving(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); await window.runtaCrew?.settings.set(settings);
    document.documentElement.dataset.theme = settings.theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : settings.theme;
    onClose();
  }
  if (mode === "connection") return <DialogShell title="Connection" onClose={onClose}><form className="settings-form compact-settings" onSubmit={save}>
      <label>API base URL<input autoFocus required type="url" value={settings.endpoint} onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })} /></label>
      <label>Dashboard URL<input required type="url" value={settings.dashboardUrl} onChange={(event) => setSettings({ ...settings, dashboardUrl: event.target.value })} /></label>
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save</button></div>
  </form></DialogShell>;
  const initials = accountName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const persist = (next: AppSettings) => { setSettings(next); void window.runtaCrew?.settings.set(next); document.documentElement.dataset.theme = next.theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : next.theme; };
  const addModelProvider = () => {
    if (!settings.dashboardUrl || !organizationId) return;
    const url = new URL(`/org/${encodeURIComponent(organizationId)}/secrets/providers/new`, settings.dashboardUrl);
    void window.runtaCrew?.openExternal(url.toString());
  };
  return <div className="dialog-backdrop settings-backdrop" role="presentation"><section className="settings-window" role="dialog" aria-modal="true" aria-label="Settings">
    <header className="settings-header"><h2>Settings</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
    <main className="settings-content">
      <section><h3>Account</h3><div className="settings-card account-card"><span className="settings-account-avatar">{initials}</span><span className="settings-account-copy"><strong>{accountName}</strong>{accountEmail && <small>{accountEmail}</small>}</span>{onLogout && <button className="settings-signout" onClick={onLogout}>Sign out</button>}</div></section>
      <section><h3>Agents</h3><div className="settings-card"><div className="settings-row settings-provider-row"><span>Model provider</span>{providers.length
        ? <Select ariaLabel="Model provider" placeholder="Select a provider" value={settings.modelProviderId ?? ""} options={[...providers.map((provider) => ({ value: provider.id, label: provider.name, icon: <ModelProviderIcon id={providerIconId(provider)} className="provider-menu-icon" /> })), { value: "__add_provider__", label: "Add model provider", icon: <Plus size={14} />, disabled: !settings.dashboardUrl || !organizationId, action: () => { onModelProviderOpen?.(); addModelProvider(); } }]} onChange={(modelProviderId) => persist({ ...settings, modelProviderId })} />
        : <button type="button" className="settings-provider-action" aria-label="Add model provider" onClick={() => { onModelProviderOpen?.(); addModelProvider(); }}>Add model provider<ChevronRight size={14} /></button>}<p className="settings-provider-note">Only API model providers are supported. Subscriptions are not supported.</p></div>
        <div className="settings-system-prompt"><label htmlFor="agent-system-prompt">System prompt</label><p>Applies to new agents only. Use {"{agent_name}"} for the agent’s name.</p><textarea id="agent-system-prompt" rows={7} value={promptDraft} disabled={promptSaving} onChange={(event) => { setPromptDraft(event.target.value); setPromptFeedback(undefined); }} /><div className="settings-prompt-actions"><button type="button" className="settings-prompt-button" disabled={promptSaving || promptDraft === DEFAULT_AGENT_SYSTEM_PROMPT} onClick={() => { setPromptDraft(DEFAULT_AGENT_SYSTEM_PROMPT); setPromptFeedback(undefined); }}>Restore default</button><button type="button" className="settings-prompt-button is-primary" aria-label="Save prompt" disabled={promptSaving || !promptDraft.trim() || promptDraft === (settings.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT)} onClick={() => void savePrompt()}>{promptSaving ? "Saving…" : "Save"}</button></div>{promptFeedback && <p role={promptFeedback.error ? "alert" : "status"}>{promptFeedback.text}</p>}</div>
      </div></section>
      <section><h3>Appearance</h3><div className="settings-card"><div className="settings-row"><span>Theme</span><Select ariaLabel="Theme" value={settings.theme} options={[{ value: "system", label: "Follow System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(theme) => persist({ ...settings, theme: theme as ThemePreference })} /></div><label className="settings-row"><span>Notifications</span><input className="settings-toggle" type="checkbox" checked={settings.notifications} onChange={(event) => persist({ ...settings, notifications: event.target.checked })} /></label></div></section>
    </main>
  </section></div>;
}
