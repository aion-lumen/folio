// Generisches Lens-Runner-Framework (Direktive 2026-05-31).
// Subprocess + Lockfile + Log-Datei + Status-Polling fuer domain-agnostische
// "Lens-Lauf"-Worker. Mail-Pipeline (interaktiv, SSE) hat ihr eigenes
// worker-runner-Modul, das hier unangetastet bleibt.

export type LensRunConfig = {
	/** Domain-Slug fuer Logging und API-Pfade (z.B. 'council', 'job'). */
	domain: string;
	/** Absolute path zum Python-Interpreter (in der venv). */
	python_bin: string;
	/** Absolute path zum Worker-Skript. */
	worker_script: string;
	/** Working directory fuer den Subprocess (typischerweise Repo-Root). */
	cwd: string;
	/** Absolute path zur Lockfile, die der Worker selbst haelt (fcntl.flock). */
	lockfile_path: string;
	/** Verzeichnis fuer Lauf-Logs. Datei-Name wird automatisch generiert. */
	log_dir: string;
	/** Praefix fuer Log-Dateien, default = domain. */
	log_prefix?: string;
};

// 2026-06-08: Persona-Fortschritts-Telemetrie aus Lens-Log-Parsing.
// Pro Persona vier Phasen (`pending`/`model_loading`/`evaluating`/`done`).
// Eval-Phase ist die langsame: lokale LLM scored die candidates
// sequentiell. ETA-Berechnung ueber Persona-Dauer-Median aus
// historischen Logs (gleicher model-name).
export type LensPersonaPhase = 'pending' | 'model_loading' | 'evaluating' | 'done';

export type LensPersonaStatus = {
	id: string;        // 'lens-baumeister'
	model: string;     // 'qwen3-30b-a3b-thinking-2507'
	phase: LensPersonaPhase;
	elapsed_seconds: number;
	scored?: number;
	ranked?: number;
};

export type LensRunProgress = {
	total_candidates: number;
	personas: LensPersonaStatus[];
	current_persona_index: number;  // 0..N-1, oder N wenn borda läuft
	phase: 'starting' | 'persona' | 'borda' | 'done';
	eta_seconds: number | null;     // basierend auf Persona-Median
};

export type LensRunStatus =
	| { running: false; stale_lock_cleaned?: boolean }
	| {
			running: true;
			pid: number;
			started_at: string;
			elapsed_seconds: number;
			progress?: LensRunProgress;
	  };

export class LensBusyError extends Error {
	constructor(
		public readonly status: Extract<LensRunStatus, { running: true }>
	) {
		super(`lens-run already in progress (pid=${status.pid}, started_at=${status.started_at})`);
		this.name = 'LensBusyError';
	}
}

export type LensSpawnResult = {
	pid: number;
	log_path: string;
	started_at: string;
};
