# Runta Crew

Runta Crew is the Electron desktop client for creating, messaging, and supervising Runta Cloud Agents. Every agent is a persistent teammate backed by a Runta Runtime cloud computer.

![Runta Crew main window](./docs/screenshots/main-window.png)

## Current product surface

- Runta device authorization with credentials encrypted by Electron `safeStorage`.
- Cloud Agent listing, creation, deletion, runs, conversation polling, and connection recovery through the Runta API.
- Search, agent switching, deterministic generated avatars, attachments, reactions, approvals, and cloud-computer entry points.
- A flat, collapsible three-column desktop layout with a light default theme.
- Native macOS window/menu behavior, notifications, dock badges, deep links, DMG/ZIP packaging, and packaged-app smoke testing.

Runta Crew no longer ships a local demo transport. The application requires a reachable Runta Dashboard and Cloud Agents API. Unsupported backend capabilities fail explicitly instead of substituting local data.

## Development

Requires Node.js 22+ and npm 10+ on macOS.

```bash
npm ci
npm run dev
```

Development defaults:

- Cloud API: `https://app.forge/api`
- Dashboard: `https://app.forge`

Connection overrides are available only in development builds.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run package
npm run smoke
```

Packaged artifacts are written under `release/`. Local builds are ad-hoc signed; public distribution still requires the Runta Developer ID identity, notarization, and an approved update channel.

## Architecture

- `electron/main`: native lifecycle, device authorization, allowlisted Cloud API broker, encrypted credentials, external navigation, and OS integration.
- `electron/preload`: narrow typed bridge; no generic IPC or Node primitives.
- `src/domain`: Cloud Agents types and client port.
- `src/clients/http`: concrete Runta API adapter plus transport-level tests.
- `src/state`: renderer orchestration and event subscription lifecycle.
- `src/ui`: minimal desktop presentation and interactions.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [API_INTEGRATION.md](./API_INTEGRATION.md), and [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## Reference provenance

Grok Bot 0.18 Reconstructed was used only to study product shape and Electron boundaries. Its repository does not grant an upstream source-code license. Runta Crew is an independent implementation and does not copy its source, binaries, assets, private interfaces, account system, telemetry, updater, or trademarks.
