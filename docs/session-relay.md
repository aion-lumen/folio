# Session Relay

Session Relay is Folio's provider-neutral handoff boundary between an incoming case and the session responsible for its domain. Folio stages a reviewed request in a target-specific filesystem inbox and accepts a response through the matching outbox.

## Trust boundary

- A fresh real installation has no cloud target configured.
- Local targets can receive staged cases without an egress approval.
- Cloud targets require one explicit human action for the exact request hash, target and set of data classes.
- Changing staged content invalidates that approval.
- Source material is marked as untrusted data, never as instructions.
- Runtime payloads live outside the repository and vault under `~/.folio/session-exchange`.
- Demo mode uses `~/.folio/session-exchange-demo` and a synthetic career case.

The UI deliberately combines approval and delivery into one button. The database still records the approval and sharing as separate append-only events.

## Targets

Targets are declared in `session-targets.yaml`; see [`config/session-targets.example.yaml`](../config/session-targets.example.yaml). Each target declares:

- its domain and adapter;
- whether it is local or cloud-hosted;
- allowed capabilities and data classes;
- the highest memory sensitivity it may receive when `memory_context` is enabled;
- its payload retention period.

Folio validates these declarations before a case can be staged. Target adapters do not decide policy themselves.

## Runtime layout

```text
~/.folio/session-exchange/
├── staging/<case-id>/payload.json
├── <domain>/inbox/<case-id>/request.md
└── <domain>/outbox/<case-id>/response.json
```

`payload.json` is the exact human-reviewed version. `request.md` is the provider-neutral handoff artifact consumed by a Cowork filesystem integration or a local Hermes adapter. `response.json` uses `folio/session-relay-response/v1` and is bound to the case ID, request hash and target ID.

## Current scope

The response envelope supports reply drafts, requests for more context and proposed Objectives. Folio rejects unknown fields, mismatched request versions and changed responses. An external session never receives direct write access to mail or campaign state: its result becomes effective only after a human action in Folio. Accepted reply drafts remain available as Folio mail templates; accepted Objective proposals use Folio's existing Objective writer.

## Career mail pilot

An actionable mail classified as `job` or `job-lead` exposes **Prepare handoff** in Mail Queue. The action stages the already local sparse Worker extraction, mail metadata and a policy-filtered memory bundle for the first eligible `career` target. It never shares immediately: cloud content still waits in Relay for the case-bound human approval.

The current mail pipeline retains a sparse extraction rather than the complete RFC message. Relay labels that completeness is not established inside the reviewed payload instead of implying that the full message is present. Repeating the action for the same account, IMAP UID and target returns the existing case. Mail Queue links back to that case and surfaces when a response draft is ready.

Before staging, the Context Compiler may retrieve confirmed facts from Folio's SQLite/FTS baseline. Retrieval is filtered by the case domain and the target's declared sensitivity ceiling. The resulting facts and their provenance are bound to the reviewed request hash; source excerpts are not copied into model context. Folio displays the exact selected facts next to the source material before a cloud handoff is approved.

The generated `request.md` contains the exact response path, request hash and schema name. A minimal reply looks like this:

```json
{
  "schema": "folio/session-relay-response/v1",
  "case_id": "<case-id>",
  "request_hash": "<request-sha256>",
  "target_id": "career-cowork",
  "result": {
    "kind": "reply_draft",
    "subject": "Re: …",
    "body": "…"
  },
  "created_at": "2026-08-08T12:00:00.000Z"
}
```
