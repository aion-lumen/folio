// F.7 — Worker-Runner Types.

import type { WorkerRunMode } from '../folio-db/types.js';

export interface StartRunInput {
	account: 'yahoo' | 'gmail' | 'mirhamed';
	mode: WorkerRunMode;
	trancheSize: number;
}

export interface ActiveRunInfo {
	uuid: string;
	pid: number;
	account: string;
	board: string;
	mode: WorkerRunMode;
	trancheSize: number;
	startedAt: string;
	triggeredBy: 'manual' | 'auto'; // F.8 BUG-I1: explicit so UI doesn't scan logs
}

export interface RunLogLine {
	line: string;
	t: string; // ISO timestamp when received
	stream: 'stdout' | 'stderr';
}

// F.7-Bugfix: SSE final-event when subprocess exits.
export interface RunEndEvent {
	event: 'end';
	status: 'completed' | 'failed' | 'cancelled';
	exit_code: number | null;
	error_summary: string | null;
	mails_processed: number;
}

export type RunStreamMsg = RunLogLine | RunEndEvent;
