# Dependency security

Folio treats dependency findings by exploitability and supported execution path, not by the raw
number printed by `npm audit`.

CI runs `npm run audit:dependencies` and fails for advisories at **moderate severity or above**.
Compatible security updates are applied without `--force`; a downgrade or major-version override
requires its own compatibility review.

## Reviewed low-severity constraints

As of 2026-08-07, `npm audit` reports only these upstream-constrained low-severity paths:

- `cookie@0.6.0`, required by the latest stable `@sveltejs/kit@2.70.2`. The advisory concerns
  serialising attacker-controlled cookie names, paths, or domains. Folio does not construct those
  attributes from imported or user-controlled content. Upgrade when stable SvelteKit accepts a
  patched `cookie` release.
- `esbuild@0.27.7`, required by the Vite versions in the test/build toolchain. The advisory concerns
  the development server on Windows; it is not part of Folio's production runtime. Upgrade when the
  surrounding Vite/Vitest ranges accept `esbuild@0.28.1` without an override.

Re-run both `npm audit` and the complete check/test/build suite whenever either constraint changes.
