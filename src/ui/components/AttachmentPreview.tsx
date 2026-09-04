import { File, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Attachment } from "@/domain/types";

const IMAGE = /^image\/(?:avif|gif|jpeg|png|svg\+xml|webp)$/i;
const TEXT = /^(?:text\/|application\/(?:json|xml))/i;
const imageByName = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const textByName = /\.(?:css|csv|html?|js|json|log|md|py|rs|sh|sql|ts|tsx|txt|ya?ml|xml)$/i;
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const isImage = (attachment: Attachment) => IMAGE.test(attachment.mediaType) || imageByName.test(attachment.name);
const isText = (attachment: Attachment) => TEXT.test(attachment.mediaType) || textByName.test(attachment.name);
type Preview = { name: string; dataUrl?: string; text?: string };

async function content(attachment: Attachment): Promise<{ name: string; mediaType: string; base64: string }> {
  if (attachment.source === "local-selection") return window.runtaCrew!.attachments.read(attachment.id);
  if (!attachment.agentId) throw new Error("Cloud artifact reference is incomplete");
  const response = await window.runtaCrew!.cloud!.request({ method: "GET", path: `/v2/agents/${encodeURIComponent(attachment.agentId)}/artifacts/${encodeURIComponent(attachment.id)}?include_content=true` });
  const artifact = response.body as { name?: unknown; media_type?: unknown; content_base64?: unknown } | undefined;
  if (response.status !== 200 || typeof artifact?.content_base64 !== "string") throw new Error(`Artifact preview failed (${response.status})`);
  return { name: attachment.name, mediaType: typeof artifact.media_type === "string" ? artifact.media_type : attachment.mediaType, base64: artifact.content_base64 };
}

async function loadPreview(attachment: Attachment): Promise<Preview> {
  const loaded = await content(attachment);
  if (IMAGE.test(loaded.mediaType) || imageByName.test(loaded.name)) return { name: loaded.name, dataUrl: `data:${loaded.mediaType};base64,${loaded.base64}` };
  if (TEXT.test(loaded.mediaType) || textByName.test(loaded.name)) {
    const bytes = Uint8Array.from(atob(loaded.base64), (value) => value.charCodeAt(0));
    return { name: loaded.name, text: new TextDecoder().decode(bytes) };
  }
  throw new Error("Preview is unavailable for this file type");
}

function PreviewDialog({ preview, onClose }: { preview: Preview; onClose(): void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  return <div className="attachment-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><header><strong>{preview.name}</strong><button type="button" onClick={onClose} aria-label="Close preview"><X size={20} /></button></header>{preview.dataUrl ? <img src={preview.dataUrl} alt={preview.name} /> : <pre>{preview.text}</pre>}</div>;
}

function AttachmentCard({ attachment, onPreview, onRemove }: { attachment: Attachment; onPreview(preview: Preview): void; onRemove?(): void }) {
  const [thumbnail, setThumbnail] = useState<string>(); const [error, setError] = useState<string>();
  useEffect(() => { if (!isImage(attachment)) return; let alive = true; void loadPreview(attachment).then((preview) => { if (alive) setThumbnail(preview.dataUrl); }).catch(() => undefined); return () => { alive = false; }; }, [attachment]);
  const previewable = isImage(attachment) || isText(attachment);
  return <div className={`message-attachment-card ${isImage(attachment) ? "is-image" : ""} ${thumbnail ? "has-thumbnail" : ""}`}>{previewable ? <button type="button" className="attachment-open" aria-label={`Preview ${attachment.name}`} onClick={() => { setError(undefined); void loadPreview(attachment).then(onPreview).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Preview failed")); }}>{thumbnail ? <img src={thumbnail} alt="" /> : <FileText size={18} />}<span><strong>{attachment.name}</strong><small>{error ?? `${formatBytes(attachment.size)} · Preview`}</small></span></button> : <><File size={18} /><span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)} · {attachment.mediaType}</small></span></>}{onRemove && <button type="button" className="attachment-remove" onClick={onRemove} aria-label={`Remove ${attachment.name}`}><X size={13} /></button>}</div>;
}

export function AttachmentCards({ attachments, onRemove }: { attachments: Attachment[]; onRemove?(id: string): void }) {
  const [preview, setPreview] = useState<Preview>();
  return <>{attachments.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} onPreview={setPreview} onRemove={onRemove ? () => onRemove(attachment.id) : undefined} />)}{preview && <PreviewDialog preview={preview} onClose={() => setPreview(undefined)} />}</>;
}
