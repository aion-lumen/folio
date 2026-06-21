// F.9 Block-3 — Root-Layout-Server. Vault-Gate verschoben nach (vault)/+layout.server.ts.
// Root liefert global-needed vaultName für Header + Regelwerk für Action-Labels.

import { basename } from 'path';
import { getVaultPath } from '$lib/server/env.js';
import { loadRegelwerkValidated } from '$lib/server/regelwerk/loader.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async () => {
	let vaultName = 'vault';
	try {
		vaultName = basename(getVaultPath());
	} catch {
		// VAULT_PATH nicht gesetzt — Default-Name reicht, Folio läuft auch ohne Vault.
	}

	// Direktive 2026-05-26 Regelwerk-Zentralisierung: action_definitions +
	// priority_relevance + voice_consensus aus zentraler Quelle. Cross-Reference
	// active_priorities ↔ priority_relevance validates loud — wenn fail, sieht
	// User die SvelteKit-Error-Page und muss regelwerk.yaml oder
	// user_context.yaml synchronisieren.
	const regelwerk = loadRegelwerkValidated();

	return { vaultName, regelwerk };
};
