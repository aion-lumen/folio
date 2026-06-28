import { redirect, fail } from '@sveltejs/kit';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import type { Actions } from './$types.js';

// Neutral path (no home dir / clear name): keeps the absolute path out of
// Hermes tool-call screenshots. /Users/Shared is a standard, writable macOS
// location with no username in the path.
const DEMO_VAULT_TARGET = '/Users/Shared/folio-demo';
const ENV_PATH = join(process.cwd(), '.env');

async function copyDir(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDir(srcPath, destPath);
		} else {
			await writeFile(destPath, await readFile(srcPath, 'utf-8'), 'utf-8');
		}
	}
}

async function copyDemoVault(): Promise<void> {
	await copyDir(join(process.cwd(), 'templates', 'demo-vault'), DEMO_VAULT_TARGET);
}

async function updateEnvVaultPath(vaultPath: string): Promise<void> {
	let envContent = '';
	try {
		envContent = await readFile(ENV_PATH, 'utf-8');
	} catch {
		// .env doesn't exist yet
	}
	if (/^VAULT_PATH=/m.test(envContent)) {
		envContent = envContent.replace(/^VAULT_PATH=.*/m, `VAULT_PATH=${vaultPath}`);
	} else {
		envContent += `\nVAULT_PATH=${vaultPath}`;
	}
	await writeFile(ENV_PATH, envContent, 'utf-8');
}

// Form action (replaces the old POST +server.ts). Using a page action means a
// plain GET /setup/demo renders the confirmation page instead of returning 405.
export const actions: Actions = {
	default: async () => {
		try {
			await copyDemoVault();
			await updateEnvVaultPath(DEMO_VAULT_TARGET);
			// Quickstart fix: make the new vault visible to the *running* process.
			// `vite preview` does not reload .env, and getVaultPath() reads
			// $env/dynamic/private (== process.env). Set it directly so /vault is
			// reachable immediately — no server restart needed.
			process.env.VAULT_PATH = DEMO_VAULT_TARGET;
		} catch (e) {
			return fail(500, { message: e instanceof Error ? e.message : 'Demo vault setup failed' });
		}
		throw redirect(303, '/?setup=demo');
	}
};
