import { error, json } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	appendSonarFollowingReview,
	SonarFollowingError,
	type SonarFollowingCategory
} from '$lib/server/modules/sonar/following.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	requireModuleCapability('sonar', 'archive.read');
	requireModuleCapability('sonar', 'reviews.read');
	requireModuleCapability('sonar', 'review.write');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültige Abo-Entscheidung');
	}
	const value = body as { account_id?: unknown; category?: unknown };
	if (
		typeof value.account_id !== 'string' ||
		typeof value.category !== 'string' ||
		!['ai', 'politics', 'both', 'drop'].includes(value.category)
	) {
		throw error(400, 'Ungültige Abo-Entscheidung');
	}
	try {
		const review = appendSonarFollowingReview(
			value.account_id,
			value.category as SonarFollowingCategory
		);
		return json({ ok: true, review });
	} catch (cause) {
		if (cause instanceof SonarFollowingError) {
			throw error(409, 'Abo-Entscheidung konnte nicht sicher protokolliert werden');
		}
		throw cause;
	}
};
