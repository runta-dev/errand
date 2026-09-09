export interface VncOriginContext {
  endpoint: string;
  dashboardUrl: string;
  rendererUrl: string;
  webContentsId: number;
}

interface VncGrant {
  context: VncOriginContext;
  url: string;
  expiresAt: number;
  origin: string;
}

interface WebSocketRequest {
  url: string;
  method: string;
  resourceType: string;
  webContentsId?: number;
  requestHeaders: Record<string, string>;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function sameContext(left: VncOriginContext, right: VncOriginContext): boolean {
  return left.endpoint === right.endpoint && left.dashboardUrl === right.dashboardUrl && left.rendererUrl === right.rendererUrl && left.webContentsId === right.webContentsId;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === name);
  return entries.length === 1 ? entries[0][1] : undefined;
}

// Only an authenticated computer-session response can authorize this desktop Origin.
export class VncOriginGrants {
  private grants: VncGrant[] = [];
  private generation = 0;

  get revision(): number { return this.generation; }

  clear(): void { this.grants = []; this.generation += 1; }

  remember(response: { url: string; method: string; status: number; body: unknown }, context: VncOriginContext, revision: number, nonce: string, now = Date.now()): Record<string, unknown> | undefined {
    this.grants = this.grants.filter((grant) => grant.expiresAt > now);
    if (revision !== this.generation || response.method !== "POST" || ![200, 201].includes(response.status) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(nonce)) return;
    try {
      const endpoint = new URL(context.endpoint);
      const dashboard = new URL(context.dashboardUrl);
      const source = new URL(response.url);
      const prefix = `${endpoint.pathname.replace(/\/+$/, "")}/v2/agents/`;
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || dashboard.protocol !== "https:" || dashboard.username || dashboard.password) return;
      if (source.origin !== endpoint.origin || source.search || source.hash || !source.pathname.startsWith(prefix) || !/^[^/]+\/computer-sessions$/.test(source.pathname.slice(prefix.length))) return;
      const body = object(response.body);
      const channels = object(body?.channels);
      const vnc = object(channels?.vnc);
      const expiresAt = typeof body?.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
      if (!body || !channels || !vnc || typeof vnc.websocket_url !== "string" || !Number.isFinite(expiresAt) || expiresAt <= now) return;
      const url = new URL(vnc.websocket_url);
      if (url.protocol !== "wss:" || url.username || url.password || url.hash || url.search || url.pathname !== "/") return;
      const protocols = vnc.protocols;
      if (!Array.isArray(protocols) || protocols.length !== 2 || !protocols.includes("binary")) return;
      const ticket = protocols.find((value: unknown): value is string => typeof value === "string" && /^vnc-ticket\.[A-Za-z0-9._~-]+$/.test(value));
      if (!ticket) return;
      // Electron hides Sec-WebSocket-Protocol from this hook. A main-generated,
      // one-use URL nonce binds the request; the gateway still validates its ticket.
      url.searchParams.set("crew_session", nonce);
      if (this.grants.some((grant) => grant.url === url.href)) return;
      this.grants.push({ context: { ...context }, url: url.href, expiresAt: Math.min(expiresAt, now + 5 * 60_000), origin: dashboard.origin });
      this.grants = this.grants.slice(-32);
      return { ...body, channels: { ...channels, vnc: { ...vnc, websocket_url: url.href } } };
    } catch { /* Invalid session metadata cannot authorize an Origin change. */ }
  }

  headersFor(request: WebSocketRequest, context: VncOriginContext, now = Date.now()): Record<string, string> | undefined {
    this.grants = this.grants.filter((grant) => grant.expiresAt > now);
    if (request.resourceType !== "webSocket" || request.method !== "GET" || request.webContentsId !== context.webContentsId) return;
    let rendererOrigin: string;
    try { rendererOrigin = new URL(context.rendererUrl).origin; } catch { return; }
    if (header(request.requestHeaders, "origin") !== rendererOrigin) return;
    const index = this.grants.findIndex((candidate) => candidate.url === request.url && sameContext(candidate.context, context));
    if (index === -1) return;
    const [grant] = this.grants.splice(index, 1);
    const headers = { ...request.requestHeaders };
    for (const key of Object.keys(headers)) if (key.toLowerCase() === "origin") delete headers[key];
    headers.Origin = grant.origin;
    return headers;
  }
}
