import { Check, ChevronsRight, Maximize2, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApprovalRequest, CloudComputer, CloudComputerSession } from "@/domain/types";
import { VncDesktop, VncSurface } from "./VncDesktop";

export function DetailPanel({ open, agentName, computer, approvals, onApproval, onComputerAction, onClose }: { open: boolean; agentName: string; computer?: CloudComputer; approvals: ApprovalRequest[]; onApproval(id: string, decision: "allow" | "deny", note?: string): Promise<void>; onComputerAction(action: "open" | "takeover"): Promise<CloudComputerSession>; onClose(): void }) {
  const [note, setNote] = useState(""); const [computerBusy, setComputerBusy] = useState(false); const [previewSession, setPreviewSession] = useState<CloudComputerSession>(); const [computerSession, setComputerSession] = useState<CloudComputerSession>(); const [computerModalOpen, setComputerModalOpen] = useState(false); const [computerFailure, setComputerFailure] = useState<string>(); const pending = approvals.filter((approval) => approval.status === "pending");
  const computerActionRef = useRef(onComputerAction);
  useEffect(() => { computerActionRef.current = onComputerAction; }, [onComputerAction]);
  useEffect(() => {
    let alive = true;
    setPreviewSession(undefined);
    if (open && !computerModalOpen && computer?.status === "online") void computerActionRef.current("open").then((session) => { if (alive) setPreviewSession(session); }).catch(() => undefined);
    return () => { alive = false; };
  }, [computer?.id, computer?.status, computerModalOpen, open]);
  async function refreshPreview() { try { setPreviewSession(await computerActionRef.current("open")); } catch { /* controller owns the user-visible error */ } }
  async function launchComputer(action: "open" | "takeover") { setComputerModalOpen(true); setPreviewSession(undefined); setComputerSession(undefined); setComputerFailure(undefined); setComputerBusy(true); try { setComputerSession(await onComputerAction(action)); } catch (reason) { setComputerFailure(reason instanceof Error ? reason.message : "Could not connect to the cloud computer."); } finally { setComputerBusy(false); } }
  function closeComputer() { setComputerModalOpen(false); setComputerSession(undefined); setComputerFailure(undefined); }
  return <aside className={`detail-panel ${open ? "is-open" : "is-closing"}`}><header><button className="icon-button" aria-label="Close details" onClick={onClose}><ChevronsRight size={18} /></button></header>
    {pending.map((approval) => <section className="approval-card" key={approval.id}><div className="eyebrow warning"><ShieldAlert size={14} /> Approval required</div><h3>{approval.title}</h3><p>{approval.description}</p><div className="scope"><span>This allows:</span>{approval.scope.map((item) => <div key={item}><Check size={13} />{item}</div>)}</div><textarea aria-label="Approval note" placeholder="Add a note (optional)" value={note} onChange={(event) => setNote(event.target.value)} /><div className="approval-actions"><button className="secondary-button danger-text" onClick={() => void onApproval(approval.id, "deny", note)}>Deny</button><button className="primary-button" onClick={() => void onApproval(approval.id, "allow", note)}>Allow once</button></div></section>)}
    <section className="screen-section"><button className="screen-trigger" disabled={computerBusy || computer?.status !== "online"} aria-label={`Open ${agentName}'s screen`} onClick={() => void launchComputer("open")}><span className="computer-preview">{previewSession ? <VncSurface session={previewSession} viewOnly compact onDisconnect={() => void refreshPreview()} /> : <span className="computer-screen-off" aria-hidden="true" />}<span className="screen-hover-action"><Maximize2 size={14} /> Open</span></span></button><span className="screen-caption">{agentName}'s screen</span></section>
    {computerModalOpen && <VncDesktop session={computerSession} failure={computerFailure} onClose={closeComputer} onReconnect={() => void launchComputer("open")} />}
  </aside>;
}
