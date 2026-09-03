import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CloudComputerSession } from "@/domain/types";

export function VncSurface({ session, viewOnly, compact = false, onReconnect, onDisconnect }: { session: CloudComputerSession; viewOnly: boolean; compact?: boolean; onReconnect?(): void; onDisconnect?(): void }) {
  const target = useRef<HTMLDivElement>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const [state, setState] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [failure, setFailure] = useState<string>();
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);

  useEffect(() => {
    if (!target.current) return;
    let cancelled = false;
    let rfb: import("@novnc/novnc/lib/rfb.js").default | undefined;
    setState("connecting"); setFailure(undefined);
    const connected = () => setState("connected");
    const disconnected = (event: Event) => {
      const clean = (event as CustomEvent<{ clean?: boolean }>).detail?.clean;
      setFailure((current) => current ?? (clean ? "Cloud computer disconnected." : "Cloud computer connection was lost."));
      setState("disconnected");
      onDisconnectRef.current?.();
    };
    const securityFailure = (event: Event) => {
      setFailure((event as CustomEvent<{ reason?: string }>).detail?.reason || "Cloud computer security negotiation failed.");
      setState("disconnected");
      onDisconnectRef.current?.();
    };
    void import("@novnc/novnc/lib/rfb.js").then(({ default: RFB }) => {
      if (cancelled || !target.current) return;
      rfb = new RFB(target.current, session.url, { shared: true, wsProtocols: session.protocols });
      rfb.viewOnly = viewOnly; rfb.scaleViewport = true; rfb.resizeSession = true;
      rfb.addEventListener("connect", connected); rfb.addEventListener("disconnect", disconnected); rfb.addEventListener("securityfailure", securityFailure);
    }).catch(() => { if (!cancelled) { setFailure("Could not load the cloud computer client."); setState("disconnected"); } });
    return () => { cancelled = true; rfb?.removeEventListener("connect", connected); rfb?.removeEventListener("disconnect", disconnected); rfb?.removeEventListener("securityfailure", securityFailure); rfb?.disconnect(); };
  }, [session, viewOnly]);

  return <div className={`vnc-viewport ${compact ? "is-compact" : ""}`}><div ref={target} className="vnc-target" />{state !== "connected" && <div className="vnc-status" role="status">{state === "connecting" ? <><Loader2 size={compact ? 14 : 18} className="spin" />{!compact && "Connecting…"}</> : <>{!compact && <span>{failure}</span>}{onReconnect && <button className="secondary-button" onClick={onReconnect}>Reconnect</button>}</>}</div>}</div>;
}

export function VncDesktop({ session, onClose, onReconnect }: { session: CloudComputerSession; onClose(): void; onReconnect(): void }) {
  return createPortal(<div className="vnc-desktop" role="dialog" aria-label="Cloud computer">
    <button className="vnc-close" aria-label="Close cloud computer" onClick={onClose}><X size={18} /></button>
    <VncSurface session={session} viewOnly={false} onReconnect={onReconnect} />
  </div>, document.body);
}
