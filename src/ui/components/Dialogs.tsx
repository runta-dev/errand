import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, X } from "lucide-react";
import type { Agent, ModelProviderOption, UpdateAgentInput } from "@/domain/types";
import type { AppSettings, ThemePreference } from "@/shared/desktop";
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
export function SettingsDialog({ mode = "preferences", providers = [], organizationId = "", accountName = "Runta account", accountEmail = "", onModelProviderOpen, onLogout, onClose }: { mode?: "connection" | "preferences"; providers?: ModelProviderOption[]; organizationId?: string; accountName?: string; accountEmail?: string; onModelProviderOpen?(): void; onLogout?(): void; onClose(): void }) {
  const [settings, setSettings] = useState<AppSettings>({ endpoint: "https://api.forge", dashboardUrl: "https://app.forge", theme: "light", notifications: true });
  useEffect(() => { void window.runtaCrew?.settings.get().then(setSettings); }, []);
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
    <main className="settings-content"><header><h2>Settings</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <section><h3>Account</h3><div className="settings-card account-card"><span className="settings-account-avatar">{initials}</span><span className="settings-account-copy"><strong>{accountName}</strong>{accountEmail && <small>{accountEmail}</small>}</span>{onLogout && <button className="settings-signout" onClick={onLogout}>Sign out</button>}</div></section>
      <section><h3>Agents</h3><div className="settings-card">{providers.length
        ? <div className="settings-row"><span>Model provider</span><Select ariaLabel="Model provider" placeholder="Select a provider" value={settings.modelProviderId ?? ""} options={providers.map((provider) => ({ value: provider.id, label: provider.name }))} onChange={(modelProviderId) => persist({ ...settings, modelProviderId })} /></div>
        : <div className="settings-row"><span>Model provider</span><button type="button" className="settings-provider-action" aria-label="Add model provider" onClick={() => { onModelProviderOpen?.(); addModelProvider(); }}>Add model provider<ChevronRight size={14} /></button></div>}
      </div></section>
      <section><h3>Appearance</h3><div className="settings-card"><div className="settings-row"><span>Theme</span><Select ariaLabel="Theme" value={settings.theme} options={[{ value: "system", label: "Follow System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(theme) => persist({ ...settings, theme: theme as ThemePreference })} /></div><label className="settings-row"><span>Notifications</span><input className="settings-toggle" type="checkbox" checked={settings.notifications} onChange={(event) => persist({ ...settings, notifications: event.target.checked })} /></label></div></section>
    </main>
  </section></div>;
}
