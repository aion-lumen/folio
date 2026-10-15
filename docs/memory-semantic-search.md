# Optional semantic Memory search

Folio can supplement its existing full-text and relationship search with locally computed embeddings. This helps retrieve confirmed knowledge when a question uses different wording or another language. Results retain their original sources and validity; similarity does not confirm a fact or establish that it answers the question.

The feature is **off by default**. The supplied small synthetic evaluation improves recall but also adds irrelevant results, including a question for which no answer is recorded. Review results on your own corpus before enabling it for daily use.

## Scope

- Integrated into the Memory context preview and explicitly accepted local companion models. `FOLIO_MEMORY_SEMANTIC_ANSWER_MODELS` lists exact local model IDs, separated by commas; it defaults to empty. Models absent from that list retain the existing lexical context. Validate primary and dialogue models separately: successful retrieval does not establish that another model will interpret it correctly. Mail-to-Relay preparation stays lexical, including when semantic retrieval is enabled. Export relevance needs its own evaluation before semantic additions are allowed.
- SQLite remains the source of truth. The disposable vector projection lives beside the active database as `folio.db.memory-vectors.sqlite`, with owner-only file permissions. No schema migration or vector tables are added to the canonical database.
- Only facts with `confirmed` status and a currently valid interval outside `finance` are indexed. Confirmation can come from the owner or an explicitly authorized independent review; candidates remain excluded. Source-confirmed and bank-confirmed claims retain their existing retrieval and verification paths. Ledger consumers and the finance domain always use the original synchronous search.
- Current status, domain, sensitivity, source/content hash and validity are checked at retrieval and again after inference. Deleted, replaced or changed facts cannot be recovered from stale vectors. Entity labels are included only within the fact's own sensitivity ceiling.
- Exact references, email addresses and recognized dates/amounts use the original search. Selected semantic seeds receive reserved places within the existing fact budget. Only the seed facts themselves bypass the companion’s word filter; other facts sharing a person or project must still match the question. The preview retains its bounded relationship expansion.
- In ready hybrid companion contexts, a literal subject token also counts as a word match. A fact about an explicitly named project need not repeat that project's name inside its value. This keeps multi-fact decisions and technical details from being discarded after retrieval. Subject tokens must match as whole tokens; sharing an entity alone does not qualify. The existing ten-fact budget remains, and finance, exact-query, disabled and unavailable paths retain their previous ranking.
- A missing index, changed model profile, invalid response or unavailable embedding endpoint falls back to current full-text retrieval. The Memory preview shows that fallback. The synchronous compiler and its callers remain available unchanged.

The companion also expands specific assessment vocabulary in its lexical query:
`Wissenstest`, `Kenntnistest`, `Kompetenztest` and `Assessment` can find each other's
recorded passages, including plural and hyphenated forms. Their terms receive reserved
places before the query limit, including with long conversation histories. Generic
`Test`, assessment centers, risk and self-assessments do not trigger the bridge;
injected bridge terms alone cannot qualify those distinct senses as lexical matches.
An explicit, ambiguous question such as `Wie war mein Assessment?` retains literal
matches from both learning assessments and assessment centers. The
embedding query stays unchanged, and no similarity threshold is lowered. This helps
both typed and voice-transcribed questions that reach the same companion search.
If several proceedings fit a question, the answer must ask which one is intended.
Finding a passage does not itself establish the cause of an access problem.

## Separate local CPU service

The included optional service uses the public MIT-licensed [multilingual E5-small model](https://huggingface.co/intfloat/multilingual-e5-small), pinned to revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, with a quantized ONNX artifact. Downloads total about 135 MB. Serving verifies the model and tokenizer SHA-256 hashes and makes no model downloads or cloud inference calls. It binds only to `127.0.0.1`, disables ONNX telemetry and defaults to two CPU threads. It does not load or unload models in LM Studio.

From the repository root, choose a separate runtime directory outside the repository:

```sh
python3 -m venv /absolute/path/embedding-runtime
/absolute/path/embedding-runtime/bin/pip install -r scripts/memory-embedding-requirements.txt
/absolute/path/embedding-runtime/bin/python scripts/memory-embedding-server.py --model-dir /absolute/path/e5-small --download
/absolute/path/embedding-runtime/bin/python scripts/memory-embedding-server.py --model-dir /absolute/path/e5-small --port 1235
```

The service stays in the foreground. For regular macOS use, run it from a dedicated runtime directory under a user LaunchAgent with `RunAtLoad`, `KeepAlive`, a restart throttle, owner-only log permissions and the same pinned model files. Keep the chat-model service separate. Stopping it restores lexical fallback; it does not stop Folio. It applies the model card's attention-masked mean pooling, normalization and 512-token limit. Folio supplies `query: ` and `passage: ` prefixes, including for non-English text. Long facts are represented only by the model's input window; their full canonical hash still guards against changes.

## Build and refresh the projection

Set these environment variables in the indexing shell **and in Folio's process environment**. The command does not load a shell `.env` automatically:

```sh
export FOLIO_MEMORY_SEMANTIC=1
# After reviewing generated answers for that exact model:
export FOLIO_MEMORY_SEMANTIC_ANSWER_MODELS=your-tested-local-model
export FOLIO_MEMORY_EMBEDDING_URL=http://127.0.0.1:1235/v1/embeddings
export FOLIO_MEMORY_EMBEDDING_MODEL=intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3/qint8
export FOLIO_MEMORY_EMBEDDING_REVISION=614241f622f53c4eeff9890bdc4f31cfecc418b3
export FOLIO_MEMORY_EMBEDDING_DIMENSIONS=384
export FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY=0.78
export FOLIO_MEMORY_SEMANTIC_MIN_MARGIN=0.05
export FOLIO_MEMORY_SEMANTIC_MAX_CANDIDATES=2
npm run memory:index-vectors
```

The app refreshes the projection five seconds after startup and then every five minutes while semantic retrieval is enabled. Only one refresh runs at a time. New confirmations, edits and withdrawals are picked up without using the shared chat model. For an immediate refresh, or before first activation, run the explicit indexing command. Unchanged facts reuse vectors. Changed/revoked/expired rows are removed before further inference. New and edited facts remain available through full-text search while awaiting reindexing. Search itself performs no index writes or model downloads. The Memory overview shows maintenance state and the last successful check; the owner-only `/api/memory/semantic-status` endpoint exposes the same aggregate status without paths or fact contents. A failed update is retried on the next cycle; retrieval still rechecks canonical facts, so stale vectors cannot revive withdrawn knowledge.

The initial implementation bounds the projection to 5,000 facts and uses cosine similarity in memory rather than an additional database service. It selects at most two semantic seeds across all permitted domains of a companion request, with one shared query inference. A seed must exceed the cosine floor and the median similarity of the query’s eligible corpus by at least 0.05. With fewer than three eligible vectors only the absolute floor applies. These are provisional relevance heuristics, not calibrated probabilities or evidence that an answer exists. The preview applies the same selection within its chosen domain.

When semantic search is ready, the companion returns at most ten facts; up to two selected seeds appear within the first four places, even when word matches or pinned classes would otherwise crowd them out. Disabled, excluded, missing-index and unavailable paths preserve the original lexical ranking and twenty-fact limit. Thresholds are model- and corpus-specific and require independent acceptance testing. Model identity, revision, dimensions, prefixes and text-projection version invalidate incompatible cached vectors.

Alternate embedding services must expose the [local embeddings HTTP format](https://lmstudio.ai/docs/developer/openai-compat/embeddings), return the requested model identity and match the configured dimensions. Folio accepts literal loopback addresses only and refuses redirects. Running an alternate service against a shared inference runtime requires separate resource coordination.

## Verification and rollback

See [the retrieval evaluation](../evals/memory-retrieval/README.md) for the 30/10 split and method. Tests cover lifecycle changes, policy ceilings, source preservation, model mismatch, unavailable service, shared-person graph filtering, global candidate budgets, ambiguous queries, seed crowding, lexical Relay, vault switching and unchanged canonical database bytes.

Set `FOLIO_MEMORY_SEMANTIC=0` and restart Folio to return every connected caller to lexical retrieval. No database rollback is needed. The projection can be rebuilt from confirmed facts. Do not treat retrieval recall as evidence of final answer accuracy; a separate answer-level evaluation remains necessary.
