import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({ payments: vi.fn(), queue: vi.fn(), duplicates:vi.fn() }));
vi.mock('$lib/server/calendar/planning.js', () => ({ calendarMatches: async () => ({}), calendarConflicts: () => ({}) }));
vi.mock('$lib/server/memory/payment-confirmation.js', () => ({ listPaymentConfirmedMemory: mocks.payments }));
vi.mock('$lib/server/memory/quorum.js', () => ({ inspectMemoryQuorum: () => [], listSourceConfirmedMemory: () => [] }));
vi.mock('$lib/server/memory/review.js', () => ({ listMemoryReviewQueue: mocks.queue }));
vi.mock('$lib/server/memory/career-duplicates.js',()=>({listCareerDuplicateImports:()=>mocks.duplicates(),reconcileCareerDuplicates:vi.fn()}));
import { resetFolioDbForTests } from '$lib/server/folio-db/init.js';
import { proposeMemoryFact } from '$lib/server/memory/store.js';
import { load } from './+page.server.js';

let dir: string;
let pending: ReturnType<typeof proposeMemoryFact>;
let paid: ReturnType<typeof proposeMemoryFact>;
const page = (view: string, role = 'owner') => load({ url: new URL(`http://localhost/memory?view=${view}`), locals: { user: { role, id: 1 } } } as any) as Promise<any>;
beforeEach(() => {
 mocks.duplicates.mockReturnValue([]);
 dir = mkdtempSync(join(tmpdir(), 'folio-memory-automatic-'));
 vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db')); resetFolioDbForTests();
 const create = (id: string) => proposeMemoryFact({ domain: 'finance', data_class: 'transaction', subject: 'Beispielrechnung', predicate: 'paid', value: id, sensitivity: 'private', source_kind: 'owner', source_ref: `test:${id}`, actor_kind: 'human', actor_id: 'test' });
 paid = create('paid'); pending = create('pending');
 mocks.payments.mockReturnValue([{ fact_id: paid.fact_id, fact: paid, episode_ids: ['paid-episode'] }]);
 mocks.queue.mockImplementation((covered: Set<string>) => ({ active: [], standalone: [paid, pending].filter(f => !covered.has(f.fact_id)), historical: [], historicalStandalone: [], counts: { historicalFacts: 0 }, today: '2026-09-29' }));
});
afterEach(() => { resetFolioDbForTests(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); vi.clearAllMocks(); });
it('keeps waiting payment evidence out of decisions while retaining the automatic count', async () => {
 const data = await page('processing');
 expect((await page('review')).candidateGroups).toEqual([]);
 expect(data.paymentConfirmed).toEqual([]);
 expect(data.automaticCount).toBe(1);
 expect(data.overview.candidates).toBe(1);
 expect(data.candidateGroups.flatMap((g: any) => g.facts.map((f: any) => f.fact_id))).toEqual([pending.fact_id]);
 expect(mocks.queue).toHaveBeenCalledWith(new Set([paid.fact_id]), expect.any(Date), new Set(['paid-episode']));
});
it('places completed proofs in their own view, without manual review cards', async () => {
 const data = await page('automatic');
 expect(data.memoryView).toBe('automatic');
 expect(data.paymentConfirmed.map((p: any) => p.fact_id)).toEqual([paid.fact_id]);
 expect(data.candidateBundles).toEqual([]);
 // Standalone review groups must also stay out of the completed view.
 expect(data.candidateGroups).toEqual([]);
});
it.each(['overview', 'knowledge'])('keeps the full completed list out of %s', async view => {
 expect((await page(view)).paymentConfirmed).toEqual([]);
});
it('does not expose payment evidence to non-owners', async () => {
 await expect(page('automatic', 'guest')).rejects.toMatchObject({status:403});
 expect(mocks.payments).not.toHaveBeenCalled();
});
it('classifies before pagination so waiting payments cannot hide decisions',async()=>{
 const queue=mocks.queue(new Set());
 const waiting=Array.from({length:12},(_,i)=>({proposal:{proposal_id:`wait-${i}`,source_kind:'mail',domain:'finance'},facts:[{...pending,fact_id:`f-${i}`}],entities:[],episodes:[]}));
 const decision={proposal:{proposal_id:'decision',source_kind:'mail',domain:'personal'},facts:[{...pending,predicate:'has_context',domain:'personal'}],entities:[],episodes:[]};
 mocks.queue.mockReturnValue({...queue,active:[...waiting,decision],standalone:[]});
 const data=await page('review');expect(data.candidateBundles.map((b:any)=>b.proposal.proposal_id)).toEqual(['decision']);expect(data.workCounts).toEqual({decision:1,processing:12});
 expect((await page('processing')).candidateBundles).toHaveLength(10);
});
it('groups only shared canonical case identities and keeps each source reachable',async()=>{
 const queue=mocks.queue(new Set());
 const make=(id:string,key:string)=>({proposal:{proposal_id:id,source_kind:'mail',source_ref:`mail:test:${id}`,domain:'personal'},facts:[{...pending,predicate:'has_context'}],entities:[{entity_type:'application',canonical_key:key}],episodes:[]});
 mocks.queue.mockReturnValue({...queue,active:[make('first','same'),make('second','same'),make('third','different')],standalone:[]});
 const data=await page('review');expect(data.workCounts.decision).toBe(2);expect(data.candidateBundles).toHaveLength(2);expect(data.candidateBundles[0].related[0].id).toBe('second');
});

import { proposeMemoryBundle,getMemoryReviewSnapshot,memorySnapshotDigest } from '$lib/server/memory/store.js';
import { getFolioDb } from '$lib/server/folio-db/init.js';
import { retentionPlan,applyRetentionPlan,restoreMemoryRetention } from '$lib/server/memory/retention.js';
it('removes routed proposals before pagination and returns restored history to actionable review',async()=>{
 const b=proposeMemoryBundle({domain:'personal',source_kind:'mail',source_ref:'mail:test:history',extractor_id:'test',actor_id:'test',facts:[{subject:'Meeting',predicate:'scheduled_for',value:'2020-01-01',source_excerpt:'2020-01-01',data_class:'appointment',sensitivity:'private'}]});
 const id=b.proposal.proposal_id,p=retentionPlan(id)!;applyRetentionPlan(id,p.digest,'owner request');
 const queue=()=>({active:[],standalone:[],historical:[{...b,facts:[],historical_facts:b.facts,hasReviewWork:false,source_date:null}],historicalStandalone:[],counts:{historicalFacts:1},today:'2026-09-29'});
 mocks.queue.mockImplementation(queue);
 expect((await page('history')).retentionGroups).toHaveLength(1);expect((await page('history')).historyCount).toBe(1);
 expect((await page('review')).candidateBundles).toHaveLength(0);
 restoreMemoryRetention(id,'owner');
 const restored=await page('review');expect(restored.candidateBundles.map((x:any)=>x.proposal.proposal_id)).toEqual([id]);expect(restored.candidateBundles[0].facts).toHaveLength(1);expect(restored.workCounts.decision).toBe(1);
 expect((await page('history')).retentionGroups).toHaveLength(0);await expect(page('history','guest')).rejects.toMatchObject({status:403});
});

import { actions } from './+page.server.js';
it('offers a profile filter, displays all group evidence and denies non-owner group confirmation',async()=>{
 const make=(n:number)=>proposeMemoryBundle({domain:'career',source_kind:'file',source_ref:`file:profile-${n}`,extractor_id:'test',actor_id:'test',episodes:[{episode_type:'application',title:'Alex Example',summary:'has_certification: Certificate A',occurred_at:'2025-01-01',source_excerpt:'Certificate A earned in 2024',sensitivity:'private'}]});
 const bundles=[make(1),make(2)].map(b=>({...b,historical_facts:[],hasReviewWork:true,source_date:null}));
 mocks.queue.mockReturnValue({active:bundles,historical:[],standalone:[],historicalStandalone:[],counts:{historicalFacts:0},today:'2026-09-29'});
 const data=await page('review');expect(data.workCounts.decision).toBe(1);expect(data.candidateBundles).toHaveLength(1);expect(data.candidateBundles[0].profileGroup.ids).toHaveLength(2);expect(data.candidateBundles[0].profileGroup.sections[0].claims[0].variants).toHaveLength(2);
 const result:any=await actions.confirmProfile!({locals:{user:{role:'guest'}}} as any);expect(result.status).toBe(403);
});

it('counts duplicate imports and exposes their provenance only in completed work',async()=>{
 const duplicate={proposal_id:'duplicate',canonical_id:'retained',source_ref:'mail:test:1',canonical_source:'mail:test:2'};
 mocks.duplicates.mockReturnValue([duplicate]);
 const automatic=await page('automatic');expect(automatic.automaticCount).toBe(2);expect(automatic.duplicateImports).toEqual([duplicate]);
 expect((await page('review')).duplicateImports).toEqual([]);
 mocks.duplicates.mockClear();await expect(page('automatic','guest')).rejects.toMatchObject({status:403});expect(mocks.duplicates).not.toHaveBeenCalled();
});
