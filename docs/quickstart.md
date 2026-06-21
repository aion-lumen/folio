# Folio — Quickstart

Two paths: a real-data setup (vault + Hermes) and a no-data demo. The README's [Quick Start](../README.md#quick-start), [Demo (mock data)](../README.md#demo-mock-data), and [Demo (full stack)](../README.md#demo-full-stack) sections are the canonical command sequences; this doc adds context about what runs where.

## Prerequisites

- Node.js 20+
- For real-data path: [Hermes Agent](https://github.com/NousResearch/hermes-agent) running on the default port (8642) with an API key.
- For the demo path: an empty checkout of [multi-agent-lab](https://github.com/aion-lumen/multi-agent-lab) (Python 3.11+). Council is optional and not required for the demo.

## Real-data path (own vault)

`npm run build && npm run preview` on port 4173. The Setup Wizard on first launch connects an existing vault (or creates one). Folio reads/writes `~/.folio/folio.db` and the configured `VAULT_PATH`. Environment variables go in a project-root `.env`:

```env
VAULT_PATH=/path/to/your/vault
HERMES_API_URL=http://localhost:8642
HERMES_API_KEY=your-key-here
AION_LUMEN_PATH=/path/to/multi-agent-lab    # optional, defaults to ~/Projects/aion-lumen/multi-agent
```

## Demo path (no real data)

`bash scripts/demo-server.sh` on port 5174 against the isolated `*-demo.db` files:

| File | Owned by | Content after `make demo` |
|---|---|---|
| `~/.folio/folio-demo.db` | folio | 2 worker_runs, 21 worker_run_logs, 15 validator_opinions, 3 hauskauf_workflow rows |
| `~/.council/council-demo.db` | multi-agent-lab seed | 7 objects, 18 rankings (3 personas), 9 lens_comparisons, 2 council_runs |
| `<multi-agent>/state/feedback-demo.db` | multi-agent-lab | 40 demo mails (uid 90001–90040) |

The demo server forces `FOLIO_DB_PATH`, `COUNCIL_DB_PATH`, `FEEDBACK_DB_PATH`, and `VAULT_PATH` to demo paths; your real `~/.folio` and `~/.council` are untouched.

The seed step lives in multi-agent-lab — see [its quickstart](https://github.com/aion-lumen/multi-agent-lab/blob/main/docs/quickstart.md) and the [README's Demo (full stack)](../README.md#demo-full-stack) walkthrough for the ordered cold-start. A cold-start machine with no `~/.folio`, no `~/.council`, and no IMAP credentials works — `init_demo_dbs.sh` bootstraps the schemas from static SQL dumps when no real DBs exist.

## Verifying the demo

After `make demo` + `bash scripts/demo-server.sh`:

- `http://localhost:5174/pipeline` — Worker / Validator / Council-Lens cards + Verlauf history with seeded runs
- `http://localhost:5174/council` — Algarve property list, cluster + Borda rank
- `http://localhost:5174/mail-queue` — 40 demo mails with domain + actionability tags
- `http://localhost:5174/heute` — Heute dashboard with four entry cards
