import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption { value: string; label: string; disabled?: boolean }

export function Select({ value, options, ariaLabel, placeholder = "Select", onChange }: { value: string; options: SelectOption[]; ariaLabel: string; placeholder?: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false); const [menuStyle, setMenuStyle] = useState<React.CSSProperties>(); const root = useRef<HTMLDivElement>(null); const menu = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const bounds = root.current?.getBoundingClientRect(); if (!bounds) return;
      const gap = 5; const margin = 8; const desiredHeight = Math.min(220, options.length * 32 + 10); const roomBelow = window.innerHeight - bounds.bottom - margin; const openUp = roomBelow < desiredHeight && bounds.top - margin > roomBelow;
      setMenuStyle({ position: "fixed", zIndex: 100, left: Math.min(bounds.left, window.innerWidth - Math.max(bounds.width, 180) - margin), top: openUp ? Math.max(margin, bounds.top - desiredHeight - gap) : bounds.bottom + gap, width: Math.max(bounds.width, 180), maxHeight: openUp ? Math.min(220, bounds.top - gap - margin) : Math.min(220, roomBelow) });
    };
    const close = (event: PointerEvent) => { const target = event.target as Node; if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false); };
    position(); window.addEventListener("pointerdown", close); window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open, options.length]);
  const move = (direction: 1 | -1) => {
    const available = options.filter((option) => !option.disabled); if (!available.length) return;
    const current = available.findIndex((option) => option.value === value);
    const next = current < 0 ? (direction > 0 ? 0 : available.length - 1) : (current + direction + available.length) % available.length;
    onChange(available[next]!.value);
  };
  const toggle = () => setOpen((current) => !current);
  return <div className={`crew-select ${open ? "open" : ""}`} ref={root}>
    <button type="button" className="crew-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={toggle} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); setOpen(true); }
    }}><span>{selected?.label ?? placeholder}</span><span className="crew-select-chevron"><ChevronDown size={15} /></span></button>
    {open && menuStyle && createPortal(<div className="crew-select-menu crew-select-menu-portal" ref={menu} style={menuStyle} role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span className="crew-select-check">{option.value === value && <Check size={14} />}</span><span title={option.label}>{option.label}</span></button>)}</div>, document.body)}
  </div>;
}
