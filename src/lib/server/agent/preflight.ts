import {
	getFeedbackDbPath,
	getFolioAgentModel,
	getLmStudioBaseUrl,
	readActiveVaultMeta
} from '../env.js';

export interface VaultMailPreflight {
	vault_mode: 'real' | 'demo';
	vault_path: string | null;
	mail_store: string;
	/** Non-null when real IMAP is blocked (demo mode) — capability removal, not a warning. */
	imap_blocked_reason: string | null;
}

export interface TriagePreflight extends VaultMailPreflight {
	ok: boolean;
	configured_model: string;
	resolved_model: string | null;
	available_models: string[];
	message: string;
}

/** Active vault ↔ mail-store mapping + demo IMAP capability state. */
export function getVaultMailPreflight(): VaultMailPreflight {
	const { path, demo } = readActiveVaultMeta();
	return {
		vault_mode: demo ? 'demo' : 'real',
		vault_path: path,
		mail_store: getFeedbackDbPath(),
		imap_blocked_reason: demo
			? 'Demo-Vault aktiv — echter IMAP-Account gesperrt (nur --imap-fixture).'
			: null
	};
}

export async function listLmStudioModels(): Promise<string[]> {
	const base = getLmStudioBaseUrl();
	try {
		const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(5_000) });
		if (!res.ok) return [];
		const data = (await res.json()) as { data?: Array<{ id: string }> };
		return (data.data ?? []).map((m) => m.id).filter(Boolean);
	} catch {
		return [];
	}
}

/** Pick configured model if loaded, otherwise first available model. */
export async function resolveTriageModel(): Promise<{ model: string | null; available: string[] }> {
	const configured = getFolioAgentModel();
	const available = await listLmStudioModels();
	if (available.length === 0) return { model: null, available };
	if (available.includes(configured)) return { model: configured, available };
	return { model: available[0], available };
}

export async function checkTriagePreflight(): Promise<TriagePreflight> {
	const configured = getFolioAgentModel();
	const vaultMail = getVaultMailPreflight();
	const { model, available } = await resolveTriageModel();

	if (available.length === 0) {
		return {
			...vaultMail,
			ok: false,
			configured_model: configured,
			resolved_model: null,
			available_models: [],
			message: `LM Studio nicht erreichbar unter ${getLmStudioBaseUrl()}`
		};
	}

	if (!model) {
		return {
			...vaultMail,
			ok: false,
			configured_model: configured,
			resolved_model: null,
			available_models: available,
			message: 'Kein Modell in LM Studio geladen'
		};
	}

	const fallback = model !== configured;
	return {
		...vaultMail,
		ok: true,
		configured_model: configured,
		resolved_model: model,
		available_models: available,
		message: fallback
			? `Konfiguriertes Modell „${configured}" nicht geladen — nutze „${model}"`
			: `Modell „${model}" bereit`
	};
}
