import { spawn } from 'node:child_process';
import {
	accessSync,
	closeSync,
	constants,
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
import { dirname, isAbsolute, join } from 'node:path';
import { getModuleDatabasePath } from '../index.js';

const MAX_STATE_BYTES = 64 * 1024;
const STARTING_GRACE_MS = 15_000;

export interface SonarSearchRunnerConfig {
	runnerPath: string | null;
	stateRoot: string;
	/** Bounded wall time, including network and model selection. */
	timeoutMs?: number;
}

export interface SonarSearchSummary {
	queries: number;
	fetched: number;
	liked: number;
	bookmarked: number;
	searched: number;
	eligible: number;
	selected: number;
	created: number;
	acquisition: 'likes-only' | 'likes+search' | 'likes+bookmarks' | 'likes+bookmarks+search' | 'cache';
	estimatedPostReadCostUsd: number;
	notification: 'skipped' | 'sent' | 'failed';
}

export type SonarSearchRunStatus =
	| { state: 'idle'; configured: boolean }
	| { state: 'running'; configured: true; startedAt: string; elapsedSeconds: number }
	| { state: 'completed'; configured: true; startedAt: string; finishedAt: string; summary: SonarSearchSummary }
	| { state: 'failed'; configured: true; startedAt: string; finishedAt: string; message?: string };

interface LockState {
	pid: number;
	startedAt: string;
	logPath: string;
}

export class SonarSearchBusyError extends Error {
	constructor(public readonly status: Extract<SonarSearchRunStatus, { state: 'running' }>) {
		super('Sonar placement search is already running');
		this.name = 'SonarSearchBusyError';
	}
}

export function getSonarSearchRunnerConfig(capability: 'search.read' | 'search.execute' = 'search.read'): SonarSearchRunnerConfig {
	const stateRoot = getModuleDatabasePath('sonar', 'search-state', capability);
	if (!stateRoot) throw new Error('Sonar search state is not available');
	return {
		runnerPath: process.env.FOLIO_SONAR_SEARCH_RUNNER?.trim() || null,
		stateRoot
	};
}

function ensureRoot(root: string): string {
	if (!isAbsolute(root)) throw new Error('Sonar search state root must be absolute');
	if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
	const stat = lstatSync(root);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe Sonar search state root');
	return realpathSync(root);
}

function safeRunner(path: string | null): string {
	if (!path || !isAbsolute(path) || !existsSync(path)) throw new Error('Sonar search runner is not configured');
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) throw new Error('Unsafe Sonar search runner');
	accessSync(path, constants.X_OK);
	return realpathSync(path);
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

function readSmallJson(path: string): unknown {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) throw new Error('Unsafe Sonar search state');
	return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function validIso(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function parseLock(value: unknown): LockState | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const lock = value as Partial<LockState>;
	return Number.isSafeInteger(lock.pid) && Number(lock.pid) >= 0 && validIso(lock.startedAt) &&
		typeof lock.logPath === 'string' && isAbsolute(lock.logPath)
		? lock as LockState
		: null;
}

function pidAlive(pid: number): boolean {
	if (pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function parseSummary(logPath: string): SonarSearchSummary | null {
	if (!existsSync(logPath)) return null;
	const stat = lstatSync(logPath);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) return null;
	const lines = readFileSync(logPath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean).reverse();
	for (const line of lines) {
		try {
			const value = JSON.parse(line) as Record<string, unknown>;
			if (
				['queries', 'fetched', 'liked', 'searched', 'eligible', 'selected'].every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0) &&
				(value.bookmarked === undefined || (Number.isSafeInteger(value.bookmarked) && Number(value.bookmarked) >= 0)) &&
				Array.isArray(value.created) &&
				['likes-only', 'likes+search', 'likes+bookmarks', 'likes+bookmarks+search', 'cache'].includes(String(value.acquisition)) &&
				typeof value.estimated_post_read_cost_usd === 'number' &&
				Number.isFinite(value.estimated_post_read_cost_usd) &&
				value.estimated_post_read_cost_usd >= 0 &&
				['skipped', 'sent', 'failed'].includes(String(value.notification))
			) {
				return {
					queries: Number(value.queries), fetched: Number(value.fetched), eligible: Number(value.eligible),
					liked: Number(value.liked), bookmarked: Number(value.bookmarked ?? 0), searched: Number(value.searched),
					selected: Number(value.selected), created: value.created.length,
					acquisition: value.acquisition as SonarSearchSummary['acquisition'],
					estimatedPostReadCostUsd: Number(value.estimated_post_read_cost_usd),
					notification: value.notification as SonarSearchSummary['notification']
				};
			}
		} catch {
			// npm prefixes and model logs are not result envelopes.
		}
	}
	return null;
}

function finish(root: string, lock: LockState, exitCode: number | null, message?: string): SonarSearchRunStatus {
	const finishedAt = new Date().toISOString();
	const summary = exitCode === 0 || exitCode === null ? parseSummary(lock.logPath) : null;
	const status: SonarSearchRunStatus = summary
		? { state: 'completed', configured: true, startedAt: lock.startedAt, finishedAt, summary }
		: { state: 'failed', configured: true, startedAt: lock.startedAt, finishedAt, message: message ?? 'Auswahl oder Abfrage fehlgeschlagen. Gespeicherte Treffer bleiben erhalten.' };
	const lockPath = join(root, 'run.lock');
	if (existsSync(lockPath)) {
		const current = parseLock(readSmallJson(lockPath));
		if (current?.pid !== lock.pid || current.startedAt !== lock.startedAt) return status;
		atomicJson(join(root, 'status.json'), status);
		unlinkSync(lockPath);
	}
	return status;
}

export function readSonarSearchRunStatus(config = getSonarSearchRunnerConfig()): SonarSearchRunStatus {
	const configured = Boolean(config.runnerPath);
	const root = ensureRoot(config.stateRoot);
	const lockPath = join(root, 'run.lock');
	if (existsSync(lockPath)) {
		let lock: LockState | null = null;
		try { lock = parseLock(readSmallJson(lockPath)); } catch { lock = null; }
		if (lock) {
			const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(lock.startedAt)) / 1000));
			if (pidAlive(lock.pid) || (lock.pid === 0 && elapsed * 1000 < STARTING_GRACE_MS)) {
				return { state: 'running', configured: true, startedAt: lock.startedAt, elapsedSeconds: elapsed };
			}
			return finish(root, lock, null);
		}
  // Another caller may be between exclusive creation and writing its claim.
  const age = Date.now() - lstatSync(lockPath).mtimeMs;
  if (age < STARTING_GRACE_MS) return { state: 'running', configured: true, startedAt: new Date(Date.now()-age).toISOString(), elapsedSeconds: Math.floor(age/1000) };
  unlinkSync(lockPath);
 }
 const statusPath = join(root, 'status.json');
	if (!configured) return { state: 'idle', configured: false };
	if (!existsSync(statusPath)) return { state: 'idle', configured };
	try {
		const value = readSmallJson(statusPath) as SonarSearchRunStatus;
		if (value && typeof value === 'object' && ['completed', 'failed'].includes(value.state)) {
			return { ...value, configured } as SonarSearchRunStatus;
		}
	} catch {
		// A damaged aggregate status is non-authoritative; the next run replaces it.
	}
	return { state: 'idle', configured };
}

export function startSonarSearchRun(config = getSonarSearchRunnerConfig('search.execute')): Extract<SonarSearchRunStatus, { state: 'running' }> {
	const runnerPath = safeRunner(config.runnerPath);
	const root = ensureRoot(config.stateRoot);
	const current = readSonarSearchRunStatus(config);
	if (current.state === 'running') throw new SonarSearchBusyError(current);
	const startedAt = new Date().toISOString();
	const logPath = join(root, `run-${startedAt.replace(/[:.]/g, '-')}.log`);
	const lockPath = join(root, 'run.lock');
	let claimFd: number | null = null;
	let logFd: number | null = null;
	let ownsClaim = false;
	try {
		try {
			claimFd = openSync(lockPath, 'wx', 0o600);
			ownsClaim = true;
		} catch (error) {
			const raced = readSonarSearchRunStatus(config);
			if (raced.state === 'running') throw new SonarSearchBusyError(raced);
			throw error;
		}
		writeFileSync(claimFd, `${JSON.stringify({ pid: 0, startedAt, logPath })}\n`);
		fsyncSync(claimFd);
		closeSync(claimFd);
		claimFd = null;
		logFd = openSync(logPath, 'a', 0o600);
		const child = spawn(runnerPath, [], {
			cwd: dirname(runnerPath),
			env: { ...process.env, FOLIO_SONAR_SEARCH_CHILD: '1' },
			stdio: ['ignore', logFd, logFd],
			detached: true
		});
		if (!child.pid) throw new Error('Sonar search runner did not start');
		const lock: LockState = { pid: child.pid, startedAt, logPath };
		atomicJson(lockPath, lock);
		  const timeout = setTimeout(() => {
   // Detached process group includes a stuck model subprocess.
   try { process.kill(-lock.pid, 'SIGKILL'); } catch { /* already ended */ }
   try { finish(root, lock, 1, 'Zeitlimit erreicht. Treffer sind gespeichert; keine automatische Wiederholung.'); } catch { /* reconciled on next read */ }
  }, config.timeoutMs ?? 480_000);
  timeout.unref();
  child.once('error', () => { clearTimeout(timeout); try { finish(root, lock, 1); } catch { /* reconcile */ } });
  child.once('close', (code) => { clearTimeout(timeout); try { finish(root, lock, code); } catch { /* reconciled on next read */ } });
		child.unref();
		return { state: 'running', configured: true, startedAt, elapsedSeconds: 0 };
	} catch (error) {
		if (ownsClaim && existsSync(lockPath)) unlinkSync(lockPath);
		throw error;
	} finally {
		if (claimFd !== null) closeSync(claimFd);
		if (logFd !== null) closeSync(logFd);
	}
}
