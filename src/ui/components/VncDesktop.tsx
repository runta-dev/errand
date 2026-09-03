import { Loader2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CloudComputerSession } from "@/domain/types";
import { canvasHasVisualFrame } from "./vncFrame";

export function VncSurface({ session, viewOnly, compact = false, onReconnect, onDisconnect, onAspectRatio }: { session: CloudComputerSession; viewOnly: boolean; compact?: boolean; onReconnect?(): void; onDisconnect?(): void; onAspectRatio?(ratio: number): void }) {
  const target = useRef<HTMLDivElement>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const onAspectRatioRef = useRef(onAspectRatio);
  const [state, setState] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [failure, setFailure] = useState<string>();
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { onAspectRatioRef.current = onAspectRatio; }, [onAspectRatio]);

  useEffect(() => {
    if (!target.current) return;
    let cancelled = false;
    let connectedToServer = false;
    let notifiedDisconnect = false;
    let framePoll: number | undefined;
    let frameTimeout: number | undefined;
    let rfb: import("@novnc/novnc/lib/rfb.js").default | undefined;
    if (compact) target.current.closest<HTMLElement>(".computer-preview")?.style.setProperty("aspect-ratio", "16 / 9");
    setState("connecting"); setFailure(undefined);
    const stopFrameWait = () => { if (framePoll) window.clearInterval(framePoll); if (frameTimeout) window.clearTimeout(frameTimeout); framePoll = undefined; frameTimeout = undefined; };
    const notifyDisconnect = () => { if (notifiedDisconnect) return; notifiedDisconnect = true; onDisconnectRef.current?.(); };
    const hasFramebuffer = () => { const canvas = target.current?.querySelector("canvas"); return canvas ? canvasHasVisualFrame(canvas) : false; };
    const connected = () => {
      connectedToServer = true;
      framePoll = window.setInterval(() => { if (!cancelled && hasFramebuffer()) { const canvas = target.current?.querySelector("canvas"); if (canvas && canvas.width > 0 && canvas.height > 0) { const ratio = canvas.width / canvas.height; onAspectRatioRef.current?.(ratio); if (compact) target.current?.closest<HTMLElement>(".computer-preview")?.style.setProperty("aspect-ratio", String(ratio)); } stopFrameWait(); setState("connected"); } }, 100);
      frameTimeout = window.setTimeout(() => { if (cancelled || hasFramebuffer()) return; stopFrameWait(); setFailure("Cloud computer did not produce a video frame."); setState("disconnected"); notifyDisconnect(); rfb?.disconnect(); }, 8_000);
    };
    const disconnected = (event: Event) => {
      stopFrameWait();
      const clean = (event as CustomEvent<{ clean?: boolean }>).detail?.clean;
      setFailure((current) => current ?? (connectedToServer && clean ? "Cloud computer stopped before producing a frame." : clean ? "Cloud computer disconnected." : "Cloud computer connection was lost."));
      setState("disconnected");
      notifyDisconnect();
    };
    const securityFailure = (event: Event) => {
      stopFrameWait();
      setFailure((event as CustomEvent<{ reason?: string }>).detail?.reason || "Cloud computer security negotiation failed.");
      setState("disconnected");
      notifyDisconnect();
    };
    void import("@novnc/novnc/lib/rfb.js").then(({ default: RFB }) => {
      if (cancelled || !target.current) return;
      rfb = new RFB(target.current, session.url, { shared: true, wsProtocols: session.protocols });
      rfb.viewOnly = viewOnly; rfb.scaleViewport = true; rfb.resizeSession = true;
      rfb.addEventListener("connect", connected); rfb.addEventListener("disconnect", disconnected); rfb.addEventListener("securityfailure", securityFailure);
    }).catch(() => { if (!cancelled) { setFailure("Could not load the cloud computer client."); setState("disconnected"); notifyDisconnect(); } });
    return () => { cancelled = true; stopFrameWait(); rfb?.removeEventListener("connect", connected); rfb?.removeEventListener("disconnect", disconnected); rfb?.removeEventListener("securityfailure", securityFailure); rfb?.disconnect(); };
  }, [compact, session, viewOnly]);

  return <div className={`vnc-viewport ${compact ? "is-compact" : ""}`}><div ref={target} className="vnc-target" />{state !== "connected" && <div className="vnc-status" role="status">{state === "connecting" ? <><Loader2 size={compact ? 14 : 18} className="spin" />{!compact && "Connecting…"}</> : <>{!compact && <span>{failure}</span>}{onReconnect && <button className="secondary-button" onClick={onReconnect}>Reconnect</button>}</>}</div>}</div>;
}

export function VncDesktop({ session, failure, onClose, onReconnect }: { session?: CloudComputerSession; failure?: string; onClose(): void; onReconnect(): void }) {
  return createPortal(<div className="vnc-desktop" role="dialog" aria-label="Cloud computer">
    <button className="vnc-close" aria-label="Minimize cloud computer" onClick={onClose}><Minimize2 size={18} /></button>
    {session ? <VncSurface session={session} viewOnly={false} onReconnect={onReconnect} /> : <div className="vnc-viewport"><div className="vnc-status" role="status">{failure ? <><span>{failure}</span><button className="secondary-button" onClick={onReconnect}>Reconnect</button></> : <><Loader2 size={18} className="spin" /> Connecting…</>}</div></div>}
  </div>, document.body);
}
