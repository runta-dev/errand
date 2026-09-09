import { describe, expect, it } from "vitest";
import { isTrustedVncRenderer, VncOriginGrants, type VncOriginContext } from "./vncOrigin";

const now = Date.parse("2026-09-09T08:00:00Z");
const nonce = "94b34170-31b4-453b-8135-afcdde214035";
const sessionUrl = `wss://vnc.runta.me/?crew_session=${nonce}`;
const context: VncOriginContext = { endpoint: "https://api.runta.me", dashboardUrl: "https://dashboard.runta.me", rendererUrl: "http://localhost:5173/", rendererOrigin: "http://localhost:5173", webContentsId: 7 };
const body = { agent_id: "agent-1", expires_at: new Date(now + 15_000).toISOString(), channels: { vnc: { websocket_url: "wss://vnc.runta.me/", protocols: ["binary", "vnc-ticket.issued-ticket"] } } };
const response = { url: "https://api.runta.me/v2/agents/agent-1/computer-sessions", method: "POST", status: 200, body };
// Chromium does not expose Sec-WebSocket-Protocol to Electron's request hook.
const request = { url: sessionUrl, method: "GET", resourceType: "webSocket", webContentsId: 7, requestHeaders: { Origin: "http://localhost:5173", Upgrade: "websocket", Other: "preserved" } };

function authorized() {
  const grants = new VncOriginGrants();
  grants.remember(response, context, grants.revision, nonce, now);
  return grants;
}

describe("VncOriginGrants", () => {
  it.each([200, 201])("binds HTTP %i sessions to a one-use URL without altering issued tickets or other metadata", (status) => {
    const grants = new VncOriginGrants();
    const returned = grants.remember({ ...response, status }, context, grants.revision, nonce, now);
    expect(returned).toEqual({ ...body, channels: { vnc: { ...body.channels.vnc, websocket_url: sessionUrl } } });
    expect(body.channels.vnc.websocket_url).toBe("wss://vnc.runta.me/");
    expect(new URL(sessionUrl).search).not.toContain("issued-ticket");
    expect(grants.headersFor(request, context, now)).toEqual({ ...request.requestHeaders, Origin: "https://dashboard.runta.me" });
    expect(request.requestHeaders.Origin).toBe("http://localhost:5173");
    expect(grants.headersFor(request, context, now + 1)).toBeUndefined();
  });

  it("handles case-insensitive headers and the packaged file Origin", () => {
    const grants = new VncOriginGrants();
    const packaged = { ...context, rendererUrl: "file:///Applications/Runta%20Crew.app/Contents/Resources/app.asar/out/renderer/index.html", rendererOrigin: "file://" };
    grants.remember(response, packaged, grants.revision, nonce, now);
    expect(grants.headersFor(request, packaged, now)).toBeUndefined();
    expect(grants.headersFor({ ...request, requestHeaders: { origin: "null" } }, packaged, now)).toBeUndefined();
    expect(grants.headersFor({ ...request, requestHeaders: { origin: "file://" } }, packaged, now)).toEqual({ Origin: "https://dashboard.runta.me" });
  });

  it.each([
    { url: "wss://vnc.runta.me/" },
    { url: "wss://vnc.runta.me/?crew_session=unissued" },
    { url: `${sessionUrl}&extra=1` },
    { url: `wss://vnc.runta.me/other?crew_session=${nonce}` },
    { url: `wss://other.example/?crew_session=${nonce}` },
    { url: `ws://vnc.runta.me/?crew_session=${nonce}` },
    { resourceType: "xhr" }, { method: "POST" },
    { webContentsId: 8 }, { webContentsId: undefined },
  ])("leaves unrelated requests unchanged without consuming the authorized grant: %j", (change) => {
    const grants = authorized();
    expect(grants.headersFor({ ...request, ...change }, context, now)).toBeUndefined();
    expect(grants.headersFor(request, context, now)).toBeDefined();
  });

  it.each<Record<string, string>>([
    { Origin: "https://other.example" }, { Origin: "null" }, {},
    { Origin: "http://localhost:5173", origin: "http://localhost:5173" },
  ])("does not adapt missing, unrelated or ambiguous Origins: %j", (requestHeaders) => {
    expect(authorized().headersFor({ ...request, requestHeaders }, context, now)).toBeUndefined();
  });

  it.each([
    { endpoint: "https://api.other.example" },
    { dashboardUrl: "https://dashboard.other.example" },
    { rendererUrl: "http://localhost:5173/changed" },
    { rendererOrigin: "https://other.example" },
    { webContentsId: 8 },
  ])("requires the same API, Dashboard, renderer and window context: %j", (change) => {
    expect(authorized().headersFor(request, { ...context, ...change }, now)).toBeUndefined();
  });

  it("rejects expired grants and late responses after credentials or settings change", () => {
    const grants = authorized();
    expect(grants.headersFor(request, context, now + 15_000)).toBeUndefined();
    const oldRevision = grants.revision;
    grants.clear();
    expect(grants.remember(response, context, oldRevision, nonce, now)).toBeUndefined();
    expect(grants.headersFor(request, context, now)).toBeUndefined();
    expect(grants.remember(response, context, grants.revision, nonce, now)).toBeDefined();
    grants.clear();
    expect(grants.headersFor(request, context, now)).toBeUndefined();
  });

  it.each([
    { status: 401 }, { method: "GET" },
    { url: "https://api.other.example/v2/agents/agent-1/computer-sessions" },
    { url: "https://api.runta.me/v2/agents" },
    { url: "https://api.runta.me/v2/agents/agent-1/computer-sessions?extra=1" },
    { body: {} }, { body: { ...body, expires_at: "invalid" } },
    { body: { ...body, expires_at: new Date(now).toISOString() } },
    { body: { ...body, channels: { vnc: { ...body.channels.vnc, websocket_url: "ws://vnc.runta.me/" } } } },
    { body: { ...body, channels: { vnc: { ...body.channels.vnc, websocket_url: sessionUrl } } } },
    { body: { ...body, channels: { vnc: { ...body.channels.vnc, protocols: ["binary", "vnc-ticket.one", "vnc-ticket.two"] } } } },
  ])("does not authorize unrelated or malformed responses: %j", (change) => {
    const grants = new VncOriginGrants();
    expect(grants.remember({ ...response, ...change }, context, grants.revision, nonce, now)).toBeUndefined();
    expect(grants.headersFor(request, context, now)).toBeUndefined();
  });

  it("requires a main-generated UUID and rejects nonce collisions", () => {
    const grants = new VncOriginGrants();
    expect(grants.remember(response, context, grants.revision, "renderer-value", now)).toBeUndefined();
    expect(grants.remember(response, context, grants.revision, nonce, now)).toBeDefined();
    expect(grants.remember(response, context, grants.revision, nonce, now)).toBeUndefined();
  });

  it("authorizes only the exact expected packaged or development document and its native origin", () => {
    const file = "file:///Applications/Runta%20Crew.app/Contents/Resources/app.asar/out/renderer/index.html";
    expect(isTrustedVncRenderer(file, "file://", file)).toBe(true);
    expect(isTrustedVncRenderer(file, "null", file)).toBe(false);
    expect(isTrustedVncRenderer("file:///tmp/untrusted.html", "file://", file)).toBe(false);
    expect(isTrustedVncRenderer(`${file}#changed`, "file://", file)).toBe(false);
    expect(isTrustedVncRenderer("file://server/app.html", "file://", "file://server/app.html")).toBe(false);
    expect(isTrustedVncRenderer(context.rendererUrl, context.rendererOrigin, context.rendererUrl)).toBe(true);
    expect(isTrustedVncRenderer(context.rendererUrl, "file://", context.rendererUrl)).toBe(false);
    for (const url of ["about:blank", "data:text/html,app", "blob:https://example.com/id"]) {
      expect(isTrustedVncRenderer(url, "null", url)).toBe(false);
    }
  });

  it.each([
    { rendererUrl: "file:///app/index.html", rendererOrigin: "null" },
    { rendererUrl: "about:blank", rendererOrigin: "null" },
    { rendererUrl: "data:text/html,app", rendererOrigin: "null" },
    { rendererUrl: "http://localhost:5173/", rendererOrigin: "file://" },
  ])("rejects untrusted or opaque renderer origins at grant registration: %j", (renderer) => {
    const grants = new VncOriginGrants();
    expect(grants.remember(response, { ...context, ...renderer }, grants.revision, nonce, now)).toBeUndefined();
  });

  it("keeps fresh packaged nonce grants isolated from other requests and previous grants", () => {
    const grants = new VncOriginGrants();
    const packaged = { ...context, rendererUrl: "file:///Applications/Runta%20Crew.app/Contents/Resources/app.asar/out/renderer/index.html", rendererOrigin: "file://" };
    const fileRequest = { ...request, requestHeaders: { Origin: "file://" } };
    const nextNonce = "565f98c4-4a95-42cf-ad76-249d7c19a540";
    grants.remember(response, packaged, grants.revision, nonce, now);
    grants.remember(response, packaged, grants.revision, nextNonce, now);
    expect(grants.headersFor(fileRequest, context, now)).toBeUndefined();
    expect(grants.headersFor(fileRequest, packaged, now)).toBeDefined();
    expect(grants.headersFor(fileRequest, packaged, now)).toBeUndefined();
    expect(grants.headersFor({ ...fileRequest, url: `wss://vnc.runta.me/?crew_session=${nextNonce}` }, packaged, now)).toBeDefined();
  });
});
