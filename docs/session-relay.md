# Session Relay

Session Relay is Folio's provider-neutral handoff boundary between an incoming case and the session responsible for its domain. The first foundation slice stages a reviewed request and writes it into a target-specific filesystem inbox. Receiving responses is the next slice; it is not part of this implementation yet.

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
- its payload retention period.

Folio validates these declarations before a case can be staged. Target adapters do not decide policy themselves.

## Runtime layout

```text
~/.folio/session-exchange/
├── staging/<case-id>/payload.json
└── <domain>/inbox/<case-id>/request.md
```

`payload.json` is the exact human-reviewed version. `request.md` is the provider-neutral handoff artifact consumed by a Cowork filesystem integration or a local Hermes adapter.

## Current scope

This slice provides staging, exact-version egress approval, delivery and an append-only audit trail. The next slice adds the provider-neutral response envelope and the human review path back into Folio. It will support response drafts, requests for more context and proposed Objectives without giving an external session direct write access to mail or campaign state.
