#!/usr/bin/env bash
# demo-server.sh — Start folio dev server against ISOLATED demo DBs.
#
# Real production data is NEVER touched. Parallel-runnable with a normal
# `npm run dev` (which uses real DBs on port 5173). This wrapper binds to
# port 5174 so both can coexist.
#
# Usage from folio repo root:
#   bash scripts/demo-server.sh                  # default port 5174
#   PORT=6000 bash scripts/demo-server.sh        # custom port

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MULTI_AGENT_REPO="$(cd "$REPO_ROOT/../aion-lumen/multi-agent" && pwd 2>/dev/null || true)"

# Demo DB paths — must match multi-agent/Makefile's exports.
export FOLIO_DB_PATH="${FOLIO_DB_PATH:-${HOME}/.folio/folio-demo.db}"
export COUNCIL_DB_PATH="${COUNCIL_DB_PATH:-${HOME}/.council/council-demo.db}"

if [ -n "${MULTI_AGENT_REPO}" ] && [ -d "${MULTI_AGENT_REPO}" ]; then
    export FEEDBACK_DB_PATH="${FEEDBACK_DB_PATH:-${MULTI_AGENT_REPO}/state/feedback-demo.db}"
fi

# Demo persona's home — Faro (Algarve). getHomePlz() in env.ts returns null
# unless PLZ + LAT + LNG are ALL set; CITY is optional.
export FOLIO_HOME_PLZ="${FOLIO_HOME_PLZ:-8000}"
export FOLIO_HOME_LAT="${FOLIO_HOME_LAT:-37.0194}"
export FOLIO_HOME_LNG="${FOLIO_HOME_LNG:--7.9322}"
export FOLIO_HOME_CITY="${FOLIO_HOME_CITY:-Faro}"

# Vault chapters — use the bundled demo-vault template (Alex's three-chapter
# narrative: 01-neustart / 02-integration / 03-etablierung). Without this
# the page falls back to ~/Projects/life/_campaign/ → private chapters leak.
export VAULT_PATH="${VAULT_PATH:-${REPO_ROOT}/templates/demo-vault}"

PORT="${PORT:-5174}"

# Pre-flight: all three demo DBs must exist.
missing=()
[ -f "$FOLIO_DB_PATH" ]    || missing+=("FOLIO_DB_PATH=$FOLIO_DB_PATH")
[ -f "$COUNCIL_DB_PATH" ]  || missing+=("COUNCIL_DB_PATH=$COUNCIL_DB_PATH")
if [ -n "${FEEDBACK_DB_PATH:-}" ]; then
    [ -f "$FEEDBACK_DB_PATH" ] || missing+=("FEEDBACK_DB_PATH=$FEEDBACK_DB_PATH")
fi
if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: demo DBs missing:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    echo "" >&2
    echo "Run in multi-agent repo: bash scripts/init_demo_dbs.sh && make demo" >&2
    exit 1
fi

cd "$REPO_ROOT"

cat <<EOF
═══ folio Demo-Server ════════════════════════════════════════
  FOLIO_DB_PATH:    $FOLIO_DB_PATH
  COUNCIL_DB_PATH:  $COUNCIL_DB_PATH
  FEEDBACK_DB_PATH: ${FEEDBACK_DB_PATH:-(not set)}
  FOLIO_HOME_PLZ:   $FOLIO_HOME_PLZ
  Port:             $PORT
═══════════════════════════════════════════════════════════════
Real DBs (~/.folio/folio.db etc.) are not touched.
You can run a normal \`npm run dev\` on port 5173 in parallel.
EOF

exec npm run dev -- --host --port "$PORT"
