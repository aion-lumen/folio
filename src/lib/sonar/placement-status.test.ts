import { expect, it } from 'vitest';
import type { SonarPlacementCandidate } from '$lib/server/modules/sonar/placements.js';
import { freshPlacementCandidates } from './placement-status.js';

it('keeps only actionable fresh opportunities, including exact expiry and age boundaries', () => {
 const now = Date.parse('2026-10-16T12:00:00Z');
 const candidate = (id: string, age: number, expiry = 60_000, status = 'open') => ({ id, status,
  source: { publishedAt: new Date(now - age).toISOString() }, expiresAt: new Date(now + expiry).toISOString(), relevance: {}
 }) as SonarPlacementCandidate;
 const candidates = [candidate('fresh', 1000), candidate('old', 24 * 3_600_000), candidate('future', -1000),
  candidate('expired', 1000, 0), candidate('approved', 1000, 60_000, 'approved'), candidate('dismissed', 1000, 60_000, 'dismissed')];
 expect(freshPlacementCandidates(candidates, now).map(c => c.id)).toEqual(['fresh']);
 expect(freshPlacementCandidates(candidates, now + 60_000)).toEqual([]);
});
