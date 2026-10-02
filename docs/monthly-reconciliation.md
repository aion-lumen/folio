# Monthly payment reconciliation

Folio imports account statements, checks their coverage and matches supported payment evidence from mail and cleared attachments. A matched payment closes its Memory question after both local model assessments agree. Remaining cases move to review after full statement coverage and completion of the monthly review, including all processing batches. Pausing automatic Memory work keeps unfinished work in processing. Deactivating monthly reconciliation releases covered, unresolved cases for manual review.

## Setup and operation

1. Configure `file-intake/statement-import.json` beside the Folio database, with the Ledger checkout, Python executable, fixed input folders and account/format mappings. [Source configuration](source-configuration.md) describes the external helpers and document-security tools.
2. Download the [Ledger companion supplied with this release](https://github.com/aion-lumen/folio/releases/download/v0.6.0-preview.5/folio-ledger-companion-v0.6.0-preview.5.zip), verify it against the release SHA256SUMS file and extract it to a separate local directory. Set `ledger_root` to that directory and use the Python environment described in its README. Its matcher must support `source-payment/v2` and return rule `claim-transaction-match/v5`.
3. Enable Folio's background runtime (`FOLIO_AUTOMAIL_RUNTIME=1`) and mail intake. In Ledger Books, activate monthly reconciliation. Existing configured Memory work remains enabled according to its saved policy; a new installation requires activation.
4. Place statements in the configured folders. Folio imports available statements before running model reviews, processes six cases at a time and continues until eligible work is exhausted. Status, activation and retry controls are available in Ledger Books. Memory work can be paused separately. Missing files leave the active queue while retaining their history. Transient import failures stop retrying after twelve attempts; already covered months can continue. A pause does not consume a review attempt. Incompatible Ledger versions stop the run with an update notice.

Statement import supports the configured CSV, camt.053, Sparkasse PDF and PostFinance PDF profiles. The profile must fit the actual export. Account coverage includes all configured accounts for the payment currency. For a receipt spanning a month boundary, the following statement month may also be needed.

Document scanning uses the configured ClamAV installation. Signature maintenance calls its sibling `freshclam` binary against the official signature service, at most daily. Financial documents stay local. PDF extraction uses the isolated macOS worker described in source configuration.

## How dates and amounts are checked

Complete calendar months establish account coverage. A separate, narrower date range decides which transactions can settle one claim:

- Explicit payment or due dates take precedence. A Memory month provides a search month. Without a source date or deadline, confirmation requires an exact reference also present in the bank transaction.
- A receipt announcing settlement in two business days uses that interval. Other source-dated receipts use a seven-day search limit; later payments remain for review.
- Invoices without a due date use a seven-day search limit after the source date. A quoted due date allows two additional weekdays for booking; this is a bounded allowance, not a bank-holiday calendar. Required coverage extends to the following month where needed.
- For refunds, the original purchase and expected credit date have separate roles. Without a quoted arrival date, the search includes the notification month rather than ending in the purchase month. An earlier matching debit can be the purchase; a later reversal or several plausible originals remain unresolved.
- Amount, original currency, party, source evidence and bank entry must agree. Partial, collective and ambiguous payments require review.

A later monthly charge cannot settle the preceding receipt simply because both statement months are available. Distinct source documents may form one payment group only when their payment identity is supported. The system checks duplicate bank-entry use across claims.

Explicit PayPal-balance, card and broker transactions receive a question for that source's evidence. Automatic import/matching of those additional statement types is a separate extension. Name aliases, currency conversions and collective-payment allocation are not inferred automatically.

A confirmation covers the statement interval shown in its evidence. Reversals in a later month outside that interval are not automatically rechecked against previously confirmed cases.

## Earlier months

Older statements use the same configured import and matching path. Each case retains its own coverage and settlement dates. Test or replay a historical period on a separate database, session-exchange directory and statement cache first. Keep its results separate from the operating installation; run the production reconciliation against production sources after rollout.

## Upgrade and rollback

Stop intake and background work, then take a consistent SQLite backup and preserve the vault, statement configuration, security receipts, session-exchange directory, `payment-agent/` and `memory-work/`. Keep the old Folio and Ledger program versions.

Update Folio and its Ledger companion together. Earlier generic payment results become stale and are rechecked with source-payment/v2 normalization including its required reference policy, v5 matching and new local votes (payment-agent/v4). Previous candidates are retained in `payment-agent/candidate-history/`; their old confirmation records remain audit history. Source changes or review disagreement keep the case open. Existing provider-specific invoice proofs retain their supported rule version.

No new database schema is required over preview.4. Account mappings, model settings and owner authorization remain operator configuration. After a change in account configuration, review and reactivate the monthly scope before continuing.

Verify account coverage, waiting/review counts and a known payment, then resume previously authorized work. For rollback, stop the new processes and restore the matching program versions plus the pre-upgrade data/configuration snapshot. Preserve decisions made after the upgrade separately. Never import confirmations from a test copy.


### Belegaufbereitung und Belegketten

Gespeicherte Extraktionen sind an Quellinhalt, Memory-Angabe und Extraktionsversion gebunden. Nur vollständig validierte Felder werden wiederverwendet; leere oder unbelegte Felder führen zu einer erneuten Auswertung. Schweizer Ganzfranken-Schreibweisen und eindeutig belegte Ganzbeträge werden normalisiert. Die ursprünglichen Textstellen bleiben erhalten.

Vertragsbestätigungen, Kündigungen und kostenlose Probeabos werden getrennt von Zahlungsfragen eingeordnet. Brokerinterne Geschäfte warten auf ihren Depotnachweis. Eine belegte Einzahlung auf ein eigenes Brokerkonto ist aus Sicht des Bankkontos ein Abgang. Eine Übertragung mit unklarer Richtung bleibt zur Prüfung offen.

Eine Rechnung und spätere Korrespondenz können als Belegkette erscheinen, wenn der vollständige ursprüngliche Zahlungsabschnitt einschließlich Leistung, Gesamtbetrag und Empfängerkonto sowie ein unterscheidender Bezug (Leistungsperiode, Rechnungsnummer oder Rechnungsdatum) übereinstimmen. Unterschiedliche explizite Rechnungsdaten bilden getrennte Identitäten. Eine eindeutig zugehörige datierte Zahlungsmitteilung kann die Auswertung ergänzen. Die Zahlungsmitteilung und die Bankbuchung müssen innerhalb des ursprünglichen Zahlungsfensters liegen. Fehlt ein Rechnungsdatum, begrenzt der an die Originalangabe gebundene Suchmonat die Verbindung; ohne diesen Zeitraum bleibt sie offen. Originalrechnung und ergänzte Zahlungsmitteilung behalten ihre getrennten Rollen bei der Gruppenprüfung. Eine ausdrücklich benannte Leistung mit Periode oder Rechnungsnummer ist weiterhin erforderlich. Alle beteiligten Quellen bleiben gebunden und werden beim Lesen erneut geprüft; zurückgezogene oder geänderte Quellen entziehen die Bestätigung. Zwei unabhängige Modellprüfungen und eine eindeutige Bankbuchung bleiben erforderlich. Gleicher Anbieter und gleicher Betrag allein bilden keine Belegkette.

Beträge mit voran- oder nachgestellten Vorzeichen werden nicht als positive Forderungen gelesen; Ganzfranken-Schreibweisen wie 99.-- und durch einen Gedankenstrich abgetrennte Erläuterungen wie „CHF 99.00 – zahlbar bis …“ bleiben gültig. Rechnungsdaten werden auch als „Rechnung vom“ und mit zweistelliger Jahreszahl erkannt. Mehrere verschiedene Rechnungsdaten, Zahlbeträge oder Empfänger in einer Mailkette verhindern deren deterministische Zusammenführung. Relative Fristen werden nur aus Zahlungsaufträgen im selben Satz bzw. derselben Zeile gelesen; Rückerstattungsbedingungen verlängern das Fenster nicht.

Beim Wiedereinschalten steht ein unterbrochener Monatsabgleich sofort auf „bereit“. Abgeschlossene Läufe bleiben abgeschlossen. Memory und Ledger zeigen die aktuelle Deaktivierung unabhängig vom Ergebnis des letzten Laufs.
