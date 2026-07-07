import { createRequire } from 'node:module';
import { readFileSync } from 'fs';
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
	try {
		const raw = readFileSync(join(homedir(), '.folio', 'active-vault.json'), 'utf-8');
		const parsed = JSON.parse(raw) as { path?: string };
		const p = parsed.path?.trim();
		return p || null;
	} catch {
		return null;
	}
}

export function getVaultPath(): string {
	// 1) ~/.folio/active-vault.json — explicit user choice (switcher), survives Vite restart
	// 2) Live process.env (setup wizard hot-set)
	// 3) $env/dynamic/private snapshot from .env at server start
	const p = readActiveVaultFromDisk() ?? process.env.VAULT_PATH ?? kitEnv().VAULT_PATH;
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
	return kitEnv().FEEDBACK_DB_PATH
		?? join(homedir(), 'Projects/aion-lumen/multi-agent/state/feedback.db');
}

export function getFolioDbPath(): string {
	// Default lives outside the project tree so vite/chokidar does not watch it.
	// Watching state/folio.db-wal caused full page reloads on every validator write.
	return kitEnv().FOLIO_DB_PATH
		?? join(homedir(), '.folio/folio.db');
}

export function getMoveActionsPath(): string {
	return kitEnv().MOVE_ACTIONS_PATH
		?? join(homedir(), 'Projects/folio/config/move_actions.yaml');
}

/** Root of aion-lumen/multi-agent (Python pipeline). Override: AION_LUMEN_PATH */
export function getAionLumenPath(): string {
	return kitEnv().AION_LUMEN_PATH ?? join(homedir(), 'Projects/aion-lumen/multi-agent');
}

export function getCouncilDbPath(): string {
	return kitEnv().COUNCIL_DB_PATH ?? join(homedir(), '.council/council.db');
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

export function getLifeMailPath(): string {
	return kitEnv().LIFE_MAIL_PATH ?? join(homedir(), 'Projects/life-mail');
}

export function getHermesHomePath(): string {
	return kitEnv().HERMES_HOME_PATH ?? join(homedir(), '.hermes');
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
	return kitEnv().FOLIO_INBOX_PATH ?? join(homedir(), '.folio/inbox');
}

/** Idempotency ledger for imported document ids. */
export function getImportLedgerPath(): string {
	return join(homedir(), '.folio/import-ledger.json');
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
	return join(homedir(), '.folio/triage-log.jsonl');
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
	const plz = kitEnv().FOLIO_HOME_PLZ;
	if (!plz) return null;
	const latEnv = kitEnv().FOLIO_HOME_LAT;
	const lngEnv = kitEnv().FOLIO_HOME_LNG;
	const cityEnv = kitEnv().FOLIO_HOME_CITY;
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
