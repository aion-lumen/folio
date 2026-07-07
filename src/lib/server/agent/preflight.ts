import { getFolioAgentModel, getLmStudioBaseUrl } from '../env.js';

export interface TriagePreflight {
	ok: boolean;
	configured_model: string;
	resolved_model: string | null;
	available_models: string[];
	message: string;
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
	const { model, available } = await resolveTriageModel();

	if (available.length === 0) {
		return {
			ok: false,
			configured_model: configured,
			resolved_model: null,
			available_models: [],
			message: `LM Studio nicht erreichbar unter ${getLmStudioBaseUrl()}`
		};
	}

	if (!model) {
		return {
			ok: false,
			configured_model: configured,
			resolved_model: null,
			available_models: available,
			message: 'Kein Modell in LM Studio geladen'
		};
	}

	const fallback = model !== configured;
	return {
		ok: true,
		configured_model: configured,
		resolved_model: model,
		available_models: available,
		message: fallback
			? `Konfiguriertes Modell „${configured}" nicht geladen — nutze „${model}"`
			: `Modell „${model}" bereit`
	};
}
