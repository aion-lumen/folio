import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
 guard: vi.fn(), read: vi.fn(() => ({ ledgerHealthy: true, sourceHealthy: true, candidates: [] })),
 append: vi.fn(() => ({ revision: 1 })), publication: vi.fn(() => ({ healthy: true, byCandidate: {} })),
 lock: vi.fn((operation: () => unknown) => operation())
}));
vi.mock('../http.js', () => ({ requireModuleCapability: m.guard }));
vi.mock('../index.js', () => ({ hasModuleCapability: () => true }));
vi.mock('../../env.js', () => ({ isDemoVaultActive: () => false }));
vi.mock('./archive.js', () => ({ readSonarArchiveState: m.read }));
vi.mock('./following.js', () => ({ readSonarFollowingState: m.read, appendSonarFollowingReview: m.append, SonarFollowingError: class extends Error {} }));
vi.mock('./store.js', () => ({ readSonarState: m.read, appendSonarReview: m.append, SonarStoreError: class extends Error {} }));
vi.mock('./placements.js', () => ({ readSonarPlacementState: m.read, appendSonarPlacementAction: m.append, SonarPlacementStoreError: class extends Error {} }));
vi.mock('./publications.js', () => ({ readSonarPublicationState: m.publication, withSonarPublicationLock: m.lock, SonarPublicationBusyError: class extends Error {} }));
vi.mock('./search-runner.js', () => ({ readSonarSearchRunStatus: m.read, startSonarSearchRun: m.append, SonarSearchBusyError: class extends Error {} }));

import { load as desktop } from '../../../../routes/sonar/+page.server.js';
import { load as mobile } from '../../../../routes/sonar/mobile/+page.server.js';
import { POST as placement } from '../../../../routes/api/sonar/placement-review/+server.js';
import { POST as following } from '../../../../routes/api/sonar/following-review/+server.js';
import { POST as review } from '../../../../routes/api/sonar/review/+server.js';
import { GET as searchStatus, POST as searchRun } from '../../../../routes/api/sonar/search-run/+server.js';

beforeEach(() => { vi.clearAllMocks(); m.publication.mockReturnValue({ healthy: true, byCandidate: {} }); });

describe('Sonar owner boundary', () => {
 for (const [name, handler] of Object.entries({ desktop, mobile, placement, following, review, searchStatus, searchRun })) {
  it.each(['council_member', 'viewer', undefined])(`${name} refuses non-owner %s before data access or actions`, async role => {
   const request = { json: vi.fn() };
   await expect(handler({ locals: { user: role ? { role } : undefined }, request, url: new URL('http://localhost/sonar/mobile') } as never)).rejects.toMatchObject({ status: 403 });
   expect(request.json).not.toHaveBeenCalled();
   for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
  });
 }
 it('still supplies owner views with their capability-limited controls', async () => {
  const event = { locals: { user: { role: 'owner' } }, url: new URL('http://localhost/sonar/mobile') };
  expect(await mobile(event as never)).toMatchObject({ canApprove: true, canReview: true, canRunSearch: true });
  expect(await desktop(event as never)).toMatchObject({ canApprovePlacements: true, canReviewPlacements: true });
  expect(m.guard).toHaveBeenCalled();
 });
 it.each(['approve', 'revise', 'revoke', 'dismiss'])('allows an owner %s, with withdrawal checked inside the publisher lock', async action => {
  const response = await placement({ locals: { user: { role: 'owner' } }, request: new Request('http://localhost/api/sonar/placement-review', {
   method: 'POST', body: JSON.stringify({ candidate_id: 'x-123456', candidate_hash: 'a'.repeat(64), expected_revision: 1, action, ...(action === 'revise' ? { draft_text: 'Revised text' } : {}) })
  }) } as never);
  expect(response.status).toBe(200);
  expect(m.append).toHaveBeenCalledOnce();
  expect(m.lock).toHaveBeenCalledTimes(action === 'revoke' ? 1 : 0);
  if (action === 'revoke') {
   expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.publication.mock.invocationCallOrder[0]);
   expect(m.publication.mock.invocationCallOrder[0]).toBeLessThan(m.append.mock.invocationCallOrder[0]);
  }
 });
 it('does not withdraw an already claimed publication', async () => {
  m.publication.mockReturnValue({ healthy: true, byCandidate: { 'x-123456': { status: 'claimed' } } });
  await expect(placement({ locals: { user: { role: 'owner' } }, request: new Request('http://localhost/api/sonar/placement-review', {
   method: 'POST', body: JSON.stringify({ candidate_id: 'x-123456', candidate_hash: 'a'.repeat(64), expected_revision: 1, action: 'revoke' })
  }) } as never)).rejects.toMatchObject({ status: 409 });
  expect(m.append).not.toHaveBeenCalled();
 });
});
