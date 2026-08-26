# Grok Bot → Runta Crew feature parity

This matrix compares the public/reconstructed Grok Bot 0.18 product surface with Runta Crew. The reference repository has no reusable upstream source license, so entries describe behavior to implement independently, not code to copy.

Legend: **Done** ships in the current desktop client; **Local next** can be implemented without a backend contract; **API blocked** requires a confirmed Runta Cloud Agents contract; **Excluded** is intentionally outside Runta Crew's product direction.

| Area | Reference surface | Runta Crew status | Next contract or work |
| --- | --- | --- | --- |
| Multi-agent sidebar | Named agents, unread state, row actions | **Done:** named agents, status, badges, search, edit, pin, duplicate, read state and confirmed delete | **Local next:** hide/restore and bulk organization |
| Command palette | Root commands plus agent/message/link search | **Done:** keyboard palette, agent switching, create/settings/computer commands | **Local next:** indexed message/link search after durable history exists |
| Conversation | Streaming turns, thinking/activity, reconnect | **Done:** typed messages, streaming deltas/completion, activity timeline, errors/reconnect | **API blocked:** durable cursor/replay, cancellation, retries, pagination |
| Agent computer | Remote box overlay and takeover | **Done:** status, active app, clearly labeled safe mock, Open/Take over UX | **API blocked:** signed ingress/WebRTC/VNC session, arbitration, audit |
| Approvals | Tool permission scope and user decision | **Done:** scoped Allow once/Deny with note | **API blocked:** expiry, revocation, policy modes, durable audit |
| Attachments | File/image/link attachment gateway and downloads | **Done:** typed native chooser, opaque IDs, metadata preview, removal, 25 MB validation, mock message parts | **API blocked:** upload, signed download, remote file identity |
| Reactions | Message reaction root and acknowledgement | **Done:** typed useful/needs-work reactions, optimistic mock event updates and accessible controls | **API blocked:** persistence and multi-device sync |
| Notifications | OS notification manager and dock badge | **Done:** typed, preference-aware, focus-aware OS notification bridge and unread dock badge | **API blocked:** background event delivery when the app is closed |
| Agent lifecycle | Rename, delete, duplicate, preferences | **Done:** mock lifecycle, pin/read preferences and destructive confirmation UI | **API blocked:** canonical mutation and concurrency semantics |
| Plugins/MCP | Plugin lifecycle, OAuth, MCP tools | **API blocked:** Runta plugin catalog, OAuth and agent capability contract | Do not reuse Cursor/xAI plugin services |
| Skills/routines | Saved repeatable work and proactive routines | **API blocked:** skill schema, scheduler, ownership and execution history | Desktop management UI follows backend contract |
| Multi-agent handoff | Subagents/group members and shared context | **API blocked:** relationship, handoff, permissions and event model | Keep `ActivityEvent.kind = handoff` as the UI seam |
| Authentication | Cursor account/session funnel | **API blocked:** Runta account/device authorization | **Excluded:** Cursor account and machine identity |
| Local inference router | Cursor/Claude/Codex/OpenRouter routing extension | **Excluded** | Runta Crew connects to Runta Cloud Agents rather than routing local inference |
| Local Docker box | Optional replacement for remote box | **Excluded for product MVP** | Runta Runtime is the cloud-computer substrate |
| Telemetry/updater | Upstream services and release feeds | **Excluded until approved** | Ports exist; require Runta privacy policy, signing and update infrastructure |

## Delivery order

1. Local desktop completeness: agent row actions, attachments, reactions, OS notifications, deep links.
2. Durable Cloud Agents foundation: auth, agents, conversations, resumable events, approvals.
3. Real computer transport: short-lived session descriptors, preview, takeover, audit.
4. Extensibility: plugins/MCP, skills, routines, schedules.
5. Collaboration: handoffs, shared computers, organization policy, multi-device sync.
