export type ThemePreference = "light" | "dark" | "system";
export type AppSettings = { endpoint: string; dashboardUrl?: string; theme: ThemePreference; notifications: boolean; modelProviderId?: string };
export interface SelectedAttachment { id: string; name: string; size: number; mediaType: string }
export interface AttachmentContent { name: string; mediaType: string; base64: string }
export interface DesktopNotification { title: string; body: string }
export interface CloudRequest { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown }
export interface CloudResponse { status: number; body?: unknown }
export interface CloudStreamEvent { event: string; id?: string; data?: unknown }
export interface DeviceAuthorizationStart { verificationUrl: string; userCode: string; expiresAt: string }
export type DeviceAuthorizationStatus = "idle" | "pending" | "authorized" | "denied" | "expired" | "error";

export interface DesktopBridge {
  getVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
  settings: { get(): Promise<AppSettings>; set(settings: AppSettings): Promise<AppSettings> };
  credentials: { has(): Promise<boolean>; set(token: string | null): Promise<boolean> };
  auth?: { start(): Promise<DeviceAuthorizationStart>; status(): Promise<DeviceAuthorizationStatus>; logout(): Promise<boolean> };
  cloud?: { request(request: CloudRequest): Promise<CloudResponse>; subscribe(path: string, listener: (event: CloudStreamEvent) => void): () => void };
  attachments: { choose(): Promise<SelectedAttachment[]>; read(id: string): Promise<AttachmentContent> };
  notifications: { show(notification: DesktopNotification): Promise<boolean>; setBadge(count: number): Promise<void> };
  deepLinks: { onOpenAgent(listener: (agentId: string) => void): () => void };
}
