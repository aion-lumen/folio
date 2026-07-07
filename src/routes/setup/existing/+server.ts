import { json, error, redirect } from '@sveltejs/kit';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types.js';
import { switchActiveVault } from '$lib/server/vault/switch.js';

const ENV_PATH = join(process.cwd(), '.env');

export const POST: RequestHandler = async ({ request }) => {
	const { vaultPath: rawPath } = await request.json();
	if (!rawPath) throw error(400, 'vaultPath required');

	let vaultPath: string;
	try {
		const result = await switchActiveVault(rawPath);
		vaultPath = result.path;
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Ungültiger Vault-Pfad';
		throw error(400, JSON.stringify({ message }));
	}

	let envContent = '';
	try {
		envContent = await readFile(ENV_PATH, 'utf-8');
	} catch {
		// .env doesn't exist
	}

	if (/^VAULT_PATH=/m.test(envContent)) {
		envContent = envContent.replace(/^VAULT_PATH=.*/m, `VAULT_PATH=${vaultPath}`);
	} else {
		envContent += `\nVAULT_PATH=${vaultPath}`;
	}
	await writeFile(ENV_PATH, envContent, 'utf-8');
	// Make the vault visible to the running process without a restart
	// (vite preview does not reload .env; getVaultPath() reads process.env).
	process.env.VAULT_PATH = vaultPath;

	throw redirect(302, '/?setup=existing');
};
