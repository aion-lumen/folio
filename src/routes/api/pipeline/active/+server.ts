// 2026-06-07 UI-Pipeline-Ansicht: aktiver Pipeline-State fuer Polling.
// Wird vom Frontend alle 5s gerufen wenn activeRun !=null. Liefert die
// aktuelle Stage (welcher Knoten in FlowDiagram pulsiert) + jüngstes
// Summary fuer die TallyChips.

import { json } from '@sveltejs/kit';
import {
	getActiveWorkerRun,
	getWorkerRunSummary,
	listRecentPipelineRuns
} from '$lib/server/folio-db/reader.js';
import { getLensRunStatus } from '$lib/server/lens-runner/status.js';
import { COUNCIL_LENS_CONFIG } from '$lib/council/lens-config.server.js';
import type { RequestHandler } from './$types.js';

// Stage-Mapping aus mode/run_type → FlowDiagram-Knoten-ID.
// Siehe src/lib/pipeline/types.ts fuer die Stage-Defs.
function activeStageFromMode(mode: string): string | null {
	if (mode === 'silent' || mode === 'learning') return 'worker';
	if (mode === 'validator') return 'valid';
	return null;
}

export const GET: RequestHandler = async () => {
	const mailRun = getActiveWorkerRun();
	const lensStatus = getLensRunStatus(COUNCIL_LENS_CONFIG);

	// Aktive Stage abgeleitet (Prioritaet: mail-side, da exklusiv im
	// Worker-Manager; council-lens nur wenn keine mail-side aktiv).
	let activeStage: string | null = null;
	if (mailRun) {
		activeStage = activeStageFromMode(mailRun.mode);
	} else if (lensStatus.running) {
		activeStage = 'lens';
	}

	// Tally aus juengstem Summary (mail-side bevorzugt fuer „diese Runde
	// erzeugt"-Chip-Reihe). Wenn kein active-run: juengster summary aus
	// Verlauf.
	let summary = null;
	if (mailRun) {
		summary = getWorkerRunSummary(mailRun.run_uuid);
	} else {
		const recent = listRecentPipelineRuns(1);
		if (recent.length > 0) summary = recent[0].summary;
	}

	return json({
		active_stage: activeStage,
		mail_run: mailRun,
		lens_running: lensStatus.running,
		lens_elapsed:
			lensStatus.running && 'elapsed_seconds' in lensStatus
				? lensStatus.elapsed_seconds
				: null,
		summary
	});
};
