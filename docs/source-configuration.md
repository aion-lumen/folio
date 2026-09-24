# Optional source configuration

Folio does not create mail accounts or infer the receiving account from a sender. Configure the existing intake/worker credentials separately; this registry contains no credentials.

Set `FOLIO_MAIL_ACCOUNTS_PATH` to an absolute JSON path, or place `mail-intake-accounts.json` next to `FOLIO_DB_PATH`:

```json
{"schema":"folio/mail-accounts/v1","accounts":[{"id":"personal","label":"Personal","kind":"imap"},{"id":"archive","label":"Export archive","kind":"proton-export","exportPath":"/absolute/path/export"}]}
```

A bare array is also accepted and is a complete list, not additions to implicit accounts. When upgrading a private workbench with implicit accounts, include **all** previous accounts before enabling the new runtime. Preserve ids, intake authority, mailbox state and historical import scopes. Keep the previous registry and runtime configuration for rollback.

For the existing Carta HTML tracker adapter, set `FOLIO_CAREER_TRACKER_PATH`, or write `career-settings.json` next to the Folio DB with `{"trackerPath":"/absolute/path/positions-tracker.html"}`. Only the supported DATA/REJECTED literal format is accepted; it is parsed without executing scripts. Unconfigured, unavailable and invalid sources are reported separately. No write can succeed without a valid source and unchanged evidence. This adapter is optional, not a requirement to run Folio.

Existing memory installations can preserve their career person identity through `FOLIO_CAREER_PERSON_KEY`. The default for new installations is `career:person:owner`. `FOLIO_OWNER_ALIASES` optionally excludes the owner's name from calendar similarity matching.

Statement import uses `file-intake/statement-import.json` beside the Folio DB. No import roots are invented when it is absent. Configure the Ledger ingestion adapter, accounts and a supported format profile before importing. Format support is profile-specific, not universal for a bank or broker.

## External runtime helpers

These optional integrations require separate checkouts and Python dependencies; `npm ci` installs neither. Folio's source package alone is not a complete mail-processing or statement-import installation. The path settings below select operator-provided runtimes, not downloaded plugins.

| Configuration and source project | Expected helpers | Behaviour when unavailable |
| --- | --- | --- |
| `ledger_root` in `file-intake/statement-import.json`; companion `aion-lumen/ledger` repository | `scripts/preview_manual_books.py` for statement previews; `scripts/normalize_invoice.py` for invoice normalization; `scripts/reconcile_finance_case.py` for evidence reconciliation, plus their Ledger imports/profiles | Without configuration there are no input roots. An unavailable helper blocks that operation; reconciliation records a case error rather than accepting a payment. Existing verified imports remain readable. |
| `AION_LUMEN_PATH`; Aion Lumen `multi-agent` runtime | `scripts/production_worker.py`, `scripts/validator_batch.py` for mail processing; `scripts/council_state.py`, `scripts/folio_log_writer.py` for state integration; `scripts/ntfy_publish.py` for optional notifications | Missing workers cannot complete an intake/evaluation. The run fails and reports its error; Folio does not substitute successful results. Missing notification infrastructure cannot deliver a notification. |
| `COUNCIL_CONFIG_PATH`; Aion Lumen `council/config` in the companion Council checkout | Its sibling `scripts/council_lens_run.py`, run with `council/.venv/bin/python3` | Missing runtime or helper prevents a Lens run; it cannot produce a completed review. This optional Council integration is separate from the household dashboard. |
| Same `multi-agent` runtime; optional model comparison | `scripts/eval_full.py`, `scripts/model_swap.py`, `scripts/validator_batch.py`, `scripts/categories_loader.py` and their dependencies/configuration; a configured local model server | Folio includes `scripts/model-eval-runner.py`, its local model profiles, catalog and synthetic labels. The companion runtime supplies the matching synthetic mail fixtures and model lifecycle. Missing prerequisites fail the run; real-mail evaluation additionally needs a locally reviewed cohort. |

Use the compatible versions of these companion runtimes supplied by their maintainers. Their availability and credentials must be established separately; this release does not claim a turnkey public installation of those companion projects. `PYTHON_BIN_PATH` selects the mail/model Python executable; the Ledger configuration selects its own `python_bin`. Both need the dependencies of their respective scripts. No automated helper is allowed to turn missing or failed evidence into a confirmed payment.

Google Calendar is optional and uses OAuth. When enabled, Folio communicates with Google; local-only and synthetic offline tests do not establish that the provider workflow was tested. Event creation requires approval of the specific event. Reconnecting verifies the selected calendar against the newly connected account and refreshes its cache.

For the production Node server, set `ORIGIN` to its exact browser origin (for example `http://127.0.0.1:4173` when running locally). A reverse proxy must provide the matching HTTPS origin. Keep SvelteKit origin/CSRF checks enabled; changing hostnames between localhost and 127.0.0.1 changes the origin.

PDF extraction and page previews currently require macOS `sandbox-exec` plus an explicitly configured Python runtime with `pypdf`, `pdfplumber`, `pypdfium2` and Pillow. Incoming documents also require ClamAV and its signature database. The security configuration lives at `file-intake/security/config.json` beside the Folio DB (`schema: folio/document-security-config/v1`, absolute `scanner_bin`, `signatures_dir`, `python_bin`). These tools are not installed by npm. Unsupported systems fail closed; the dashboard can still display previously verified imports and offer their original documents.
