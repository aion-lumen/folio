import { error, json } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { RelayStoreError, updateRelayMailDraft } from '$lib/server/relay/store.js';
import type { RequestHandler } from './$types.js';

export const PATCH: RequestHandler = async ({ params, request }) => {
	requireModuleCapability('relay', 'cases.read');
	requireModuleCapability('relay', 'responses.read');
	requireModuleCapability('relay', 'responses.apply');
	const value = (await request.json().catch(() => null)) as {
		subject?: unknown;
		body?: unknown;
	} | null;
	if (!value || typeof value.subject !== 'string' || typeof value.body !== 'string') {
		throw error(400, 'Betreff und Antworttext müssen Zeichenfolgen sein.');
	}
	try {
		const draft = updateRelayMailDraft(params.caseId, value.subject, value.body, 'owner');
		return json({
			draft_id: draft.draft_id,
			case_id: draft.case_id,
			subject: draft.subject,
			body: draft.body,
			created_at: draft.created_at,
			updated_at: draft.updated_at
		});
	} catch (cause) {
		if (cause instanceof RelayStoreError) throw error(409, cause.message);
		throw cause;
	}
};
