import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ correct: vi.fn() }));
vi.mock('$lib/server/memory/store.js', () => ({ correctMemoryCandidate: mocks.correct }));
vi.mock('$lib/server/calendar/planning.js', () => ({}));
vi.mock('$lib/server/memory/consolidation.js', () => ({}));
vi.mock('$lib/server/memory/compiler.js', () => ({}));
vi.mock('$lib/server/memory/sources.js', () => ({}));
import { actions } from './+page.server.js';

function event(role = 'owner', extra?: [string,string]) {
	const data = new FormData();
	for (const [k,v] of Object.entries({fact_id:'fixture',expected_version:'a'.repeat(64),predicate:'decided',value:'Funding approved',valid_from:'',reason:'Not paid'})) data.set(k,v);
	if (extra) data.append(...extra);
	return { locals:{ user:{role,id:1} }, request:new Request('http://localhost/memory?/correct',{method:'POST',body:data}) } as any;
}
it('refuses non-owner corrections before invoking the store', async () => {
	mocks.correct.mockClear(); const result:any = await actions.correct!(event('council_member'));
	expect(result.status).toBe(403); expect(mocks.correct).not.toHaveBeenCalled();
});
it.each([['source_ref','forged'],['value','duplicate']])('refuses forged or duplicate fields %s', async (key,value) => {
	mocks.correct.mockClear(); const result:any = await actions.correct!(event('owner',[key,value]));
	expect(result.status).toBe(410); expect(mocks.correct).not.toHaveBeenCalled();
});
it('retires the old correction form without changing facts', async () => {
	mocks.correct.mockClear(); const result:any = await actions.correct!(event());
	expect(result.status).toBe(410); expect(mocks.correct).not.toHaveBeenCalled();
});
