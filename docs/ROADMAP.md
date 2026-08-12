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

## Required before public reach reporting — Leuchtfeuer evidence hardening

- Count only `GET` requests that returned `200` for a route present in the deployed static site
  tree; user-agent heuristics remain a secondary filter, not the definition of a visit.
- Apply the same eligibility rule to paths, referrers, door measurements, and estimated uniques.
- Report excluded probe traffic separately as operational scan noise rather than folding it into
  audience reach or silently discarding it.
- Recompute the 28-day baseline after the rule change and check in a before/after evidence artifact
  that attributes differences to missing routes, non-200 responses, non-GET requests, and bot
  filtering. No pre-hardening reach number is used publicly.
- Name the structural counting rule in the UI and keep the no-client-tracking promise unchanged.

## v0.4.1 — Context and traceability

- Stamp every assistant turn with a credential-free execution profile: exact configured model and
  locally matched artifact, provider class, endpoint locality, quantisation, context limit, thinking
  settings, and prompt/policy fingerprints.
- Make Hermes context manifest-driven through a strictly validated `hermes-context.yaml`; the
  manifest selects known Folio context sources but cannot grant filesystem capabilities.
- Give each chat session and turn correlation IDs owned by Folio, and persist session-objective
  links plus turn outcomes in Folio's audit database.
- Publish and enforce the [Folio–Hermes adapter contract](hermes-adapter-contract.md).
- Do not change a triage or cross-check model, nor publish performance claims for it, without a
  fresh hermetic evaluation and checked-in result artifact.

## Time-boxed milestone — Second-device demo by the end of August 2026

This milestone is an owner-operated demonstration on a second Apple Silicon Mac, not a third-party
installation. It therefore does not bypass the 08c gate below.

- Provide a reproducible, non-developer-oriented quickstart that can be completed and tested within
  one to two days. Installing documented prerequisites and using the two existing repositories is
  acceptable; undocumented source edits or environment guesswork are not.
- Start Folio with one documented demo command against the bundled demo vault and deterministic
  demo fixtures. The baseline demo must work without IMAP credentials, real data, Hermes, or a
  loaded model; optional local-AI capability is configured separately.
- Make demo isolation fail closed: use only demo-scoped state paths, never discover or fall back to
  real vaults or databases, and display the active demo mode unambiguously.
- Add a credential-free, per-device model-routing configuration with small always-on and heavy
  on-demand slots. Exact model assignments follow only after the second Mac's hardware is known;
  changing triage or cross-check models still requires the hermetic evaluation gate above.
- Keep generated demo databases out of Git. Record both source commits, runtime versions, and the
  fixture fingerprint for diagnosis.
- Acceptance is a cold-start run by the project owner on the fresh Mac: documented steps to a
  working demo within the planned setup window, with an evidence checklist covering startup, demo
  isolation, the core screens, restart, and clean removal.

## Required before v0.5.0 — Module foundation (08c)

08c is a hard gate before any third-party installation and before v0.5.0. The owner-operated
second-device demo above is explicitly not permission for external installation:

- Introduce a registry API for module domains, panel fields, capabilities, and databases.
- Extract Council into `modules/council/` as the first reference module.
- Guard all `/api/council/*` write routes through module registration.
- Replace domain-name conditionals with registered capabilities.
- Migrate Leuchtfeuer as the second registry consumer.

Development status (unreleased): the minimal capability-broker slice now includes
manifest validation, deny-by-default registry, global/per-module kill switches, Council route and
database guards, a path-free registry endpoint, and Leuchtfeuer as the second consumer. Full
third-party package loading remains deliberately outside this foundation and is not implied by it.
Sonar is the first non-mail consumer: its initial read/review surface keeps imported external notes
immutable, records human decisions append-only, and has no external publishing capability.

## v0.5.0 — Session Relay and career pilot

- Add a provider-neutral filesystem contract that hands a reviewed case to its responsible session
  and accepts a reply draft, context request, or Objective proposal in return.
- Require a case-bound human approval for every cloud handoff; local targets need no egress approval.
- Keep runtime request and response bodies outside repositories and vaults with target-declared
  retention.
- Establish Folio-owned canonical memory with candidate/confirmed facts, provenance, temporal
  supersession, tombstones, and a rebuildable SQLite FTS projection.
- Compile small context bundles from confirmed facts only, filtered by domain and the target's
  explicit sensitivity ceiling, and show the exact bundle before approval.
- Complete one real career workflow from incoming mail through session response to a reviewed Folio
  result. Cloud targets remain opt-in and absent from a fresh installation.
- Keep the existing Redaction Gate as an optional `redact-then-share` step where a case needs it;
  do not make its more complex T2 workflow the default path.
- Update the public privacy promise atomically with the release, never afterward.

## After the career learning gate

- Evaluate Hindsight and OpenViking as disposable shadow projections against questions produced by
  real Relay usage; Folio's SQLite/FTS baseline remains the control.
- Consider direct provider adapters only when the filesystem pilot shows that they reduce real work.
- Hand individual task types from cloud sessions to local Hermes agents only after measured shadow
  results, while retaining the same Relay and memory contracts.
- Ledger is a later consumer of the same gated session interface; real-money execution remains
  outside this roadmap stage.

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
