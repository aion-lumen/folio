#!/usr/bin/env bash
# Leuchtfeuer daily collector runner (VPS, invoked by /etc/cron.d/leuchtfeuer as root).
# Sources the token env file, aggregates YESTERDAY's site logs (full day) and snapshots GitHub.
# Aggregate-only, no visitor storage. Best-effort: one failing site never aborts the rest.
set -uo pipefail

ENV_FILE=/etc/leuchtfeuer/env         # root:root 0600, holds LEUCHTFEUER_GH_PAT_* (never in this repo)
APP=/opt/leuchtfeuer                   # where collect_*.py are deployed
OUT=/var/lib/leuchtfeuer/metrics       # NOT web-exposed (deliberately not under /srv/aion-lumen)
SITES=(aion-lumen.ch frag-shifu.ch noblecause.ai mirhamed.ch)

# shellcheck disable=SC1090
set -a; [ -r "$ENV_FILE" ] && . "$ENV_FILE"; set +a

YESTERDAY=$(date -u -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -u -v-1d +%Y-%m-%d)
TODAY=$(date -u +%Y-%m-%d)

for s in "${SITES[@]}"; do
	python3 "$APP/collect_caddy.py" --site "$s" \
		--log "/var/log/caddy/$s.log" --out "$OUT" --date "$YESTERDAY" || true
done

python3 "$APP/collect_github.py" --out "$OUT" --date "$TODAY" || true
