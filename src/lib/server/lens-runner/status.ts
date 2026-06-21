// Status-Lookup fuer Lens-Runner. Liest Lockfile, prueft PID-Liveness.
// Stale Locks (Worker gecrasht ohne finally-cleanup) werden auto-cleaned.

import { existsSync, readFileSync, unlinkSync } from 'fs';
import type { LensRunConfig, LensRunStatus } from './types.js';
import {
	findLatestLogPath,
	parseLensRunLog,
	getPersonaEvalMedians,
	computeEtaSeconds
} from './log-parser.js';

type LockContent = {
	pid: number;
	started_at: string;
};

function isPidAlive(pid: number): boolean {
	try {
		// Signal 0 prueft nur Existenz, sendet kein Signal.
		process.kill(pid, 0);
		return true;
	} catch {
		// ESRCH (no such process) oder EPERM (existiert, aber wir duerfen nicht).
		// EPERM heisst: Prozess existiert. ESRCH: existiert nicht.
		// Da wir die Lockfile selbst geschrieben haben oder den gleichen User
		// nutzen, ist EPERM unwahrscheinlich — wir behandeln Fehler als „tot".
		return false;
	}
}

export function getLensRunStatus(config: LensRunConfig): LensRunStatus {
	if (!existsSync(config.lockfile_path)) {
		return { running: false };
	}
	let parsed: LockContent;
	try {
		const raw = readFileSync(config.lockfile_path, 'utf-8');
		parsed = JSON.parse(raw) as LockContent;
	} catch {
		// Lockfile existiert, aber kein gueltiges JSON. Vermutlich Worker
		// crashed mitten im Schreiben. Behandeln wie stale.
		try {
			unlinkSync(config.lockfile_path);
		} catch {
			/* ignore */
		}
		return { running: false, stale_lock_cleaned: true };
	}

	if (!isPidAlive(parsed.pid)) {
		try {
			unlinkSync(config.lockfile_path);
		} catch {
			/* ignore */
		}
		return { running: false, stale_lock_cleaned: true };
	}

	const startedMs = Date.parse(parsed.started_at);
	const elapsed = Number.isFinite(startedMs)
		? Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
		: 0;

	// 2026-06-08: Progress-Anreicherung via Log-Parsing.
	// Best-effort: wenn Log-File noch nicht da oder unleserlich,
	// bleibt progress undefined → UI faellt auf "läuft seit Xs" zurück.
	let progress;
	const logPath = findLatestLogPath(config.log_dir, config.log_prefix ?? config.domain);
	if (logPath) {
		try {
			const content = readFileSync(logPath, 'utf-8');
			const parsedLog = parseLensRunLog(content, Date.now());
			if (parsedLog) {
				const medians = getPersonaEvalMedians(
					config.log_dir,
					config.log_prefix ?? config.domain
				);
				const eta = computeEtaSeconds(parsedLog.personas, medians, parsedLog.phase);
				progress = {
					total_candidates: parsedLog.total_candidates,
					personas: parsedLog.personas,
					current_persona_index: Math.min(
						parsedLog.personas.findIndex((p) => p.phase !== 'done'),
						parsedLog.personas.length
					) === -1
						? parsedLog.personas.length
						: parsedLog.personas.findIndex((p) => p.phase !== 'done'),
					phase: parsedLog.phase,
					eta_seconds: eta
				};
			}
		} catch {
			/* parse-fehler → progress bleibt undefined */
		}
	}

	return {
		running: true,
		pid: parsed.pid,
		started_at: parsed.started_at,
		elapsed_seconds: elapsed,
		progress
	};
}
