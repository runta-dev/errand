# Runta Cloud Agents API integration

Runta Crew does not assume unconfirmed backend paths. `HttpCloudAgentsClient` accepts a `CloudAgentsRoutes` mapping and implements endpoint resolution, bearer authentication injection, typed failures, and `AbortSignal` cancellation.

## Required operations

The backend contract must support:

| Client operation | Required behavior |
| --- | --- |
| `listAgents`, `getAgent`, `createAgent` | Named agents, role/goal, status, timestamps, unread/approval counters, computer association |
| `listConversations`, `getConversation` | Stable conversation identity and ordered message history |
| `sendMessage` | Idempotency key, accepted message, and subsequent stream identity |
| `subscribeToConversationEvents` | Resume cursor, ordering, heartbeat, message deltas/completion, activity, approvals, connection events |
| `listApprovalRequests`, `respondToApproval` | Explicit action scope, decision, optional note, actor, audit timestamp, single-use semantics |
| `getComputer` | Runtime state, active app/tool, preview availability, supported actions |
| `openComputer`, `takeOverComputer` | Short-lived secure session descriptor, origin/audience, expiry, audit trail |
| `reconnect` | Authentication/session validation and event resume behavior |

## Decisions still required

1. Canonical REST or ConnectRPC paths and response envelopes.
2. Account/organization identity and token issuance/refresh flow.
3. Whether authenticated requests are brokered through the Electron main process (recommended) or use a cookie-bound web origin.
4. SSE vs WebSocket vs Connect streaming framing, cursor format, replay window, and backpressure.
5. Message idempotency, retry, cancellation, and offline queue semantics.
6. Agent status state machine and terminal/offline reason codes.
7. Approval scope schema, expiry, revocation, and audit retention.
8. Mapping from Agent to Runtime/Cloud Computer: dedicated vs shared environments.
9. Computer session transport: Runta ingress, WebRTC, VNC, or browser stream; takeover arbitration and idle timeout.
10. Attachments, files, tool output truncation, and signed download URLs.
11. API error envelope, retry-after behavior, rate limits, and compatibility/version negotiation.
12. Desktop notification payloads and background delivery when the app is closed.

## Proposed event shapes

The domain currently understands `message.created`, `message.delta`, `message.completed`, `activity.updated`, `approval.updated`, and `connection.changed`. These are client-side names, not claims about existing backend events. The adapter should translate the confirmed server protocol into these stable domain events.

## Credential handling

Tokens entered in Settings are encrypted using Electron `safeStorage` and written with user-only file permissions. The preload exposes `has` and `set`, not credential reads. Production API requests should be made by a main-process broker that decrypts only for the outbound request.
