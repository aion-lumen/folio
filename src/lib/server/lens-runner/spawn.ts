// Subprocess-Spawn fuer Lens-Runner. Detached, stdout/stderr in Log-Datei,
// kein Streaming zum Browser (Architekt-Direktive 2026-05-31).
//
// Race-Vermeidung: der Worker selbst haelt das Lockfile via fcntl.flock — wir
// pruefen vor dem Spawn nur, ob ein Lauf bereits aktiv ist. Bei Race zwischen
// status-Check und Spawn fangen wir den Worker-Exit-2 nicht hier ab; das ist
// ok, weil der zweite Spawn dann nicht doppelt arbeitet.

import { spawn } from 'child_process';
import { existsSync, mkdirSync, openSync } from 'fs';
import { join } from 'path';
import type { LensRunConfig, LensSpawnResult } from './types.js';
import { LensBusyError } from './types.js';
import { getLensRunStatus } from './status.js';

function isoFilenameSafe(): string {
	// 2026-05-31T18-45-12Z
	return new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
}

export function spawnLensRun(config: LensRunConfig): LensSpawnResult {
	const status = getLensRunStatus(config);
	if (status.running) {
		throw new LensBusyError(status);
	}

	if (!existsSync(config.log_dir)) {
		mkdirSync(config.log_dir, { recursive: true });
	}
	const prefix = config.log_prefix ?? config.domain;
	const log_path = join(config.log_dir, `${prefix}-${isoFilenameSafe()}.log`);
	const logfd = openSync(log_path, 'a');

	const proc = spawn(config.python_bin, [config.worker_script], {
		cwd: config.cwd,
		stdio: ['ignore', logfd, logfd],
		detached: true
	});
	// detached + unref erlaubt der Folio-Server-Prozess zu beenden, ohne den
	// Worker mitzureissen.
	proc.unref();

	if (proc.pid == null) {
		throw new Error('lens-run spawn failed: no pid');
	}

	return {
		pid: proc.pid,
		log_path,
		started_at: new Date().toISOString()
	};
}
