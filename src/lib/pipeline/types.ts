// 2026-06-07 UI-Pipeline-Ansicht: lokale Types + Stage-Defs.

import type {
	WorkerRunRow,
	WorkerRunSummaryRow,
	PipelineRunRow,
	HauskaufWorkflowRow
} from '$lib/server/folio-db/types.js';
import type { CouncilObjectRow } from '$lib/server/council-db/types.js';
import type { LensRunStatus } from '$lib/server/lens-runner/types.js';

export type StageId = 'imap' | 'worker' | 'valid' | 'auto' | 'ingest' | 'lens';
export type StageState = 'idle' | 'armed' | 'active' | 'done';
export type LaneKey = 'mail' | 'council';

export interface StageDef {
	id: StageId;
	lane: LaneKey;
	label: string;
	sub: string;
	unit: string;
}

// Stage-Reihenfolge im Mockup. Mail-Lane 4 Stations, Council-Lane 2.
export const STAGES: StageDef[] = [
	{ id: 'imap', lane: 'mail', label: 'IMAP', sub: 'yahoo · :15 stündlich', unit: 'mails' },
	{ id: 'worker', lane: 'mail', label: 'Worker', sub: 'classify_immo', unit: 'verarbeitet' },
	{ id: 'valid', lane: 'mail', label: 'Validator', sub: '3 stimmen sequenziell', unit: 'stimmen' },
	{ id: 'auto', lane: 'mail', label: 'Auto-Übernahme', sub: 'konsens 4/4', unit: 'übernommen' },
	{ id: 'ingest', lane: 'council', label: 'Council-Ingest', sub: ':25 stündlich', unit: 'objekte' },
	{ id: 'lens', lane: 'council', label: 'Council-Lens', sub: '4h periodik', unit: 'bewertet' }
];

export interface ActiveStateResponse {
	active_stage: StageId | null;
	mail_run: WorkerRunRow | null;
	lens_running: boolean;
	lens_elapsed: number | null;
	summary: WorkerRunSummaryRow | null;
}

export interface PipelinePageData {
	pipelineRuns: PipelineRunRow[];
	activeRun: WorkerRunRow | null;
	lensStatus: LensRunStatus;
	workflows: Array<{
		workflow: HauskaufWorkflowRow;
		object: CouncilObjectRow | null;
	}>;
}

// Tweaks-Panel View-Mode (localStorage-persistiert).
export type PipelineView = 'fluss' | 'werkbank';

// Tally-Chip-Substanz (rechts neben LiveLog in der Live-Sicht).
export type TallyTone = 'green' | 'blue' | 'ember' | 'slate';
export interface TallyChip {
	n: number;
	label: string;
	tone: TallyTone;
}
