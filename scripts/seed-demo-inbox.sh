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
target: 02-integration
id: ${DOC_ID}
source: screenshot-demo
created: 2026-07-08T12:00:00+02:00
title: "Momentum-Import: MVP-Warteliste"
tags: [demo, import, screenshot]
---

# Momentum-Ziel für Alex

Bitte als Objective im Kapitel Momentum anlegen:

- Title: Landing-Page + Warteliste fuer DevTool-MVP
- Threshold: Landing-Page live, Warteliste >= 50 Eintragungen, Analytics aktiv - bis 2026-10-31.
- Weight: 1.5
- Related goals: obj-02-02

Kontext:
- Ziel passt zur bestehenden Demo-Kampagne von Alex in Lissabon.
- Fokus: sichtbarer Schritt von Idee zu validiertem MVP-Funnel.
- Demo data only.
EOF

echo "Seeded demo inbox file: $FILE_PATH"
