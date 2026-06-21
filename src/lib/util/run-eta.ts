// Direktive 3 (pipeline-minimal): ETA-Helper für Lebenszeichen-Anzeige.
// Median-Rate über die letzten N=5 completed-Runs gleicher (account, mode).
// Fallback bei kalter History: 3 Sekunden pro Mail.

import type { WorkerRunRow } from '$lib/server/folio-db/types.js';

const FALLBACK_SECONDS_PER_MAIL = 3;
const HISTORY_WINDOW = 5;

interface EtaActiveRunInput {
	account: string;
	mode: string;
	trancheSize: number;
	startedAt: string;
}

/**
 * ETA in Sekunden bis Run-Ende, geschätzt aus
 * (median-sekunden-pro-mail × tranche-size) − elapsed.
 *
 * Kein Per-Mail-Live-Tracking nötig (Direktive §Prohibitions: keine
 * SSE-Refactors). Bei kalter History fallback: 3 s/mail.
 */
export function estimateEtaSeconds(active: EtaActiveRunInput, history: WorkerRunRow[]): number {
	const candidates = history
		.filter(
			(r) =>
				r.account === active.account &&
				r.mode === active.mode &&
				r.status === 'completed' &&
				r.mails_processed > 0 &&
				r.ended_at != null
		)
		.slice(0, HISTORY_WINDOW);

	let secondsPerMail = FALLBACK_SECONDS_PER_MAIL;
	if (candidates.length > 0) {
		const rates = candidates
			.map((r) => {
				const dur =
					(new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()) / 1000;
				return dur / r.mails_processed;
			})
			.sort((a, b) => a - b);
		secondsPerMail = rates[Math.floor(rates.length / 2)];
	}

	const totalEstimated = active.trancheSize * secondsPerMail;
	const startMs = new Date(active.startedAt).getTime();
	if (!Number.isFinite(startMs)) return Math.round(totalEstimated);
	const elapsed = (Date.now() - startMs) / 1000;
	return Math.max(0, Math.round(totalEstimated - elapsed));
}

/** „2m 7s" oder „43s". */
export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** „~3m" / „gleich" / „—" bei Unbekannt. */
export function formatEta(seconds: number | null | undefined): string {
	if (seconds == null) return '—';
	if (seconds <= 0) return 'gleich';
	if (seconds < 60) return `~${seconds}s`;
	const m = Math.ceil(seconds / 60);
	return `~${m}m`;
}
