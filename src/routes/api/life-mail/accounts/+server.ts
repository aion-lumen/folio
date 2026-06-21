import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getLifeMailPath } from '$lib/server/env.js';

interface AccountEntry {
	name: string;
	displayName: string;
	host: string;
}

function parseAccountsToml(raw: string): AccountEntry[] {
	const accounts: AccountEntry[] = [];
	let current: Partial<AccountEntry> & { name?: string } = {};

	for (const rawLine of raw.split('\n')) {
		const line = rawLine.trim();
		if (line.startsWith('#') || !line) continue;

		const section = line.match(/^\[accounts\.([^\]]+)\]$/);
		if (section) {
			if (current.name && current.host) accounts.push(current as AccountEntry);
			current = { name: section[1], displayName: section[1], host: '' };
			continue;
		}
		const kv = line.match(/^(\w+)\s*=\s*"([^"]+)"/);
		if (kv && current.name) {
			if (kv[1] === 'display_name') current.displayName = kv[2];
			if (kv[1] === 'host') current.host = kv[2];
		}
	}
	if (current.name && current.host) accounts.push(current as AccountEntry);
	return accounts;
}

export async function GET() {
	const tomlPath = join(getLifeMailPath(), 'accounts.toml');
	try {
		const raw = await readFile(tomlPath, 'utf-8');
		return json({ accounts: parseAccountsToml(raw) });
	} catch {
		return json({ accounts: [] });
	}
}
