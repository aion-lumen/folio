# Field Note — Cold-Start Fix Round + Commit-Metadata PII Discovery

**Date:** 2026-06-21 → 2026-06-22 · **Scope:** folio + multi-agent-lab · **Direktive:** `Projects/directive-coldstart-fixes.md`

## What was broken

A cold-start test (one session prior) cloned both public repos into a throwaway dir and followed the docs literally. Ten divergences came out (D1–D10). Owner triaged them. While reading the divergence report this session, the engineer found an **eleventh, more serious leak**: the author/committer fields of the orphan commits on both public repos still carried `redacted@example.com`. The Route B PII grep in the previous session had only checked file contents, not git metadata.

| # | Item | Severity | Owner-Decision |
|---|---|---|---|
| **P0 commit-meta** | Owner mail in author/committer of public orphan commits | BLOCKER (security) | Re-amend with noreply identity (`105276395+AfshinMirhamed@users.noreply.github.com`), force-push both repos |
| **D1** | `make demo` fails on a true cold-start (`feedback.db` cannot bootstrap; `init_demo_dbs.sh` only knows how to **clone** real DB schemas) | BLOCKER | Code-fix — make the script self-contained via static SQL dumps |
| **D2** | Council unmentioned everywhere | BLOCKER (deferred) | Single-line note in multi-agent README (no full link until Council public/private decision) |
| **D3** | folio README has no Demo path | BLOCKER | Doc-fix — new `## Demo (mock data)` section |
| **D4** | multi-agent README skips Python venv + pip | major | Doc-fix — Prepend setup steps before the cp+script block |
| **D5** | `cd multi-agent` vs repo name `multi-agent-lab` | major | Doc-fix — two `cd` lines in quickstart.md |
| **D6** | Cross-repo order circular (each README points at the other for the missing piece) | major | Doc-fix — one authoritative ordered sequence in folio README |
| **D7** | folio README claimed v0.1.0 without a tag (we'd deleted the tag in B.5 because of PII) | minor | Re-tag with noreply tagger identity after Phase 0 |
| **D8** | env-table doesn't distinguish demo vs prod vars | minor | Doc-fix — add `Required for` column |
| **D9** | Makefile dead-code `COUNCIL_SETUP` variable | minor | Code-fix — drop the line |
| **D10** | folio has no `docs/quickstart.md` (only README) | minor | Doc-fix — create one, mirroring multi-agent pattern |

## What got fixed

In order of execution:

### Phase 0 — Commit-metadata PII (P0)

Per Repo:
```bash
git -c user.name="Afshin Mirhamed" \
    -c user.email="105276395+AfshinMirhamed@users.noreply.github.com" \
    commit --amend --no-edit --reset-author
git config user.name "Afshin Mirhamed"
git config user.email "105276395+AfshinMirhamed@users.noreply.github.com"
git push --force origin main
```

Verified via clean-clone-probe: `git log --format='%ae %ce'` returns only the noreply email for both repos. Owner real name remains. Local `git config user.email` is now noreply, so future commits inherit the neutral identity without per-command overrides.

**SHA churn:** folio `d79017d` → `08d50f8`. multi-agent `f21b404` → `f6a1a15`.

### Phase 1 — D1 self-contained demo bootstrap

Three changes:

1. **Static SQL dumps** committed to `multi-agent-lab/data/schemas/`:
   - `folio.schema.sql` (185 lines, includes default users row INSERT for hauskauf_workflow FK)
   - `council.schema.sql` (184 lines)
   - `feedback.schema.sql` (32 lines)
   Generated via `sqlite3 .schema` plus a Python regex that strips `__pre_*` migration-backup tables.

2. **`scripts/init_demo_dbs.sh` got a fallback path.** If the owner's real DB is present, clone its live schema via `.schema` (preserves owner-side schema-drift detection). Otherwise load from `data/schemas/<label>.schema.sql`. Both paths produce the same demo DB content.

3. **`make refresh-demo-schemas` Makefile target** for owner pre-release: regenerates the static SQL dumps from the real DBs. The folio dump includes the default-users INSERT as part of the schema file, so the script-side hack from `init_demo_dbs.sh:50` is no longer needed in the static-SQL path.

Smoke-tested both paths locally before committing — Path 1 (real DBs present) yielded folio-demo with 18 tables (incl. `__pre_*` backups), Path 2 (real DBs absent) yielded 16 clean tables.

### Phases 2-4 — Doc + trivial fixes

- **D2:** Council row in multi-agent README's DB table got `optional companion, not required for the demo` suffix. No cross-repo link added — deferred per directive.
- **D3+D6:** folio README got two new sections, `## Demo (mock data)` (one-command demo-server invocation) and `## Demo (full stack)` (the 4-step ordered cold-start covering both repos). The Screenshots section now sits below them.
- **D4:** multi-agent README quickstart now prepends `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
- **D5:** `cd multi-agent` → `cd multi-agent-lab` in both occurrences (`docs/quickstart.md:8` and `:49`).
- **D8:** env-table got a `Required for` column. `LIFE_MAIL_ACCOUNTS_TOML` is now flagged "prod only (live IMAP)". `COUNCIL_DB_PATH` and `AION_LUMEN_PATH` added (previously missing from the table).
- **D9:** dead `COUNCIL_SETUP` variable removed from Makefile.
- **D10:** new `folio/docs/quickstart.md` (60 lines). Mirrors the multi-agent quickstart structure, points at the README's Demo sections for the canonical command sequences, adds a `*-demo.db` content table and a list of verifiable URLs.

### Phase 5 — Empty-state re-test (mandatory acceptance gate)

Per directive, mandatory acceptance gate after the D1 fix. Moved `~/.folio` and `~/.council` aside, cloned both repos into `/tmp/coldstart-empty-XXXXXX...` via `file://` (so the unpushed fix branch was the source-of-truth), ran the documented commands literally.

- `python3 -m venv && pip install -r requirements.txt` — exit 0
- `cp config/*.example.yaml config/*.yaml` — exit 0
- **`make demo`** — exit 0. `init_demo_dbs.sh` took Path 2 (static SQL) for all three DBs. Inventory after seed: 7 council objects · 18 rankings · 9 lens_comparisons · 2 council_runs · 2 worker_runs · 21 worker_run_logs · 15 validator_opinions · 3 hauskauf_workflow · 40 mails.
- `npm install` (folio) — exit 0
- `bash scripts/demo-server.sh` — vite ready on port 5174 in 824 ms
- Browser at `http://localhost:5174/pipeline` (Playwright, 1600×1000, full-page screenshot) — Pipeline page rendered with the full Datenfluss diagram (5/5/15/2/2 counts), three voice cards (gemma · qwen-plugin-lens · qwen-thinking) all FERTIG, ÜBERGANG → KAMPAGNE block, three Hauskauf-Kanban cards (Loulé OFFEN / Faro IN ARBEIT / Olhão ERLEDIGT with Algarve addresses). **0 console errors.**

Screenshot evidence: `/tmp/cold-empty-pipeline.png` (kept for owner reference; sandbox at `/var/folders/.../coldstart-empty-XXXXXX...` kept until owner sees it per directive).

Post-test cleanup: owner DBs restored from aside-dirs. A small caveat — `mv ~/.folio.cold-test-aside ~/.folio` moved the aside dir **into** the freshly-created `~/.folio/` (because the test had created a new `~/.folio/`). Recovered by moving contents up one level and removing the empty aside-subdir; owner's `folio.db` (1.4 MB) and `council.db` (377 KB) restored intact, all backups present. pytest on owner working copy still 71/71. Future iterations of this kind should use `rsync` or guard `mv` with a missing-target check.

### Phase 6 — D7 tag v0.1.0

After Phase 0, with `git config user.email` already on noreply, the tag command is straightforward — no per-command overrides needed:

```bash
git tag -a v0.1.0 -m "v0.1.0 public preview ..."
git push origin v0.1.0
```

Verified via clean-clone: `tagger Afshin Mirhamed <105276395+AfshinMirhamed@users.noreply.github.com>`. `git rev-list --all --count` = 2 (orphan + doc-fix). Tag points at `c56a5cc` (the fix-commit, not the orphan). No pre-orphan history reachable via the tag.

multi-agent-lab: **no tag** per owner directive — workshop repo, not a versioned product.

## What was deferred

- **D2 full Council cross-link.** Pending Council public/private decision (separate directive). The one-liner placeholder now sits in the multi-agent README's DB table so a reader sees Council exists and isn't required for the demo. No link to `aion-lumen/council` until the repo is releasable.

- **Schema-drift CI check.** `make refresh-demo-schemas` is a manual owner-pre-release task. If owner changes a schema migration but forgets to regenerate the static SQL, cold-start users would get a stale schema. A future check could compare `data/schemas/*.sql` against `sqlite3 <real-DB> .schema` in CI, but that requires CI to have access to real DBs (it doesn't). Discipline for now; could be enforced via a pre-tag check later.

- **Hermes setup detail.** README still says "Hermes Agent installed and running" as a prerequisite for the real-data path. Cold-start tester didn't exercise this — the demo path bypasses Hermes entirely. If a Hermes-version-check directive runs later, the README prereq line might need updating with a minimum version.

## What surprised

1. **The PII leak hid in metadata, not content.** The Route B PII grep in the prior session was thorough about file contents — even examined `data/plz-de-ch.csv` for PLZ matches, accepted as public reference. But it never ran `git log --format='%ae %ce'` on the orphan commits. The original Route B plan said "Mail-Adresse → entfernen" but that was understood as "from file content"; the commit-metadata layer was assumed clean. The discovery during the read-phase of this directive (a routine `git log -1 --format='Author: %an <%ae>'` to know the current identity) caught it. Lesson: a "PII clean" claim needs to cover author/committer/tagger of every published ref, not just file diffs.

2. **`init_demo_dbs.sh` was a clone-only script.** Its name said "init" but its implementation said "copy schema from a DB that already exists". For owner-side use this was invisible — owner's real DBs always existed, the script always worked. The failure mode was only visible to a stranger. This kind of bug — script *seems* general-purpose but assumes owner-side state — is the exact shape the cold-start test exists to find.

3. **mv semantics on dir-into-dir.** `mv source-dir existing-dir` moves source-dir INTO existing-dir as a subdir. Caused a recovery step that wasn't in the plan when restoring `~/.folio` from aside. Trivial to recover but worth noting for future aside-and-restore patterns.

4. **The fix landed in two file-classes the owner now never touches manually.** `data/schemas/*.sql` is regenerated by `make refresh-demo-schemas`; `init_demo_dbs.sh` has a clear fallback contract. The script's complexity went up modestly, the user-facing surface (one command, `make demo`) stayed identical. This is the right place for the complexity to land.

## Repos final state

| | folio | multi-agent-lab |
|---|---|---|
| Default branch | main (`c56a5cc`) | main (`e234182`) |
| Visibility | PUBLIC | PRIVATE (owner-decision pending) |
| Tag | `v0.1.0` → `c56a5cc`, noreply tagger | (none, intentional) |
| CI | green ✓ | green ✓ |
| Commit author/committer | noreply only | noreply only |
| `rev-list --all --count` | 2 (orphan + doc-fix) | 2 (orphan + fix-bundle) |
| Pre-orphan history reachable | no | no |
| `make demo` empty-state | n/a | works (no `~/.folio`, no `~/.council`, no IMAP creds) |

## Open follow-ups (none in this directive's scope)

- multi-agent-lab visibility flip (owner action only)
- Council repo public/private decision + full cross-link
- Frau-Test
- Hermes version-check directive
- Distribution / release packaging beyond v0.1.0
- CI-side schema-drift check (manual `make refresh-demo-schemas` for now)

— afm.
