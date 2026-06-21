import { redirect, error } from '@sveltejs/kit';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types.js';

const DEMO_VAULT_TARGET = join(process.env.HOME!, 'Projects', 'life-demo');
const ENV_PATH = join(process.cwd(), '.env');

async function copyDemoVault(): Promise<void> {
	const templateDir = join(process.cwd(), 'templates', 'demo-vault');
	await copyDir(templateDir, DEMO_VAULT_TARGET);
}

async function copyDir(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDir(srcPath, destPath);
		} else {
			const content = await readFile(srcPath, 'utf-8');
			await writeFile(destPath, content, 'utf-8');
		}
	}
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

export const POST: RequestHandler = async () => {
	try {
		await copyDemoVault();
		await updateEnvVaultPath(DEMO_VAULT_TARGET);
	} catch (e) {
		throw error(500, e instanceof Error ? e.message : 'Demo vault setup failed');
	}
	throw redirect(302, '/?setup=demo');
};
