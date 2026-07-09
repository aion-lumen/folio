import { describe, expect, it } from 'vitest';
import { canReclassify } from './reclassify.js';

describe('canReclassify — capability gate (no account-name proxy)', () => {
	it('real feedback row (numeric uid, not mock) → true — incl. demo konto-a/konto-b', () => {
		// Real vault yahoo row (unchanged behaviour vs the old isYahoo gate)
		expect(canReclassify({ isMock: false, uid: '123' })).toBe(true);
		// Demo mail masked to konto-a/konto-b — still a real feedback row → now re-classifiable
		expect(canReclassify({ isMock: false, uid: '45' })).toBe(true);
	});

	it('mock row → false (unchanged)', () => {
		expect(canReclassify({ isMock: true, uid: '123' })).toBe(false);
		expect(canReclassify({ isMock: true, uid: 'm_1234' })).toBe(false);
	});

	it('non-numeric / empty uid → false', () => {
		expect(canReclassify({ isMock: false, uid: 'm_9' })).toBe(false);
		expect(canReclassify({ isMock: false, uid: '' })).toBe(false);
		expect(canReclassify({ isMock: false, uid: '0' })).toBe(false);
		expect(canReclassify({ isMock: false, uid: null })).toBe(false);
	});

	it('null / undefined row → false', () => {
		expect(canReclassify(null)).toBe(false);
		expect(canReclassify(undefined)).toBe(false);
	});
});
