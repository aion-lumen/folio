// 2026-06-07 UI-Pipeline-Ansicht: Loader fuer die neue Fluss-Sicht.
// Liest die Cross-DB-Pipeline-Verlauf-Liste (mail-side + council-side
// gemerged) plus aktive-Run-State (mail-side + council-Lens).
// Hauskauf-Workflow fuer den permanent sichtbaren Kampagnen-Track.

import {
	listRecentPipelineRuns,
	listRecentWorkerRuns,
	getActiveWorkerRun,
	getWorkerRunLogs,
	getWorkerRunSummary,
	listAllHauskaufWorkflow
} from '$lib/server/folio-db/reader.js';
import {
	getCouncilObjectById,
	listRecentCouncilRuns,
	getCouncilRunLogs,
	loadPersonas
} from '$lib/server/council-db/reader.js';
import { getLensRunStatus } from '$lib/server/lens-runner/status.js';
import { COUNCIL_LENS_CONFIG } from '$lib/council/lens-config.server.js';
import type { PageServerLoad } from './$types.js';

// 2026-06-10 Bauteil Model-Status-Panel: idle persistence shapes.
// `lastValidatorRun` is the most recent completed mode='validator' run plus
// its log rows (we count rows per voice to determine FERTIG cards).
// `lastLensRun` is the most recent completed council-lens run plus its
// 'lens.persona_*' event rows (a persona is FERTIG if it has a completed
// event; otherwise stays at WARTET in the dimmed-idle display).

export const load: PageServerLoad = async () => {
	const pipelineRuns = listRecentPipelineRuns(30);
	const activeRun = getActiveWorkerRun();
	const lensStatus = getLensRunStatus(COUNCIL_LENS_CONFIG);

	// Live-Substanz fuer LiveDetail (nur wenn ein Run aktiv ist).
	let activeLogs = null;
	let activeSummary = null;
	if (activeRun) {
		activeLogs = getWorkerRunLogs(activeRun.run_uuid);
		activeSummary = getWorkerRunSummary(activeRun.run_uuid);
	}

	// Idle: letzter abgeschlossener Validator-Lauf für Modell-Status-Panel.
	let lastValidatorRun: {
		run_uuid: string;
		started_at: string;
		ended_at: string | null;
		voiceCounts: Record<string, number>;
	} | null = null;
	if (!activeRun || activeRun.mode !== 'validator') {
		const recent = listRecentWorkerRuns(20);
		const last = recent.find((r) => r.mode === 'validator' && r.status === 'completed');
		if (last) {
			const logs = getWorkerRunLogs(last.run_uuid);
			const voiceCounts: Record<string, number> = {};
			for (const l of logs) {
				if (l.event_type !== 'validated') continue;
				voiceCounts[l.voice] = (voiceCounts[l.voice] ?? 0) + 1;
			}
			lastValidatorRun = {
				run_uuid: last.run_uuid,
				started_at: last.started_at,
				ended_at: last.ended_at,
				voiceCounts
			};
		}
	}

	// Idle: letzter abgeschlossener Council-Lens-Lauf. Liest die zwei neuen
	// event_type-Strings 'lens.persona_started' / 'lens.persona_completed'
	// aus council_run_logs (kein Schema-Change — bestehende TEXT-Spalte).
	let lastLensRun: {
		run_uuid: string;
		started_at: string;
		ended_at: string | null;
		personaStates: Record<string, 'started' | 'completed'>;
	} | null = null;
	if (!lensStatus.running) {
		const councilRecent = listRecentCouncilRuns(20);
		const lastLens = councilRecent.find(
			(r) => r.run_type === 'council-lens' && r.status === 'completed'
		);
		if (lastLens) {
			const logs = getCouncilRunLogs(lastLens.run_uuid);
			const personaStates: Record<string, 'started' | 'completed'> = {};
			for (const l of logs) {
				if (l.event_type !== 'lens.persona_started' && l.event_type !== 'lens.persona_completed') {
					continue;
				}
				const personaId = (l.message ?? '').split(' ')[0];
				if (!personaId) continue;
				if (l.event_type === 'lens.persona_started') {
					if (!personaStates[personaId]) personaStates[personaId] = 'started';
				} else {
					personaStates[personaId] = 'completed';
				}
			}
			lastLensRun = {
				run_uuid: lastLens.run_uuid,
				started_at: lastLens.started_at,
				ended_at: lastLens.ended_at,
				personaStates
			};
		}
	}

	// Hauskauf-Workflow + Cross-DB-Object-Resolve fuer Card-Substanz
	// (Adresse, Portal). Latest-wins ist im Reader schon implementiert.
	const workflows = listAllHauskaufWorkflow();
	const workflowsWithObjects = workflows.map((w) => ({
		workflow: w,
		object: getCouncilObjectById(w.council_object_id)
	}));

	// Persona-Meta (id, label, lm_studio_model) for the Lens panel idle
	// state — read from personas.yaml, same source the lens worker uses.
	const personas = loadPersonas();

	return {
		pipelineRuns,
		activeRun,
		activeLogs,
		activeSummary,
		lensStatus,
		lastValidatorRun,
		lastLensRun,
		personas,
		workflows: workflowsWithObjects
	};
};
