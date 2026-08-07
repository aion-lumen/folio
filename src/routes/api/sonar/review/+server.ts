import { error, json } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	appendSonarReview,
	SonarStoreError,
	type SonarDecision
} from '$lib/server/modules/sonar/store.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	requireModuleCapability('sonar', 'notes.read');
	requireModuleCapability('sonar', 'reviews.read');
	requireModuleCapability('sonar', 'review.write');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültige Review-Anfrage');
	}
	const value = body as { post_id?: unknown; status?: unknown };
	if (
		typeof value.post_id !== 'string' ||
		typeof value.status !== 'string' ||
		!['accepted', 'deferred', 'rejected'].includes(value.status)
	) {
		throw error(400, 'Ungültige Review-Anfrage');
	}
	try {
		const review = appendSonarReview(value.post_id, value.status as SonarDecision);
		return json({ ok: true, review });
	} catch (cause) {
		if (cause instanceof SonarStoreError) {
			throw error(409, 'Review konnte nicht sicher protokolliert werden');
		}
		throw cause;
	}
};
