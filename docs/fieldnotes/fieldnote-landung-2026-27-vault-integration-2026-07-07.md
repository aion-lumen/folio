# Field-Note: Landung 2026/27 — Vault-Integration — 2026-07-07

**Direktive:** `direktive_gesamtplan_landung-2026-27.md` (Fable → Opus, 07.07.2026)
**Scope:** Security scharf schalten, P1–P8 als Folio-Objectives mergen, Job-Digest-Skript.

## Block A — Security

| Check | Ergebnis |
|---|---|
| `VAULT_PATH` in `folio/.env` | `~/Projects/life` (war `/Users/Shared/folio-demo`) |
| Hermes-Patches applied | `hermes-vault-jail-ebene2.patch` + `hermes-folio-toolset.patch` — beide reverse-check grün |
| Gateway | `127.0.0.1:8642` — health ok |
| Vault-scoped conversation | `folio-vault-20c775948a3c` (SHA256 von LIFE-Vault-Pfad) |
| Alte `folio-vault-chat`-Pointer | **nicht** in `~/.hermes/response_store.db` |
| `vault_root` in Folio-Hermes-Client | `client.ts` sendet `getVaultPath()` pro Request |

**Manuell durch der Steward (einmalig):**
- Browser localStorage `folio-chat` leeren (nicht vault-scoped)
- Im Folio-Chat „Neuer Chat" → `/api/hermes/reset` (frischer Thread)
- Live-Jail-Test im Chat: `read_file` auf Pfad ausserhalb Vault → denied; kein Terminal-Tool

## Block B — Kampagnen-Merge

P1–P8 in bestehende LIFE-Kampagne integriert (keine neue Kampagne):

| P | Objective | Kapitel |
|---|---|---|
| P1 Migrationsamt | `obj-01-08` | 01 Repositionierung |
| P2 Einkommensgleis | `obj-01-09` | 01 |
| P7 Kapital-Hebel | `obj-01-10` | 01 |
| Messpunkt W8 | `obj-02-06` | 02 Durchbruch |
| P6 Therapeutin-Pilot | `obj-02-07` | 02 |
| P3 Hauskauf-Wächter | `obj-04-01` | 04 Hauskauf |
| P4 Basel-Entscheid | `obj-04-02` | 04 |
| P5 Behandlungskontinuität | `obj-05-04` | 05 (neutral; Details in `restricted/gesundheit-parastoo.md`) |
| P8 Geparkt | `_campaign/zeitgeist.md` | — |

Aktualisiert: `campaign.md`, `zeitgeist.md`, Kapitel-Frontmatter + Fortschritts-Logs.

Recherchefragen (FsE, G-Bewilligung, BAföG, Versorgung Freiburg, BVG, Kündigungsfrist, SAP-Hub) als **`- [ ]`-Subtasks** in den jeweiligen Objectives — nicht als Web-Recherche in diesem Lauf.

**API-Verifikation:** `GET /api/vault` — alle 8 neuen Objectives geparst, keine fehlenden IDs.

## Block C — Job-Digest

- Neues Skript: `aion-lumen/multi-agent/scripts/job_digest.py`
- Lauf: `VAULT_PATH=~/Projects/life python3 scripts/job_digest.py` → 23 actionable Job-Mails
- Output: `~/Projects/life/internal/mail/job-digest.md`
- Rein lokal (SQLite read-only), kein LLM, kein Netz

## Explizit nicht in diesem Lauf

- Web-Recherche der 7 Fragen
- Pasche-Briefentwurf-Text
- Portalanmeldungen
- Job-Council-Bau
- CV-Session v2 Deliverables (Hays, Projektliste, Kanal-Assets)

## Smoke-Checkliste

- [x] Folio lädt LIFE-Vault (`/api/vault` → `current_chapter: 1`)
- [x] 8 neue Objectives im Parser
- [x] Job-Digest geschrieben
- [ ] der Steward: Browser localStorage + Live-Jail-Chat-Test
- [ ] der Steward: Folio Dashboard öffnen → Kapitel 01 → obj-01-08..10 sichtbar
