import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';
import matter from 'gray-matter';
import { getVaultPath } from '../env.js';
import type { VaultListEntry } from '$lib/types/vault.js';

export type { VaultListEntry };

const DEMO_VAULT_PATH = '/Users/Shared/folio-demo';

export interface VaultRegistryFile {
	paths: string[];
}

function registryPath(): string {
	return join(homedir(), '.folio', 'vaults.json');
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

async function isVault(p: string): Promise<boolean> {
	try {
		await access(join(p, '_campaign', 'campaign.md'));
		return true;
	} catch {
		return false;
	}
}

export async function readRegistry(): Promise<VaultRegistryFile> {
	try {
		const raw = await readFile(registryPath(), 'utf-8');
		const parsed = JSON.parse(raw) as VaultRegistryFile;
		if (!Array.isArray(parsed.paths)) return { paths: [] };
		return { paths: [...new Set(parsed.paths.filter((p) => typeof p === 'string' && p.trim()))] };
	} catch {
		return { paths: [] };
	}
}

async function writeRegistry(paths: string[]): Promise<void> {
	const dir = join(homedir(), '.folio');
	await mkdir(dir, { recursive: true });
	const unique = [...new Set(paths.filter(Boolean))];
	await writeFile(registryPath(), JSON.stringify({ paths: unique }, null, 2), 'utf-8');
}

/** Seed registry with active vault + demo if missing. */
export async function ensureRegistrySeeded(): Promise<string[]> {
	let active = '';
	try {
		active = getVaultPath();
	} catch {
		// VAULT_PATH not set — only seed demo if present.
	}

	const registry = await readRegistry();
	const paths = new Set(registry.paths);
	if (active) paths.add(active);
	if (await pathExists(DEMO_VAULT_PATH)) paths.add(DEMO_VAULT_PATH);

	const list = [...paths];
	if (list.length !== registry.paths.length || list.some((p, i) => p !== registry.paths[i])) {
		await writeRegistry(list);
	}
	return list;
}

export async function upsertVaultInRegistry(vaultPath: string): Promise<void> {
	const normalized = vaultPath.replace(/^~/, homedir());
	const registry = await readRegistry();
	if (!registry.paths.includes(normalized)) {
		await writeRegistry([normalized, ...registry.paths]);
	}
}

async function readVaultMetadata(vaultPath: string): Promise<Omit<VaultListEntry, 'active'>> {
	const name = basename(vaultPath);
	const campaignFile = join(vaultPath, '_campaign', 'campaign.md');

	if (!(await pathExists(campaignFile))) {
		return {
			path: vaultPath,
			name,
			title: name,
			currentAct: null,
			currentChapter: null,
			updated: null,
			exists: false
		};
	}

	try {
		const raw = await readFile(campaignFile, 'utf-8');
		const { data, content } = matter(raw);
		const h1 = content.match(/^#\s+(.+)/m);
		const title =
			(h1 ? h1[1].trim() : null) ??
			(typeof data.summary === 'string' ? data.summary : null) ??
			name;

		return {
			path: vaultPath,
			name,
			title,
			currentAct: typeof data.current_act === 'number' ? data.current_act : null,
			currentChapter: typeof data.current_chapter === 'number' ? data.current_chapter : null,
			updated: typeof data.updated === 'string' ? data.updated : null,
			exists: true
		};
	} catch {
		return {
			path: vaultPath,
			name,
			title: name,
			currentAct: null,
			currentChapter: null,
			updated: null,
			exists: false
		};
	}
}

export async function listKnownVaults(): Promise<{ active: string; vaults: VaultListEntry[] }> {
	const paths = await ensureRegistrySeeded();
	let active = '';
	try {
		active = getVaultPath();
	} catch {
		// no active vault
	}

	const vaults: VaultListEntry[] = [];
	for (const path of paths) {
		const existsOnDisk = await pathExists(path);
		if (!existsOnDisk) {
			vaults.push({
				path,
				name: basename(path),
				title: basename(path),
				currentAct: null,
				currentChapter: null,
				updated: null,
				exists: false,
				active: path === active
			});
			continue;
		}
		const meta = await readVaultMetadata(path);
		vaults.push({ ...meta, active: path === active });
	}

	// Active vault first, then vaults with campaign, then by name.
	vaults.sort((a, b) => {
		if (a.active !== b.active) return a.active ? -1 : 1;
		if (a.exists !== b.exists) return a.exists ? -1 : 1;
		return a.name.localeCompare(b.name, 'de');
	});

	return { active, vaults };
}

export async function validateVaultPath(rawPath: string): Promise<string> {
	const vaultPath = rawPath.replace(/^~/, homedir());
	if (!(await isVault(vaultPath))) {
		throw new Error(`Keine campaign.md unter ${vaultPath}/_campaign/ gefunden`);
	}
	return vaultPath;
}
