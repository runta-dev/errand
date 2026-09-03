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
    let connectedToServer = false;
    let notifiedDisconnect = false;
    let framePoll: number | undefined;
    let frameTimeout: number | undefined;
    let rfb: import("@novnc/novnc/lib/rfb.js").default | undefined;
    setState("connecting"); setFailure(undefined);
    const stopFrameWait = () => { if (framePoll) window.clearInterval(framePoll); if (frameTimeout) window.clearTimeout(frameTimeout); framePoll = undefined; frameTimeout = undefined; };
    const notifyDisconnect = () => { if (notifiedDisconnect) return; notifiedDisconnect = true; onDisconnectRef.current?.(); };
    const hasFramebuffer = () => {
      const canvas = target.current?.querySelector("canvas"); if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;
      try { const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return false; const points = [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1], [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)]]; return points.some(([x, y]) => context.getImageData(x, y, 1, 1).data[3] > 0); } catch { return false; }
    };
    const connected = () => {
      connectedToServer = true;
      framePoll = window.setInterval(() => { if (!cancelled && hasFramebuffer()) { stopFrameWait(); setState("connected"); } }, 100);
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
      setFailure((event as CustomEvent<{ reason?: string }>).detail?.reason || "Cloud computer security negotiation failed.");
      setState("disconnected");
      notifyDisconnect();
    };
    void import("@novnc/novnc/lib/rfb.js").then(({ default: RFB }) => {
      if (cancelled || !target.current) return;
      rfb = new RFB(target.current, session.url, { shared: true, wsProtocols: session.protocols });
      rfb.viewOnly = viewOnly; rfb.scaleViewport = true; rfb.resizeSession = true;
      rfb.addEventListener("connect", connected); rfb.addEventListener("disconnect", disconnected); rfb.addEventListener("securityfailure", securityFailure);
    }).catch(() => { if (!cancelled) { setFailure("Could not load the cloud computer client."); setState("disconnected"); } });
    return () => { cancelled = true; stopFrameWait(); rfb?.removeEventListener("connect", connected); rfb?.removeEventListener("disconnect", disconnected); rfb?.removeEventListener("securityfailure", securityFailure); rfb?.disconnect(); };
  }, [session, viewOnly]);

  return <div className={`vnc-viewport ${compact ? "is-compact" : ""}`}><div ref={target} className="vnc-target" />{state !== "connected" && <div className="vnc-status" role="status">{state === "connecting" ? <><Loader2 size={compact ? 14 : 18} className="spin" />{!compact && "Connecting…"}</> : <>{!compact && <span>{failure}</span>}{onReconnect && <button className="secondary-button" onClick={onReconnect}>Reconnect</button>}</>}</div>}</div>;
}

export function VncDesktop({ session, failure, onClose, onReconnect }: { session?: CloudComputerSession; failure?: string; onClose(): void; onReconnect(): void }) {
  return createPortal(<div className="vnc-desktop" role="dialog" aria-label="Cloud computer">
    <button className="vnc-close" aria-label="Close cloud computer" onClick={onClose}><X size={18} /></button>
    {session ? <VncSurface session={session} viewOnly={false} onReconnect={onReconnect} /> : <div className="vnc-viewport"><div className="vnc-status" role="status">{failure ? <><span>{failure}</span><button className="secondary-button" onClick={onReconnect}>Reconnect</button></> : <><Loader2 size={18} className="spin" /> Connecting…</>}</div></div>}
  </div>, document.body);
}
