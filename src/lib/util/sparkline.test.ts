import { describe, expect, it } from 'vitest';
import { sparklinePoints, lastN } from './sparkline.js';

describe('sparklinePoints', () => {
	it('empty series → empty string', () => {
		expect(sparklinePoints([], 100, 20)).toBe('');
	});

	it('single value → flat line at mid height', () => {
		expect(sparklinePoints([5], 100, 20, 1)).toBe('1,10.0 99,10.0');
	});

	it('rising series → first point at bottom, last at top, one point per value', () => {
		const pts = sparklinePoints([0, 5, 10], 100, 20, 1).split(' ');
		expect(pts).toHaveLength(3);
		// min maps to bottom (height - pad = 19), max to top (pad = 1)
		expect(pts[0].endsWith(',19.0')).toBe(true);
		expect(pts[2].endsWith(',1.0')).toBe(true);
	});

	it('lastN slices the tail', () => {
		expect(lastN([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
		expect(lastN([1, 2], 7)).toEqual([1, 2]);
	});
});
