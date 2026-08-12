# Mail Integration

Mail integration is an optional feature that connects Folio to
[life-mail](https://github.com/aion-lumen/life-mail), a companion tool
that fetches, classifies, and routes incoming emails into the vault.

## What it does

When configured, life-mail runs periodically and:

1. Connects to your IMAP accounts via TLS
2. Fetches new messages since the last run
3. Classifies each message with a local LLM (Ollama)
4. Routes the result: creates a vault note, links to an objective, or escalates to Hermes
5. Writes a status snapshot to `_meta/mail/state.json`

This ingestion path runs entirely locally; email content does not leave your machine. The separate,
case-bound handover to an online session is described in [Session Relay](session-relay.md) and
happens only after explicit approval.

## Dashboard integration

When `_meta/mail/state.json` exists in your vault, a mail badge appears
in the top bar showing pipeline status:

- **Green dot** — pipeline ran within the last 12 hours, no errors
- **Amber dot** — pipeline hasn't run in more than 12 hours
- **Red dot** (pulsing) — last run failed
- **No badge** — life-mail not configured

Clicking the badge opens the Mail detail modal with:
- Connector and last-run status
- A list of recently processed messages
- A button to trigger the pipeline manually (streams output live)
- Error details with remediation hint when applicable

## Setup

life-mail is a separate project. Installation and configuration are
documented in its own repository. The short version:

```bash
git clone https://github.com/aion-lumen/life-mail.git
cd life-mail
pip install -r requirements.txt
cp config.example.yaml config.yaml
# Edit config.yaml: vault_path, accounts, classifier model
```

Credentials are managed via Bitwarden — life-mail uses `bw get` at
runtime. No passwords are stored in config files.

## Vault output

life-mail writes classified messages to:

```
your-vault/
└── restricted/
    └── internal/open/mail/
        └── YYYY-MM-DD-slug.md
```

Each file has frontmatter:

```yaml
---
type: mail
date: 2026-04-22T14:20:00Z
from: sender@example.com
subject: Subject line
classification: task
linked_objective: obj-01-04
confidence: 0.87
---

Body or summary of the message.
```

Classification values: `task`, `ignore`, `hermes-escalate`

## Graceful degradation

If life-mail is not installed or `state.json` does not exist, the
dashboard shows no mail badge and the manual trigger returns a clear
error message. No part of the core dashboard depends on mail integration.
