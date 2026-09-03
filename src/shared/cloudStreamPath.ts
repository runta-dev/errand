const CLOUD_RUN_EVENTS_PATH = /^\/v2\/agents\/[A-Za-z0-9._-]{1,160}\/runs\/[A-Za-z0-9._-]{1,160}\/events(?:\?after=-?\d+)?$/;

export function cloudRunEventsPath(value: unknown): string | undefined {
  return typeof value === "string" && CLOUD_RUN_EVENTS_PATH.test(value) ? value : undefined;
}
