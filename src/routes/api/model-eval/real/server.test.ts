import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './+server.js';
import { load } from '../../../(mail)/pipeline/modelle/alltag/+page.server.js';
import { buildRealMailEvalSuite, RealMailEvalUnavailable } from '$lib/server/model-eval/real-suite.js';

vi.mock('$lib/server/model-eval/real-suite.js', async (original) => ({
 ...await original<typeof import('$lib/server/model-eval/real-suite.js')>(),
 buildRealMailEvalSuite: vi.fn()
}));
afterEach(() => vi.clearAllMocks());
const event = { locals: { user: { role: 'owner' } } };

it('reports an absent reviewed cohort without a 500 or an invented result', async () => {
 vi.mocked(buildRealMailEvalSuite).mockImplementation(() => { throw new RealMailEvalUnavailable('Noch keine menschlich bewertete Mailkohorte vorhanden.'); });
 const response = await GET(event as Parameters<typeof GET>[0]);
 expect(response.status).toBe(409);
 expect(await response.json()).toMatchObject({ unavailable: true });
 const page = await load(event as Parameters<typeof load>[0]);
 expect(page).toMatchObject({ unavailable: expect.stringContaining('Mailkohorte'), catalog: { suite: { cases: 0 } }, latest: null });
});
it('does not disguise unexpected failures as missing data', async () => {
 vi.mocked(buildRealMailEvalSuite).mockImplementation(() => { throw new Error('unexpected'); });
 await expect(GET(event as Parameters<typeof GET>[0])).rejects.toThrow('unexpected');
 await expect(load(event as Parameters<typeof load>[0])).rejects.toThrow('unexpected');
});
it('denies non-owner access before reading mail evidence', async () => {
 await expect(GET({ locals: { user: { role: 'viewer' } } } as unknown as Parameters<typeof GET>[0])).rejects.toMatchObject({ status: 403 });
 expect(buildRealMailEvalSuite).not.toHaveBeenCalled();
});
