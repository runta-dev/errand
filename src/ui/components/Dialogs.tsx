import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Agent, CreateAgentInput, ModelProviderOption, UpdateAgentInput } from "@/domain/types";
import type { AppSettings, ThemePreference } from "@/shared/desktop";

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={18} /></button></header>{children}</section></div>; }
export function CreateAgentDialog({ providers, onClose, onCreate }: { providers: ModelProviderOption[]; onClose(): void; onCreate(input: CreateAgentInput): Promise<void> }) {
  const [form, setForm] = useState<CreateAgentInput>({ name: "", modelProviderId: providers[0]?.id ?? "" }); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onCreate(form); onClose(); } finally { setSaving(false); } }
  return <DialogShell title="Add a cloud agent" onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Name<input autoFocus required placeholder="e.g. Scout" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Model provider<select required value={form.modelProviderId} onChange={(event) => setForm({ ...form, modelProviderId: event.target.value })}><option value="" disabled>Select a provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.defaultModel ? ` · ${provider.defaultModel}` : ""}</option>)}</select></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !form.modelProviderId}>{saving ? "Creating…" : "Create agent"}</button></div></form></DialogShell>;
}
export function EditAgentDialog({ agent, onClose, onSave }: { agent: Agent; onClose(): void; onSave(input: UpdateAgentInput): Promise<void> }) {
  const [form, setForm] = useState({ name: agent.name, role: agent.role, goal: agent.goal }); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } }
  return <DialogShell title={`Edit ${agent.name}`} onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Name<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Role<input required value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></label><label>Goal<textarea required value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save agent"}</button></div></form></DialogShell>;
}
export function DeleteAgentDialog({ agent, onClose, onDelete }: { agent: Agent; onClose(): void; onDelete(): Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  async function remove() { setDeleting(true); try { await onDelete(); onClose(); } finally { setDeleting(false); } }
  return <DialogShell title={`Delete ${agent.name}?`} onClose={onClose}><div className="delete-agent-copy"><p>This permanently removes the cloud agent and its runtime data.</p><strong>This action cannot be undone.</strong></div><div className="dialog-actions delete-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button destructive-button" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting…" : "Delete agent"}</button></div></DialogShell>;
}
export function SettingsDialog({ mode = "preferences", accountName = "Runta account", accountEmail = "", onLogout, onClose }: { mode?: "connection" | "preferences"; accountName?: string; accountEmail?: string; onLogout?(): void; onClose(): void }) {
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
  return <div className="dialog-backdrop settings-backdrop" role="presentation"><section className="settings-window" role="dialog" aria-modal="true" aria-label="Settings">
    <main className="settings-content"><header><h2>Settings</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <section><h3>Account</h3><div className="settings-card account-card"><span className="settings-account-avatar">{initials}</span><span className="settings-account-copy"><strong>{accountName}</strong>{accountEmail && <small>{accountEmail}</small>}</span>{onLogout && <button className="settings-signout" onClick={onLogout}>Sign out</button>}</div></section>
      <section><h3>Appearance</h3><div className="settings-card"><label className="settings-row"><span>Theme</span><select value={settings.theme} onChange={(event) => persist({ ...settings, theme: event.target.value as ThemePreference })}><option value="system">Follow System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label className="settings-row"><span>Notifications</span><input className="settings-toggle" type="checkbox" checked={settings.notifications} onChange={(event) => persist({ ...settings, notifications: event.target.checked })} /></label></div></section>
    </main>
  </section></div>;
}
