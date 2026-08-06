import { json } from '@sveltejs/kit';
import { runInboxTriage, selectInboxItemForTriage } from '$lib/server/agent/triage.js';
import { checkTriagePreflight } from '$lib/server/agent/preflight.js';
import { getRecentInboxActivity } from '$lib/server/agent/recent.js';
import { resolveInboxDirs, scanInbox, scanInboxForDisplay } from '$lib/server/inbox/scanner.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const preflight = await checkTriagePreflight();
	const body = (await request.json().catch(() => ({}))) as {
		autoCommit?: boolean;
		filename?: string;
		model?: string;
		promptVariant?: 'v1' | 'v1-strict';
	};

	if (!preflight.ok && process.env.FOLIO_AGENT_MOCK_RESPONSE === undefined) {
		return json(
			{
				error: preflight.message,
				preflight,
				scan: await scanInboxForDisplay(),
				result: { assessed: 0, auto_committed: [], awaiting_review: [], skipped: [] }
			},
			{ status: 503 }
		);
	}

	const dirs = resolveInboxDirs();
	const scan = await scanInbox(dirs);
	const selectedScan = body.filename ? selectInboxItemForTriage(scan, body.filename) : scan;
	if (!selectedScan) {
		return json(
			{
				error: `Inbox-Datei nicht mehr zur Triage verfügbar: ${body.filename}`,
				preflight,
				scan: await scanInboxForDisplay()
			},
			{ status: 409 }
		);
	}

	const { scan: enriched, result } = await runInboxTriage(selectedScan, dirs, {
		autoCommit: body.autoCommit !== false,
		model: body.model ?? preflight.resolved_model ?? undefined,
		promptVariant: body.promptVariant
	});

	return json({
		scan: enriched,
		result,
		preflight,
		lastActivity: await getRecentInboxActivity()
	});
};
