# Sonar placement search

The X search worker first reads a bounded page of the owner's bookmarks (when enabled), then
likes. Both signals pass the original post-age boundary and local model selection. Recent
bookmarks rank before likes, then public search results. A bookmark expresses interest; it is
not an endorsement, confirmed knowledge, or permission to reply. Public drafts never reveal that
an item was bookmarked. Duplicate source IDs are considered only once.

Set `budget.max_bookmarked_results` to 1–100 to enable bookmark reads; omit it or use 0 to keep
bookmarks disabled. The X user token needs bookmark read access. An enabled read failure is
reported, rather than silently claiming a complete run. The configured account must match the
connected X account.

Retrieved bookmarks also remain as private, unverified research copies under
`<output_root>/bookmarks/x-<id>.json`, even when too old for a timely reply. These are local
observations, not a complete mirror or current-membership list: only one bounded page is fetched,
older pages are not backfilled, and removing a bookmark on X does not delete a local copy.
The mobile reply queue shows selected fresh conversations, not this research archive.

Only when the shortlist remains incomplete does the worker fetch one rotating batch from the
curated source list. The next run continues with the following batch; it never sweeps the whole
list by default. Local selection and human review remain required.

```bash
npm run sonar:search-placements -- \
  --config /absolute/path/to/sonar-placement-search.json \
  --dry-run
```

The acquisition is retained locally as `search-latest.json`; after a model-format or availability
failure, retry with `--from-cache` to avoid paying for the same X reads again. If the cache already
contains a validated selection, replay calls neither X nor Hermes. If acquisition completed but the
selection did not, the same option resumes exactly the missing Hermes step over the fixed cached
posts and still never calls X again. Remove `--dry-run`
only after reviewing the reported query and eligible-post counts. A normal run
writes strictly validated `folio/sonar-placement-candidate/v1` files atomically to the configured
placement inbox. Existing source IDs are never proposed twice.

An optional `notification` block sends one payload-minimal ntfy wake-up only when a run creates new
candidates. The message contains no source handle, post text or draft. Its click target opens
`/sonar/mobile` with the first candidate selected; the Folio UI remains the review and approval
surface. Notification failure is reported as `notification: "failed"` but never removes or widens a
locally created candidate.

The private config contains the chosen public source handles, local executable paths, the target
account and writing guidance. An optional `memory` block selects Folio-owned domains and fact
classes. Because the result is intended for a public channel, this worker accepts only
`max_sensitivity: "public"`; private or sensitive Folio memory cannot enter the generation prompt.
The config contains no X token or model credential.
`xurl` remains responsible for its own credential store, which the worker never reads.

## Manual mobile run

The owner-only mobile Sonar surface may start the same configured worker through
`POST /api/sonar/search-run`. Set `FOLIO_SONAR_SEARCH_RUNNER` to an absolute, executable wrapper
path when starting Folio. The endpoint accepts no query, source or credential input, permits only
one concurrent run and exposes only aggregate run state. The wrapper remains private and owns the
actual config path.

X reads may incur charges, including expansions. Check [X pricing](https://docs.x.com/x-api/getting-started/pricing) for the authenticated app before enabling a schedule. Result-count limits are not a billing ceiling.
Aggregate status reports likes, bookmarks and search counts separately. Inference is local;
publishing remains a separately approved step.

## Boundaries

- X source text is inserted into the model prompt as explicitly untrusted JSON data.
- Owner-, project-, test- and metric claims must be supported by Folio-confirmed public memory;
  otherwise the model must ask an honest question, stay source-bound or select nothing.
- The model may only return IDs from the fetched shortlist and an exact, narrow selection envelope.
- Hermes uses its empty `context_engine` toolset. Alternatively, the supplied local JSON adapter uses a literal loopback inference endpoint with no tools. Both selection modes keep file, web, terminal and messaging actions outside the model.
- The deterministic worker constructs the final candidate; the model cannot choose paths, trust
  flags, account credentials or a publishing action.
- Like and bookmark counts, one rotating query batch, results per query, candidate count, post age and expiry are config-bounded.
- Scheduling is separate. Verify a manual run first, then configure an operating-system scheduler or another approved scheduler to invoke the same single-flight wrapper. A sleeping or offline host cannot run on time.
