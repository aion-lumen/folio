import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
	readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { getAionLumenPath, getLmStudioBaseUrl } from '../env.js';
import type { ModelEvalCandidate } from '../model-eval/catalog.js';

export const MAIL_SELECTION_DOMAINS = [
	'immo', 'job', 'shopping', 'finance', 'kontakt', 'werbung', 'system', 'unsorted'
] as const;
export type MailSelectionDomain = (typeof MAIL_SELECTION_DOMAINS)[number];
export type MailSelectionCategory = 'normal' | 'boundary' | 'cross_domain' | 'detail_rich';
export type MailSelectionTrait =
	| 'boundary'
	| 'cross_domain'
	| 'detail_rich'
	| 'action_required'
	| 'deadline_present';

export interface MailSelectionCandidate {
	feedback_id: number;
	account_id: string;
	sender: string;
	subject: string;
	received_at: string | null;
	mail_domain: MailSelectionDomain;
	body: string;
}

export interface MailSelectionPick {
	feedback_id: number;
	/** v1-exclusive result, retained for old frozen runs. */
	category?: MailSelectionCategory;
	/** v2-multilabel result. Empty means a normal case. */
	traits?: MailSelectionTrait[];
	secondary_domains: MailSelectionDomain[];
	reason_codes: Array<
		'clear_intent' | 'competing_domain' | 'low_signal' | 'rich_identifiers' |
		'rich_timeline' | 'ambiguous_sender' | 'workflow_edge' | 'routine_pattern' |
		'action_required' | 'explicit_deadline'
	>;
}

export function mailSelectionTraits(pick: MailSelectionPick): MailSelectionTrait[] {
	if (Array.isArray(pick.traits)) return pick.traits;
	return pick.category && pick.category !== 'normal' ? [pick.category] : [];
}

export interface MailSelectionOutput {
	schema: 'folio/memory-mail-selection/v1' | 'folio/memory-mail-selection/v2';
	domain: MailSelectionDomain;
	selections: MailSelectionPick[];
}

export type MailSelectionWarningCode =
	| 'cross_domain_added_for_secondary'
	| 'cross_domain_removed_without_secondary'
	| 'duplicate_feedback_ids_replaced'
	| 'traits_added_for_reason_codes'
	| 'trait_coverage_shortfall';

export interface MailSelectionWarning {
	code: MailSelectionWarningCode;
	count?: number;
	actual?: Record<string, number>;
	minimum?: Record<string, number>;
}

export interface MailSelectionQuality {
	selected: number;
	target: number;
	normal: number;
	boundary: number;
	cross_domain: number;
	detail_rich: number;
	action_required: number;
	deadline_present: number;
	trait_quota_met: boolean;
}

export interface MailSelectionModelResult {
	id: string;
	label: string;
	model_id: string;
	variant: string;
	outputs: Array<{
		domain: MailSelectionDomain;
		target_count: number;
		latency_seconds: number;
		status: 'valid' | 'valid_with_warnings' | 'invalid' | 'failed';
		selection?: MailSelectionOutput;
		warnings?: MailSelectionWarning[];
		quality?: MailSelectionQuality;
		detail?: string;
	}>;
}

export interface MailSelectionResult {
	schema: 'folio/memory-selection-result/v1';
	run_id: string;
	started_at: string;
	finished_at: string;
	prior_model: string | null;
	restore_warning: string | null;
	baseline_run_id?: string | null;
	pool_counts: Record<MailSelectionDomain, number>;
	models: MailSelectionModelResult[];
}

export interface MailSelectionProgress {
	schema: 'folio/memory-selection-progress/v1';
	run_id: string;
	phase: 'starting' | 'loading' | 'selecting' | 'restoring' | 'completed' | 'failed' | 'aborted';
	started_at: string;
	finished_at?: string;
	total_models: number;
	current_model: number;
	total_domains: number;
	completed_domains: number;
	model_id?: string;
	model_label?: string;
	domain?: MailSelectionDomain;
}

export type MailSelectionRunStatus =
	| { state: 'idle' }
	| { state: 'running'; startedAt: string; elapsedSeconds: number; progress: MailSelectionProgress | null }
	| { state: 'completed'; finishedAt: string; result: MailSelectionResult }
	| { state: 'failed'; finishedAt: string; result: MailSelectionResult | null }
	| { state: 'aborted'; finishedAt: string; result: MailSelectionResult | null };

export interface MailSelectionRunnerConfig {
	stateRoot: string;
	pythonBin: string;
	runnerPath: string;
	cwd: string;
	hermesHome: string;
}

type LockState = { pid: number; startedAt: string; runId: string; logPath: string };
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const STARTING_GRACE_MS = 15_000;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MailSelectionBusyError extends Error {
	constructor(public readonly status: Extract<MailSelectionRunStatus, { state: 'running' }>) {
		super('Memory mail selection is already running');
	}
}

function getHermesPythonBinPath(): string {
	const configured = process.env.HERMES_PYTHON_BIN?.trim();
	if (configured) return configured;
	const launcher = join(homedir(), '.local', 'bin', 'hermes');
	if (existsSync(launcher)) {
		const firstLine = readFileSync(launcher, 'utf8').split('\n', 1)[0]?.trim();
		const shebang = firstLine?.match(/^#!(\/.+)$/)?.[1];
		if (shebang) return shebang;
	}
	throw new Error('Hermes Python executable not found; set HERMES_PYTHON_BIN');
}

export function getMailSelectionRunnerConfig(): MailSelectionRunnerConfig {
	return {
		stateRoot: process.env.FOLIO_MEMORY_SELECTION_ROOT?.trim() || join(homedir(), '.folio', 'memory-selection'),
		// Reading saved results/status does not require an installed model runtime.
		// Resolve and validate the executable only when a run actually needs it.
		get pythonBin() { return getHermesPythonBinPath(); },
		runnerPath: join(process.cwd(), 'scripts', 'memory-selection-runner.py'),
		cwd: getAionLumenPath(),
		hermesHome: join(homedir(), '.hermes', 'hermes-agent')
	};
}

function ensureRoot(path: string): string {
	if (!isAbsolute(path)) throw new Error('Memory-selection state root must be absolute');
	if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe memory-selection state root');
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
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) {
		throw new Error('Unsafe memory-selection state');
	}
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function isIso(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function parseLock(value: unknown): LockState | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const lock = value as Partial<LockState>;
	return Number.isSafeInteger(lock.pid) && Number(lock.pid) >= 0 && isIso(lock.startedAt) &&
		typeof lock.runId === 'string' && RUN_ID_PATTERN.test(lock.runId) &&
		typeof lock.logPath === 'string' && isAbsolute(lock.logPath) ? lock as LockState : null;
}

function purgeAbandonedRun(root: string, runId: string): void {
	if (!RUN_ID_PATTERN.test(runId)) return;
	const requestPath = join(root, `request-${runId}.json`);
	const runtimePath = join(root, `runtime-${runId}`);
	if (existsSync(requestPath)) unlinkSync(requestPath);
	if (existsSync(runtimePath)) rmSync(runtimePath, { recursive: true, force: true });
}

function pidAlive(pid: number): boolean {
	if (pid <= 0) return false;
	try { process.kill(pid, 0); return true; } catch { return false; }
}

function readProgress(root: string): MailSelectionProgress | null {
	const path = join(root, 'progress.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MailSelectionProgress>;
		if (value.schema === 'folio/memory-selection-progress/v1' && typeof value.run_id === 'string' &&
			['starting', 'loading', 'selecting', 'restoring', 'completed', 'failed', 'aborted'].includes(String(value.phase)) &&
			isIso(value.started_at) && Number.isSafeInteger(value.total_models) && Number.isSafeInteger(value.total_domains)) {
			return value as MailSelectionProgress;
		}
	} catch { /* incomplete writes are not authoritative */ }
	return null;
}

export function readLatestMailSelectionResult(config = getMailSelectionRunnerConfig()): MailSelectionResult | null {
	const path = join(ensureRoot(config.stateRoot), 'latest.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MailSelectionResult>;
		if (value.schema === 'folio/memory-selection-result/v1' && typeof value.run_id === 'string' &&
			isIso(value.started_at) && isIso(value.finished_at) && Array.isArray(value.models)) {
			return value as MailSelectionResult;
		}
	} catch { /* damaged latest is ignored */ }
	return null;
}

export function readStoredMailSelectionResult(
	runId: string,
	config = getMailSelectionRunnerConfig()
): MailSelectionResult | null {
	if (!RUN_ID_PATTERN.test(runId)) return null;
	const path = join(ensureRoot(config.stateRoot), 'results', `${runId}.json`);
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MailSelectionResult>;
		if (value.schema === 'folio/memory-selection-result/v1' && value.run_id === runId &&
			isIso(value.started_at) && isIso(value.finished_at) && Array.isArray(value.models)) {
			return value as MailSelectionResult;
		}
	} catch { /* damaged history is ignored */ }
	return null;
}

/** Return the frozen human-review lineage in oldest-to-newest order. */
export function mailSelectionBaselineRunIds(
	result: MailSelectionResult,
	config = getMailSelectionRunnerConfig()
): string[] {
	const newestFirst: string[] = [];
	const seen = new Set<string>();
	let runId = result.baseline_run_id ?? null;
	while (runId && RUN_ID_PATTERN.test(runId) && !seen.has(runId) && newestFirst.length < 100) {
		seen.add(runId);
		newestFirst.push(runId);
		runId = readStoredMailSelectionResult(runId, config)?.baseline_run_id ?? null;
	}
	return newestFirst.reverse();
}

function readPartialMailSelectionResult(config = getMailSelectionRunnerConfig()): MailSelectionResult | null {
	const path = join(ensureRoot(config.stateRoot), 'partial.json');
	if (!existsSync(path)) return null;
	try {
		const value = readJson(path) as Partial<MailSelectionResult>;
		if (value.schema === 'folio/memory-selection-result/v1' && typeof value.run_id === 'string' &&
			isIso(value.started_at) && isIso(value.finished_at) && Array.isArray(value.models)) {
			return value as MailSelectionResult;
		}
	} catch { /* damaged checkpoints are ignored */ }
	return null;
}

export function readMailSelectionRunStatus(config = getMailSelectionRunnerConfig()): MailSelectionRunStatus {
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
			purgeAbandonedRun(root, lock.runId);
		}
		unlinkSync(lockPath);
	}
	const latest = readLatestMailSelectionResult(config);
	const bound = latest?.run_id === progress?.run_id ? latest : null;
	const partial = readPartialMailSelectionResult(config);
	const boundPartial = partial?.run_id === progress?.run_id ? partial : null;
	if (progress?.phase === 'failed') return { state: 'failed', finishedAt: progress.finished_at ?? new Date().toISOString(), result: bound ?? boundPartial };
	if (progress?.phase === 'aborted') return { state: 'aborted', finishedAt: progress.finished_at ?? new Date().toISOString(), result: bound ?? boundPartial };
	if (progress?.phase === 'completed' && bound) return { state: 'completed', finishedAt: bound.finished_at, result: bound };
	if (progress && !['completed', 'failed', 'aborted'].includes(progress.phase)) return { state: 'failed', finishedAt: new Date().toISOString(), result: boundPartial };
	return { state: 'idle' };
}

export async function checkMailSelectionServer(): Promise<void> {
	const base = getLmStudioBaseUrl().replace(/\/$/, '');
	try {
		const response = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(5_000) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
	} catch {
		throw new Error(`LM Studio ist unter ${base} nicht erreichbar. Lokalen Server zuerst starten.`);
	}
}

export function cancelMailSelectionRun(config = getMailSelectionRunnerConfig()): MailSelectionRunStatus {
	const root = ensureRoot(config.stateRoot);
	const lockPath = join(root, 'run.lock');
	if (!existsSync(lockPath)) return readMailSelectionRunStatus(config);
	let lock: LockState | null = null;
	try { lock = parseLock(readJson(lockPath)); } catch { lock = null; }
	if (!lock || !pidAlive(lock.pid)) return readMailSelectionRunStatus(config);
	process.kill(lock.pid, 'SIGTERM');
	return readMailSelectionRunStatus(config);
}

export function startMailSelectionRun(
	models: ModelEvalCandidate[],
	candidates: MailSelectionCandidate[],
	baselineRunId: string | null = null,
	config = getMailSelectionRunnerConfig()
): Extract<MailSelectionRunStatus, { state: 'running' }> {
	if (models.length < 2 || models.length > 6) throw new Error('Choose 2–6 models');
	if (!candidates.length || candidates.length > 2_000) throw new Error('No usable real mails found');
	if (new Set(models.map((model) => model.id)).size !== models.length) throw new Error('Duplicate model selection');
	if (new Set(candidates.map((item) => item.feedback_id)).size !== candidates.length) throw new Error('Duplicate mail candidate');
	const root = ensureRoot(config.stateRoot);
	const current = readMailSelectionRunStatus(config);
	if (current.state === 'running') throw new MailSelectionBusyError(current);
	const pythonBin = realpathSync(config.pythonBin);
	if (!lstatSync(pythonBin).isFile()) throw new Error('Unsafe memory-selection Python executable');
	const runnerStat = lstatSync(config.runnerPath);
	if (!runnerStat.isFile() || runnerStat.isSymbolicLink()) throw new Error('Unsafe memory-selection runner');
	const hermesStat = lstatSync(config.hermesHome);
	if (!hermesStat.isDirectory() || hermesStat.isSymbolicLink()) throw new Error('Unsafe Hermes home');

	const runId = randomUUID();
	const startedAt = new Date().toISOString();
	const requestPath = join(root, `request-${runId}.json`);
	const logPath = join(root, `run-${runId}.log`);
	const lockPath = join(root, 'run.lock');
	atomicJson(requestPath, {
		schema: 'folio/memory-selection-request/v1', run_id: runId,
		baseline_run_id: baselineRunId,
		models: models.map(({ default: _default, ...model }) => model), candidates
	});
	let claimFd: number | null = null;
	let logFd: number | null = null;
	let ownsClaim = false;
	try {
		claimFd = openSync(lockPath, 'wx', 0o600); ownsClaim = true;
		writeFileSync(claimFd, `${JSON.stringify({ pid: 0, startedAt, runId, logPath })}\n`); fsyncSync(claimFd);
		closeSync(claimFd); claimFd = null;
		logFd = openSync(logPath, 'a', 0o600);
		const child = spawn(config.pythonBin, [config.runnerPath, '--request', requestPath, '--state-root', root, '--hermes-home', config.hermesHome], {
			cwd: config.cwd, env: { ...process.env, AION_LUMEN_PATH: config.cwd },
			stdio: ['ignore', logFd, logFd], detached: true
		});
		if (!child.pid) throw new Error('Memory-selection runner did not start');
		const lock: LockState = { pid: child.pid, startedAt, runId, logPath };
		atomicJson(lockPath, lock);
		child.once('close', (code) => {
			try {
				const progress = readProgress(root);
				if (code !== 0 && (!progress || (progress.run_id === runId && !['completed', 'failed', 'aborted'].includes(progress.phase)))) {
					purgeAbandonedRun(root, runId);
					atomicJson(join(root, 'progress.json'), {
						schema: 'folio/memory-selection-progress/v1', run_id: runId, phase: 'failed',
						started_at: startedAt, finished_at: new Date().toISOString(), total_models: models.length,
						current_model: 0, total_domains: MAIL_SELECTION_DOMAINS.length, completed_domains: 0
					} satisfies MailSelectionProgress);
				}
				if (existsSync(lockPath) && parseLock(readJson(lockPath))?.pid === lock.pid) unlinkSync(lockPath);
			} catch { /* next status read reconciles */ }
		});
		child.unref();
		return { state: 'running', startedAt, elapsedSeconds: 0, progress: null };
	} catch (cause) {
		if (ownsClaim && existsSync(lockPath)) unlinkSync(lockPath);
		if (existsSync(requestPath)) unlinkSync(requestPath);
		throw cause;
	} finally {
		if (claimFd !== null) closeSync(claimFd);
		if (logFd !== null) closeSync(logFd);
	}
}

export function buildMailSelectionView(result: MailSelectionResult | null) {
	if (!result) return null;
	const allModels = result.models.map((model) => model.id);
	const domains = MAIL_SELECTION_DOMAINS.map((domain) => {
		const byModel = result.models.map((model) => {
			const output = model.outputs.find((item) => item.domain === domain);
			return {
				model_id: model.id, label: model.label, status: output?.status ?? 'failed',
				target_count: output?.target_count ?? Math.min(10, result.pool_counts[domain]),
				latency_seconds: output?.latency_seconds ?? null,
				selections: output?.selection?.selections ?? [], detail: output?.detail ?? null,
				warnings: output?.warnings ?? [], quality: output?.quality ?? null
			};
		});
		const support = new Map<number, {
			feedback_id: number; support: number; model_ids: string[]; categories: MailSelectionCategory[];
			traits: MailSelectionTrait[];
			secondary_domains: MailSelectionDomain[]; reason_codes: string[];
		}>();
		for (const model of byModel) for (const pick of model.selections) {
			const current = support.get(pick.feedback_id) ?? {
				feedback_id: pick.feedback_id, support: 0, model_ids: [], categories: [],
				traits: [],
				secondary_domains: [], reason_codes: []
			};
			current.support += 1; current.model_ids.push(model.model_id);
			if (pick.category) current.categories.push(pick.category);
			for (const trait of mailSelectionTraits(pick)) {
				if (!current.traits.includes(trait)) current.traits.push(trait);
			}
			for (const secondary of pick.secondary_domains) {
				if (!current.secondary_domains.includes(secondary)) current.secondary_domains.push(secondary);
			}
			for (const reason of pick.reason_codes) {
				if (!current.reason_codes.includes(reason)) current.reason_codes.push(reason);
			}
			support.set(pick.feedback_id, current);
		}
		return {
			domain, pool_count: result.pool_counts[domain], target_count: Math.min(10, result.pool_counts[domain]),
			models: byModel,
			consensus: [...support.values()].sort((a, b) => b.support - a.support || a.feedback_id - b.feedback_id),
			model_count: allModels.length
		};
	});
	const scores = result.models.map((model) => {
		const usable = model.outputs.filter((item) => item.status === 'valid' || item.status === 'valid_with_warnings');
		const strict = usable.filter((item) => item.status === 'valid');
		const picked = usable.flatMap((item) => item.selection?.selections ?? []);
		const expected = model.outputs.reduce((sum, item) => sum + item.target_count, 0);
		return {
			id: model.id, label: model.label,
			usable_domains: usable.length, strict_domains: strict.length,
			warning_domains: usable.length - strict.length, total_domains: model.outputs.length,
			coverage: expected ? picked.length / expected : 0,
			boundary: picked.filter((item) => mailSelectionTraits(item).includes('boundary')).length,
			cross_domain: picked.filter((item) => mailSelectionTraits(item).includes('cross_domain')).length,
			detail_rich: picked.filter((item) => mailSelectionTraits(item).includes('detail_rich')).length,
			action_required: picked.filter((item) => mailSelectionTraits(item).includes('action_required')).length,
			deadline_present: picked.filter((item) => mailSelectionTraits(item).includes('deadline_present')).length
		};
	});
	return { run_id: result.run_id, started_at: result.started_at, finished_at: result.finished_at, domains, scores };
}

export function hydrateMailSelectionView(
	view: ReturnType<typeof buildMailSelectionView>,
	mails: Map<number, { subject: string; sender: string; account_id: string | null; mail_date: string | null }>
) {
	if (!view) return null;
	return {
		...view,
		domains: view.domains.map((domain) => ({
			...domain,
			consensus: domain.consensus.map((item) => ({ ...item, mail: mails.get(item.feedback_id) ?? null }))
		}))
	};
}
