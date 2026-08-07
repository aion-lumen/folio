# Module registry

Folio's module registry is a deny-by-default capability boundary for optional
domains. It is deliberately smaller than a plugin loader: registration happens
in trusted server code, while manifests make permissions and data contracts
inspectable.

Each `folio/module-manifest/v1` declaration contains:

- a stable module domain and version;
- named read, write, execute, and render capabilities;
- panel fields linked to declared data classes;
- logical databases with read-only or read-write access;
- sensitivity and retention declarations; and
- the standard global and per-module emergency stops.

Runtime filesystem paths are separate from the manifest. `GET /api/modules`
returns declarations and current enabled/killed state, but never returns those
paths.

## Emergency stops

The global stop wins over every registration:

```sh
FOLIO_MODULES_DISABLED=true npm run dev
```

Individual modules can be stopped with a comma-separated list:

```sh
FOLIO_DISABLED_MODULES=council,leuchtfeuer,sonar npm run dev
```

Both switches are evaluated dynamically. Unknown module and capability names are
denied. HTTP guards intentionally answer `404` for disabled, killed, unknown, or
undeclared capabilities so a route does not reveal installation state.

## Built-in reference modules

Council is the first reference manifest under
`src/lib/server/modules/council/`. Its page boundary, read-only Council database,
and every `/api/council/*` handler require a registered capability. Human
decisions remain writes to Folio-owned state; Council's own database remains
read-only from Folio.

Council activation still uses the existing `council: true` vault flag. That
format is shared with the Python worker and must not be migrated in Folio alone.

Leuchtfeuer is the second registry consumer. Its aggregate-only metrics reader
resolves the filesystem store through the registry and degrades to empty/stale
when its capability is stopped. This does not change the privacy boundary:
Leuchtfeuer continues to use server-log aggregates and no client tracking.

Sonar is the first non-mail reference module built on the boundary. It reads
schema-guarded, external-derived notes from the active vault and renders their
content as text, never as trusted HTML. Explicit human decisions are appended to
a private `reviews.ndjson` audit ledger; the imported source notes remain
unchanged. Demo runs keep that mutable ledger in demo-scoped Folio state rather
than writing into the bundled fixture tree. No capability in this slice can
publish, follow, like, or reply on an external service.

## Deliberate limits of the first gate

- Retention is declared and inspectable; only policies already enforced by the
  underlying store are marked `enforced: true`.
- There is no runtime install endpoint, package execution, remote manifest, or
  credential facility.
- A future third-party loader needs its own provenance, signature, filesystem,
  and upgrade policy review. This registry does not grant those powers.
