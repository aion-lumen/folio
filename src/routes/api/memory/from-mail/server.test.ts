vi.mock('$lib/server/mail-intake/model-session.js', () => ({ withMailModel: async (_role:string,work:()=>Promise<unknown>)=>work(),MailModelSessionError:class extends Error {} }));
vi.mock('$lib/server/mail-intake/state.js', () => ({ locked: () => false }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ propose: vi.fn(), decision: vi.fn() }));
vi.mock('$lib/server/feedback/reader.js', () => ({ getFeedbackRowById: () => ({ id: 7, account_id: 'test', imap_uid: 42, task_id: 'task7', sender: 'test', subject: 'test', domain: 'shopping' }) }));
vi.mock('$lib/server/hermes/mail-body.js', () => ({ lookupMailBody: () => ({ bodyText: 'synthetic evidence' }) }));
vi.mock('$lib/server/memory/mail-domain.js', () => ({ resolveMailMemoryDomain: mocks.decision }));
vi.mock('$lib/server/memory/mail-candidates.js', () => ({ proposeMemoryFromMail: mocks.propose, MailMemoryError: class extends Error {} }));
vi.mock('$lib/server/mail-intake/source.js', () => ({ memoryMailBody: () => 'synthetic evidence' }));
import { POST } from './+server.js';
const event = () => ({ locals: { user: { role: 'owner' } }, request: new Request('http://localhost/api/memory/from-mail', { method: 'POST', body: JSON.stringify({ feedback_id: 7 }) }) } as Parameters<typeof POST>[0]);
describe('mail memory pipeline domain handoff', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	it('passes model consensus to extraction rather than the stored heuristic', async () => {
		mocks.decision.mockReturnValue({ domain: 'finance', source: 'model_consensus', models: ['a','b','c'] });
		mocks.propose.mockResolvedValue({ domain: 'finance', created: true, facts: [] });
		const response = await POST(event());
		expect(mocks.propose).toHaveBeenCalledWith(expect.objectContaining({ mail_domain: 'finance' }));
		expect(await response.json()).toMatchObject({ domain_decision: { source: 'model_consensus' } });
	});
	it('surfaces a conflict without generating any candidate', async () => {
		mocks.decision.mockReturnValue({ domain: null, source: 'conflict', models: ['a','b','c'] });
		expect((await POST(event())).status).toBe(409); expect(mocks.propose).not.toHaveBeenCalled();
	});
});
