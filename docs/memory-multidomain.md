# Multi-domain sources in Memory

A mail or file has one source identity and can concern several topics. Memory assigns
each supported claim its own domain and creates a separate review bundle per domain.
A property letter can supply an `immo` milestone, a `finance` invoice condition and
a `personal` communication preference. Each claim is stored once.

## Paths

- Mail triage retains complete model topic opinions as extraction hints. A human
  correction or included multilabel review takes precedence. The primary filing
  category stays independent of the domains of extracted facts.
- Manual **Wissen vorschlagen** and automatic incoming-mail Memory share extraction
  and validation. Automatic review persists a grant/result per bundle, resumes
  unfinished bundles and reports full confirmation only when all are accepted.
- Verified PDF attachments select exact page/line spans. The source hash and page
  provenance are shared; each domain gets its own explicit review grant. The attachment
  CLI reviews every bundle; partial confirmation remains `needs_review`.
- Verified-file extraction carries a domain per candidate through independent review.
  File placement and physical source paths remain unchanged. Operator-specific Reorg
  campaign and backfill adapters are maintained separately from this public release.

## Validation and review

Topic labels guide extraction; they do not verify claims. Exact quotations, attribution,
dates, sensitivity and independent review still apply. The reviewer sees the whole
source and sibling claims as context, but can approve only its own bundle's objects.
Source and related-claim changes invalidate outstanding grants. A rejected bundle
remains a candidate and does not undo accepted sibling bundles.

An open invoice, price or future debit is financial context, not proof of payment.
Financial and health claims remain sensitive. Conflicting values remain separate,
attributed candidates; deduplication does not decide which value is true. This feature
performs no Ledger postings or external actions.

Mail extraction is bounded to three generic facts plus the dedicated application
object; attachment extraction to five facts. A bounded repair attempt retains the same
grounding rules. Mail repair cannot silently turn independently supported facts into
an empty result. These are reviewed suggestions, not an exhaustive account of every
statement in a long source.

## Compatibility

New mail responses use `folio/memory-candidate-proposals/v2` with a domain per fact;
v1 inputs remain readable. Existing single-proposal intake and attachment records
remain readable. New records add arrays and per-proposal review results to their JSON;
there is no canonical schema migration or historical bulk reclassification.

File routing vocabulary maps to Memory vocabulary for new facts: `property → immo`;
`private/family/mobility/household → personal`; `systems/data_analytics → projects`;
`ai → knowledge`. Source routing labels retain their file-taxonomy meaning. Candidates
without a fact domain use their source domain.

## Regression coverage

Synthetic tests cover mixed-topic mails/PDFs/files, applications plus costs, unpaid
invoices, partial confirmation, interrupted review/resume, repeated/concurrent requests,
duplicate claims, sibling contradictions, exact source/page binding and legacy records.
Model evaluations must also check missed facts: valid structure alone does not establish
useful recall. Use fictional sources and retain failed model responses.

## Historical file facts

The explicit verified-file path uses `file-source-context-v3`. In addition to a domain,
the extractor labels a passage as an event, state, plan, rule or transient information.
Folio keeps the verbatim excerpt and adds a fixed source qualifier to the Memory value.
An old plan states that implementation is unverified; an archived state or rule states
that its current validity is unverified. These become context rather than a current
preference or commitment. Contractual rules remain rules even if the extractor used
the `committed_to` predicate or the text uses modal verbs such as `shall`, `soll` or
`werden`. An explicit intention mislabelled as a rule is held for reassessment; the
independent reviewer also checks plan/rule confusion in both directions.
Documented events also remain context and require a
document date or an explicit historical date/period in the quoted passage.

Only an explicit, unambiguous date in the initial contiguous header establishes the source date.
The header is bounded to five nonempty lines, may start with one title, and ends at body
text or the next page. Dates after the recorded extraction day (UTC) are not accepted.
Near local midnight this can conservatively hold a document dated the local new day.
Filenames, file modification times, import times and incidental deadlines do not.
Undated plans/states and events lacking temporal evidence are held. A date in an event
quote is not repurposed as a document date; rules may retain an unknown source date.
The source date is not written into the fact's validity interval. Process IDs,
package metadata and one-off execution instructions are filtered or held.

The independent reviewer receives the whole file, original passage, temporal qualifier
and related facts. It must check meaning, attribution and usefulness as well as exact
quotation. The grant binds the context metadata and source text. A deterministic prefix
is not presented as a quotation and cannot authorize a generic mail fact. This path
does not establish the four-source quorum used for separate source-confirmed claims.

An archive excerpt is limited to four consecutive extracted-text lines and 500 characters.
If a model selects too many lines, its one permitted correction receives the inclusive
line count. Folio never truncates the quote or removes necessary conditions to make it fit;
a second invalid selection remains unaccepted.
Exact excerpts consisting only of a title, date or empty form-header fields are held
as low-value metadata. The extractor's bounded correction can select a substantive
passage instead; the independent reviewer checks usefulness as well as literal support.

Legacy file records require explicit `proposeFileMemory(document, assertActive,
{ reassessLegacy: true })`. All old bundles and facts must still be candidates; existing
human decisions and confirmed facts block replacement. The old attempt remains in the
audit record. Its old facts become `superseded`; its obsolete bundles receive a system
rejection with a `quality_reassessed` audit entry linking the new IDs. Individual,
source-wide and bundle confirmation cannot revive them. This also applies if all new
suggestions are held or omitted. No automatic
historical rewrite runs on startup. If previous confirmations need reopening, review
their exact IDs and back up the database before a separately authorized repair.

This policy applies to explicit verified-file extraction. It does not silently change
PDF-attachment extraction, earlier Reorg records or general Memory entry paths. A
quality hold and an extractor omission are different outcomes: a missing fact requires
its own recall investigation, not a relaxation of grounding or review.
