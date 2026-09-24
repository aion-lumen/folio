import { sourceDateSpan } from '../calendar/source-dates.js';

export interface TemporalFact {
	predicate: string;
	value_text: string;
	valid_from: string | null;
	source_excerpt?: string | null;
}

export function zurichToday(now = new Date()): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(now);
}

/** Only explicitly dated, consistently past appointments leave active review.
 * Import time, subject urgency, and the age of durable context are not evidence.
 * Today remains active; a range must have ended. Expired never means completed.
 */
export function isHistoricalAppointment(fact: TemporalFact, today = zurichToday()): boolean {
	if (fact.predicate !== 'scheduled_for') return false;
	const value = sourceDateSpan({ value_text: fact.value_text, valid_from: null });
	const evidence = sourceDateSpan({ value_text: fact.source_excerpt ?? '', valid_from: null });
	if (!value && /\b\d{4}-\d{2}-\d{2}\b/.test(fact.value_text)) return false;
	const span = value ?? evidence;
	if (!span || (span.end ?? span.start) < span.start || (span.end ?? span.start) >= today) return false;
	// Disagreeing evidence or an additional future alternative must remain reviewable.
	if (value && evidence && (value.start !== evidence.start || (evidence.end && (value.end ?? value.start) !== evidence.end))) return false;
	const dates = `${fact.value_text} ${fact.source_excerpt ?? ''}`.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
	if (dates.some(date => date >= today)) return false;
	return true;
}
