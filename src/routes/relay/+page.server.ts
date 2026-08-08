import { fail } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import {
	approveRelayEgress,
	getRelayPayloadForReview,
	listRelayCases,
	shareRelayCase,
	stageRelayCase
} from '$lib/server/relay/store.js';
import { DEMO_CAREER_TARGET, loadSessionTargets } from '$lib/server/relay/targets.js';
import type { Actions, PageServerLoad } from './$types.js';

function ensureDemoCase(): void {
	if (!isDemoVaultActive()) return;
	if (listRelayCases().some((item) => item.source_ref === 'demo:career-interview')) return;
	stageRelayCase({
		domain: 'career',
		source_kind: 'mail',
		source_ref: 'demo:career-interview',
		subject: 'Einladung zum zweiten Gespräch',
		body: `Guten Tag Alex\n\nwir möchten Sie gerne zu einem zweiten Gespräch einladen. Wären Dienstag um 10:00 Uhr oder Mittwoch um 14:00 Uhr für Sie möglich?\n\nFreundliche Grüsse\nMara Keller`,
		capability: 'reply_draft',
		data_classes: ['mail_metadata', 'mail_body', 'memory_context'],
		target: DEMO_CAREER_TARGET
	});
}

export const load: PageServerLoad = async () => {
	ensureDemoCase();
	const targets = loadSessionTargets();
	const labels = Object.fromEntries(targets.map((target) => [target.id, target.label]));
	const cases = listRelayCases().map((item) => ({
		...item,
		target_label: labels[item.target_id] ?? item.target_id,
		preview: getRelayPayloadForReview(item.case_id).body
	}));
	return { cases, targetsConfigured: targets.length > 0 };
};

export const actions: Actions = {
	share: async ({ request }) => {
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			const target = loadSessionTargets().find((item) => item.id === relayCase.target_id);
			if (!target) return fail(409, { message: 'Ziel ist nicht mehr konfiguriert.' });
			if (target.locality === 'cloud') approveRelayEgress(caseId, 'owner');
			shareRelayCase(caseId, target);
			return { success: true, caseId };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Freigabe fehlgeschlagen.' });
		}
	}
};
