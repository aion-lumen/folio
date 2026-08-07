# Second-device demo on Apple Silicon

This is the assisted setup path for demonstrating Folio on a second Mac. Allow one to two days for
installation, optional local-model setup, and acceptance testing. The baseline demo uses only
fictional fixtures and needs no IMAP or model credentials.

This owner-operated demo is not the external-installation path. External installations remain
blocked until the 08c module gate in the [roadmap](ROADMAP.md) is complete.

## 1. Prerequisites

Install:

- Git;
- Node.js 20 or newer;
- Python 3.11 or newer; and
- the macOS command-line tools (`xcode-select --install`), which provide `make` and `sqlite3`.

Clone both repositories into the same parent directory:

```bash
git clone https://github.com/aion-lumen/folio.git
git clone https://github.com/aion-lumen/multi-agent-lab.git
cd folio
```

Another layout is supported by passing the absolute multi-agent path with `--multi-agent`.

## 2. Preflight

This command checks versions, repository paths, and required fixture tooling without changing
anything:

```bash
bash scripts/setup-second-device-demo.sh --check-only
```

If the repositories are not siblings:

```bash
bash scripts/setup-second-device-demo.sh \
  --multi-agent /absolute/path/to/multi-agent-lab \
  --check-only
```

## 3. Prepare and start

Install dependencies, initialize the isolated `*-demo.db` files, seed deterministic fixtures, and
start Folio:

```bash
bash scripts/setup-second-device-demo.sh --start
```

The launcher binds to `http://localhost:5174` and forces:

- the bundled fictional demo vault;
- `~/.folio/folio-demo.db`;
- `<multi-agent>/state/feedback-demo.db`;
- a separate demo inbox, import ledger, and triage log; and
- no automatic LLM triage.

Missing demo databases are initialized only from the checked-in static schemas. This setup path
does not inspect a real local database even if one already exists on the Mac.

The demo does not replace the persisted real-vault selection. Stopping the demo leaves any regular
Folio setup untouched.

The setup copies the bundled vault once to `/Users/Shared/folio-demo`. This neutral runtime path
keeps the macOS account name out of the UI and screenshots. An existing directory is never
overwritten automatically. A custom `FOLIO_DEMO_VAULT_PATH` must resolve to a directory named
`folio-demo` or `demo-vault`; the wrappers resolve symlinks and `..` segments before checking it.
This is a local footgun guard, not an authentication boundary.

Optional local-model routing is declared per machine in `~/.folio/model-routing.yaml`. Copy
`config/model-routing.example.yaml` there and adjust only the registered Hermes profile/model IDs
after the hardware is known. Folio interprets no executable fields from the manifest, and
`auto_switch` remains off by default. Without the per-device file, routing metadata stays disabled.

## 4. Acceptance checklist

- The startup banner lists only paths ending in `demo-vault`, `*-demo.db`, or `demo-inbox`.
- Heute, Vault, Mail, Pipeline, Import-Inbox, and Leuchtfeuer open without real-data errors.
- No IMAP credentials are requested and no mail worker is started.
- Restarting the same command returns to the isolated demo.
- Hermes is optional. If configured later, its chat uses the demo-specific context manifest and no
  private Hermes memory.
- Record both Git commits, Node/Python versions, and the fixture inventory printed during setup.

## Cleanup

Generated demo state is separate from regular state. To remove it, stop Folio and delete only the
explicit paths printed by the setup and demo-server commands. Do not use a recursive cleanup command
against `~/.folio` or either repository root.
