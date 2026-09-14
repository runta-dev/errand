import { Loader2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CloudComputerSession } from "@/domain/types";
import { canvasHasVisualFrame } from "./vncFrame";

export function VncSurface({ session, viewOnly, compact = false, onReconnect, onDisconnect }: { session: CloudComputerSession; viewOnly: boolean; compact?: boolean; onReconnect?(): void; onDisconnect?(): void }) {
  const target = useRef<HTMLDivElement>(null);
  const onDisconnectRef = useRef(onDisconnect);
  const [state, setState] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [failure, setFailure] = useState<string>();
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);

  useEffect(() => {
    if (!target.current) return;
    let cancelled = false;
    let failed = false;
    let connectedToServer = false;
    let notifiedDisconnect = false;
    let framePoll: number | undefined;
    let frameTimeout: number | undefined;
    let connectionTimeout: number | undefined;
    let rfb: import("@novnc/novnc/lib/rfb.js").default | undefined;
    const preview = compact ? target.current.closest<HTMLElement>(".computer-preview") : null;
    preview?.style.removeProperty("aspect-ratio");
    setState("connecting"); setFailure(undefined);
    const stopFrameWait = () => { if (framePoll) window.clearInterval(framePoll); if (frameTimeout) window.clearTimeout(frameTimeout); framePoll = undefined; frameTimeout = undefined; };
    const stopConnectionWait = () => { if (connectionTimeout) window.clearTimeout(connectionTimeout); connectionTimeout = undefined; };
    const notifyDisconnect = () => { if (notifiedDisconnect) return; notifiedDisconnect = true; onDisconnectRef.current?.(); };
    const fail = (message: string) => { if (cancelled || failed) return; failed = true; stopConnectionWait(); stopFrameWait(); setFailure(message); setState("disconnected"); notifyDisconnect(); rfb?.disconnect(); };
    const hasFramebuffer = () => { const canvas = target.current?.querySelector("canvas"); return canvas ? canvasHasVisualFrame(canvas) : false; };
    const connected = () => {
      if (cancelled || failed) return;
      stopConnectionWait();
      connectedToServer = true;
      framePoll = window.setInterval(() => { if (!cancelled && hasFramebuffer()) { stopFrameWait(); setState("connected"); } }, 100);
      frameTimeout = window.setTimeout(() => { if (!hasFramebuffer()) fail("Cloud computer did not produce a video frame."); }, 8_000);
    };
    const disconnected = (event: Event) => {
      if (cancelled || failed) return;
      stopConnectionWait();
      stopFrameWait();
      const clean = (event as CustomEvent<{ clean?: boolean }>).detail?.clean;
      setFailure((current) => current ?? (connectedToServer && clean ? "Cloud computer stopped before producing a frame." : clean ? "Cloud computer disconnected." : "Cloud computer connection was lost."));
      setState("disconnected");
      notifyDisconnect();
    };
    const securityFailure = (event: Event) => {
      fail((event as CustomEvent<{ reason?: string }>).detail?.reason || "Cloud computer security negotiation failed.");
    };
    const credentialsRequired = () => fail("Cloud computer requires VNC credentials that Errand cannot provide.");
    connectionTimeout = window.setTimeout(() => fail("Cloud computer connection timed out."), 15_000);
    void import("@novnc/novnc/lib/rfb.js").then(({ default: RFB }) => {
      if (cancelled || failed || !target.current) return;
      rfb = new RFB(target.current, session.url, { shared: true, wsProtocols: session.protocols });
      rfb.viewOnly = viewOnly; rfb.scaleViewport = true; rfb.resizeSession = false;
      if (compact) rfb.background = "transparent";
      rfb.addEventListener("connect", connected); rfb.addEventListener("disconnect", disconnected); rfb.addEventListener("securityfailure", securityFailure); rfb.addEventListener("credentialsrequired", credentialsRequired);
    }).catch(() => fail("Could not load the cloud computer client."));
    return () => { cancelled = true; stopConnectionWait(); stopFrameWait(); rfb?.removeEventListener("connect", connected); rfb?.removeEventListener("disconnect", disconnected); rfb?.removeEventListener("securityfailure", securityFailure); rfb?.removeEventListener("credentialsrequired", credentialsRequired); rfb?.disconnect(); };
  }, [compact, session, viewOnly]);

  return <div className={`vnc-viewport ${compact ? "is-compact" : ""}`}><div ref={target} className="vnc-target" />{state !== "connected" && <div className="vnc-status" role="status">{state === "connecting" ? <><Loader2 size={compact ? 14 : 18} className="spin" />{!compact && "Connecting…"}</> : <><span>{compact ? "Screen unavailable" : failure}</span>{onReconnect && <button className="secondary-button" onClick={onReconnect}>Reconnect</button>}</>}</div>}</div>;
}

export function VncDesktop({ session, failure, onClose, onReconnect }: { session?: CloudComputerSession; failure?: string; onClose(): void; onReconnect(): void }) {
  return createPortal(<div className="vnc-desktop" role="dialog" aria-label="Cloud computer">
    <div className="vnc-titlebar" aria-hidden="true" />
    <button className="vnc-close" aria-label="Minimize cloud computer" onClick={onClose}><Minimize2 size={18} /></button>
    {session ? <VncSurface session={session} viewOnly={false} onReconnect={onReconnect} /> : <div className="vnc-viewport"><div className="vnc-status" role="status">{failure ? <><span>{failure}</span><button className="secondary-button" onClick={onReconnect}>Reconnect</button></> : <><Loader2 size={18} className="spin" /> Connecting…</>}</div></div>}
  </div>, document.body);
}
