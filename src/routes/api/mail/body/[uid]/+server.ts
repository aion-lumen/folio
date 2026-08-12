// F.4.E — GET /api/mail/body/[uid]
// Returns body + classification-meta for one mail row.
// Yahoo (real feedback.db): looks up task_id, fetches Kanban-Task body+executor-comment.
// Gmail/mirhamed.ch (mock): synthesizes body from mock subject/sender.

import { error, json } from '@sveltejs/kit';
import { getFeedbackRowById } from '$lib/server/feedback/reader.js';
import { lookupMailBody } from '$lib/server/hermes/mail-body.js';
import { getMockRows } from '$lib/util/mail-mock.js';
import type { RequestHandler } from './$types.js';

export interface MailBodyResponse {
	uid: string;
	source: 'kanban' | 'mock' | 'unavailable';
	board: string | null;
	taskId: string | null;
	taskTitle: string | null;
	bodyText: string | null;
	bodyTruncated: boolean;
	summary: string | null;
	evidence: { type: string; content: string; source?: string; weight?: number }[];
	reasoning: string | null;
	classification: string | null;
	confidence: number | null;
}

function mockResponse(uid: string): MailBodyResponse | null {
	const row = getMockRows().find((r) => r.id === uid);
	if (!row) return null;
	const lines = [
		`Von: ${row.from_name} <${row.from_addr}>`,
		`Betreff: ${row.subject}`,
		'',
		`[Mock-Body für Account ${row.account}]`,
		'',
		`Diese E-Mail ist Teil des F.4-Vorbau-Mock-Datensatzes. Echte Mail-Body-Fetches`,
		`werden in F.6 (Multi-Account-IMAP-Integration) implementiert. Aktuell sind nur`,
		`Yahoo-Mails über die echte feedback.db + Hermes-Kanban verfügbar.`,
		'',
		`Heuristik-Reason: ${row.reason}`,
		`Klassifikation: ${row.classification}`,
		`Vorgeschlagene Aktion: ${row.suggested_action}`,
		`Markers: ${row.markers.join(', ')}`
	];
	return {
		uid,
		source: 'mock',
		board: null,
		taskId: null,
		taskTitle: row.subject,
		bodyText: lines.join('\n'),
		bodyTruncated: false,
		summary: row.reason,
		evidence: [{ type: 'mock', content: row.evidence, weight: 1.0 }],
		reasoning: row.reason,
		classification: row.classification,
		confidence: row.confidence
	};
}

export const GET: RequestHandler = ({ params }) => {
	const uid = params.uid;
	if (!uid) throw error(400, 'uid required');

	// Mock-uids: m_NNNN
	if (uid.startsWith('m_')) {
		const r = mockResponse(uid);
		if (!r) throw error(404, `mock uid not found: ${uid}`);
		return json(r);
	}

	// Real yahoo: uid is feedback.id (stringified). Look up task_id.
	const idNum = parseInt(uid, 10);
	if (!Number.isFinite(idNum)) throw error(400, `invalid uid: ${uid}`);

	// `id` is the primary-key INTEGER but reader only accepts FeedbackFilter,
	// so we fetch a small slice and filter — or write a direct query.
	// Use direct sqlite for sub-ms lookup.
	let row;
	try {
		row = getFeedbackRowById(idNum);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `feedback lookup failed: ${msg}`);
	}
	if (!row) throw error(404, `feedback row not found: ${uid}`);

	const body = lookupMailBody(row.task_id);
	const response: MailBodyResponse = {
		uid,
		source: body.source,
		board: body.board,
		taskId: body.taskId,
		taskTitle: body.taskTitle,
		bodyText: body.bodyText,
		bodyTruncated: body.bodyTruncated,
		summary: body.summary,
		evidence: body.evidence,
		reasoning: body.reasoning,
		classification: body.classification,
		confidence: body.confidence
	};
	return json(response);
};
