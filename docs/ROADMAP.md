# Roadmap

Folio is a local-first AI workspace. The current public release is **v0.4.0**; see the
[changelog](../CHANGELOG.md) for shipped details.

The order below reflects current product decisions. A version boundary is a gate, not a promise to
ship every adjacent idea together.

## Stable foundations

- Folio Interchange Format v1 is public and frozen. Future changes are additive.
- Auto-commit is limited to trusted sources; content derived from external material always requires
  review.
- Mail access remains read-only-first. Sending is reply-only and requires an explicit human action.
- Leuchtfeuer uses privacy-preserving server-log aggregates only: no cookies, client-side tracking,
  or external analytics.
- Evaluations are hermetic and publish evidence artifacts rather than unsupported headline numbers.
- The four established cross-database writes from the mail-side agent are documented in the
  [multi-agent repository](https://github.com/aion-lumen/multi-agent-lab/blob/main/docs/cross-db-write-ausnahmen.md).

## v0.4.1 — Context and traceability

- Show the active model unambiguously wherever model output is presented.
- Make Hermes context manifest-driven through `hermes-context.yaml`.
- Link sessions and objectives so decisions and follow-up work remain traceable.

## Required before v0.5.0 — Module foundation (08c)

08c is a hard gate before any third-party installation and before v0.5.0:

- Introduce a registry API for module domains, panel fields, capabilities, and databases.
- Extract Council into `modules/council/` as the first reference module.
- Guard all `/api/council/*` write routes through module registration.
- Replace domain-name conditionals with registered capabilities.
- Migrate Leuchtfeuer as the second registry consumer.

## v0.5.0 — Redaction Gate, T2 first

The first release of the Redaction Gate is deliberately human-carried and has no outbound network
capability:

- One local redaction core based on Presidio with a local-LLM cross-check.
- Per data class, choose reversible tokenisation or irreversible masking explicitly.
- Keep the token map in memory only; never persist it or expose it to a model provider.
- Add **Prepare for session**: review original and redacted content before copying the approved
  version into an external model session.
- Record what was redacted and approved without storing the sensitive reconstruction map.
- Update the public privacy promise atomically with the release, never afterward.

## After the learning gate — T1 candidate

An automated provider API is not part of the initial v0.5.0 scope. It may be designed only after at
least two weeks of real T2 usage have produced evidence about redaction quality and operator needs.
Ledger is a later consumer of the same gated session interface; real-money execution remains outside
this roadmap stage.

## Local routines — exploration

- Move search-only daily routines, such as job and repository watches, from hosted agent runs to
  Folio and local models.
- Use the existing authenticated ntfy channel for payload-minimal completion, failure, and
  decision-waiting notifications.
- Keep credentials and outbound actions outside model context and behind deterministic code.

## Future directions — no version commitment

- Voice input for chat and objective updates.
- Interview-style vault setup.
- Mobile/PWA workflows.
- Guided weekly review and print-friendly export.
- NAS/home-server deployment, public vault templates, and local sync.
