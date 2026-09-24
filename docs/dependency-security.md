# Dependency security

Folio treats dependency findings by exploitability and supported execution path, not by the raw
number printed by `npm audit`.

CI runs `npm run audit:dependencies` and fails for advisories at **moderate severity or above**.
Compatible security updates are applied without `--force`; a downgrade or major-version override
requires its own compatibility review.

## Release check — 25 September 2026

The v0.6.0-preview.1 lockfile was checked with `npm audit` on 25 September 2026: zero reported vulnerabilities at all severity levels. This is a dated dependency advisory check, not a guarantee of application security. CI continues to reject moderate or higher findings.

Earlier cookie/esbuild constraints documented for the August release no longer appear in this lockfile's audit. Re-run the audit and check/test/build suite when dependencies change.
