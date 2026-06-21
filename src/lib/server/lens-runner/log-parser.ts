// 2026-06-08 Bauteil 2.7c-Hotfix: Lens-Log-Parser fuer
// Fortschritts-Telemetrie. Pure-Funktionen, kein State.
//
// Log-Format (siehe scripts/council_lens_run.py):
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] === council_lens_run start ===
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] Personas: [...] | Candidates: N | no_llm=...
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] --- persona <name> (model=<model>) ---
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] model swap: unload all → load <model>
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] wait_for_lens_model_loaded: <model> confirmed loaded
//   YYYY-MM-DD HH:MM:SS,mmm [INFO]   scored=N ranked=M beobachten=B verworfen=V skipped=S cmp=C
//   ... (3x Persona-Block)
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] === Lens-Lauf done ===
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] Triggering council_borda.py …
//   YYYY-MM-DD HH:MM:SS,mmm [INFO] Borda exit_code=0

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { LensPersonaStatus, LensRunProgress, LensPersonaPhase } from './types.js';

const TS_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),(\d{3})/;
const PERSONA_LINE_RE = /--- persona (\S+) \(model=(\S+)\) ---/;
const SWAP_RE = /model swap: unload all/;
const LOADED_RE = /wait_for_lens_model_loaded: \S+ confirmed loaded/;
const SCORED_RE = /scored=(\d+) ranked=(\d+)/;
const PERSONAS_RE = /Personas: \[([^\]]+)\] \| Candidates: (\d+)/;
const LENS_DONE_RE = /=== Lens-Lauf done ===/;
const BORDA_TRIGGER_RE = /Triggering council_borda/;
const BORDA_EXIT_RE = /Borda exit_code=(\d+)/;

function parseTs(line: string): number | null {
	const m = TS_RE.exec(line);
	if (!m) return null;
	// SQLite-Standard-Format: '2026-06-08 21:29:47,233'.
	// JS parst das nicht direkt — Space->T, Komma->Punkt, Z anhaengen.
	const iso = `${m[1].replace(' ', 'T')}.${m[2]}Z`;
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? ms : null;
}

/**
 * Findet die neueste Log-Datei im log_dir mit dem gegebenen Praefix.
 * Returns null wenn keine vorhanden.
 */
export function findLatestLogPath(log_dir: string, log_prefix: string): string | null {
	let entries: string[];
	try {
		entries = readdirSync(log_dir);
	} catch {
		return null;
	}
	const matches = entries
		.filter((f) => f.startsWith(log_prefix) && f.endsWith('.log'))
		.map((f) => ({ path: join(log_dir, f), mtime: 0 }));
	for (const m of matches) {
		try {
			m.mtime = statSync(m.path).mtimeMs;
		} catch {
			m.mtime = 0;
		}
	}
	matches.sort((a, b) => b.mtime - a.mtime);
	return matches[0]?.path ?? null;
}

/**
 * Parsed ein Lens-Log und liefert pro Persona Status + Phase + elapsed.
 * Wenn das Log noch unvollstaendig ist (Lauf laeuft noch), wird die
 * aktuelle Persona als 'model_loading' oder 'evaluating' markiert.
 *
 * Zeit-Bezugspunkt: `nowMs` (typischerweise Date.now()) fuer
 * elapsed-Berechnung der aktuell laufenden Persona.
 */
export function parseLensRunLog(content: string, nowMs: number): {
	phase: LensRunProgress['phase'];
	total_candidates: number;
	personas: LensPersonaStatus[];
} | null {
	const lines = content.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length === 0) return null;

	// Personas-Liste + Candidate-Count aus erster passender Zeile.
	let total_candidates = 0;
	let personaIds: string[] = [];
	for (const l of lines) {
		const m = PERSONAS_RE.exec(l);
		if (m) {
			total_candidates = parseInt(m[2], 10);
			personaIds = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
			break;
		}
	}
	if (personaIds.length === 0) return null;

	// Pro Persona: index → { model, started_ms, loaded_ms, done_ms, scored, ranked }
	type PSlot = {
		id: string;
		model: string;
		started_ms?: number;
		loaded_ms?: number;
		done_ms?: number;
		scored?: number;
		ranked?: number;
	};
	const slots: PSlot[] = personaIds.map((id) => ({ id, model: '' }));

	let cur = -1;
	let bordaTriggeredMs: number | null = null;
	let bordaDoneMs: number | null = null;

	for (const l of lines) {
		const ts = parseTs(l);
		const pm = PERSONA_LINE_RE.exec(l);
		if (pm) {
			const id = pm[1];
			const model = pm[2];
			const idx = personaIds.indexOf(id);
			if (idx >= 0) {
				cur = idx;
				slots[idx].model = model;
				if (ts != null) slots[idx].started_ms = ts;
			}
			continue;
		}
		if (cur >= 0 && LOADED_RE.test(l)) {
			if (ts != null) slots[cur].loaded_ms = ts;
			continue;
		}
		if (cur >= 0 && SCORED_RE.test(l)) {
			const m = SCORED_RE.exec(l);
			if (m) {
				slots[cur].scored = parseInt(m[1], 10);
				slots[cur].ranked = parseInt(m[2], 10);
			}
			if (ts != null) slots[cur].done_ms = ts;
			continue;
		}
		if (LENS_DONE_RE.test(l)) {
			// Alle Personas done — eventuell folgt Borda.
			continue;
		}
		if (BORDA_TRIGGER_RE.test(l)) {
			if (ts != null) bordaTriggeredMs = ts;
			continue;
		}
		if (BORDA_EXIT_RE.test(l)) {
			if (ts != null) bordaDoneMs = ts;
			continue;
		}
	}

	// Pro slot Phase ableiten.
	const personas: LensPersonaStatus[] = slots.map((s, idx) => {
		let phase: LensPersonaPhase = 'pending';
		let elapsed_seconds = 0;
		if (s.done_ms != null && s.started_ms != null) {
			phase = 'done';
			elapsed_seconds = Math.max(0, Math.round((s.done_ms - s.started_ms) / 1000));
		} else if (s.loaded_ms != null && s.started_ms != null) {
			phase = 'evaluating';
			elapsed_seconds = Math.max(0, Math.round((nowMs - s.started_ms) / 1000));
		} else if (s.started_ms != null) {
			phase = 'model_loading';
			elapsed_seconds = Math.max(0, Math.round((nowMs - s.started_ms) / 1000));
		}
		// Falls Persona "im Voraus" gestartet aber Log noch nicht reingerollt
		// und der eval-step der vorherigen Persona schon done ist, bleibt sie
		// einfach pending — wird beim nächsten Poll detektiert.
		void idx;
		return {
			id: s.id,
			model: s.model,
			phase,
			elapsed_seconds,
			scored: s.scored,
			ranked: s.ranked
		};
	});

	// Run-Phase ableiten.
	let phase: LensRunProgress['phase'];
	if (bordaDoneMs != null) {
		phase = 'done';
	} else if (bordaTriggeredMs != null) {
		phase = 'borda';
	} else if (personas.every((p) => p.phase === 'done')) {
		phase = 'borda'; // Lens-done, Borda noch nicht getriggert (Übergangs-Tick)
	} else if (personas.every((p) => p.phase === 'pending')) {
		phase = 'starting';
	} else {
		phase = 'persona';
	}

	return { phase, total_candidates, personas };
}

/**
 * Liest alle historischen Logs im log_dir und liefert pro Persona
 * den Median der Eval-Dauer (loaded → scored). Wird fuer ETA genutzt.
 */
export function getPersonaEvalMedians(log_dir: string, log_prefix: string): Map<string, number> {
	const durations = new Map<string, number[]>();
	let entries: string[];
	try {
		entries = readdirSync(log_dir);
	} catch {
		return new Map();
	}
	for (const f of entries) {
		if (!f.startsWith(log_prefix) || !f.endsWith('.log')) continue;
		let content: string;
		try {
			content = readFileSync(join(log_dir, f), 'utf-8');
		} catch {
			continue;
		}
		// Wir parsen mit nowMs=Date.now() — bei abgeschlossenen Personas spielt
		// das keine Rolle (started_ms+done_ms reichen).
		const parsed = parseLensRunLog(content, Date.now());
		if (!parsed) continue;
		for (const p of parsed.personas) {
			if (p.phase !== 'done') continue;
			if (p.elapsed_seconds <= 0) continue;
			if (!durations.has(p.id)) durations.set(p.id, []);
			durations.get(p.id)!.push(p.elapsed_seconds);
		}
	}
	const medians = new Map<string, number>();
	for (const [id, arr] of durations) {
		const sorted = [...arr].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		const median = sorted.length % 2 === 0
			? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
			: sorted[mid];
		medians.set(id, median);
	}
	return medians;
}

/**
 * Berechnet ETA-Sekunden fuer den aktuellen Lens-Run aus dem aktuellen
 * Progress + Persona-Eval-Medianen aus historischen Logs.
 *
 * - Aktuelle Persona: median - elapsed (mit Floor 0)
 * - Zukuenftige Personas: jeweils Median + Pauschal-Model-Swap (10s)
 * - Borda: 2s Pauschal
 *
 * Returns null wenn keine Median-Daten fuer eine ausstehende Persona
 * vorhanden sind (keine seriöse ETA möglich).
 */
export function computeEtaSeconds(
	personas: LensPersonaStatus[],
	medians: Map<string, number>,
	runPhase: LensRunProgress['phase']
): number | null {
	if (runPhase === 'done') return 0;
	if (runPhase === 'borda') return 2;
	let eta = 0;
	for (const p of personas) {
		if (p.phase === 'done') continue;
		const median = medians.get(p.id);
		if (median == null) return null; // keine historie → keine seriöse eta
		if (p.phase === 'evaluating') {
			eta += Math.max(0, median - p.elapsed_seconds);
		} else if (p.phase === 'model_loading') {
			// model_loading → schon im start, evaluating folgt
			eta += median;
		} else {
			// pending → noch nicht begonnen, +10s pauschal fuer model-swap
			eta += median + 10;
		}
	}
	eta += 2; // borda
	return eta;
}
