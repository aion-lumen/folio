# Folio 0.6 Preview · setup and upgrade

The [main README](../README.md) introduces Folio's memory, campaign and mail workflow.
This companion page covers the additional calendar, career, recurring-cost and Ledger features.

## Run locally


Node.js 20 or later. This candidate was built and checked on macOS with Node 20. A local Hermes/model runtime and source-specific adapters are optional and are not installed by these commands.

```sh
npm ci
npm run check
npm test
npm run build
ORIGIN=http://127.0.0.1:4173 HOST=127.0.0.1 PORT=4173 node build/index.js
```

Open the same origin, `http://127.0.0.1:4173`. With no configured sources, Folio displays setup/unavailable states, not invented data. Configure optional mail, career, statement and calendar sources according to [source configuration](source-configuration.md). Mail credentials and worker infrastructure are configured separately; an account label alone does not connect a mailbox.

## Upgrade and rollback

Stop the old runtime and any intake jobs. Back up the Folio SQLite database using a SQLite backup operation (or after all writers have stopped), the vault, source configuration and external tracker before starting the new version. Keep the former runtime. Preserve every account id and add formerly implicit accounts to the complete explicit registry before switching. Existing career identity keys can be retained with the documented setting.

The synthetic upgrade test starts with the v0.5.0 schema, preserves source-linked confirmed knowledge, and restores the old backup with v0.5.0. It is not a test of every personal adapter. To roll back, stop the new runtime, restore the old configuration and data backup, and start the old runtime; do not point the old version at a migrated database.

## Preview scope

Ledger works with imported sources and supported format profiles. It is not audited accounting or a trading platform. Missing evidence and uncertain matches remain unresolved. Optional model and import helpers require their separately configured runtimes. Source setup is documented in [source configuration](source-configuration.md).

The release adds an optional local model comparison bench for mail triage. An explicit test cohort and a separate local multi-agent runtime are required.

The [complete Ledger screenshot](screenshots/v0.6.0-preview.1/ledger-dashboard-complete.jpg) uses synthetic data. Diagnostic screenshots of unavailable sources in the [release image index](screenshots/v0.6.0-preview.1/README.md) document setup states; they are not a tour of the mail workflow. For that, see the [mail gallery](screenshots/mail/README.md).
