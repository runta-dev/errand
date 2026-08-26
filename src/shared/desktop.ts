export type ThemePreference = "light" | "dark" | "system";
export type AppSettings = { endpoint: string; theme: ThemePreference; notifications: boolean };

export interface DesktopBridge {
  getVersion(): Promise<string>;
  openExternal(url: string): Promise<void>;
  settings: { get(): Promise<AppSettings>; set(settings: AppSettings): Promise<AppSettings> };
  credentials: { has(): Promise<boolean>; set(token: string | null): Promise<boolean> };
}
