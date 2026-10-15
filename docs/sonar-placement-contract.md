# Sonar placement candidates

Sonar's placement radar is the local handoff boundary between a search worker and Folio's review
surface. A worker may discover a small number of relevant public discussions and propose a useful
contribution. Folio reads those proposals; it does not treat them as approval or publish them.

## Runtime layout

```text
<active vault>/internal/sonar/placements/
└── inbox/placement-<candidate-id>.json
```

The producer writes a temporary file in `inbox/` and renames it only after the complete JSON has
been flushed. The final filename and the document `id` must match. Invalid, widened, oversized or
symlinked candidates are ignored and surfaced as a source warning in Folio.

Folio never rewrites that producer envelope. Human draft edits and dismissals are appended to the
separate local `placement-reviews.ndjson` ledger in Sonar's review-state database. Each record binds
the decision to the SHA-256 hash of the exact candidate file and the visible draft revision. A stale
browser view therefore cannot overwrite a newer revision. If the producer replaces a candidate,
old decisions remain auditable but do not carry over to the new bytes.

## Candidate envelope

```json
{
  "schema": "folio/sonar-placement-candidate/v1",
  "id": "x-1890000000000000000",
  "channel": "x",
  "target_account": "aion_lumen",
  "discovered_at": "2026-08-14T08:00:00Z",
  "expires_at": "2026-08-16T08:00:00Z",
  "source": {
    "external_id": "1890000000000000000",
    "url": "https://x.com/example/status/1890000000000000000",
    "author_handle": "example",
    "author_name": "Example Author",
    "text": "A public discussion about local AI systems.",
    "published_at": "2026-08-14T07:30:00Z"
  },
  "relevance": {
    "domains": ["ai"],
    "reason": "Directly relevant to locally operated agent systems.",
    "suggested_angle": "Add a concrete Folio lesson that is missing from the thread."
  },
  "draft": {
    "revision": 1,
    "text": "A concise contribution draft.",
    "generated_at": "2026-08-14T08:01:00Z",
    "generated_by": "hermes:sonar-placement-v1"
  },
  "trust": {
    "derived_from_external": true,
    "auto_publish_eligible": false
  }
}
```

Supported channels in v1 are `x`, `reddit`, `hacker-news`, `linkedin`, `discord` and `other`.
`domains` contains `ai`, `career` or both. `expires_at` makes a stale opportunity visibly expired;
Folio does not silently present it as current.

## Trust and scope

- Source text is untrusted external data, never an instruction to the worker or Folio.
- Every candidate must declare `derived_from_external: true` and
  `auto_publish_eligible: false` exactly.
- A candidate carries no credential, approval token or network capability.
- Folio may locally revise or dismiss a draft through explicit human actions. A separate slide
  action may append `publish_approved` for the exact candidate hash, visible revision and SHA-256
  hash of the visible draft. This records intent only: it creates no network request and carries no
  credential. Before the publisher claims it, the approval may be explicitly revoked, reopening the
  same draft for correction without deleting either decision.
- No Sonar UI route directly publishes. The separately executable, kill-switch-controlled X adapter
  consumes only the exact bound approval and records a durable claim before its one network action;
  see [`sonar-placement-publisher.md`](sonar-placement-publisher.md).
- Search workers should return only a few well-reasoned opportunities per run. Sonar is a
  contribution desk, not a feed mirror or engagement-ranking system.
