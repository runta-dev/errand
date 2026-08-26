# Architecture

## Process boundaries

```text
Electron main
  native window/menu and deep links
  Runta device authorization
  safeStorage credential encryption
  allowlisted HTTPS Cloud API broker
        │ typed invoke-only preload bridge
        ▼
React renderer
  useCrewController
        │ CloudAgentsClient
        ▼
RuntaCloudAgentsClient
  agents, runs, events, approvals, computer sessions
```

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. It cannot access Node.js, filesystem paths, decrypted credentials, or arbitrary Electron IPC. The main process accepts only `/v1/*` Cloud API paths on the configured origin and opens only HTTP(S) external URLs.

## Authentication

The Cloud API owns Runta Crew device authorization at `/v1/auth/device/authorization` and `/v1/auth/device/token`. The resulting bearer credential is encrypted on disk and remains in the main process. The renderer verifies a session through `/v1/auth/context`; it never receives the token.

The client identifies itself as `runta_crew`, a value defined by the Cloud Agents OpenAPI contract. Production connection endpoints are compiled defaults and cannot be overridden from the renderer.

## Cloud Agents boundary

`CloudAgentsClient` is the renderer-facing port. `RuntaCloudAgentsClient` maps the Cloud Agents API to stable UI domain types. `useCrewController` owns request lifecycle, selection, event subscriptions, connection state, and errors; presentation components contain no transport calls.

No local fallback data ships in the application. An unavailable or incomplete backend contract is surfaced as an error. Computer actions open only a URL returned by the backend; the UI does not simulate a remote desktop.

## Theme and layout

Light tokens are the default. Dark tokens live under `data-theme="dark"`. At wide sizes the computer panel is a flat third grid column; below 1030px it becomes an overlay so the conversation remains usable. The Electron minimum window is 960×640.

## Updates

`UpdateService` remains disabled. No update URL is contacted. Production rollout requires signing, notarization, manifest authenticity, downgrade policy, and staged rollout behavior.
