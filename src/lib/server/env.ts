import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

/** SvelteKit private env; empty record when running outside Kit (e.g. eval:triage). */
function kitEnv(): Record<string, string | undefined> {
	try {
		return require('$env/dynamic/private').env as Record<string, string | undefined>;
	} catch {
		return {};
	}
}

function readActiveVaultFromDisk(): string | null {
	return readActiveVaultMeta().path;
}

/** True for the bundled/shared demo vaults (path-based fallback when no explicit flag). */
export function isDemoVaultPath(p: string | null | undefined): boolean {
	if (!p) return false;
	return p.includes('demo-vault') || p.includes('folio-demo');
}

/**
 * Active vault + whether it is a demo vault. The mail/DB stores are scoped off this
 * (env-independent, unlike kitEnv() which does not surface demo-server.sh exports).
 * `demo` is the explicit flag written by the switcher, falling back to a path heuristic
 * so pre-existing active-vault.json files (no flag) still scope correctly.
 */
export function readActiveVaultMeta(): {
	path: string | null;
	demo: boolean;
	council: boolean;
	modules: Readonly<Record<string, boolean>>;
} {
	try {
		const raw = readFileSync(join(homedir(), '.folio', 'active-vault.json'), 'utf-8');
		const parsed = JSON.parse(raw) as {
			path?: string;
			demo?: boolean;
			council?: boolean;
			modules?: Record<string, unknown>;
		};
		const p = parsed.path?.trim() || null;
		const modules: Record<string, boolean> = {};
		if (parsed.modules && typeof parsed.modules === 'object' && !Array.isArray(parsed.modules)) {
			for (const [id, enabled] of Object.entries(parsed.modules)) {
				if (/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) && typeof enabled === 'boolean') {
					modules[id] = enabled;
				}
			}
		}
		// `council` is opt-in (Default AUS): only an explicit `true` registers Council on a
		// real vault. Mirrored 1:1 in the Python pipeline (multi-agent/scripts/council_state.py);
		// a cross-language parity test locks the two against divergence.
		return {
			path: p,
			demo: parsed.demo === true || isDemoVaultPath(p),
			council: parsed.council === true,
			modules
		};
	} catch {
		return { path: null, demo: false, council: false, modules: {} };
	}
}

/** True when the active vault is a demo vault → stores must resolve to *-demo.db. */
export function isDemoVaultActive(): boolean {
	// A process-scoped override is used by hermetic evals and the isolated demo
	// launcher. It must beat a persisted real-vault selection without rewriting it.
	const override = process.env.FOLIO_VAULT_OVERRIDE;
	if (override) return isDemoVaultPath(override);
	return readActiveVaultMeta().demo;
}

export function getVaultPath(): string {
	// 0) FOLIO_VAULT_OVERRIDE — process-scoped override for hermetic evals and the isolated
	//    demo launcher. It forces the vault regardless of active-vault.json, WITHOUT writing
	//    user state.
	// 1) ~/.folio/active-vault.json — explicit user choice (switcher), survives Vite restart
	// 2) Live process.env (setup wizard hot-set)
	// 3) $env/dynamic/private snapshot from .env at server start
	const p =
		process.env.FOLIO_VAULT_OVERRIDE ??
		readActiveVaultFromDisk() ??
		process.env.VAULT_PATH ??
		kitEnv().VAULT_PATH;
	if (!p) throw new Error('VAULT_PATH not set');
	return p;
}

export function getHermesApiUrl(): string {
	// 127.0.0.1, not localhost: the gateway binds IPv4 only, and Node may resolve
	// `localhost` to ::1 (IPv6) first → intermittent ECONNREFUSED / "fetch failed".
	return kitEnv().HERMES_API_URL ?? 'http://127.0.0.1:8642';
}

// F.9 — Lazy-Read ~/.hermes/.env wenn API_SERVER_KEY nicht im Vite-Process-Env steht.
// Folio's vite-shell hat den Key nur wenn explizit exportiert vor `npm run dev`.
// loadHermesEnvVars() liest die Datei einmalig, cached. Read-only auf .env (Constraint).
let _hermesEnvCache: Record<string, string> | null = null;
export function loadHermesEnvVars(): Record<string, string> {
	if (_hermesEnvCache) return _hermesEnvCache;
	try {
		const content = readFileSync(join(getHermesHomePath(), '.env'), 'utf-8');
		const out: Record<string, string> = {};
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m) {
				let value = m[2];
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1);
				}
				out[m[1]] = value;
			}
		}
		_hermesEnvCache = out;
		return out;
	} catch {
		_hermesEnvCache = {};
		return _hermesEnvCache;
	}
}

export function getHermesApiKey(): string {
	// F.7-Bugfix: API_SERVER_KEY ist canonical per hermes-agent config.
	// HERMES_API_KEY-Fallback für externe Cloud-API-Settings.
	// F.9 Fallback: lade ~/.hermes/.env wenn weder env noch process.env gesetzt sind.
	let k = kitEnv().API_SERVER_KEY ?? kitEnv().HERMES_API_KEY;
	if (!k) {
		const file = loadHermesEnvVars();
		k = file.API_SERVER_KEY ?? file.HERMES_API_KEY;
	}
	if (!k) throw new Error('API_SERVER_KEY (or HERMES_API_KEY) not set in env or ~/.hermes/.env');
	return k;
}

export function getFeedbackDbPath(): string {
	// Vault-scoped: a demo vault binds to the demo mail store (never the real feedback.db).
	if (isDemoVaultActive()) return join(getAionLumenPath(), 'state/feedback-demo.db');
	return process.env.FEEDBACK_DB_PATH
		?? kitEnv().FEEDBACK_DB_PATH
		?? join(homedir(), 'Projects/aion-lumen/multi-agent/state/feedback.db');
}

export function getFolioDbPath(): string {
	// Default lives outside the project tree so vite/chokidar does not watch it.
	// Watching state/folio.db-wal caused full page reloads on every validator write.
	if (isDemoVaultActive()) return join(homedir(), '.folio/folio-demo.db');
	return process.env.FOLIO_DB_PATH
		?? kitEnv().FOLIO_DB_PATH
		?? join(homedir(), '.folio/folio.db');
}

/** Runtime-only Session Relay files. Never stored in the repository or vault. */
export function getSessionExchangePath(): string {
	if (isDemoVaultActive()) return join(homedir(), '.folio', 'session-exchange-demo');
	return process.env.FOLIO_SESSION_EXCHANGE_PATH
		?? kitEnv().FOLIO_SESSION_EXCHANGE_PATH
		?? join(homedir(), '.folio', 'session-exchange');
}

export function getMoveActionsPath(): string {
	return kitEnv().MOVE_ACTIONS_PATH
		?? join(homedir(), 'Projects/folio/config/move_actions.yaml');
}

/** Sources whose imports may auto-commit (source ∈ list). Override: FOLIO_TRUSTED_SOURCES_PATH */
export function getTrustedSourcesPath(): string {
	return process.env.FOLIO_TRUSTED_SOURCES_PATH
		?? kitEnv().FOLIO_TRUSTED_SOURCES_PATH
		?? join(homedir(), 'Projects/folio/config/trusted_sources.yaml');
}

/** Root of aion-lumen/multi-agent (Python pipeline). Override: AION_LUMEN_PATH */
export function getAionLumenPath(): string {
	return process.env.AION_LUMEN_PATH
		?? kitEnv().AION_LUMEN_PATH
		?? join(homedir(), 'Projects/aion-lumen/multi-agent');
}

/**
 * True when Council is registered for the active vault.
 * Demo vaults NEVER register Council. On a real vault Council is opt-in via
 * `"council": true` in active-vault.json (Default AUS — P0 immo/council-Move-
 * Entkopplung 2026-07-12). Mirrored in multi-agent/scripts/council_state.py.
 */
export function isCouncilRegistered(): boolean {
	if (isDemoVaultActive()) return false;
	return readActiveVaultMeta().council;
}

/** Vault opt-in for optional modules. Unknown and malformed entries are denied. */
export function isVaultModuleEnabled(moduleId: string): boolean {
	return readActiveVaultMeta().modules[moduleId] === true;
}

export function getCouncilDbPath(): string | null {
	// Aufgabe 4(b): a demo vault does NOT register Council — capability removal at the
	// data-access layer (not display filtering). null ⇒ readers return empty, no council.
	if (!isCouncilRegistered()) return null;
	return process.env.COUNCIL_DB_PATH
		?? kitEnv().COUNCIL_DB_PATH
		?? join(homedir(), '.council/council.db');
}

export function getCouncilConfigPath(): string {
	return kitEnv().COUNCIL_CONFIG_PATH ?? join(homedir(), 'Projects/aion-lumen/council/config');
}

// Demo/presentation flag: when HIDE_COUNCIL is set, the pipeline page hides all
// Council-specific UI (dataflow lane, lens panel/progress, campaign track, council
// run rows) so a Council-free mail-only screenshot can be taken. Off by default.
export function getHideCouncil(): boolean {
	return kitEnv().HIDE_COUNCIL === '1' || kitEnv().HIDE_COUNCIL === 'true';
}

/** Emergency stop for every optional module. This always wins over registration. */
export function areModulesDisabled(): boolean {
	const value = process.env.FOLIO_MODULES_DISABLED ?? kitEnv().FOLIO_MODULES_DISABLED ?? '';
	return value === '1' || value === 'true';
}

/** Comma-separated per-module emergency stops. Unknown ids are harmless and remain denied. */
export function getDisabledModuleIds(): ReadonlySet<string> {
	const value = process.env.FOLIO_DISABLED_MODULES ?? kitEnv().FOLIO_DISABLED_MODULES ?? '';
	return new Set(
		value
			.split(',')
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean)
	);
}

export function getLifeMailPath(): string {
	return kitEnv().LIFE_MAIL_PATH ?? join(homedir(), 'Projects/life-mail');
}

export function getHermesHomePath(): string {
	return kitEnv().HERMES_HOME_PATH ?? join(homedir(), '.hermes');
}

/**
 * Manifest controlling which fixed context sources Folio reads for Hermes.
 * A vault-local manifest may narrow or customize context; it cannot grant new
 * filesystem capabilities because the schema exposes booleans, not source paths.
 */
export function getHermesContextPath(): string {
	const override =
		process.env.FOLIO_HERMES_CONTEXT_PATH ?? kitEnv().FOLIO_HERMES_CONTEXT_PATH;
	if (override) return override;
	const vaultManifest = join(getVaultPath(), 'hermes-context.yaml');
	if (existsSync(vaultManifest)) return vaultManifest;
	if (isDemoVaultActive()) {
		const bundledDemoManifest = join(
			process.cwd(),
			'templates',
			'demo-vault',
			'hermes-context.yaml'
		);
		if (existsSync(bundledDemoManifest)) return bundledDemoManifest;
	}
	return join(process.cwd(), 'config', 'hermes-context.yaml');
}

/** Credential-free per-device routing declaration. The file may select only
 * registered Hermes profile/model identifiers; it never carries commands. */
export function getModelRoutingPath(): string {
	const override = process.env.FOLIO_MODEL_ROUTING_PATH ?? kitEnv().FOLIO_MODEL_ROUTING_PATH;
	if (override) return override;
	return join(homedir(), '.folio', 'model-routing.yaml');
}

export function getRegelwerkPath(): string {
	return kitEnv().REGELWERK_PATH ?? join(getAionLumenPath(), 'config/regelwerk.yaml');
}

export function getUserContextPath(): string {
	return kitEnv().USER_CONTEXT_PATH ?? join(getAionLumenPath(), 'config/user_context.yaml');
}

export function getPythonBinPath(): string {
	return kitEnv().PYTHON_BIN_PATH ?? join(getAionLumenPath(), '.venv/bin/python3');
}

/** Staging inbox for Folio Interchange Format v1 (outside vault). */
export function getInboxPath(): string {
	return process.env.FOLIO_INBOX_PATH
		?? kitEnv().FOLIO_INBOX_PATH
		?? join(homedir(), isDemoVaultActive() ? '.folio/demo-inbox' : '.folio/inbox');
}

/** Idempotency ledger for imported document ids. */
export function getImportLedgerPath(): string {
	return join(
		homedir(),
		isDemoVaultActive() ? '.folio/import-ledger-demo.json' : '.folio/import-ledger.json'
	);
}

/** LM Studio base URL for Folio inbox triage agent. */
export function getLmStudioBaseUrl(): string {
	return (
		process.env.LM_STUDIO_BASE_URL ??
		kitEnv().LM_STUDIO_BASE_URL ??
		'http://127.0.0.1:1234'
	);
}

/** Default model for inbox triage (override after eval:triage). */
export function getFolioAgentModel(): string {
	return process.env.FOLIO_AGENT_MODEL ?? kitEnv().FOLIO_AGENT_MODEL ?? 'qwen3-30b-a3b-thinking-2507';
}

/** Minimum confidence for auto-creating objectives from triage. */
export function getFolioAgentConfidence(): number {
	const raw = process.env.FOLIO_AGENT_CONFIDENCE ?? kitEnv().FOLIO_AGENT_CONFIDENCE ?? '0.8';
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : 0.8;
}

/** When true, inbox scan triggers LLM triage automatically. */
export function getFolioAgentAuto(): boolean {
	const v = process.env.FOLIO_AGENT_AUTO ?? kitEnv().FOLIO_AGENT_AUTO ?? '';
	return v === '1' || v === 'true';
}

/** Audit log for triage auto-decisions (JSONL). */
export function getTriageLogPath(): string {
	return join(
		homedir(),
		isDemoVaultActive() ? '.folio/triage-log-demo.jsonl' : '.folio/triage-log.jsonl'
	);
}

/** Cached LLM assessments keyed by file content hash. */
export function getTriageCachePath(): string {
	return join(homedir(), '.folio/triage-cache.json');
}

// 2026-05-25 Block 3 — Wohnort-PLZ für Distance-Anzeige im DetailPanel.
// Set FOLIO_HOME_PLZ (+ optional LAT/LNG/CITY) or leave unset for no distance pill.

export interface HomePlz {
	plz: string;
	lat: number;
	lng: number;
	city: string;
}

export function getHomePlz(): HomePlz | null {
	const plz = process.env.FOLIO_HOME_PLZ ?? kitEnv().FOLIO_HOME_PLZ;
	if (!plz) return null;
	const latEnv = process.env.FOLIO_HOME_LAT ?? kitEnv().FOLIO_HOME_LAT;
	const lngEnv = process.env.FOLIO_HOME_LNG ?? kitEnv().FOLIO_HOME_LNG;
	const cityEnv = process.env.FOLIO_HOME_CITY ?? kitEnv().FOLIO_HOME_CITY;
	if (latEnv && lngEnv) {
		return {
			plz,
			lat: parseFloat(latEnv),
			lng: parseFloat(lngEnv),
			city: cityEnv ?? plz
		};
	}
	return null;
}
