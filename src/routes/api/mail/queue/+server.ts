// F.3 — GET /api/mail/queue
// Returns paginated feedback.db rows + counts.
// Query-params: userFinalAction, heuristicAction, pluginValue, senderDomain,
//               disagreementOnly, dateFrom, dateTo, limit, offset
// All filters optional; default limit=200.

import { error } from '@sveltejs/kit';
import { getFeedbackRows, getFeedbackCounts } from '$lib/server/feedback/reader.js';
import type { FeedbackFilter } from '$lib/server/feedback/types.js';
import type { RequestHandler } from './$types.js';

function parseBool(v: string | null): boolean | undefined {
	if (v === null) return undefined;
	if (v === '1' || v === 'true') return true;
	if (v === '0' || v === 'false') return false;
	return undefined;
}

function parseInt0(v: string | null): number | undefined {
	if (v === null) return undefined;
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? n : undefined;
}

export const GET: RequestHandler = ({ url }) => {
	const filter: FeedbackFilter = {
		userFinalAction: url.searchParams.get('userFinalAction') ?? undefined,
		heuristicAction: url.searchParams.get('heuristicAction') ?? undefined,
		pluginValue: url.searchParams.get('pluginValue') ?? undefined,
		senderDomain: url.searchParams.get('senderDomain') ?? undefined,
		disagreementOnly: parseBool(url.searchParams.get('disagreementOnly')),
		dateFrom: url.searchParams.get('dateFrom') ?? undefined,
		dateTo: url.searchParams.get('dateTo') ?? undefined,
		limit: parseInt0(url.searchParams.get('limit')),
		offset: parseInt0(url.searchParams.get('offset'))
	};

	try {
		const rows = getFeedbackRows(filter);
		const counts = getFeedbackCounts();
		return new Response(
			JSON.stringify({ rows, total: counts.total, counts }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `feedback reader failed: ${msg}`);
	}
};
