// F.9 Block-3 — Vault-Layout-Group.
// Verschoben aus root +layout.server.ts: Vault-Gate + campaign-Loads leben jetzt
// nur unter (vault)/. Andere Module (Mail, Pipeline, Heute) booten ohne Vault.

import { loadCampaign, loadAllActs, loadAllChapters } from '$lib/server/vault/reader.js';
import { redirect } from '@sveltejs/kit';
import { access } from 'fs/promises';
import { join } from 'path';
import { getVaultPath } from '$lib/server/env.js';
import type { LayoutServerLoad } from './$types.js';

async function vaultExists(): Promise<boolean> {
	try {
		await access(join(getVaultPath(), '_campaign', 'campaign.md'));
		return true;
	} catch {
		return false;
	}
}

export const load: LayoutServerLoad = async () => {
	if (!(await vaultExists())) {
		throw redirect(302, '/setup');
	}
	const [campaign, acts, chapters] = await Promise.all([
		loadCampaign(),
		loadAllActs(),
		loadAllChapters()
	]);
	return { campaign, acts, chapters };
};
