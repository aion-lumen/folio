import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { getAionLumenPath, getPythonBinPath } from '$lib/server/env.js';
import type { ModelEvalCandidate, ModelEvalCatalog } from './catalog.js';
import type { RealMailEvalCase } from './real-corpus.js';

const MAX_PROGRESS_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 4 * 1024 * 1024;
const STARTING_GRACE_MS = 15_000;

export type ModelEvalProgress = {
	schema: 'folio/model-eval-progress/v1';
	run_id: string;
	phase: 'starting' | 'loading' | 'evaluating' | 'restoring' | 'completed' | 'failed';
	started_at: string;
	finished_at?: string;
	total_models: number;
	current_model: number;
	total_cases: number;
	completed_cases: number;
	candidate_id?: string;
	candidate_label?: string;
};

export type ModelEvalScore = {
	id?: string;
	label?: string;
	model_id?: string;
	variant?: string;
	n?: number;
	valid?: number;
	accuracy?: number | null;
	domain_accuracy?: number | null;
	action_accuracy?: number | null;
	false_positive_rate?: number | null;
	false_positive_count?: number;
	non_actionable_cases?: number;
	primary_macro_f1?: number | null;
	secondary_micro_f1?: number | null;
	secondary_labeled_cases?: number;
	action_f1?: number | null;
	action_labeled_cases?: number;
	deadline_f1?: number | null;
	deadline_labeled_cases?: number;
	false_action_count?: number;
	abstention_rate?: number | null;
	median_latency_seconds?: number | null;
	p95_latency_seconds?: number | null;
	error_counts?: Record<string, number>;
	predictions?: ModelEvalPrediction[];
	error?: string;
};

export type ModelEvalPrediction = {
	uid: number;
	expected?: [string, string];
	expected_note?: string;
	predicted?: [string, string];
	expected_real?: {
		primary_domain: string;
		secondary_domains: string[];
		secondary_labeled: boolean;
		action_required: boolean | null;
		deadline_present: boolean | null;
	};
	predicted_real?: {
		primary_domain: string;
		secondary_domains: string[];
		action_required: boolean;
		deadline_present: boolean;
		needs_review: boolean;
		confidence: number;
	};
	valid?: true;
	latency_seconds?: number;
	error?: string;
	error_detail?: string;
	raw_excerpt?: string;
};

export type ModelEvalResult = {
	schema: 'folio/model-eval-result/v1';
	run_id: string;
	suite: { id: string; label: string; cases: number };
	started_at: string;
	finished_at: string;
	prior_model: string | null;
	restore_warning: string | null;
	source?: {
		temperature?: number;
		reasoning_effort?: string;
		max_completion_tokens?: number;
		response_format?: string;
		contract?: string;
		corpus_sha256?: string;
		baseline_run_ids?: string[];
	};
	models: ModelEvalScore[];
};

export type ModelEvalRunStatus =
	| { state: 'idle' }
	| { state: 'running'; startedAt: string; elapsedSeconds: number; progress: ModelEvalProgress | null }
	| { state: 'completed'; finishedAt: string; result: ModelEvalResult }
	| { state: 'failed'; finishedAt: string; result: ModelEvalResult | null };

type LockState = { pid: number; startedAt: string; runId: string; logPath: string };

export type ModelEvalRunnerConfig = {
	stateRoot: string;
	pythonBin: string;
	runnerPath: string;
	cwd: string;
};

export type ModelEvalRunInput = {
	cases?: RealMailEvalCase[];
	baseline_run_ids?: string[];
};

export class ModelEvalBusyError extends Error {
	constructor(public readonly status: Extract<ModelEvalRunStatus, { state: 'running' }>) {
		super('Model evaluation is already running');
		this.name = 'ModelEvalBusyError';
	}
}

export function getModelEvalRunnerConfig(): ModelEvalRunnerConfig {
	return {
		stateRoot: process.env.FOLIO_MODEL_EVAL_ROOT?.trim() || join(homedir(), '.folio', 'model-eval'),
		pythonBin: getPythonBinPath(),
		runnerPath: join(process.cwd(), 'scripts', 'model-eval-runner.py'),
		cwd: getAionLumenPath()
	};
}

export function getRealModelEvalRunnerConfig(): ModelEvalRunnerConfig {
	return {
		...getModelEvalRunnerConfig(),
		stateRoot: process.env.FOLIO_REAL_MODEL_EVAL_ROOT?.trim() || join(homedir(), '.folio', 'model-eval-real')
	};
}

function ensureRoot(path: string): string {
	if (!isAbsolute(path)) throw new Error('Model-eval state root must be absolute');
	if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe model-eval state root');
	return path;
}

function atomicJson(path: string, value: unknown): void {
	const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
	let fd: number | null = null;
	try {
		writeFileSync(temp, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
		fd = openSync(temp, 'r');
		fsyncSync(fd);
		closeSync(fd);
		fd = null;
		renameSync(temp, path);
	} finally {
		if (fd !== null) closeSync(fd);
		if (existsSync(temp)) unlinkSync(temp);
	}
}

function readJson(path: string, maxBytes: number): unknown {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error('Unsafe model-eval state');
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function isIso(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function parseLock(value: unknown): LockState | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const lock = value as Partial<LockState>;
	return Number.isSafeInteger(lock.pid) && Number(lock.pid) >= 0 && isIso(lock.startedAt) &&
		typeof lock.runId === 'string' && lock.runId.length <= 80 &&
		typeof lock.logPath === 'string' && isAbsolute(lock.logPath)
		? lock as LockState
		: null;
}

function pidAlive(pid: number): boolean {
	if (pid <= 0) return false;
	try { process.kill(pid, 0); return true; } catch { return false; }
}

function readProgress(root: string): ModelEvalProgress | null {
	const path = join(root, 'progress.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path, MAX_PROGRESS_BYTES) as Partial<ModelEvalProgress>;
		if (
			value.schema === 'folio/model-eval-progress/v1' && typeof value.run_id === 'string' &&
			['starting', 'loading', 'evaluating', 'restoring', 'completed', 'failed'].includes(String(value.phase)) &&
			isIso(value.started_at) && typeof value.total_models === 'number' && Number.isSafeInteger(value.total_models) &&
			typeof value.total_cases === 'number' && Number.isSafeInteger(value.total_cases)
		) return value as ModelEvalProgress;
	} catch { /* incomplete progress is non-authoritative */ }
	return null;
}

export function readLatestModelEvalResult(config = getModelEvalRunnerConfig()): ModelEvalResult | null {
	const root = ensureRoot(config.stateRoot);
	const path = join(root, 'latest.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path, MAX_RESULT_BYTES) as Partial<ModelEvalResult>;
		if (
			value.schema === 'folio/model-eval-result/v1' && typeof value.run_id === 'string' &&
			isIso(value.started_at) && isIso(value.finished_at) && Array.isArray(value.models)
		) return value as ModelEvalResult;
	} catch { /* damaged latest result is ignored */ }
	return null;
}

export function readModelEvalRunStatus(config = getModelEvalRunnerConfig()): ModelEvalRunStatus {
	const root = ensureRoot(config.stateRoot);
	const lockPath = join(root, 'run.lock');
	const progress = readProgress(root);
	if (existsSync(lockPath)) {
		let lock: LockState | null = null;
		try { lock = parseLock(readJson(lockPath, MAX_PROGRESS_BYTES)); } catch { lock = null; }
		if (lock) {
			const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(lock.startedAt)) / 1000));
			if (pidAlive(lock.pid) || (lock.pid === 0 && elapsedSeconds * 1000 < STARTING_GRACE_MS)) {
				return { state: 'running', startedAt: lock.startedAt, elapsedSeconds, progress };
			}
		}
		unlinkSync(lockPath);
	}
	const latest = readLatestModelEvalResult(config);
	const boundResult = latest?.run_id === progress?.run_id ? latest : null;
	if (progress?.phase === 'failed') return { state: 'failed', finishedAt: progress.finished_at ?? new Date().toISOString(), result: boundResult };
	if (progress?.phase === 'completed' && boundResult) return { state: 'completed', finishedAt: boundResult.finished_at, result: boundResult };
	if (progress && !['completed', 'failed'].includes(progress.phase)) {
		return { state: 'failed', finishedAt: new Date().toISOString(), result: null };
	}
	return { state: 'idle' };
}

function selectedCandidates(ids: string[], catalog: ModelEvalCatalog): ModelEvalCandidate[] {
	if (!Array.isArray(ids) || ids.length < 1 || ids.length > 6) throw new Error('Select between one and six models');
	const unique = [...new Set(ids)];
	if (unique.length !== ids.length) throw new Error('Duplicate model selection');
	const byId = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));
	return unique.map((id) => {
		const candidate = byId.get(id);
		if (!candidate) throw new Error(`Unknown model candidate: ${id}`);
		return candidate;
	});
}

export function startModelEvalRun(
	candidateIds: string[],
	catalog: ModelEvalCatalog,
	config = getModelEvalRunnerConfig(),
	input: ModelEvalRunInput = {}
): Extract<ModelEvalRunStatus, { state: 'running' }> {
	const candidates = selectedCandidates(candidateIds, catalog);
	if (input.cases && (input.cases.length !== catalog.suite.cases || input.cases.length > 500)) {
		throw new Error('Real-mail cases do not match the selected suite');
	}
	if (input.baseline_run_ids && (!Array.isArray(input.baseline_run_ids) ||
		input.baseline_run_ids.some((id) => typeof id !== 'string' || id.length > 80))) {
		throw new Error('Invalid baseline run ids');
	}
	const root = ensureRoot(config.stateRoot);
	const current = readModelEvalRunStatus(config);
	if (current.state === 'running') throw new ModelEvalBusyError(current);
	const pythonBin = realpathSync(config.pythonBin);
	if (!lstatSync(pythonBin).isFile()) throw new Error('Unsafe model-eval Python executable');
	const runnerStat = lstatSync(config.runnerPath);
	if (!runnerStat.isFile() || runnerStat.isSymbolicLink()) throw new Error('Unsafe model-eval runner');
	const runId = randomUUID();
	const startedAt = new Date().toISOString();
	const requestPath = join(root, `request-${runId}.json`);
	const logPath = join(root, `run-${runId}.log`);
	const lockPath = join(root, 'run.lock');
	atomicJson(requestPath, {
		schema: 'folio/model-eval-request/v1', run_id: runId, suite: catalog.suite,
		candidates: candidates.map(({ default: _default, ...candidate }) => candidate),
		...(input.cases ? { cases: input.cases } : {}),
		...(input.baseline_run_ids ? { baseline_run_ids: input.baseline_run_ids } : {})
	});
	let claimFd: number | null = null;
	let logFd: number | null = null;
	let ownsClaim = false;
	try {
		claimFd = openSync(lockPath, 'wx', 0o600);
		ownsClaim = true;
		writeFileSync(claimFd, `${JSON.stringify({ pid: 0, startedAt, runId, logPath })}\n`);
		fsyncSync(claimFd);
		closeSync(claimFd);
		claimFd = null;
		logFd = openSync(logPath, 'a', 0o600);
		const child = spawn(config.pythonBin, [config.runnerPath, '--request', requestPath, '--state-root', root], {
			cwd: config.cwd,
			env: { ...process.env, AION_LUMEN_PATH: config.cwd },
			stdio: ['ignore', logFd, logFd],
			detached: true
		});
		if (!child.pid) throw new Error('Model-eval runner did not start');
		const lock: LockState = { pid: child.pid, startedAt, runId, logPath };
		atomicJson(lockPath, lock);
		child.once('close', (code) => {
			try {
				// Real-mail requests are transport artifacts only. The Python runner
				// removes them after parsing; this is the crash-safe fallback.
				if (existsSync(requestPath)) unlinkSync(requestPath);
				const progress = readProgress(root);
				if (code !== 0 && (!progress || (progress.run_id === runId && !['completed', 'failed'].includes(progress.phase)))) {
					const failed: ModelEvalProgress = progress?.run_id === runId
						? { ...progress, phase: 'failed', finished_at: new Date().toISOString() }
						: {
							schema: 'folio/model-eval-progress/v1', run_id: runId, phase: 'failed',
							started_at: startedAt, finished_at: new Date().toISOString(),
							total_models: candidates.length, current_model: 0,
							total_cases: catalog.suite.cases, completed_cases: 0
						};
					atomicJson(join(root, 'progress.json'), failed);
				}
				if (existsSync(lockPath) && parseLock(readJson(lockPath, MAX_PROGRESS_BYTES))?.pid === lock.pid) unlinkSync(lockPath);
			} catch { /* reconciled by the next status read */ }
		});
		child.unref();
		return { state: 'running', startedAt, elapsedSeconds: 0, progress: null };
	} catch (error) {
		if (existsSync(requestPath)) unlinkSync(requestPath);
		if (ownsClaim && existsSync(lockPath)) unlinkSync(lockPath);
		throw error;
	} finally {
		if (claimFd !== null) closeSync(claimFd);
		if (logFd !== null) closeSync(logFd);
	}
}
