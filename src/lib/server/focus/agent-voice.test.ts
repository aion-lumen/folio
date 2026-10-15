import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ memory: vi.fn().mockResolvedValue([]), lease: vi.fn(async (_role: string, work: () => Promise<unknown>, _model?: string) => work()) }));
vi.mock('node:fs', () => ({ readFileSync: () => JSON.stringify({ dialogModel: 'accepted-dialogue' }) }));
vi.mock('../env.js', () => ({ getLmStudioBaseUrl: () => 'http://127.0.0.1:1234' }));
vi.mock('../mail-intake/model-session.js', () => ({ withMailModel: mocks.lease }));
vi.mock('./memory-for-model.js', () => ({ memoryForAnswerModel: mocks.memory }));
vi.mock('./mail.js', () => ({ companionMail: () => [] }));
vi.mock('./store.js', () => ({ loadFocus: () => ({ items: [] }) }));
vi.mock('../career/store.js', () => ({ listCareerLeads: () => [] }));
vi.mock('./capabilities.js', () => ({ capabilityAnswer: () => null }));
import { advise } from './agent.js';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('binds the speech request and Memory policy to the selected dialogue model, not the first loaded model', async () => {
 const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ models: [
  { type: 'llm', key: 'other-loaded-model', loaded_instances: [{}] },
  { type: 'llm', key: 'accepted-dialogue', loaded_instances: [{}] }
 ] }))).mockResolvedValueOnce(new Response([
  'data: {"type":"reasoning.delta","content":"hidden thought"}',
  'data: {"type":"message.delta","content":"The offer is not a payment."}',
  'data: {"type":"chat.end"}', ''
 ].join('\n')));
 vi.stubGlobal('fetch', fetch);
 const spoken: string[] = [];
 const answer = await advise('Has this been paid?', undefined, { onText: text => spoken.push(text) });
 expect(mocks.lease.mock.calls[0][2]).toBe('accepted-dialogue');
 expect(mocks.memory).toHaveBeenCalledWith('accepted-dialogue', 'Has this been paid?', '', undefined);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ model: 'accepted-dialogue', stream: true, store: false, integrations: [] });
 expect(answer.model).toBe('accepted-dialogue');
 expect(spoken).toEqual(['The offer is not a payment.']);
});

it('does not silently use a different model when the selected dialogue model is absent', async () => {
 const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [
  { type: 'llm', key: 'other-loaded-model', loaded_instances: [{}] }
 ] })));
 vi.stubGlobal('fetch', fetch);
 await expect(advise('Has this been paid?', undefined, { onText: () => {} })).rejects.toThrow('Kein lokales Sprachmodell');
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(mocks.memory).not.toHaveBeenCalled();
});
