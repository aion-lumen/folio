import { env } from '$env/dynamic/private';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export function getVaultPath(): string {
	// Read process.env first (live), falling back to $env/dynamic/private (a
	// startup snapshot from .env). The setup wizard sets process.env.VAULT_PATH
	// at runtime, so the freshly created/linked vault is reachable without a
	// server restart; the snapshot still covers a normal restart where .env holds it.
	const p = process.env.VAULT_PATH ?? env.VAULT_PATH;
	if (!p) throw new Error('VAULT_PATH not set');
	return p;
}

export function getHermesApiUrl(): string {
	// 127.0.0.1, not localhost: the gateway binds IPv4 only, and Node may resolve
	// `localhost` to ::1 (IPv6) first → intermittent ECONNREFUSED / "fetch failed".
	return env.HERMES_API_URL ?? 'http://127.0.0.1:8642';
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
	let k = env.API_SERVER_KEY ?? env.HERMES_API_KEY;
	if (!k) {
		const file = loadHermesEnvVars();
		k = file.API_SERVER_KEY ?? file.HERMES_API_KEY;
	}
	if (!k) throw new Error('API_SERVER_KEY (or HERMES_API_KEY) not set in env or ~/.hermes/.env');
	return k;
}

export function getFeedbackDbPath(): string {
	return env.FEEDBACK_DB_PATH
		?? join(homedir(), 'Projects/aion-lumen/multi-agent/state/feedback.db');
}

export function getFolioDbPath(): string {
	// Default lives outside the project tree so vite/chokidar does not watch it.
	// Watching state/folio.db-wal caused full page reloads on every validator write.
	return env.FOLIO_DB_PATH
		?? join(homedir(), '.folio/folio.db');
}

export function getMoveActionsPath(): string {
	return env.MOVE_ACTIONS_PATH
		?? join(homedir(), 'Projects/folio/config/move_actions.yaml');
}

/** Root of aion-lumen/multi-agent (Python pipeline). Override: AION_LUMEN_PATH */
export function getAionLumenPath(): string {
	return env.AION_LUMEN_PATH ?? join(homedir(), 'Projects/aion-lumen/multi-agent');
}

export function getCouncilDbPath(): string {
	return env.COUNCIL_DB_PATH ?? join(homedir(), '.council/council.db');
}

export function getCouncilConfigPath(): string {
	return env.COUNCIL_CONFIG_PATH ?? join(homedir(), 'Projects/aion-lumen/council/config');
}

export function getLifeMailPath(): string {
	return env.LIFE_MAIL_PATH ?? join(homedir(), 'Projects/life-mail');
}

export function getHermesHomePath(): string {
	return env.HERMES_HOME_PATH ?? join(homedir(), '.hermes');
}

export function getRegelwerkPath(): string {
	return env.REGELWERK_PATH ?? join(getAionLumenPath(), 'config/regelwerk.yaml');
}

export function getUserContextPath(): string {
	return env.USER_CONTEXT_PATH ?? join(getAionLumenPath(), 'config/user_context.yaml');
}

export function getPythonBinPath(): string {
	return env.PYTHON_BIN_PATH ?? join(getAionLumenPath(), '.venv/bin/python3');
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
	const plz = env.FOLIO_HOME_PLZ;
	if (!plz) return null;
	const latEnv = env.FOLIO_HOME_LAT;
	const lngEnv = env.FOLIO_HOME_LNG;
	const cityEnv = env.FOLIO_HOME_CITY;
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
