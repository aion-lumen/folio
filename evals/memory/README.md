# Memory evaluation

Folio first evaluates **case selection** against the private, real local mail archive. The same fixed task asks each local Hermes agent to choose up to ten mails per original mail domain: four normal cases, two boundary cases, two cross-domain cases, and two detail-rich cases. A domain with fewer than ten real local excerpts reports the shortfall instead of filling it with fixtures.

The raw candidate corpus exists only in an isolated runtime directory below `~/.folio/memory-selection/` while the run is active. Hermes' file tools are jailed to that directory. The runtime corpus and raw request are purged after the run; durable results contain feedback IDs, controlled categories, and reason codes only.

After human review, the accepted mails are copied into a separate private cohort and consistently masked. Memory extraction is then evaluated in cohorts of exactly three comparable cases per domain. A cohort may be selected by a human or proposed by Hermes, but that choice is recorded and assessed separately from the models that fill memory.

The checked-in suite must contain synthetic source references and expected objects only. Real mail bodies, names, addresses, identifiers, and account details stay outside the repository.

Two questions are scored independently:

1. **Case selection:** Did Hermes find a representative mix of ordinary, boundary, cross-domain, and detail-rich cases? Which selections recur across models, and which survive human review?
2. **Memory extraction:** Did a model recover the expected entities, facts, relations, and dated episodes without inventing extra objects?

This separation prevents a helpful or poor Hermes selection from being mistaken for model quality. The same frozen cohort can later be replayed against different local models and retrieval projections.

Confirmed historical Memory can additionally be evaluated with the [private retrieval replay](../memory-retrieval/README.md#private-historical-replay). That runner compares the existing and optional semantic search through both the owner preview and companion paths. Its references and raw contexts remain outside the public repository, and its retrieval results do not replace extraction accuracy or final-answer evaluation.
