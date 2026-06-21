// F.5 + F.8 Block-E — POST /api/mail/correction (2-Achsen).
// Inserts an append-only correction row into folio.db with corrected_domain
// + corrected_actionability. corrected_action wird mit compact-string
// `${domain}/${actionability}` belegt fuer Schema-Back-Compat (NOT NULL).

import { error, json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { getFeedbackDbPath } from '$lib/server/env.js';
import { insertCorrection } from '$lib/server/folio-db/writer.js';
import {
	DOMAIN_KEYS,
	ACTIONABILITY_KEYS,
	type DomainKey,
	type ActionabilityKey,
	type CorrectionMarker
} from '$lib/server/folio-db/types.js';

const CORRECTION_MARKER_KEYS: CorrectionMarker[] = ['zu-weit', 'zu-klein'];
import type { FeedbackRow } from '$lib/server/feedback/types.js';
import type { RequestHandler } from './$types.js';

let _feedbackConn: Database.Database | null = null;
function feedbackConn(): Database.Database {
	if (_feedbackConn) return _feedbackConn;
	_feedbackConn = new Database(getFeedbackDbPath(), {
		readonly: true,
		fileMustExist: true
	});
	return _feedbackConn;
}

function fetchFeedbackRow(id: number): FeedbackRow | null {
	const r = feedbackConn()
		.prepare('SELECT * FROM feedback WHERE id = ?')
		.get(id) as FeedbackRow | undefined;
	return r ?? null;
}

interface PostBody {
	feedback_id: number;
	corrected_domain: DomainKey;
	corrected_actionability: ActionabilityKey;
	note?: string | null;
	// Panel-C werkstatt: multi-select. Backwards-compat marker (single) bleibt akzeptiert.
	markers?: CorrectionMarker[] | null;
	marker?: CorrectionMarker | null;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: PostBody;
	try {
		body = (await request.json()) as PostBody;
	} catch {
		throw error(400, 'invalid JSON body');
	}

	if (typeof body.feedback_id !== 'number' || !Number.isFinite(body.feedback_id)) {
		throw error(400, 'feedback_id must be a number');
	}
	if (!DOMAIN_KEYS.includes(body.corrected_domain)) {
		throw error(400, `corrected_domain must be one of: ${DOMAIN_KEYS.join(', ')}`);
	}
	if (!ACTIONABILITY_KEYS.includes(body.corrected_actionability)) {
		throw error(400, `corrected_actionability must be one of: ${ACTIONABILITY_KEYS.join(', ')}`);
	}

	const feedback = fetchFeedbackRow(body.feedback_id);
	if (!feedback) {
		throw error(404, `feedback row not found: ${body.feedback_id}`);
	}

	const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
	// Panel-C werkstatt: aggregierte markers (multi-select) als CSV in single TEXT column.
	// Backwards-compat: body.marker (single) wird als 1-element-array behandelt.
	let markerCsv: string | null = null;
	const rawMarkers: (CorrectionMarker | null)[] = body.markers ?? (body.marker != null ? [body.marker] : []);
	const validMarkers: CorrectionMarker[] = [];
	for (const m of rawMarkers) {
		if (m == null) continue;
		if (!CORRECTION_MARKER_KEYS.includes(m)) {
			throw error(400, `marker must be one of: ${CORRECTION_MARKER_KEYS.join(', ')}`);
		}
		if (!validMarkers.includes(m)) validMarkers.push(m);
	}
	if (validMarkers.length > 0) {
		markerCsv = validMarkers.join(',');
	}

	try {
		const correction = insertCorrection({
			feedback_id: feedback.id,
			imap_uid: feedback.imap_uid,
			previous_action: feedback.user_final_action,
			corrected_action: `${body.corrected_domain}/${body.corrected_actionability}`,
			corrected_domain: body.corrected_domain,
			corrected_actionability: body.corrected_actionability,
			note,
			correction_marker: markerCsv as CorrectionMarker | null, // CSV-Convention: single TEXT, mehrere durch ','
			source: 'folio-detail-panel'
		});
		return json({ correction }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `correction insert failed: ${msg}`);
	}
};
