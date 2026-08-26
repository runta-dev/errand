# Architecture

## Product mapping

| Product concept | Runta Crew implementation |
| --- | --- |
| Persistent named AI teammate | `Agent` domain object |
| Ongoing user relationship | `Conversation` and typed event stream |
| Visible work | `ActivityEvent` timeline |
| Human authority boundary | `ApprovalRequest` with explicit scope |
| Agent's machine | `CloudComputer` and replaceable computer transport |
| Desktop shell | Electron main, preload, and React renderer |

This is a new implementation. The reference reconstruction was not licensed for source reuse, so it informed only the product/architecture mapping above.

## Process boundaries

```text
Electron main
  native window/menu
  safeStorage credentials
  settings file
  allowlisted external URLs
        │ typed invoke-only preload bridge
        ▼
React renderer
  useCrewController (domain state/effects)
        │ CloudAgentsClient port
        ├── MockCloudAgentsClient (active MVP)
        └── HttpCloudAgentsClient (contract-ready adapter)
```

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. It cannot access the filesystem, Node.js, arbitrary Electron APIs, or arbitrary IPC channels. The preload exposes only application version, HTTP(S) external navigation, non-secret settings, write/exists credential operations, native file selection metadata, and bounded notification operations. It never exposes the stored credential value or selected filesystem paths.

## Cloud Agents boundary

`CloudAgentsClient` is the renderer-facing port. Components never import fixtures or transport implementations. `useCrewController` owns request cancellation, subscriptions, selection, loading, error, and connection state. This keeps the eventual backend migration localized to client construction and transport wiring.

The HTTP adapter requires route injection. It deliberately throws `contract_pending` if routes are absent rather than inventing Runta API paths. Event framing and remote computer transports remain explicit integration points.

Before production authentication, authenticated HTTP should move behind a narrow main-process request broker so decrypted bearer tokens never enter renderer memory. The current HTTP adapter is not activated by the UI.

## Computer surface

The MVP preview is generated UI, clearly marked `Safe mock preview`. Open/Take over show a modal explaining that no remote session exists. A production adapter may return an approved HTTPS ingress URL or drive a WebRTC/VNC viewer, but must preserve origin validation, short-lived authorization, and takeover audit events.

## Updates

`UpdateService` is a port with a disabled implementation. No update URL or third-party update service is contacted. Production rollout must provide signing, notarization, update manifest authenticity, downgrade policy, and staged rollout behavior.

## Theme and layout

Light tokens are the default. Dark tokens live under `data-theme="dark"`. At widths below 1030px, the detail panel becomes an overlay so conversation space remains usable; the Electron minimum window is 960×640.
