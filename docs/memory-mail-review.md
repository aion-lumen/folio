# Mail classification and delegated Memory review

`POST /api/memory/from-mail` uses an explicit domain correction or an included human
multilabel review first. Otherwise all enabled primary/control model voices must supply
valid, identity-bound opinions (at least three distinct models). Different topic labels
are retained as routing hints; they do not constitute a factual contradiction. The
conditional reviewer is not an extra base vote. Missing opinions return 409 with
`domain_decision`; the heuristic is never a silent substitute. An action-only correction
does not erase an earlier domain correction. Original feedback and opinions remain unchanged.

Extraction assigns each supported claim its own Memory domain. A source can therefore
produce several candidate bundles, with one domain per bundle and no duplicate copies
of the same claim. The API response includes `domains` and `proposal_ids`. Internal extraction returns
`bundles` while retaining `bundle` as its first item for existing callers. Existing proposals in another domain
do not block additional claims. See [multi-domain Memory](memory-multidomain.md).

Proposal extraction still creates candidates. It is not confirmation. Mail identity currently
uses the existing feedback ID, account and IMAP UID; this change does not add UIDVALIDITY
to the underlying feedback schema. Delegated review additionally binds the source snapshot,
task ID and content hash. A separate ingestion migration is needed for epoch-safe IMAP deduplication.

New extraction explicitly uses the configured primary model and records its model ID in the
proposal. The delegated reviewer must differ from that recorded model. Legacy proposals retain
their original extractor identifier; no historical model attribution is invented for them.

## Bounded delegation API

All actions on `POST /api/memory/delegated-review` require the authenticated owner and JSON
with a positive `feedback_id`. The owner supplies an explicit authorization reference, not
a claim to have personally checked every fact.

- `action: "authorize"`, `proposal_id`, `authorization_ref`: creates a one-hour grant for
  exactly this mail proposal, source digest, bundle digest and configured conditional reviewer.
- `action: "review"`, `grant_id`: reads source data on the server, checks evidence quotes and
  invokes the configured reviewer through the loopback LM Studio endpoint. Every object must
  be covered in the structured response. Only a complete `fully_supported` verdict confirms
  the bundle. Rejection leaves candidates available for normal clarification.
- `action: "revoke"`, `grant_id`: prevents an outstanding grant from completing. A completed
  review uses the existing correction/tombstone workflow instead.

The model receives untrusted evidence, not tools or authority to create grants. Remote model
endpoints and environment mock responses are refused. Missing, malformed or incomplete
responses never confirm anything. Changed content, related source facts, domain, reviewer, candidate state, expiry
or revocation blocks completion. A repeated completed grant returns its recorded result and
does not repeat the model call or write a second confirmation.

Authorization is a `human` journal event. Delegated review and all resulting confirmations
are `system` events attributed to `local-memory-reviewer:<model>`. Both carry the grant,
authorization reference and snapshot hashes in the append-only journal. Existing manual
confirmation remains a separate human action. The Memory page shows recent delegated reviews.
No global automatic confirmation, scheduled worker, mailbox changes, external sends or
finance execution is enabled by this API. No schema migration is required.

Each new grant also pins the review-policy version. The reviewer is told the trusted mapping
between mail categories and Memory domains, so different taxonomy labels are not treated
as contradictions. It checks whether statements follow from their attributed evidence,
not whether outside sources independently verify reality. The stored email date cannot prove
a payment date. Explicitly dated events may be useful memory even when they are not permanent
states. The UI shows the newest delegated decision per proposal; previous decisions remain
in the append-only journal. A different policy requires a fresh owner grant.

An additional, explicitly enabled [incoming mail service](automatic-mail-intake.md) may issue
system grants under a recorded standing owner authorization. These grants also bind the
intake run and feedback ID. Pausing intake revokes that standing authority immediately for
pending confirmations. The direct API described above continues to create individual human
authorizations; the two kinds are not conflated.
