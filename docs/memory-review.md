# Memory review

Open **Gedächtnis** (`/memory`).

- **Deine Entscheidung:** cases with a question for you.
- **Vorbereitung & Warten:** evidence awaiting preparation, a source or reconciliation.
- **Automatisch erledigt:** completed evidence checks with their provenance.
- **Historie:** past or set-aside material; **Wieder prüfen** brings a proposal back.
- **Wissen:** confirmed knowledge. **Graph** shows its connections and sources.

Related profile documents are grouped before pagination. Source differences remain visible. Group confirmation checks that every selected proposal is unchanged and applies the group together. Confirmation keeps the current tab and filters.

## Optional automatic work

The review interface works without automatic work. The background runtime runs only with `FOLIO_AUTOMAIL_RUNTIME=1`, enabled mail intake and an explicitly enabled Memory policy. Existing approved configurations are retained on upgrade. A new installation starts without a Memory policy.

Operator setup uses `configureMemoryWork(owner, authorizationReference, proposalIds)` in `src/lib/server/memory/work-runtime.ts`. It captures the current statement-import scope, already present files and proposal hashes. Configure statement sources first. The separate opt-ins `enableCareerMemoryWork`, `enableApplicationEvidence` and `enableMemoryRetention` record the owner's authorization reference. This preview has pause/resume controls; initial setup is an operator API, not a settings wizard. Policy and progress live in `memory-work/` beside the Folio database.

- A payment receipt waits for complete monthly coverage for its account. After reconciliation, unresolved matches become a decision. Statement parsing and model checks use the separately configured Ledger runtime.
- Tracker reconciliation requires an unambiguous employer, role, chronology and source evidence. Organization variants must be supported by the original message. Missing or conflicting evidence stays open.
- Document/mail corroboration additionally needs a configured import evidence archive: `FOLIO_REORG_STATE_ROOT` points to its absolute directory. Existing `results/<run-id>.json` files use `folio/reorg-pilot-result/v2` and retain the source hash, document identity and captured text. This reader does not start a file migration. With no archive, those cases remain open.
- Exact duplicate career imports appear under **Automatisch erledigt**, with both source references and a link to the retained case. The redundant import and its audit snapshot remain stored.
- **Memory aus Mail** creates proposals without invoking relevance routing. Automatic intake and explicitly authorized model reviews may route proposals when the relevance policy is enabled.
- Relevance routing preserves the original proposals and sources. Each decision records its policy and evidence; a restored proposal stays in owner review until a human decides. Later model assessments remain in its audit history.

Changing the statement-import scope requires setup again. Pausing stops new automatic work. Source adapters and external helpers are described in [source configuration](source-configuration.md).

## Upgrade and rollback

Stop Folio and its workers. Back up the SQLite database consistently, the vault, source settings, external tracker and `memory-work/` configuration. Keep the previous application version. Starting preview.4 adds the `memory_retention` table; it does not bulk-confirm existing proposals or enable new automation.

Check the review counts, grouped evidence, selected-tab persistence and configured sources before resuming intake. To roll back, stop the new version, restore the pre-upgrade database and configuration, then start the previous application. Preserve the newer backup separately if it contains decisions made since the update.
