#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACTIVE_VAULT_FILE="${HOME}/.folio/active-vault.json"
ACTIVE_VAULT_BACKUP="${HOME}/.folio/active-vault.json.bak.capture"
SCRATCH_VAULT="/Users/Shared/folio-demo-shots"
INBOX_PATH="${HOME}/.folio/inbox"
PORT="${SCREENSHOT_PORT:-5176}"
BASE_URL="http://localhost:${PORT}"

cleanup() {
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi

  if [ -f "$ACTIVE_VAULT_BACKUP" ]; then
    mv "$ACTIVE_VAULT_BACKUP" "$ACTIVE_VAULT_FILE"
  fi

  rm -rf "$SCRATCH_VAULT"
  rm -f "${INBOX_PATH}"/demo-import-beleg-*.md
}
trap cleanup EXIT

mkdir -p "$(dirname "$ACTIVE_VAULT_FILE")"
if [ -f "$ACTIVE_VAULT_FILE" ]; then
  cp "$ACTIVE_VAULT_FILE" "$ACTIVE_VAULT_BACKUP"
fi

rm -rf "$SCRATCH_VAULT"
cp -R "${REPO_ROOT}/templates/demo-vault" "$SCRATCH_VAULT"

cat > "$ACTIVE_VAULT_FILE" <<EOF
{
  "path": "${SCRATCH_VAULT}",
  "switchedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cd "$REPO_ROOT"

FOLIO_DB_PATH="${HOME}/.folio/folio-demo.db" \
COUNCIL_DB_PATH="${HOME}/.council/council-demo.db" \
FEEDBACK_DB_PATH="${HOME}/Projects/aion-lumen/multi-agent/state/feedback-demo.db" \
VAULT_PATH="$SCRATCH_VAULT" \
FOLIO_HOME_PLZ="8000" \
FOLIO_HOME_LAT="37.0194" \
FOLIO_HOME_LNG="-7.9322" \
FOLIO_HOME_CITY="Faro" \
FOLIO_AGENT_AUTO="0" \
FOLIO_AGENT_MOCK_RESPONSE='{"verdict":"task","confidence":0.94,"reasoning":"Klares, messbares Ziel mit Deadline und Bezug zu obj-02-02. Kapitel Momentum eindeutig.","chapter_slug":"02-integration","objective":{"title":"Landing-Page + Warteliste fuer DevTool-MVP","threshold":"Landing-Page live, Warteliste >= 50 Eintragungen, Analytics aktiv - bis 2026-10-31.","weight":1.5,"related_goals":["obj-02-02"]}}' \
npm run dev -- --port "$PORT" > /tmp/folio-capture-import.log 2>&1 &
DEV_PID=$!

for _ in $(seq 1 60); do
  if curl -s "$BASE_URL/inbox" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

SCREENSHOT_BASE_URL="$BASE_URL" npx playwright test tests/e2e/screenshots-import.spec.ts

echo "Capture complete on $BASE_URL"
