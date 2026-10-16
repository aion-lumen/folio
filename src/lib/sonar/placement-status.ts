import type { SonarPlacementCandidate } from '$lib/server/modules/sonar/placements.js';

/** Shared mobile/workspace boundary, including future timestamps and exact expiry. */
export function freshPlacementCandidates(candidates: SonarPlacementCandidate[], now: number): SonarPlacementCandidate[] {
 return candidates.filter(c => c.status === 'open' && Date.parse(c.expiresAt) > now &&
  Date.parse(c.source.publishedAt) <= now && now - Date.parse(c.source.publishedAt) < 24 * 3_600_000)
  .sort((a, b) => Number(Boolean(b.relevance.references?.length)) - Number(Boolean(a.relevance.references?.length)) ||
   Date.parse(b.source.publishedAt) - Date.parse(a.source.publishedAt));
}
