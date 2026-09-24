import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
	readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { getAionLumenPath, getPythonBinPath } from '../env.js';
import type { ModelEvalCandidate } from '../model-eval/catalog.js';
import {
	MailMemoryError,
	type MailMemoryCandidateEnvelope,
	type MailMemoryInput,
	type ProposedMailMemoryFact,
	type ValidatedMailMemoryProposal,
	validateMailMemoryEnvelope
} from './mail-candidates.js';

const MAX_STATE_BYTES = 8 * 1024 * 1024;
const STARTING_GRACE_MS = 15_000;

export interface MemoryEvalCaseRequest {
	case_id: string;
	input: MailMemoryInput;
	prompt: string;
}

interface MemoryEvalRequest {
	schema: 'folio/memory-eval-request/v1';
	run_id: string;
	models: Array<Omit<ModelEvalCandidate, 'default'>>;
	cases: MemoryEvalCaseRequest[];
	response_format: Record<string, unknown>;
}

export interface MemoryEvalOutput {
	case_id: string;
	input_sha256?: string;
	latency_seconds?: number;
	response?: MailMemoryCandidateEnvelope;
	kind?: string;
	detail?: string;
	raw_excerpt?: string;
}

export interface MemoryEvalModelResult {
	id?: string;
	label?: string;
	model_id?: string;
	variant?: string;
	response_strip?: string;
	error?: string;
	outputs?: MemoryEvalOutput[];
}

export interface MemoryEvalResult {
	schema: 'folio/memory-eval-result/v1';
	run_id: string;
	started_at: string;
	finished_at: string;
	prior_model: string | null;
	restore_warning: string | null;
	models: MemoryEvalModelResult[];
}

export interface MemoryEvalProgress {
	schema: 'folio/memory-eval-progress/v1';
	run_id: string;
	phase: 'starting' | 'loading' | 'evaluating' | 'restoring' | 'completed' | 'failed';
	started_at: string;
	finished_at?: string;
	total_models: number;
	current_model: number;
	total_cases: number;
	completed_cases: number;
	model_id?: string;
	model_label?: string;
	case_id?: string;
}

export type MemoryEvalRunStatus =
	| { state: 'idle' }
	| { state: 'running'; startedAt: string; elapsedSeconds: number; progress: MemoryEvalProgress | null }
	| { state: 'completed'; finishedAt: string; result: MemoryEvalResult }
	| { state: 'failed'; finishedAt: string; result: MemoryEvalResult | null };

type LockState = { pid: number; startedAt: string; runId: string; logPath: string };

export interface MemoryEvalRunnerConfig {
	stateRoot: string;
	pythonBin: string;
	runnerPath: string;
	cwd: string;
}

export interface MemoryEvalModelView {
	id: string;
	label: string;
	model_id: string;
	latency_seconds: number | null;
	status: 'valid' | 'empty' | 'invalid' | 'failed';
	error: string | null;
	proposal: ValidatedMailMemoryProposal | null;
}

export interface MemoryEvalCandidateView {
	key: string;
	kind: 'application' | 'fact';
	label: string;
	value: string;
	sensitivity: 'private' | 'sensitive';
	valid_from: string | null;
	support: number;
	model_ids: string[];
	evidence: string[];
}

export interface MemoryEvalCaseView {
	case_id: string;
	feedback_id: number;
	source_ref: string;
	domain: string;
	sender: string;
	subject: string;
	received_at: string | null;
	models: MemoryEvalModelView[];
	candidates: MemoryEvalCandidateView[];
}

export interface MemoryEvalView {
	run_id: string;
	started_at: string;
	finished_at: string;
	restore_warning: string | null;
	cases: MemoryEvalCaseView[];
}

export class MemoryEvalBusyError extends Error {
	constructor(public readonly status: Extract<MemoryEvalRunStatus, { state: 'running' }>) {
		super('Memory evaluation is already running');
	}
}

export function getMemoryEvalRunnerConfig(): MemoryEvalRunnerConfig {
	return {
		stateRoot: process.env.FOLIO_MEMORY_EVAL_ROOT?.trim() || join(homedir(), '.folio', 'memory-eval'),
		pythonBin: getPythonBinPath(),
		runnerPath: join(process.cwd(), 'scripts', 'memory-eval-runner.py'),
		cwd: getAionLumenPath()
	};
}

function ensureRoot(path: string): string {
	if (!isAbsolute(path)) throw new Error('Memory-eval state root must be absolute');
	if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe memory-eval state root');
	return path;
}

function atomicJson(path: string, value: unknown): void {
	const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
	let fd: number | null = null;
	try {
		writeFileSync(temp, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
		fd = openSync(temp, 'r'); fsyncSync(fd); closeSync(fd); fd = null;
		renameSync(temp, path);
	} finally {
		if (fd !== null) closeSync(fd);
		if (existsSync(temp)) unlinkSync(temp);
	}
}

function readJson(path: string): unknown {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) throw new Error('Unsafe memory-eval state');
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
		typeof lock.logPath === 'string' && isAbsolute(lock.logPath) ? lock as LockState : null;
}

function pidAlive(pid: number): boolean {
	if (pid <= 0) return false;
	try { process.kill(pid, 0); return true; } catch { return false; }
}

function readProgress(root: string): MemoryEvalProgress | null {
	const path = join(root, 'progress.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MemoryEvalProgress>;
		if (value.schema === 'folio/memory-eval-progress/v1' && typeof value.run_id === 'string' &&
			['starting', 'loading', 'evaluating', 'restoring', 'completed', 'failed'].includes(String(value.phase)) &&
			isIso(value.started_at) && Number.isSafeInteger(value.total_models) && Number.isSafeInteger(value.total_cases)) {
			return value as MemoryEvalProgress;
		}
	} catch { /* an incomplete progress write is not authoritative */ }
	return null;
}

export function readLatestMemoryEvalResult(config = getMemoryEvalRunnerConfig()): MemoryEvalResult | null {
	const root = ensureRoot(config.stateRoot);
	const path = join(root, 'latest.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MemoryEvalResult>;
		if (value.schema === 'folio/memory-eval-result/v1' && typeof value.run_id === 'string' &&
			isIso(value.started_at) && isIso(value.finished_at) && Array.isArray(value.models)) return value as MemoryEvalResult;
	} catch { /* damaged latest is ignored */ }
	return null;
}

function readRequest(runId: string, config = getMemoryEvalRunnerConfig()): MemoryEvalRequest | null {
	const path = join(ensureRoot(config.stateRoot), `request-${runId}.json`);
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MemoryEvalRequest>;
		return value.schema === 'folio/memory-eval-request/v1' && value.run_id === runId &&
			Array.isArray(value.models) && Array.isArray(value.cases) ? value as MemoryEvalRequest : null;
	} catch { return null; }
}

export function readMemoryEvalRunStatus(config = getMemoryEvalRunnerConfig()): MemoryEvalRunStatus {
	const root = ensureRoot(config.stateRoot);
	const lockPath = join(root, 'run.lock');
	const progress = readProgress(root);
	if (existsSync(lockPath)) {
		let lock: LockState | null = null;
		try { lock = parseLock(readJson(lockPath)); } catch { lock = null; }
		if (lock) {
			const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(lock.startedAt)) / 1000));
			if (pidAlive(lock.pid) || (lock.pid === 0 && elapsedSeconds * 1000 < STARTING_GRACE_MS)) {
				return { state: 'running', startedAt: lock.startedAt, elapsedSeconds, progress };
			}
		}
		unlinkSync(lockPath);
	}
	const latest = readLatestMemoryEvalResult(config);
	const bound = latest?.run_id === progress?.run_id ? latest : null;
	if (progress?.phase === 'failed') return { state: 'failed', finishedAt: progress.finished_at ?? new Date().toISOString(), result: bound };
	if (progress?.phase === 'completed' && bound) return { state: 'completed', finishedAt: bound.finished_at, result: bound };
	if (progress && !['completed', 'failed'].includes(progress.phase)) return { state: 'failed', finishedAt: new Date().toISOString(), result: null };
	return { state: 'idle' };
}

export function startMemoryEvalRun(
	models: ModelEvalCandidate[],
	cases: MemoryEvalCaseRequest[],
	responseFormat: Record<string, unknown>,
	config = getMemoryEvalRunnerConfig()
): Extract<MemoryEvalRunStatus, { state: 'running' }> {
	if (models.length < 1 || models.length > 6 || cases.length < 1 || cases.length > 12) throw new Error('Choose 1–6 models and 1–12 mails');
	if (new Set(models.map((model) => model.id)).size !== models.length) throw new Error('Duplicate model selection');
	if (new Set(cases.map((item) => item.case_id)).size !== cases.length) throw new Error('Duplicate mail selection');
	const root = ensureRoot(config.stateRoot);
	const current = readMemoryEvalRunStatus(config);
	if (current.state === 'running') throw new MemoryEvalBusyError(current);
	const pythonBin = realpathSync(config.pythonBin);
	if (!lstatSync(pythonBin).isFile()) throw new Error('Unsafe memory-eval Python executable');
	const runnerStat = lstatSync(config.runnerPath);
	if (!runnerStat.isFile() || runnerStat.isSymbolicLink()) throw new Error('Unsafe memory-eval runner');
	const runId = randomUUID();
	const startedAt = new Date().toISOString();
	const requestPath = join(root, `request-${runId}.json`);
	const logPath = join(root, `run-${runId}.log`);
	const lockPath = join(root, 'run.lock');
	atomicJson(requestPath, {
		schema: 'folio/memory-eval-request/v1', run_id: runId,
		models: models.map(({ default: _default, ...model }) => model), cases,
		response_format: responseFormat
	} satisfies MemoryEvalRequest);
	let claimFd: number | null = null;
	let logFd: number | null = null;
	let ownsClaim = false;
	try {
		claimFd = openSync(lockPath, 'wx', 0o600); ownsClaim = true;
		writeFileSync(claimFd, `${JSON.stringify({ pid: 0, startedAt, runId, logPath })}\n`); fsyncSync(claimFd);
		closeSync(claimFd); claimFd = null;
		logFd = openSync(logPath, 'a', 0o600);
		const child = spawn(config.pythonBin, [config.runnerPath, '--request', requestPath, '--state-root', root], {
			cwd: config.cwd, env: { ...process.env, AION_LUMEN_PATH: config.cwd }, stdio: ['ignore', logFd, logFd], detached: true
		});
		if (!child.pid) throw new Error('Memory-eval runner did not start');
		const lock: LockState = { pid: child.pid, startedAt, runId, logPath };
		atomicJson(lockPath, lock);
		child.once('close', (code) => {
			try {
				const progress = readProgress(root);
				if (code !== 0 && (!progress || (progress.run_id === runId && !['completed', 'failed'].includes(progress.phase)))) {
					atomicJson(join(root, 'progress.json'), {
						schema: 'folio/memory-eval-progress/v1', run_id: runId, phase: 'failed', started_at: startedAt,
						finished_at: new Date().toISOString(), total_models: models.length, current_model: 0,
						total_cases: cases.length, completed_cases: 0
					} satisfies MemoryEvalProgress);
				}
				if (existsSync(lockPath) && parseLock(readJson(lockPath))?.pid === lock.pid) unlinkSync(lockPath);
			} catch { /* reconciled by next read */ }
		});
		child.unref();
		return { state: 'running', startedAt, elapsedSeconds: 0, progress: null };
	} catch (error) {
		if (ownsClaim && existsSync(lockPath)) unlinkSync(lockPath);
		throw error;
	} finally {
		if (claimFd !== null) closeSync(claimFd);
		if (logFd !== null) closeSync(logFd);
	}
}

function normalized(value: string): string {
	return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH');
}

function proposalItems(proposal: ValidatedMailMemoryProposal): Array<Omit<MemoryEvalCandidateView, 'support' | 'model_ids'>> {
	if (proposal.application) {
		const application = proposal.application;
		return [
			{
				key: `application:${normalized(application.organization)}:${normalized(application.role)}:${application.status}`,
				kind: 'application', label: `${application.role} · ${application.organization}`,
				value: application.status, sensitivity: 'private', valid_from: proposal.event_date,
				evidence: [application.identity_quote, application.status_quote]
			},
			...(application.contact ? [{
				key: `fact:contact:${normalized(application.contact.address)}`, kind: 'fact' as const,
				label: application.contact.label ?? 'Kontakt', value: application.contact.address,
				sensitivity: 'private' as const, valid_from: null, evidence: [application.contact.evidence_quote]
			}] : [])
		];
	}
	return proposal.facts.map((fact: ProposedMailMemoryFact) => ({
		key: `fact:${fact.data_class}:${fact.predicate}:${normalized(fact.value)}:${fact.valid_from ?? ''}`,
		kind: 'fact' as const, label: fact.subject, value: fact.value, sensitivity: fact.sensitivity,
		valid_from: fact.valid_from, evidence: [fact.evidence_quote]
	}));
}

export function buildMemoryEvalView(result: MemoryEvalResult, config = getMemoryEvalRunnerConfig()): MemoryEvalView | null {
	const request = readRequest(result.run_id, config);
	if (!request) return null;
	return {
		run_id: result.run_id, started_at: result.started_at, finished_at: result.finished_at,
		restore_warning: result.restore_warning,
		cases: request.cases.map((item) => {
			const models: MemoryEvalModelView[] = result.models.filter((model) => model.id).map((model) => {
				const output = model.outputs?.find((row) => row.case_id === item.case_id);
				let proposal: ValidatedMailMemoryProposal | null = null;
				let status: MemoryEvalModelView['status'] = output?.response ? 'valid' : 'failed';
				let error = output?.kind ?? model.error ?? null;
				if (output?.response) {
					try {
						proposal = validateMailMemoryEnvelope(item.input, output.response);
						status = proposal.application || proposal.facts.length ? 'valid' : 'empty';
						error = null;
					} catch (cause) {
						status = 'invalid';
						error = cause instanceof MailMemoryError ? cause.message : 'Ungültiger Modellvorschlag';
					}
				}
				return {
					id: model.id!, label: model.label ?? model.id!, model_id: model.model_id ?? model.id!,
					latency_seconds: output?.latency_seconds ?? null, status, error, proposal
				};
			});
			const grouped = new Map<string, MemoryEvalCandidateView>();
			for (const model of models) {
				if (!model.proposal) continue;
				for (const candidate of proposalItems(model.proposal)) {
					const existing = grouped.get(candidate.key);
					if (existing) {
						existing.support += 1;
						existing.model_ids.push(model.id);
						existing.evidence = [...new Set([...existing.evidence, ...candidate.evidence])];
					} else grouped.set(candidate.key, { ...candidate, support: 1, model_ids: [model.id] });
				}
			}
			const input = item.input;
			return {
				case_id: item.case_id, feedback_id: input.feedback_id,
				source_ref: `mail:${input.account_id}:${input.imap_uid}`,
				domain: models.find((model) => model.proposal)?.proposal?.domain ?? input.mail_domain ?? 'unknown',
				sender: input.sender, subject: input.subject, received_at: input.received_at, models,
				candidates: [...grouped.values()].sort((a, b) => b.support - a.support || a.label.localeCompare(b.label, 'de'))
			};
		})
	};
}
