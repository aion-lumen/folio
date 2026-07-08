#!/usr/bin/env bash
set -euo pipefail

INBOX_PATH="${FOLIO_INBOX_PATH:-${HOME}/.folio/inbox}"
mkdir -p "$INBOX_PATH"

STAMP="$(date +%Y%m%d-%H%M%S)"
DOC_ID="demo-import-beleg-${STAMP}"
FILE_PATH="${INBOX_PATH}/${DOC_ID}.md"

cat > "$FILE_PATH" <<EOF
---
folio_import: v1
type: note
target: chapter-1
id: ${DOC_ID}
source: screenshot-demo
created: 2026-07-08T12:00:00+02:00
title: Demo Import Objective Seed
tags: [demo, import, screenshot]
---

# Campaign objective proposal

Please add a new objective to chapter 1:

- Title: Inbox-Automation dry-run with objective landing
- Threshold: First import path lands one unambiguous objective in campaign chapter 1 and is visible in Heute-Hub.
- Weight: 3
- Related goals: obj-01-01

This is demo data only.
EOF

echo "Seeded demo inbox file: $FILE_PATH"
