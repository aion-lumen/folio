# Cowork-Vorabcheck · v0.4.0 (vor ChatGPT-Review)

**Datum:** 2026-07-10 · Sicherheits-/Markenversprechen-Vorabprüfung durch cowork (Pflicht, entlastet Review).

## F1 — Markenversprechen „0 externe Calls / kein Client-Tracking" ✅
`CardLeuchtfeuer.svelte` + `src/routes/leuchtfeuer/` enthalten **keinen** externen fetch/script/cookie/analytics-Aufruf. Karte liest nur lokal `~/.folio/metrics/`. Markenversprechen gehalten.

## F2a — Kein Token im Repo ✅
Kein hardcodiertes `ghp_`/`github_pat_`/Bearer-Token in `ops/leuchtfeuer/`. Token nur als **Env-Name** referenziert (`LEUCHTFEUER_GH_PAT_AION`, `_NOBLECAUSE`), gelesen via `os.environ.get(env_name)`. `run-collectors.sh` kommentiert Env-Datei als „root:root 0600, never in this repo". Konsistent mit Direktiv-Verbot (Afschin legt PAT an, CC referenziert nur Namen).

## F2b — Keine echte PII in Fixtures ✅
Parser (`collect_caddy.py`): IPs sind bereits von Caddy `ip_mask` maskiert; Collector hasht zusätzlich (masked-IP + UA) für Uniques, **speichert nie die Adresse**. Test-Fixtures nutzen `1.2.3.0` (maskierte Beispiel-IP, letztes Oktett 0) — keine realen IPs.

## Ergebnis
F1 + F2 vorab bestätigt. Der ChatGPT-Review dient damit v.a. als **unabhängige Bestätigung** + dem eigentlichen Substanzpunkt **F3 (Privacy-Text-Konsistenz der 4 Sites)**.
