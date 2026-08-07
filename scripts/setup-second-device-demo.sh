#!/usr/bin/env bash
# Prepare the two-repository, data-isolated Folio demo on a fresh macOS machine.
# The setup is intentionally explicit and idempotent; it never asks for IMAP or
# provider credentials and never seeds the real databases.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MULTI_AGENT_REPO="${AION_LUMEN_PATH:-}"
CHECK_ONLY=0
SKIP_INSTALL=0
START_AFTER=0
DEMO_VAULT_PATH="${FOLIO_DEMO_VAULT_PATH:-/Users/Shared/folio-demo}"

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

usage() {
    cat <<'EOF'
Usage: bash scripts/setup-second-device-demo.sh [options]

Options:
  --multi-agent PATH  Path to the multi-agent-lab checkout
  --check-only        Validate prerequisites and paths; change nothing
  --skip-install      Do not run npm ci or install the Python venv
  --start             Start Folio after setup
  -h, --help          Show this help
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --multi-agent)
            [ $# -ge 2 ] || { echo "ERROR: --multi-agent needs a path" >&2; exit 2; }
            MULTI_AGENT_REPO="$2"
            shift 2
            ;;
        --check-only) CHECK_ONLY=1; shift ;;
        --skip-install) SKIP_INSTALL=1; shift ;;
        --start) START_AFTER=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
done

if [ -z "$MULTI_AGENT_REPO" ]; then
    for candidate in \
        "$REPO_ROOT/../multi-agent-lab" \
        "$REPO_ROOT/../aion-lumen/multi-agent"; do
        if [ -d "$candidate" ]; then
            MULTI_AGENT_REPO="$candidate"
            break
        fi
    done
fi

missing=()
for command_name in git node npm python3 make sqlite3; do
    command -v "$command_name" >/dev/null 2>&1 || missing+=("command:$command_name")
done
[ -d "$MULTI_AGENT_REPO" ] || missing+=("multi-agent:$MULTI_AGENT_REPO")
[ -d "$REPO_ROOT/.git" ] || missing+=("git-checkout:$REPO_ROOT")
[ -d "$MULTI_AGENT_REPO/.git" ] || missing+=("git-checkout:$MULTI_AGENT_REPO")
[ -f "$REPO_ROOT/package-lock.json" ] || missing+=("file:$REPO_ROOT/package-lock.json")
[ -f "$MULTI_AGENT_REPO/requirements.txt" ] || missing+=("file:$MULTI_AGENT_REPO/requirements.txt")
[ -f "$MULTI_AGENT_REPO/Makefile" ] || missing+=("file:$MULTI_AGENT_REPO/Makefile")
[ -f "$MULTI_AGENT_REPO/scripts/init_demo_dbs.sh" ] || \
    missing+=("file:$MULTI_AGENT_REPO/scripts/init_demo_dbs.sh")
[ -f "$MULTI_AGENT_REPO/tests/fixtures/imap/demo_quickstart.json" ] || \
    missing+=("file:$MULTI_AGENT_REPO/tests/fixtures/imap/demo_quickstart.json")
for schema_name in folio council feedback; do
    [ -f "$MULTI_AGENT_REPO/data/schemas/${schema_name}.schema.sql" ] || \
        missing+=("file:$MULTI_AGENT_REPO/data/schemas/${schema_name}.schema.sql")
done

if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: second-device demo preflight failed:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    echo "See docs/second-device-demo.md for the prerequisite steps." >&2
    exit 1
fi

MULTI_AGENT_REPO="$(cd "$MULTI_AGENT_REPO" && pwd)"
DEMO_VAULT_PATH="$(canonical_demo_vault_path "$DEMO_VAULT_PATH")"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
PYTHON_VERSION="$(python3 -c 'import platform; print(platform.python_version())')"
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "ERROR: Node.js 20+ required; found $(node --version)" >&2
    exit 1
fi
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' || {
    echo "ERROR: Python 3.11+ required; found $PYTHON_VERSION" >&2
    exit 1
}

echo "Folio second-device demo preflight"
echo "  Architecture:       $(uname -m)"
echo "  Folio:              $REPO_ROOT"
echo "  Folio commit:       $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
echo "  multi-agent:        $MULTI_AGENT_REPO"
echo "  multi-agent commit: $(git -C "$MULTI_AGENT_REPO" rev-parse --short HEAD)"
echo "  Node:               $(node --version)"
echo "  Python:             $PYTHON_VERSION"
echo "  Fixture SHA-256:    $(shasum -a 256 "$MULTI_AGENT_REPO/tests/fixtures/imap/demo_quickstart.json" | awk '{print $1}')"

if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "Preflight OK; no files changed."
    exit 0
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
    echo "Installing Folio dependencies..."
    (cd "$REPO_ROOT" && npm ci)

    if [ ! -x "$MULTI_AGENT_REPO/.venv/bin/python3" ]; then
        echo "Creating multi-agent Python environment..."
        python3 -m venv "$MULTI_AGENT_REPO/.venv"
    fi
    echo "Installing multi-agent dependencies..."
    "$MULTI_AGENT_REPO/.venv/bin/python3" -m pip install -r "$MULTI_AGENT_REPO/requirements.txt"
fi

PYTHON_BIN="$MULTI_AGENT_REPO/.venv/bin/python3"
if [ ! -x "$PYTHON_BIN" ]; then
    echo "ERROR: $PYTHON_BIN missing; rerun without --skip-install" >&2
    exit 1
fi

init_demo_db_from_static_schema() {
    local target="$1"
    local schema="$2"
    if [ -f "$target" ]; then
        return 0
    fi
    mkdir -p "$(dirname "$target")"
    sqlite3 "$target" < "$schema"
    echo "  Initialized $target from checked-in static schema"
}

# Create missing demo DBs ourselves from checked-in schemas. This deliberately
# avoids multi-agent's maintainer convenience fallback, which may inspect the
# schema of a real local DB when one exists.
echo "Initializing missing demo databases from static schemas..."
init_demo_db_from_static_schema \
    "${HOME}/.folio/folio-demo.db" \
    "$MULTI_AGENT_REPO/data/schemas/folio.schema.sql"
init_demo_db_from_static_schema \
    "${HOME}/.council/council-demo.db" \
    "$MULTI_AGENT_REPO/data/schemas/council.schema.sql"
init_demo_db_from_static_schema \
    "$MULTI_AGENT_REPO/state/feedback-demo.db" \
    "$MULTI_AGENT_REPO/data/schemas/feedback.schema.sql"

echo "Initializing and seeding isolated demo databases..."
make -C "$MULTI_AGENT_REPO" demo PYTHON="$PYTHON_BIN"

if [ ! -e "$DEMO_VAULT_PATH" ]; then
    echo "Creating neutral demo-vault runtime copy at $DEMO_VAULT_PATH..."
    mkdir -p "$(dirname "$DEMO_VAULT_PATH")"
    cp -R "$REPO_ROOT/templates/demo-vault" "$DEMO_VAULT_PATH"
elif [ ! -f "$DEMO_VAULT_PATH/_campaign/campaign.md" ]; then
    echo "ERROR: $DEMO_VAULT_PATH exists but is not a Folio demo vault" >&2
    exit 1
fi

echo ""
echo "Setup complete. Start the isolated demo with:"
echo "  AION_LUMEN_PATH=\"$MULTI_AGENT_REPO\" bash scripts/demo-server.sh"

if [ "$START_AFTER" -eq 1 ]; then
    export AION_LUMEN_PATH="$MULTI_AGENT_REPO"
    export FOLIO_DEMO_VAULT_PATH="$DEMO_VAULT_PATH"
    exec bash "$REPO_ROOT/scripts/demo-server.sh"
fi
