# Folio–Hermes adapter contract

> **Folio owns state, policy, approvals, and audit. Hermes is a replaceable execution runtime.**

This boundary keeps Folio's product rules independent from one agent runtime. Hermes may execute a
turn and expose tools, but it is not Folio's source of truth for sessions, objective links,
permissions, approvals, or audit history.

## Request boundary

For each chat turn, Folio:

1. creates opaque session and turn correlation IDs;
2. resolves a credential-free execution profile;
3. loads and validates `config/hermes-context.yaml`;
4. assembles only the enabled, known context sources;
5. records the running turn and selected objective links in Folio's database;
6. sends the request to Hermes with a vault-scoped conversation and tool root; and
7. records the turn as `completed`, `failed`, or `aborted`.

Hermes configuration, provider credentials, and reconstruction secrets are never copied into the
execution profile or Folio's turn audit.

## Execution profile

Every assistant message keeps the profile observed at the start of its own turn. A later model
switch therefore cannot relabel older output. The profile includes:

- the configured model and Hermes profile identifiers;
- provider class and whether the configured endpoint is local or remote;
- a locally matched artifact identifier, engine, quantisation, and revision when available;
- context limit and thinking/reasoning settings;
- prompt-manifest and adapter-policy versions and fingerprints; and
- an explicit verification state (`local-artifact`, `config-only`, or `unavailable`).

`local-artifact` means the exact configured model was matched to an installed local artifact. It
does not claim that a model server is currently loaded or healthy. Model changes used for triage or
cross-checking require a fresh hermetic evaluation before performance claims are updated.

## Context manifest

`hermes-context.yaml` is a declarative prompt and context manifest, not a capability manifest. Its
schema is fail-closed. It can enable or disable Folio-defined context sources and provide vault
guidance, but it cannot add arbitrary source paths or enlarge the gateway's filesystem boundary.

The active vault remains the request's tool root. Conversation names are derived from both the
vault and the opaque Folio session ID, preventing history reuse across sessions or vaults.

## Compatibility rule

Folio may contain narrowly scoped compatibility handling for a known Hermes response-chain failure,
but that handling cannot become an audit or policy dependency. Hermes upgrades are tested in a
separate compatibility run and are not coupled to a Folio feature release.
