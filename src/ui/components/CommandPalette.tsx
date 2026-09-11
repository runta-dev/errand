import { Bot, Cloud, Plus, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/domain/types";

type PaletteCommand = { id: string; label: string; detail: string; icon: typeof Search; run(): void };
export function CommandPalette({ open, agents, onClose, onSelectAgent, onCreateAgent, onSettings, onComputer }: { open: boolean; agents: Agent[]; onClose(): void; onSelectAgent(id: string): void; onCreateAgent(): void; onSettings(): void; onComputer(): void }) {
  const [query, setQuery] = useState(""); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  const commands = useMemo<PaletteCommand[]>(() => [
    { id: "create", label: "Create cloud agent", detail: "Add another agent", icon: Plus, run: onCreateAgent },
    { id: "computer", label: "Open agent details", detail: "View the current cloud computer", icon: Cloud, run: onComputer },
    { id: "settings", label: "Open settings", detail: "Connection, theme and notifications", icon: Settings, run: onSettings },
    ...agents.map((agent) => ({ id: `agent-${agent.id}`, label: agent.name, detail: `${agent.role} · ${agent.status.replaceAll("_", " ")}`, icon: Bot, run: () => onSelectAgent(agent.id) })),
  ], [agents, onComputer, onCreateAgent, onSelectAgent, onSettings]);
  const results = commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()));
  if (!open) return null;
  const choose = (command: PaletteCommand) => { command.run(); onClose(); };
  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <label><Search size={17} /><input ref={inputRef} aria-label="Search commands and agents" placeholder="Search commands and agents…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter" && results[0]) choose(results[0]); }} /><kbd>esc</kbd></label>
      <div className="palette-results">{results.length ? results.map((command, index) => { const Icon = command.icon; return <button key={command.id} className={index === 0 ? "active" : ""} onClick={() => choose(command)}><span><Icon size={16} /></span><div><strong>{command.label}</strong><small>{command.detail}</small></div>{index === 0 && <kbd>↵</kbd>}</button>; }) : <p>No matching commands or agents</p>}</div>
      <footer><span>Errand</span><span><kbd>⌘</kbd><kbd>K</kbd> to open</span></footer>
    </section>
  </div>;
}
