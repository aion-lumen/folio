// F.7 — Subprocess-Manager für Worker-Runs.
// Singleton (1 Run at-a-time), spawn via child_process, SSE-Subscribe-Pattern.
// Folio-Restart kills Worker (kein Persistence; Operator macht Re-Run).

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { getClassifiedMailIdsForRun } from '$lib/server/folio-db/reader.js';
import {
	insertWorkerRun,
	updateWorkerRunStatus
} from '$lib/server/folio-db/writer.js';
import { getAionLumenPath, getPythonBinPath, loadHermesEnvVars } from '$lib/server/env.js';
import type { ActiveRunInfo, RunEndEvent, RunLogLine, RunStreamMsg, StartRunInput } from './types.js';

// F.7-Bugfix + F.9: loadHermesEnvVars lebt jetzt in env.ts (geteilt mit Hermes-Chat-API).

const WORKER_SCRIPT = 'scripts/production_worker.py';
const VALIDATOR_SCRIPT = 'scripts/validator_batch.py';
const LOG_BUFFER_MAX = 500;
const CANCEL_GRACE_MS = 5000;

// Cleanup 2026-05-27: slugifyBoard + ensureBoardExists raus (Hermes-Kanban-
// Board-Item-Mechanik obsolet durch Pipeline-Redesign). board-slug wird
// jetzt intern als interner Identifier auto-generiert, kein Hermes-side-effect.
function defaultBoardSlug(account: string): string {
	const d = new Date();
	const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return `silent-${account}-${today}`;
}

interface RunContext {
	uuid: string;
	proc: ChildProcess;
	logBuffer: RunLogLine[];
	logListeners: Set<(msg: RunStreamMsg) => void>;
	startedAt: string;
	account: string;
	board: string;
	mode: 'learning' | 'silent' | 'validator';
	trancheSize: number;
	mailsProcessed: number;
	stderrBuffer: string; // last error excerpt for failure-summary
	triggeredBy: 'manual' | 'auto'; // F.8 BUG-I1: auto-trigger detection without log-scan
}

let _active: RunContext | null = null;

export function isBusy(): boolean {
	return _active !== null;
}

export function getActiveRun(): ActiveRunInfo | null {
	if (!_active) return null;
	return {
		uuid: _active.uuid,
		pid: _active.proc.pid ?? 0,
		account: _active.account,
		board: _active.board,
		mode: _active.mode,
		trancheSize: _active.trancheSize,
		startedAt: _active.startedAt,
		triggeredBy: _active.triggeredBy
	};
}

function pushLine(ctx: RunContext, line: string, stream: 'stdout' | 'stderr') {
	const entry: RunLogLine = { line, t: new Date().toISOString(), stream };
	ctx.logBuffer.push(entry);
	if (ctx.logBuffer.length > LOG_BUFFER_MAX) {
		ctx.logBuffer.shift();
	}
	if (stream === 'stderr') {
		ctx.stderrBuffer = (ctx.stderrBuffer + '\n' + line).slice(-1500);
	}
	// F.7-Bugfix: extract per-mail counter (race-resistant ggü DONE-line),
	// plus DONE-line als final-truth.
	const perMail = /^\[(\d+)\/\d+\]/.exec(line);
	if (perMail) ctx.mailsProcessed = parseInt(perMail[1], 10);
	const done = /processed=(\d+)/.exec(line);
	if (done) ctx.mailsProcessed = parseInt(done[1], 10);
	for (const listener of ctx.logListeners) {
		try {
			listener(entry);
		} catch {
			// listener gone or threw — ignore
		}
	}
}

function attachStreamListener(
	ctx: RunContext,
	stream: NodeJS.ReadableStream,
	streamName: 'stdout' | 'stderr'
) {
	let pending = '';
	stream.on('data', (chunk: Buffer | string) => {
		pending += chunk.toString();
		let nl;
		while ((nl = pending.indexOf('\n')) >= 0) {
			const line = pending.slice(0, nl).replace(/\r$/, '');
			pending = pending.slice(nl + 1);
			if (line) pushLine(ctx, line, streamName);
		}
	});
	stream.on('end', () => {
		if (pending) pushLine(ctx, pending, streamName);
	});
}

export function startRun(input: StartRunInput): { uuid: string; board_slug: string } {
	if (_active) {
		throw new Error(`Another run is active (uuid=${_active.uuid})`);
	}
	// Cleanup 2026-05-27: kein user-facing Board mehr. Intern auto-generierter
	// Slug für DB-Logging-Zwecke (worker_runs.board bleibt NOT NULL).
	const slug = defaultBoardSlug(input.account);

	const uuid = randomUUID();
	const startedAt = new Date().toISOString();
	const args = [
		WORKER_SCRIPT,
		'--account', input.account,
		'--mode', input.mode,
		'--tranche-size', String(input.trancheSize),
		// 2026-06-07 Pre-Bauteil Pipeline-Persistenz: run_uuid an Python
		// weitergeben (CLI-Arg + env-Fallback) — fuer Per-Mail-Logs in
		// worker_run_logs / worker_run_summary.
		'--run-uuid', uuid
	];
	const proc = spawn(getPythonBinPath(), args, {
		cwd: getAionLumenPath(),
		env: {
			...process.env,
			...loadHermesEnvVars(),
			FOLIO_RUN_UUID: uuid // env-Fallback
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});

	insertWorkerRun({
		run_uuid: uuid,
		account: input.account,
		board: slug,
		mode: input.mode,
		tranche_size: input.trancheSize,
		pid: proc.pid ?? null,
		status: 'running',
		started_at: startedAt
	});

	const ctx: RunContext = {
		uuid,
		proc,
		logBuffer: [],
		logListeners: new Set(),
		startedAt,
		account: input.account,
		board: slug,
		mode: input.mode,
		trancheSize: input.trancheSize,
		mailsProcessed: 0,
		stderrBuffer: '',
		triggeredBy: 'manual' // user-initiated worker-run is always manual
	};
	_active = ctx;

	if (proc.stdout) attachStreamListener(ctx, proc.stdout, 'stdout');
	if (proc.stderr) attachStreamListener(ctx, proc.stderr, 'stderr');

	// F.7-Bugfix: 'close' fires AFTER stdio-streams flushed (vs 'exit' which
	// can race with buffered stdout-data). Eliminates mails_processed=0 bug.
	proc.on('close', (code, signal) => {
		const status =
			signal === 'SIGTERM' || signal === 'SIGKILL'
				? 'cancelled'
				: code === 0
					? 'completed'
					: 'failed';
		const errorSummary =
			status === 'failed'
				? ctx.stderrBuffer.trim().slice(-500) || `exit ${code}`
				: null;
		updateWorkerRunStatus(uuid, status, {
			exit_code: code,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		});
		// F.7-Bugfix: emit final end-event before clearing _active.
		const endEvent: RunEndEvent = {
			event: 'end',
			status,
			exit_code: code,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		};
		for (const listener of ctx.logListeners) {
			try {
				listener(endEvent);
			} catch {
				// listener gone — ignore
			}
		}
		_active = null;

		// Direktive D: Auto-Validator nach completed silent-Worker mit explizitem
		// --mail-ids-Handoff aus worker_run_logs (kein last-tranche-Race).
		if (
			ctx.mode === 'silent' &&
			status === 'completed' &&
			ctx.mailsProcessed > 0
		) {
			const workerUuid = ctx.uuid;
			const inheritedTrancheSize = ctx.mailsProcessed;
			const workerAccount = ctx.account;
			setImmediate(() => {
				const mailIds = getClassifiedMailIdsForRun(workerUuid);
				try {
					startValidatorRun('last-tranche', {
						triggeredBy: 'auto',
						trancheSize: inheritedTrancheSize,
						mailIds,
						account: workerAccount,
						parentRunUuid: workerUuid
					});
				} catch (e) {
					const errMsg = e instanceof Error ? e.message : String(e);
					const failUuid = randomUUID();
					const startedAt = new Date().toISOString();
					insertWorkerRun({
						run_uuid: failUuid,
						parent_run_uuid: workerUuid,
						account: workerAccount,
						board: 'last-tranche',
						mode: 'validator',
						tranche_size: inheritedTrancheSize,
						pid: null,
						status: 'failed',
						started_at: startedAt
					});
					updateWorkerRunStatus(failUuid, 'failed', {
						error_summary: `auto-validator spawn failed: ${errMsg}`
					});
					console.error('[worker-runner] auto-validator failed:', e);
				}
			});
		}
	});

	proc.on('error', (err) => {
		const errorSummary = `spawn error: ${err.message}`;
		updateWorkerRunStatus(uuid, 'failed', { error_summary: errorSummary });
		const endEvent: RunEndEvent = {
			event: 'end',
			status: 'failed',
			exit_code: null,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		};
		for (const listener of ctx.logListeners) {
			try {
				listener(endEvent);
			} catch {
				// ignore
			}
		}
		_active = null;
	});

	return { uuid, board_slug: slug };
}

// Cleanup 2026-05-27: scope `disagreements` raus (obsolet durch Drei-Lens-Architektur).
export type ValidatorScope = 'unreviewed' | 'all' | 'last-tranche';

export interface StartValidatorRunOpts {
	triggeredBy?: 'manual' | 'auto';
	trancheSize?: number;
	mailIds?: number[];
	account?: string;
	parentRunUuid?: string;
}

export function startValidatorRun(
	scope: ValidatorScope,
	opts: StartValidatorRunOpts = {}
): { uuid: string } {
	if (_active) {
		throw new Error(`Another run is active (uuid=${_active.uuid})`);
	}
	const uuid = randomUUID();
	const startedAt = new Date().toISOString();
	const triggeredBy = opts.triggeredBy ?? (opts.parentRunUuid ? 'auto' : 'manual');
	const trancheSize = opts.trancheSize ?? 0;
	const mailIds = opts.mailIds ?? [];
	const args = [VALIDATOR_SCRIPT];
	if (mailIds.length > 0) {
		args.push('--mail-ids', mailIds.join(','));
	}
	args.push('--scope', scope);
	if (opts.account) {
		args.push('--account', opts.account);
	}
	args.push('--run-uuid', uuid);
	const proc = spawn(getPythonBinPath(), args, {
		cwd: getAionLumenPath(),
		env: {
			...process.env,
			...loadHermesEnvVars(),
			FOLIO_RUN_UUID: uuid
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});

	const runAccount = opts.account ?? 'validator';
	insertWorkerRun({
		run_uuid: uuid,
		parent_run_uuid: opts.parentRunUuid ?? null,
		account: runAccount,
		board: scope,
		mode: 'validator',
		tranche_size: trancheSize,
		pid: proc.pid ?? null,
		status: 'running',
		started_at: startedAt
	});

	const ctx: RunContext = {
		uuid,
		proc,
		logBuffer: [],
		logListeners: new Set(),
		startedAt,
		account: runAccount,
		board: scope,
		mode: 'validator',
		trancheSize,
		mailsProcessed: 0,
		stderrBuffer: '',
		triggeredBy
	};
	_active = ctx;

	// F.8 BUG-I1: triggeredBy ist jetzt ueber ActiveRunInfo direkt exposed (kein log-scan).
	// Log-line bleibt fuer Engineer-Diagnose im Live-Log.
	pushLine(
		ctx,
		`[validator] triggeredBy=${triggeredBy} scope=${scope} mail_ids=${mailIds.length}`,
		'stdout'
	);

	if (proc.stdout) attachStreamListener(ctx, proc.stdout, 'stdout');
	if (proc.stderr) attachStreamListener(ctx, proc.stderr, 'stderr');

	// F.7-Bugfix: 'close' fires AFTER stdio-streams flushed (vs 'exit' which
	// can race with buffered stdout-data). Eliminates mails_processed=0 bug.
	proc.on('close', (code, signal) => {
		const status =
			signal === 'SIGTERM' || signal === 'SIGKILL'
				? 'cancelled'
				: code === 0
					? 'completed'
					: 'failed';
		const errorSummary =
			status === 'failed'
				? ctx.stderrBuffer.trim().slice(-500) || `exit ${code}`
				: null;
		updateWorkerRunStatus(uuid, status, {
			exit_code: code,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		});
		const endEvent: RunEndEvent = {
			event: 'end',
			status,
			exit_code: code,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		};
		for (const listener of ctx.logListeners) {
			try {
				listener(endEvent);
			} catch {
				// ignore
			}
		}
		_active = null;
	});

	proc.on('error', (err) => {
		const errorSummary = `spawn error: ${err.message}`;
		updateWorkerRunStatus(uuid, 'failed', { error_summary: errorSummary });
		const endEvent: RunEndEvent = {
			event: 'end',
			status: 'failed',
			exit_code: null,
			error_summary: errorSummary,
			mails_processed: ctx.mailsProcessed
		};
		for (const listener of ctx.logListeners) {
			try {
				listener(endEvent);
			} catch {
				// ignore
			}
		}
		_active = null;
	});

	return { uuid };
}

export function cancelActiveRun(): boolean {
	if (!_active) return false;
	const ctx = _active;
	try {
		ctx.proc.kill('SIGTERM');
	} catch {
		// ignore
	}
	setTimeout(() => {
		if (_active === ctx && !ctx.proc.killed) {
			try {
				ctx.proc.kill('SIGKILL');
			} catch {
				// ignore
			}
		}
	}, CANCEL_GRACE_MS);
	return true;
}

export function subscribeToLogs(
	uuid: string,
	listener: (msg: RunStreamMsg) => void
): { unsubscribe: () => void; replay: RunLogLine[] } {
	if (!_active || _active.uuid !== uuid) {
		return { unsubscribe: () => {}, replay: [] };
	}
	_active.logListeners.add(listener);
	const replay = [..._active.logBuffer];
	return {
		unsubscribe: () => {
			if (_active && _active.uuid === uuid) {
				_active.logListeners.delete(listener);
			}
		},
		replay
	};
}

export function getLogSnapshot(uuid: string): RunLogLine[] {
	if (!_active || _active.uuid !== uuid) return [];
	return [..._active.logBuffer];
}
