import { error, json } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	appendSonarPlacementAction,
	SonarPlacementStoreError,
	type SonarPlacementAction
} from '$lib/server/modules/sonar/placements.js';
import type { RequestHandler } from './$types.js';
import { readSonarPublicationState, withSonarPublicationLock, SonarPublicationBusyError } from '$lib/server/modules/sonar/publications.js';

function exactKeys(value: object, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	const sortedExpected = [...expected].sort();
	return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('sonar', 'placements.read');
	requireModuleCapability('sonar', 'reviews.read');
	requireModuleCapability('sonar', 'review.write');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültige Platzierungsentscheidung');
	}
	if (!body || typeof body !== 'object') throw error(400, 'Ungültige Platzierungsentscheidung');
	const value = body as {
		candidate_id?: unknown;
		candidate_hash?: unknown;
		expected_revision?: unknown;
		action?: unknown;
		draft_text?: unknown;
	};
	const action = value.action;
	const keysValid =
		action === 'revise'
			? exactKeys(value, ['candidate_id', 'candidate_hash', 'expected_revision', 'action', 'draft_text'])
			: action === 'dismiss' || action === 'approve' || action === 'revoke'
				? exactKeys(value, ['candidate_id', 'candidate_hash', 'expected_revision', 'action'])
				: false;
	if (
		!keysValid ||
		typeof value.candidate_id !== 'string' ||
		typeof value.candidate_hash !== 'string' ||
		!Number.isSafeInteger(value.expected_revision) ||
		(action === 'revise' && typeof value.draft_text !== 'string')
	) {
		throw error(400, 'Ungültige Platzierungsentscheidung');
	}
	try {
		if (action === 'approve' || action === 'revoke') requireModuleCapability('sonar', 'publish.approve');
		const append = () => appendSonarPlacementAction(
			value.candidate_id as string,
			value.candidate_hash as string,
			value.expected_revision as number,
			action as SonarPlacementAction,
			value.draft_text as string | undefined
		);
		const review = action === 'revoke' ? withSonarPublicationLock(() => {
			requireModuleCapability('sonar', 'publish.read');
			const publications = readSonarPublicationState();
			if (!publications.healthy || publications.byCandidate[value.candidate_id as string]) {
				throw error(409, 'Die Freigabe wurde bereits vom Publisher übernommen oder ist nicht sicher prüfbar');
			}
			return append();
		}) : append();
		return json({ ok: true, review });
	} catch (cause) {
		if (cause instanceof SonarPublicationBusyError) throw error(409, 'Der Publisher arbeitet gerade. Bitte erneut prüfen.');
		if (cause instanceof SonarPlacementStoreError) {
			throw error(409, 'Der Kandidat hat sich verändert oder ist nicht mehr aktuell');
		}
		throw cause;
	}
};
