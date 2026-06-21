// F.7 — POST /api/review/mark
// Body: { feedback_id, source?: 'auto-open'|'manual-toggle', action?: 'mark'|'unmark'|'toggle' }
// Default action='mark'. Returns new state.

import { error, json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { getFeedbackDbPath } from '$lib/server/env.js';
import { upsertReviewState, deleteReviewState } from '$lib/server/folio-db/writer.js';
import { getReviewedIds } from '$lib/server/folio-db/reader.js';
import type { FeedbackRow } from '$lib/server/feedback/types.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	feedback_id: number;
	source?: 'auto-open' | 'manual-toggle';
	action?: 'mark' | 'unmark' | 'toggle';
}

let _feedbackConn: Database.Database | null = null;
function fetchFeedback(id: number): FeedbackRow | null {
	if (!_feedbackConn) {
		_feedbackConn = new Database(getFeedbackDbPath(), {
			readonly: true,
			fileMustExist: true
		});
	}
	const r = _feedbackConn
		.prepare('SELECT * FROM feedback WHERE id = ?')
		.get(id) as FeedbackRow | undefined;
	return r ?? null;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: PostBody;
	try {
		body = (await request.json()) as PostBody;
	} catch {
		throw error(400, 'invalid JSON body');
	}
	if (typeof body.feedback_id !== 'number') {
		throw error(400, 'feedback_id required');
	}
	const action = body.action ?? 'mark';
	const source = body.source ?? 'manual-toggle';

	const fb = fetchFeedback(body.feedback_id);
	if (!fb) throw error(404, `feedback row not found: ${body.feedback_id}`);

	const currentlyReviewed = getReviewedIds().has(body.feedback_id);

	if (action === 'toggle') {
		if (currentlyReviewed) {
			deleteReviewState(body.feedback_id);
			return json({ reviewed: false });
		}
		upsertReviewState(body.feedback_id, fb.account_id, fb.imap_uid, source);
		return json({ reviewed: true });
	}
	if (action === 'unmark') {
		deleteReviewState(body.feedback_id);
		return json({ reviewed: false });
	}
	// default: mark
	upsertReviewState(body.feedback_id, fb.account_id, fb.imap_uid, source);
	return json({ reviewed: true });
};
