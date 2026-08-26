# Runta Cloud Agents API

Runta Crew targets the `codex/cloud-agents-v1` implementation in the Runta monorepo. The concrete adapter is `RuntaCloudAgentsClient`; authenticated calls are brokered by the Electron main process so bearer credentials never enter renderer memory.

## Confirmed endpoints

| Capability | Endpoint |
| --- | --- |
| Device authorization | `POST /v1/auth/device/authorization` |
| Device token exchange | `POST /v1/auth/device/token` |
| Session verification | `GET /v1/auth/context` |
| Token revocation | `DELETE /v1/auth/token` |
| Agents | `GET/POST /v1/agents`, `GET/DELETE /v1/agents/{agent_id}` |
| Model providers | `GET /v1/model-providers`, `PATCH /v1/model-providers/{provider_id}` |
| Runs | `GET/POST /v1/agents/{agent_id}/runs`, run get/cancel/resume/follow-up routes |
| Events | Agent event listing plus run SSE at `/v1/agents/{agent_id}/runs/{run_id}/events` |
| Artifacts | Agent artifact list/create/get/delete routes |
| Workspace | Agent workspace operations and file write/delete routes |

The device client id is `runta_crew`. Request and response fields follow the Cloud Agents OpenAPI snake_case schema.

## Desktop mappings still incomplete

- Agent role, goal, pin, unread state, rename, and duplicate do not yet have canonical server mutations.
- The renderer currently polls runs; it must move to the confirmed per-run SSE stream with cursor replay.
- Run output must be translated into structured user/agent messages and activity events without losing run/session identity.
- Approval list/decision routes and durable audit semantics are not present in this branch.
- Computer preview/open/takeover session descriptors are not present; the desktop UI must not simulate them.
- Local attachment IDs need artifact upload/finalization wiring before they can be sent with a run.
- Reactions and multi-device counters need server persistence.

Unsupported operations fail with `CrewError("contract_pending", ...)`. There is no local product fallback.

## End-to-end environment

The Runta development stack must run the `cloud-agents-v1` worktree so `app.forge/api` serves the endpoints above. A 401 from `POST /v1/auth/device/authorization` means an older Runta API is active, because the Cloud Agents OpenAPI marks that route unauthenticated.

With a test credential available, `RUNTA_CREW_E2E_TOKEN=... npm run test:e2e` creates a temporary agent, executes a real run, asserts its result, and deletes the agent and runtime in a `finally` cleanup.
