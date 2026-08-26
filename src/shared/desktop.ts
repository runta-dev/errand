export type ThemePreference = "light" | "dark" | "system";
export type AppSettings = { endpoint: string; theme: ThemePreference; notifications: boolean };
export interface SelectedAttachment { id: string; name: string; size: number; mediaType: string }
export interface DesktopNotification { title: string; body: string }

export interface DesktopBridge {
  getVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
  settings: { get(): Promise<AppSettings>; set(settings: AppSettings): Promise<AppSettings> };
  credentials: { has(): Promise<boolean>; set(token: string | null): Promise<boolean> };
  attachments: { choose(): Promise<SelectedAttachment[]> };
  notifications: { show(notification: DesktopNotification): Promise<boolean>; setBadge(count: number): Promise<void> };
}
