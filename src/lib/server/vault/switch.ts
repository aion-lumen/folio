import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';
import { isDemoVaultPath } from '../env.js';
import { upsertVaultInRegistry, validateVaultPath } from './registry.js';

const FOLIO_DIR = join(homedir(), '.folio');
const ACTIVE_VAULT_FILE = join(FOLIO_DIR, 'active-vault.json');

/** Persist active vault without touching folio/.env (avoids Vite dev-server restart mid-switch). */
export async function writeActiveVaultFile(vaultPath: string): Promise<void> {
	await mkdir(FOLIO_DIR, { recursive: true });
	await writeFile(
		ACTIVE_VAULT_FILE,
		JSON.stringify(
			// `demo` scopes the mail/DB stores to *-demo.db (read by env.ts, env-independent).
			{ path: vaultPath, demo: isDemoVaultPath(vaultPath), switchedAt: new Date().toISOString() },
			null,
			2
		),
		'utf-8'
	);
}

export async function readActiveVaultFile(): Promise<string | null> {
	try {
		const raw = await readFile(ACTIVE_VAULT_FILE, 'utf-8');
		const parsed = JSON.parse(raw) as { path?: string };
		const p = parsed.path?.trim();
		return p || null;
	} catch {
		return null;
	}
}

/** Switch active vault at runtime. Does NOT write folio/.env — use for in-app switcher. */
export async function switchActiveVault(rawPath: string): Promise<{ path: string; name: string }> {
	const vaultPath = await validateVaultPath(rawPath);
	await writeActiveVaultFile(vaultPath);
	process.env.VAULT_PATH = vaultPath;
	await upsertVaultInRegistry(vaultPath);
	return { path: vaultPath, name: basename(vaultPath) };
}
