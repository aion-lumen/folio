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

canonical_demo_vault_path() {
    local candidate="$1"
    local canonical
    local base

    canonical="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$candidate")"
    base="${canonical##*/}"
    case "$base" in
        demo-vault|folio-demo) ;;
        *)
            echo "ERROR: canonical demo vault directory must be named 'demo-vault' or 'folio-demo':" >&2
            echo "  requested: $candidate" >&2
            echo "  resolved:  $canonical" >&2
            return 1
            ;;
    esac
    printf '%s\n' "$canonical"
}

# Accept an explicit checkout and the two layouts used by the public docs and
# the maintainer machine. Never fall back to an unknown/default real-data path.
MULTI_AGENT_REPO=""
if [ -n "${AION_LUMEN_PATH:-}" ] && [ -d "${AION_LUMEN_PATH}" ]; then
    MULTI_AGENT_REPO="$(cd "${AION_LUMEN_PATH}" && pwd)"
else
    for candidate in \
        "$REPO_ROOT/../multi-agent-lab" \
        "$REPO_ROOT/../aion-lumen/multi-agent"; do
        if [ -d "$candidate" ]; then
            MULTI_AGENT_REPO="$(cd "$candidate" && pwd)"
            break
        fi
    done
fi

if [ -z "$MULTI_AGENT_REPO" ]; then
    echo "ERROR: multi-agent checkout not found." >&2
    echo "Set AION_LUMEN_PATH=/absolute/path/to/multi-agent-lab and retry." >&2
    exit 1
fi
export AION_LUMEN_PATH="$MULTI_AGENT_REPO"

# Demo DB paths — must match multi-agent/Makefile's exports. Deliberately
# replace inherited values so a shell configured for production cannot leak a
# real DB into this process.
export FOLIO_DB_PATH="${HOME}/.folio/folio-demo.db"
export COUNCIL_DB_PATH="${HOME}/.council/council-demo.db"

export FEEDBACK_DB_PATH="${MULTI_AGENT_REPO}/state/feedback-demo.db"

# Demo persona's home — Faro (Algarve). getHomePlz() in env.ts returns null
# unless PLZ + LAT + LNG are ALL set; CITY is optional.
export FOLIO_HOME_PLZ="${FOLIO_HOME_PLZ:-8000}"
export FOLIO_HOME_LAT="${FOLIO_HOME_LAT:-37.0194}"
export FOLIO_HOME_LNG="${FOLIO_HOME_LNG:--7.9322}"
export FOLIO_HOME_CITY="${FOLIO_HOME_CITY:-Faro}"

# Prefer the neutral runtime copy created by setup-second-device-demo.sh. A
# developer may still run the bundled template directly; both choices are
# explicitly demo-scoped and neither can fall back to a persisted real vault.
if [ -n "${FOLIO_DEMO_VAULT_PATH:-}" ]; then
    DEMO_VAULT_PATH="$FOLIO_DEMO_VAULT_PATH"
elif [ -f "/Users/Shared/folio-demo/_campaign/campaign.md" ]; then
    DEMO_VAULT_PATH="/Users/Shared/folio-demo"
else
    DEMO_VAULT_PATH="${REPO_ROOT}/templates/demo-vault"
fi
DEMO_VAULT_PATH="$(canonical_demo_vault_path "$DEMO_VAULT_PATH")"
export FOLIO_VAULT_OVERRIDE="$DEMO_VAULT_PATH"
export VAULT_PATH="$FOLIO_VAULT_OVERRIDE"
export FOLIO_INBOX_PATH="${HOME}/.folio/demo-inbox"
export FOLIO_SESSION_BRIDGE_PATH="${HOME}/Projects/folio-session-bridge-demo"
export FOLIO_SESSION_TARGETS_PATH="${HOME}/.folio/session-targets-demo.yaml"
export FOLIO_AGENT_AUTO=0

PORT="${PORT:-5174}"

# Pre-flight: all three demo DBs must exist.
missing=()
[ -f "$FOLIO_DB_PATH" ]    || missing+=("FOLIO_DB_PATH=$FOLIO_DB_PATH")
[ -f "$COUNCIL_DB_PATH" ]  || missing+=("COUNCIL_DB_PATH=$COUNCIL_DB_PATH")
[ -f "$FEEDBACK_DB_PATH" ] || missing+=("FEEDBACK_DB_PATH=$FEEDBACK_DB_PATH")
[ -f "$FOLIO_VAULT_OVERRIDE/_campaign/campaign.md" ] || \
    missing+=("FOLIO_VAULT_OVERRIDE=$FOLIO_VAULT_OVERRIDE")
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
  AION_LUMEN_PATH:  $AION_LUMEN_PATH
  VAULT_OVERRIDE:   $FOLIO_VAULT_OVERRIDE
  SESSION_BRIDGE:   $FOLIO_SESSION_BRIDGE_PATH
  SESSION_TARGETS:  $FOLIO_SESSION_TARGETS_PATH
  FOLIO_HOME_PLZ:   $FOLIO_HOME_PLZ
  Port:             $PORT
═══════════════════════════════════════════════════════════════
Real DBs (~/.folio/folio.db etc.) are not touched.
You can run a normal \`npm run dev\` on port 5173 in parallel.
EOF

exec npm run dev -- --host 127.0.0.1 --port "$PORT"
