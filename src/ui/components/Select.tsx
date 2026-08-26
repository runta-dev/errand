import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface SelectOption { value: string; label: string; disabled?: boolean }

export function Select({ value, options, ariaLabel, placeholder = "Select", onChange }: { value: string; options: SelectOption[]; ariaLabel: string; placeholder?: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false); const [openUp, setOpenUp] = useState(false); const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const move = (direction: 1 | -1) => {
    const available = options.filter((option) => !option.disabled); if (!available.length) return;
    const current = available.findIndex((option) => option.value === value);
    const next = current < 0 ? (direction > 0 ? 0 : available.length - 1) : (current + direction + available.length) % available.length;
    onChange(available[next]!.value);
  };
  const toggle = () => {
    if (!open) { const bounds = root.current?.getBoundingClientRect(); if (bounds) setOpenUp(window.innerHeight - bounds.bottom < 190 && bounds.top > window.innerHeight - bounds.bottom); }
    setOpen((current) => !current);
  };
  return <div className={`crew-select ${open ? "open" : ""} ${openUp ? "open-up" : ""}`} ref={root}>
    <button type="button" className="crew-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={toggle} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); setOpen(true); }
    }}><span>{selected?.label ?? placeholder}</span><span className="crew-select-chevron"><ChevronDown size={15} /></span></button>
    {open && <div className="crew-select-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span className="crew-select-check">{option.value === value && <Check size={14} />}</span><span title={option.label}>{option.label}</span></button>)}</div>}
  </div>;
}
