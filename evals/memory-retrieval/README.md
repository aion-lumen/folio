# Memory retrieval comparison

This synthetic suite evaluates full-text/graph retrieval against optional local semantic augmentation. It is separate from classification and extraction evaluations.

The corpus contains 17 facts and 40 questions: 30 development cases and 10 held-out cases. Types cover exact terms, paraphrases, German/English/French questions, relationship expansion and absent evidence. All cases and references were authored by the implementing AI; this is neither an independent human benchmark nor a measurement on private production data.

Start the isolated embedding service described in [the setup guide](../../docs/memory-semantic-search.md), then run:

```sh
npm run eval:memory-retrieval -- --split dev --thresholds 0.78 --output /absolute/path/dev-results.json
npm run eval:memory-retrieval -- --split heldout --thresholds 0.78 --output /absolute/path/heldout-results.json
```

The runner creates its own temporary database and vault. It does not open the owner's canonical database. Output includes fixture location, suite hash, model/profile, index/update timings and size, per-question source context, recall at five, irrelevant fact IDs and no-evidence queries that nevertheless receive hits. Temporary fixtures are retained for inspection.

Choose parameters on development cases, freeze code/configuration and only then run held-out cases once. The runner rejects a threshold sweep for `heldout`. Keep failed and irrelevant cases in the report. Existing lexical false positives are counted as well.

The historical initial run used E5-small qint8, cosine floor 0.78 and one semantic seed per domain. Its figures below describe the original selection policy, not the current code:

| Split | Baseline macro recall@5 | Hybrid macro recall@5 | Irrelevant facts, baseline → hybrid | No-evidence questions with hits |
|---|---:|---:|---:|---:|
| Development, 26 answerable + 4 absent | 57.7% | 75.0% | 12 → 13 | 2 → 2 |
| Held-out, 8 answerable + 2 absent | 25.0% | 75.0% | 3 → 6 | 1 → 2 |

Exact-case recall remained unchanged. The held-out result supports additional recall but fails a strict “no extra absent-evidence hit” adoption criterion. Consequently the feature remains opt-in. Do not tune against these held-out outcomes and then present the same cases as an untouched final evaluation; create a new independent set if changing relevance rules.

The current policy caps seeds globally at two, adds a 0.05 margin above the query’s corpus median, reserves seed places and limits a ready hybrid companion to ten facts. Historical cases used to design these changes are now regression data. See the setup guide for exact exclusions and the small-corpus fallback.

The measurements evaluate **retrieval and rendered source context**, not a generated answer. Answer completeness, relevance judgments on real owner questions, and application-level latency under load remain separate validation work. Unit tests use controlled embeddings to verify policy/lifecycle contracts; those tests are not evidence of semantic model quality.

## Private historical replay

For real owner cases, the private replay complements the synthetic suite and the [Memory selection/extraction evaluations](../memory/README.md). It tests retrieval **after** extraction and confirmation. Keep snapshots, question sets, quoted evidence, runtime databases and reports in a private directory outside this public repository. Neither the case contents nor owner-specific aggregate results belong in a public fixture or PR.

```sh
# The private directory must already exist; outputs must be new files.
npm run eval:memory-export-private -- --source /private/folio.db --output /private/snapshot.json
npm run eval:memory-replay-private -- --snapshot /private/snapshot.json --cases /private/cases.json --output /private/results.json
npm run eval:memory-check
npm test -- evals/memory-retrieval/private-support.test.ts
```

The exporter opens the source SQLite database **read-only**, enables `query_only`, and takes a consistent read transaction. It does not import app initialization or run migrations. Its table allowlist copies Memory facts, graph, status and provenance, excluding the Finance domain and all Ledger/application tables. It refuses foreign keys into excluded data rather than altering records. Source excerpts remain private. The replay imports this snapshot into a new isolated database, rebuilds its text index, and records canonical database hashes before and after retrieval/indexing. Existing app data, active-vault settings and the shared inference server are not changed. The separate embedding service is the one described in the setup guide.

Prepare a case file before the first run, bound to the snapshot's SHA-256:

```json
{
  "schema": "folio/private-retrieval-cases/v1",
  "snapshot_sha256": "sha256-of-the-exact-snapshot-file",
  "reference": "Who authored/reviewed the references and how cases were selected",
  "queries": [{
    "id": "example-1", "family": "historical-case-1", "kind": "paraphrase",
    "domain": "career", "query": "Which assignment used this method?",
    "slots": [["confirmed-fact-id", "equivalent-confirmed-fact-id"]],
    "answer_note": "What these facts support, including time/claim boundaries",
    "forbidden_ids": ["superseded-fact-id"]
  }]
}
```

Each answer slot requires **one** of its equivalent fact IDs; multiple slots require multiple pieces of evidence. Use `slots: []` for a question lacking approved support. A planned course does not establish a passed exam; an asking price does not establish a settled payment. Keep candidate/rejected/superseded rows as negative controls. Preserve references and every first-run result even when later review changes a label. Group paraphrases under the same `family`; they are not independent cases. Reconstructed questions are not verbatim historical user requests. AI-authored references are not human-approved gold labels.

The runner compares four actual paths: the lexical/hybrid owner preview at five facts, and the lexical/hybrid companion including its domain discovery, query rewriting, graph expansion and final ranking. The lexical path returns at most twenty facts; ready hybrid retrieval returns at most ten. Compare the reports at the same maximum budgets of five and ten (`fixed_budgets`), not the raw totals. `matched_companion_counts` additionally truncates both outputs per question to the smaller available count (capped at k), to compare equal context sizes without padding. Reports contain every returned context, evidence-slot coverage, complete-support counts, unanswerable questions with context, forbidden IDs, durations, index reuse and size. Volume metrics include the actual median context size, median/total nonreference facts on answerable questions, and total/median context counts for absent-evidence questions. Other retrieved IDs are labelled **nonreference/unjudged**, not automatically irrelevant. There is no LLM-as-judge or generated-answer success claim.

The replay fixes the review-regression settings (0.78 cosine floor, 0.05 median margin, two global seeds, E5 query/passage prefixes) instead of offering a threshold sweep. Freeze code and model hashes externally as well. Before recommending activation, inspect dropped correct seeds, broad graph expansion, missing multi-fact evidence and unknown-answer cases. Passing lifecycle tests alone is insufficient. If this set guides a fix, it becomes a development/regression set; use new, independently reviewed cases for the next acceptance evaluation.

For acceptance, freeze a new owner-authored set before viewing results: paraphrases, multi-fact questions, planned-versus-completed evidence, cross-domain distractors and exact-query controls. Evaluate generated companion answers as well as retrieval, including explicit abstention when evidence is absent. Record the answer model, prompt, context and human judgment separately. No answer-level verdict is inferred from a retrieval score. Relay stays lexical until its own export tests have been reviewed.


## Fictional operational answer tests

`operational-cases.json` contains 33 wholly fictional facts and 32 questions inspired by general personal-vault workflows: applications, training, quotes, appointments, project decisions and technical notes. Names, places, amounts and source references are invented. It includes candidate/rejected/superseded distractors and a stored instruction that must be treated as data. Facts deliberately omit some completion evidence instead of spelling out every unknown answer.

```sh
node --import tsx evals/memory-retrieval/operational.ts --retrieval-only --output /private/context-report.json
node --import tsx evals/memory-retrieval/operational.ts --model YOUR_LOADED_MODEL --coordination-db /private/folio.db --output /private/answers.jsonl
# Fresh fictional transfer suite; record the first run before adjusting anything:
node --import tsx evals/memory-retrieval/operational.ts --cases /private/fictional-cases.json --mode hybrid --stream --model YOUR_LOADED_MODEL --coordination-db /private/folio.db --output /private/voice-answers.jsonl
```

The answer run reuses the production companion instructions and inference settings, with empty focus/mail/lead context and only fictional Memory. It runs each question with lexical and hybrid retrieval, alternating pair order. It never loads or switches models. The explicit coordination database is used only for Folio's existing model-gate tables, without app initialization or reading its evidence tables. It waits for a free gate, renews its own exclusive activity and releases it at completion. This pauses competing model work for the test's duration but does not disable mail intake or modify its configuration.

The output records every request, final answer, model, timing and context. Expected answers are human-readable criteria, not a keyword-based pass verdict. Inspect every answer for invented completion, unsupported certainty, source confusion, missed evidence and compliance with stored instructions. References and any AI assessment are not independent human judgment. Run the dialogue model separately as well if it differs from the primary model. Keep first runs and all failures; do not tune on them and relabel them as new acceptance evidence.

`--cases` accepts the same facts/queries schema as the bundled fictional suite. A query may supply a short `history` array of `{role: "user" | "assistant", text: string}` for follow-up questions; retrieval and answer input both receive it. `--mode hybrid` runs only the augmented path, while the default compares both. `--stream` uses the production message-stream consumer and records time to the first spoken text delta separately from total completion time. This measures answer generation, not speech recognition or audio synthesis. Optional `--reasoning off|low|medium|high|on` requests that API setting explicitly; it must be supported by the selected local model. A rejected setting is not a completed evaluation. No flag changes the production model acceptance list.
