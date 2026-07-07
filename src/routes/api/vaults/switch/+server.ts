import { json, error } from '@sveltejs/kit';
import { switchActiveVault } from '$lib/server/vault/switch.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const rawPath = typeof body.vaultPath === 'string' ? body.vaultPath : '';
	if (!rawPath.trim()) throw error(400, JSON.stringify({ message: 'vaultPath required' }));

	try {
		const result = await switchActiveVault(rawPath);
		return json({ ok: true, ...result });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Vault-Wechsel fehlgeschlagen';
		throw error(400, JSON.stringify({ message }));
	}
};
