import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Agent, CreateAgentInput, UpdateAgentInput } from "@/domain/types";
import type { AppSettings, ThemePreference } from "@/shared/desktop";

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={18} /></button></header>{children}</section></div>; }
export function CreateAgentDialog({ onClose, onCreate }: { onClose(): void; onCreate(input: CreateAgentInput): Promise<void> }) {
  const [form, setForm] = useState<CreateAgentInput>({ name: "", role: "", goal: "" }); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onCreate(form); onClose(); } finally { setSaving(false); } }
  return <DialogShell title="Add a cloud agent" onClose={onClose}><p className="dialog-lead">Give your new teammate a clear role and first objective.</p><form className="dialog-form" onSubmit={submit}><label>Name<input autoFocus required placeholder="e.g. Scout" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Role<input required placeholder="e.g. Customer research lead" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label><label>Initial goal<textarea required placeholder="What should this agent own?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create agent"}</button></div></form></DialogShell>;
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
export function SettingsDialog({ mode = "preferences", onClose }: { mode?: "connection" | "preferences"; onClose(): void }) {
  const [settings, setSettings] = useState<AppSettings>({ endpoint: "https://app.forge/api", dashboardUrl: "https://app.forge", theme: "light", notifications: true });
  useEffect(() => { void window.runtaCrew?.settings.get().then(setSettings); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); await window.runtaCrew?.settings.set(settings);
    document.documentElement.dataset.theme = settings.theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : settings.theme;
    onClose();
  }
  return <DialogShell title={mode === "connection" ? "Connection" : "Settings"} onClose={onClose}><form className="settings-form compact-settings" onSubmit={save}>
    {mode === "connection" ? <>
      <label>API base URL<input autoFocus required type="url" value={settings.endpoint} onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })} /></label>
      <label>Dashboard URL<input required type="url" value={settings.dashboardUrl} onChange={(event) => setSettings({ ...settings, dashboardUrl: event.target.value })} /></label>
    </> : <>
      <label>Theme<select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value as ThemePreference })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
      <label className="checkbox"><input type="checkbox" checked={settings.notifications} onChange={(event) => setSettings({ ...settings, notifications: event.target.checked })} /> Notify me when work finishes or needs approval</label>
    </>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save</button></div>
  </form></DialogShell>;
}
