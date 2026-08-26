export interface UpdateInfo { version: string; releaseNotes?: string }
export interface UpdateService {
  check(signal?: AbortSignal): Promise<UpdateInfo | null>;
  install(update: UpdateInfo, signal?: AbortSignal): Promise<void>;
}

/** Deliberately performs no network activity until an update service is approved. */
export class DisabledUpdateService implements UpdateService {
  async check(): Promise<null> { return null; }
  async install(): Promise<void> { throw new Error("Automatic updates are not configured"); }
}
