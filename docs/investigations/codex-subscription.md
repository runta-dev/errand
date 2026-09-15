# Why Codex subscriptions do not appear in Errand

Investigated 2026-09-15. This describes the checked-out Errand and Runta code; it is not a production API capture or an audit of a particular user's authorization status.

## Catalog mismatch

Errand calls `GET /v2/model-providers` in `src/clients/http/RuntaCloudAgentsClient.ts`. It maps every returned provider into the picker without filtering by protocol or provider name.

In Runta, `dashboard/src/lib/api.ts` builds the Dashboard list by combining:

- Stored custom model-provider definitions from `api.customModelProviders(orgId)`.
- Subscription credentials from `api.aiAgentCredentials(orgId)`, mapped with `agentSubscriptionMetadata`.

The subscription metadata uses `codex_oauth` or `claude_oauth`; it is not itself a managed provider definition.

The public Cloud Agents handler in `crates/runta-api/src/cloud_agents.rs` calls the Secrets service's `list_model_providers`. `crates/runta-secrets/src/service/custom_model_providers.rs` reads only `custom_model_providers_for_tenant`. It does not merge subscription credentials into this response. Thus a subscription can appear in Dashboard without appearing in Errand's catalog.

## Listing it alone is insufficient

Errand creates an agent with `model_provider: { type: "managed", id }`. Runta's `ManagedModelProviderReference` currently accepts only this variant. Agent creation looks the ID up in the same managed-provider list and rejects an ID absent from it.

The current Cloud Agents provider setup injects an API-key secret file and selects API-key environment variables by protocol. The subscription path needs the corresponding OAuth credential binding and refresh lifecycle, plus a compatible harness. It cannot be implemented by treating `codex_oauth` as a managed provider ID or copying OAuth tokens into Errand.

## Required integration

1. Extend the public provider catalog with an explicit subscription reference and safe metadata (label, compatibility, authorization status); keep credentials server-side.
2. Extend Cloud Agent creation to resolve that reference, validate tenant ownership and harness compatibility, and bind the existing subscription credential/refresh mechanism.
3. Teach Errand's typed catalog and creation request to preserve that provider reference rather than assuming every entry is managed.
4. Verify catalog visibility, successful agent creation and reply, expired/revoked credentials, and tenant isolation against the actual backend.

Also check that Dashboard and Errand use the same organization, and that the catalog has refreshed after an authorization. These can independently cause a mismatch, but refreshing does not fix the missing subscription branch in the current public catalog.

No Runta backend or subscription credentials were changed during this investigation.
