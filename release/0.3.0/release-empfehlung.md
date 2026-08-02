# Release-Empfehlung v0.3.0 — G1 (Lauf #2)

**Datum:** 2026-07-09 · **Trigger:** 08b gebaut/verifiziert/gemergt · **Kimi-Schleife:** ja (volle Gesamtreview, als Verifikations-Test)

## Version
**folio v0.3.0** + **multi-agent-lab v0.3.0** (semver **minor**: Council-Trennung + Eval-Infrastruktur; Vault-Scoping als Bugfix-Anteil). Kein Merge nötig — 08b ist auf main; G2 = Version-Bump + CHANGELOG + Tag + Push.

## Änderungsliste
- Vault-Scoping für Mails/DB (Demo-Isolation, konto-a/b, Demo-IMAP-Guard)
- Council-Trennung (`/council`→404 im Demo, immo-only Detail-Pillen, „→Übernommen" an Registrierung gekoppelt, Server-409)
- Golden Labels (`demo_labels.yaml`), `make eval-full` (40-Mail-E2E, interne Kennzahl), `inject-eval-numbers.ts`

## Review-Befunde — nach Triangulation

**Reviewer-Wechsel Kimi → ChatGPT (Test in diesem Lauf).** Kimi produzierte 3 halluzinierte Impressum-Blocker (alle von dir live widerlegt) und verpasste die echten Konsistenzfehler. ChatGPT (mit Anti-Halluzinations-Regel + Konsistenz-only-Scope): **null Fehlalarme, zwei echte Befunde.** Details: `kimi-triangulation.md` (Kimi-Nachlese) + `chatgpt-triangulation.md`.

**Kein Blocker.**

**Zwei echte Wichtig-Punkte (Außenflächen-Konsistenz, ChatGPT):**
1. **Versions-Angaben veraltet** (W1) — README (`folio/README.md:23`) + aion-lumen.ch/folio (6× in `index.html`) zeigen „v0.1.0 public preview", während die Repos auf 0.2.0 getaggt sind. Nachzug nötig (auf 0.3.0 im Zuge dieses Release). **Entscheidung nötig:** bewusste „public preview"-Positionierung oder vergessener Nachzug?
2. **v1-strict vs. v1** (W2) — Site-Claim „v1-strict — 93 %", aber `results-2026-07-09.json` steht auf `variant: "v1"`. Entweder Site auf „v1" korrigieren, oder results mit dem 3-Modell-Lauf aktualisieren (falls der v1-strict als beste Variante liefert). **Hängt am ausstehenden 3-Modell-Lauf.**

**Kimi-Fehlalarme (alle widerlegt, kein Handlungsbedarf):** frag-shifu/aion-lumen/mirhamed Impressum sind live (von dir + ChatGPT bestätigt). eval-full „leer" = nur Output-Ordner, Skript existiert.

**Zwei Doku-Empfehlungen (aus Kimi W3/W5, weiterhin sinnvoll → Export A):** Council-Trennung + Demo-IMAP-Guard in README dokumentieren.

**Zahlen-Regel eingehalten:** Triage (14 Fixtures) öffentlich, eval-full intern, keine Vermischung (beide Reviewer bestätigen). Keine Außenzahl-Änderung in 0.3.0.

## Verifikations-Test (dein Ziel) — Ergebnis
✅ **Zwei Erkenntnisse:** (a) Kimi ist als Reviewer unzuverlässig (halluziniert Negativbefunde) → Wechsel zu ChatGPT. (b) Der Workflow selbst funktioniert: die Triangulation fing alle Fehlalarme ab, und der neue Reviewer förderte zwei echte Konsistenzfehler zutage (veraltete Versionsangabe, v1/v1-strict-Mismatch).

## Umsetzung (Phase 5, vor G2)
1. CHANGELOG [0.3.0] (Entwurf steht), package.json + pyproject 0.3.0.
2. **Versions-Nachzug** (W1): README + aion-lumen.ch/folio v0.1.0 → aktuell — nach deiner Entscheidung.
3. **v1/v1-strict** (W2): mit 3-Modell-Lauf klären.
4. README-Absätze Council + Demo-IMAP (Export A).
5. Screenshots 08b — Aufnahme via ChatGPT/Afschin, **PII-Gegenprüfung cowork vor G1**.

## Offene Entscheidungen für dich (G1)
1. **Freigabe** der Empfehlung?
2. **v0.1.0-Angaben** (W1): bewusst „public preview" oder auf aktuellen Stand nachziehen?
3. **Wichtig-Punkte** in 0.3.0 miterledigen oder ins Backlog (Import-Dateien liegen bereit)?
4. **Reviewer dauerhaft auf ChatGPT** umstellen (Skill-Update)?

## Info (kein Blocker)
- 08c-Punkte (API-Guard, 4c-Pillen, Council-Extraktion) bleiben bewusst außen — kein Scope-Zuwachs.
- Prozess-Lehre: Kimi-Direktive nächste Runde um „live deployt?"-Teil ergänzen (B2/W4 zeigen: Repo ≠ live).

---
**G1: Bitte Freigabe · Änderungswünsche · Stopp.**
