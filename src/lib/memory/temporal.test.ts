import { describe, expect, it } from 'vitest';
import { isHistoricalAppointment, zurichToday } from './temporal.js';

const today = '2026-09-16';
const fact = (value_text: string, source_excerpt: string | null = null, valid_from: string | null = null) => ({ predicate: 'scheduled_for', value_text, source_excerpt, valid_from });

describe('historical appointment review policy', () => {
	it('uses explicit event dates, not extraction metadata or subject urgency', () => {
		expect(isHistoricalAppointment(fact('2026-04-24T12:00', 'Freitag, 24.04.2026 um 12:00 Uhr', today), today)).toBe(true);
		expect(isHistoricalAppointment(fact('2026-04-27T14:00', 'Montag, 27.04.2026 um 14:00 Uhr'), today)).toBe(true);
		expect(isHistoricalAppointment(fact('2026-10-27', null, '2026-04-24'), today)).toBe(false);
	});
	it('keeps today, ongoing ranges and future dates active', () => {
		for (const value of ['2026-09-16T09:00', '2026-09-21', '2026-09-15 bis 2026-09-17', '15 bis 17 September 2026']) {
			expect(isHistoricalAppointment(fact(value), today)).toBe(false);
		}
		expect(isHistoricalAppointment(fact('2026-09-10 bis 2026-09-15'), today)).toBe(true);
		expect(isHistoricalAppointment(fact('21 to 23 April 2026'), today)).toBe(true);
	});
	it('does not expire durable context, ambiguous dates, conflicting evidence or malformed dates', () => {
		expect(isHistoricalAppointment({ ...fact('2026-04-24'), predicate: 'has_context' }, today)).toBe(false);
		for (const f of [fact('nächsten Montag', null, '2026-04-24'), fact('2026-02-30'), fact('2026-04-24', 'Termin am 24.10.2026'), fact('2026-04-24 oder 2026-10-24'), fact('2026-04-27 bis 2026-04-24')]) {
			expect(isHistoricalAppointment(f, today)).toBe(false);
		}
	});
	it('uses the Zurich calendar day across UTC and daylight-saving boundaries', () => {
		expect(zurichToday(new Date('2026-09-15T22:30:00Z'))).toBe(today);
		expect(zurichToday(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
	});
});
