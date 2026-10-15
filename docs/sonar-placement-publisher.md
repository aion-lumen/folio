# Sonar placement publisher

The publisher is a separate, bounded consumer of Sonar's human-approved placement drafts. It never
selects content and never widens an approval. A run handles at most one X reply and requires the
candidate hash, visible revision and draft hash that were approved in Folio.

The private runtime configuration contains paths and an xurl app label, but no credential. xurl owns
its credential store. Before recording a publish claim, the worker calls `whoami` and requires the
authenticated username to match `expected_username` exactly.

```sh
npm run sonar:publish-placement -- \
  --config /absolute/path/to/sonar-placement-publisher.json \
  --dry-run
```

Remove `--dry-run` only after the reported candidate has been reviewed in Folio and the dedicated
write-enabled app is authenticated for the intended account. `--candidate x-123456` restricts the
run to one known approval.

## Publication trail

The publisher appends to `placement-publications.ndjson` in its private state root:

1. `publish_claimed` is written and synced before the network request.
2. `published` binds the returned X post ID and URL to that claim.
3. `publish_unclear` records a command or response failure after the claim.

If X's self-service API refuses an otherwise valid reply to a foreign post, the publisher records
`manual_required` and exposes an official prefilled X Web Intent. After the human finishes that last
public click, the result can be reconciled without another write request:

```sh
npm run sonar:publish-placement -- \
  --config /absolute/path/to/sonar-placement-publisher.json \
  --candidate x-123456 \
  --record-manual-publication \
  --external-post-id 987654
```

This command reads the X post back and requires the expected account, approved text, source reply
binding and conversation before recording `manual_published`. A pasted URL or local assertion alone
is not accepted as a publication receipt.

A claimed, published or unclear approval is never retried automatically. This prevents a duplicate
reply when X accepted the request but the local process lost the response. An unclear result must be
reconciled manually against the account before any new attempt.

`FOLIO_MODULES_DISABLED` and `FOLIO_DISABLED_MODULES=sonar` also disable this executable path through
the module registry. The publisher does not support original posts, likes, follows, reposts or media.
