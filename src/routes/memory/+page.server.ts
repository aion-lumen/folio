import { listCareerDuplicateImports } from '$lib/server/memory/career-duplicates.js';
import { listApplicationEvidence } from '$lib/server/memory/application-evidence.js';
import { summarizeProfileGroup,profileGroupDigest,confirmProfileGroup } from '$lib/server/memory/profile-groups.js';
import { memoryRetentionState, restoreMemoryRetention } from '$lib/server/memory/retention.js';
import { memoryWorkEnabled, monthlyPaymentAutomation, memoryWorkStatus, pauseMemoryWork, resumeMemoryWork } from '$lib/server/memory/work-runtime.js';
import { memoryWorkProjection, paymentReviewStates } from '$lib/server/memory/worklists.js';
import { listPaymentConfirmedMemory } from '$lib/server/memory/payment-confirmation.js';
import { listCareerMemoryConfirmations, careerReviewQuestions } from '$lib/server/memory/career-confirmation.js';
import { calendarMatches, calendarConflicts } from '$lib/server/calendar/planning.js';
import { isDemoVaultActive } from '$lib/server/env.js';
import { error, fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { compileMemoryContext } from '$lib/server/memory/compiler.js';
import { inspectMemoryQuorum } from '$lib/server/memory/quorum.js';
import { listMemoryReviewQueue } from '$lib/server/memory/review.js';
import { isHistoricalAppointment } from '$lib/memory/temporal.js';
import {
	applyMemoryConsolidationBundle,
	listMemoryConsolidationBundles,
	rejectMemoryConsolidationBundle,
	runMemoryNightShift
} from '$lib/server/memory/consolidation.js';
import {
	confirmMemoryCandidatesBySource,
	confirmMemoryFactByHuman,
	confirmMemoryReviewProposalBundle,
	getMemoryOverview,
	listMemoryDossiers,
	listMemoryFacts,
	listDelegatedMemoryReviews,
	proposeMemoryFact,
	rejectMemoryCandidatesBySource,
	rejectMemoryCandidate,
	rejectMemoryProposalBundle,
	tombstoneMemoryFact
} from '$lib/server/memory/store.js';
import { listActiveMemorySources } from '$lib/server/memory/sources.js';
import type { MemorySensitivity } from '$lib/server/memory/types.js';
import type { Actions, PageServerLoad } from './$types.js';

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const MEMORY_VIEWS = new Set(['overview','review','processing','automatic','knowledge','maintenance','history']);
const SENSITIVITIES = new Set<MemorySensitivity>(['public', 'private', 'sensitive']);
const PREDICATES: Record<string, string> = {
	product_fact: 'has_product_fact',
	profile: 'has_profile_fact',
	preference: 'prefers',
	voice_rule: 'follows_voice_rule',
	voice_example: 'has_voice_example',
	decision: 'decided',
	context: 'has_context'
};

function field(data: FormData, name: string, max = 4_000): string {
	const value = String(data.get(name) ?? '').trim();
	if (!value || value.length > max) throw new Error(`${name} ist ungültig.`);
	return value;
}

function sensitivity(data: FormData): MemorySensitivity {
	const value = field(data, 'sensitivity', 16) as MemorySensitivity;
	if (!SENSITIVITIES.has(value)) throw new Error('Vertraulichkeit ist ungültig.');
	return value;
}

function factId(data: FormData): string {
	return field(data, 'fact_id', 64);
}

function source(data: FormData): { domain: string; sourceRef: string } {
	const domain = field(data, 'domain', 64);
	if (!ID.test(domain)) throw new Error('Domäne ist ungültig.');
	return { domain, sourceRef: field(data, 'source_ref', 2_000) };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
	const viewParam=url.searchParams.get('view')??'overview';
	const memoryView=MEMORY_VIEWS.has(viewParam)?viewParam:'overview';
	const requestedLimit=Number(url.searchParams.get('limit')??10);
	const reviewLimit=[10,25,100].includes(requestedLimit)?requestedLimit:10;
	const proposalParam = url.searchParams.get('proposal')?.trim() ?? '';
	const domainParam = url.searchParams.get('domain')?.trim() ?? '';
	const domain = ID.test(domainParam) ? domainParam : 'ai';
	const query = url.searchParams.get('q')?.trim().slice(0, 8_000) ?? '';
	const sensitivityParam = url.searchParams.get('sensitivity') as MemorySensitivity | null;
	const maxSensitivity = sensitivityParam && SENSITIVITIES.has(sensitivityParam)
		? sensitivityParam
		: 'private';
	const facts = listMemoryFacts({ limit: 300 });
	// Apply status before the limit: an import backlog must not hide confirmed knowledge.
	const confirmed = memoryView === 'knowledge' ? listMemoryFacts({ status: 'confirmed', limit: 300 }) : [];
	const quorum = inspectMemoryQuorum();
	const sourceConfirmed = quorum.filter((claim) => claim.state === 'source_confirmed');
	const paymentConfirmed = locals.user.role === 'owner' ? listPaymentConfirmedMemory() : [];
	const applicationEvidence = locals.user.role === 'owner' ? listApplicationEvidence() : [];
	const careerConfirmed = locals.user.role === 'owner' ? listCareerMemoryConfirmations() : [];
	const duplicateImports = listCareerDuplicateImports();
	const covered = new Set([...sourceConfirmed.flatMap((claim) => claim.covered_fact_ids), ...paymentConfirmed.map(claim => claim.fact_id)]);
	const coveredPending = new Set([...sourceConfirmed.flatMap((claim) => claim.pending_fact_ids), ...paymentConfirmed.filter(claim => claim.fact.status === 'candidate').map(claim => claim.fact_id)]);
	const overview = getMemoryOverview();
	const reviewQueue = listMemoryReviewQueue(covered, new Date(), new Set(paymentConfirmed.flatMap(claim => claim.episode_ids)));
 const retention=locals.user.role==='owner'?memoryRetentionState():{hidden:new Set<string>(),work:new Map(),entries:[],groups:[],counts:{discard:0,history:0,profileSources:0,profiles:0,review:0}};
 // Explicit review questions (and restored proposals) remain actionable even
 // when an older temporal projection had placed their dates in history.
 for(const bundle of [...reviewQueue.active,...reviewQueue.historical]){
  if(!retention.work.has(bundle.proposal.proposal_id))continue;
  if(!reviewQueue.active.some(b=>b.proposal.proposal_id===bundle.proposal.proposal_id))reviewQueue.active.push(bundle);
  if(bundle.historical_facts?.length){bundle.facts=[...bundle.facts,...bundle.historical_facts];bundle.historical_facts=[];}
  bundle.hasReviewWork=true;
 }
 reviewQueue.historical=reviewQueue.historical.filter(b=>!retention.work.has(b.proposal.proposal_id));
 reviewQueue.active=reviewQueue.active.filter(b=>!retention.hidden.has(b.proposal.proposal_id));
 reviewQueue.historical=reviewQueue.historical.filter(b=>!retention.hidden.has(b.proposal.proposal_id));
 reviewQueue.counts.historicalFacts=reviewQueue.historical.reduce((n,b)=>n+b.historical_facts.length,reviewQueue.historicalStandalone.length);
 reviewQueue.counts.historicalOnlyBundles=reviewQueue.historical.filter(b=>!b.hasReviewWork).length;
 reviewQueue.counts.mixedBundles=reviewQueue.historical.filter(b=>b.hasReviewWork).length;

	const paymentStates = locals.user.role === 'owner' ? paymentReviewStates() : [];
	const runtimeState=locals.user.role==='owner'?memoryWorkStatus():null;
	const work = memoryWorkProjection(reviewQueue.active, undefined, paymentStates,new Set(Object.entries(runtimeState?.repairs??{}).filter(([,r])=>r.status==='needs_review').map(([id])=>id)),new Map([...retention.work,...(locals.user.role==='owner'?careerReviewQuestions(reviewQueue.active):new Map())]));
	const workDomain = url.searchParams.get('work_domain') ?? '';
	const workKind = url.searchParams.get('kind') ?? '';
	const lane = memoryView === 'processing' ? 'processing' : 'decision';
	const focused = work.items.find(b => b.proposal.proposal_id === proposalParam);
	const filtered = work.items.filter(b => (b.work.lane === lane || b === focused) && (!workDomain || b.proposal.domain === workDomain) && (!workKind || b.work.kind === workKind));
	const activeBundles = focused ? filtered.sort((a,b) => Number(b === focused)-Number(a === focused)) : filtered;
	const groupsByCase = new Map<string,typeof activeBundles>();
	for (const bundle of activeBundles) { const key=`${bundle.workGroup}:${bundle.work.kind}`; const group=groupsByCase.get(key); if(group) group.push(bundle); else groupsByCase.set(key,[bundle]); }
	const grouped = [...groupsByCase.values()];
	const candidateBundles = ['overview','review','processing'].includes(memoryView) ? grouped.slice(0, reviewLimit).map(group=>{const profile=summarizeProfileGroup(group);return {...group[0],profileGroup:profile&&group.length>1?{...profile,digest:profileGroupDigest(profile.ids),issues:group.filter(b=>b.work.reasons.length).map(b=>({id:b.proposal.proposal_id,reasons:b.work.reasons}))}:null,related:group.slice(1).map(b=>({id:b.proposal.proposal_id,source:b.proposal.source_ref,date:b.source_date}))};}) : [];
	const standaloneWaiting = (fact: typeof reviewQueue.standalone[number]) => fact.predicate === 'paid' && !paymentStates.some(p => p.factId === fact.fact_id && p.state === 'decision');
	const candidates = ['overview','review','processing'].includes(memoryView) ? reviewQueue.standalone.filter(f => standaloneWaiting(f) === (lane === 'processing') && (!workDomain || f.domain === workDomain) && (!workKind || (f.predicate === 'paid' ? 'payment' : 'identity') === workKind)) : [];
	const candidateGroups = [...candidates.reduce((groups, fact) => {
		const key = `${fact.domain}\u0000${fact.source_ref}`;
		const current = groups.get(key);
		if (current) current.facts.push(fact);
		else groups.set(key, { domain: fact.domain, source_ref: fact.source_ref, facts: [fact] });
		return groups;
	}, new Map<string, { domain: string; source_ref: string; facts: typeof candidates }>()).values()].slice(0,Math.max(0,reviewLimit-candidateBundles.length));
	const activeSources=listActiveMemorySources();
	const sourceDomainCounts=[...activeSources.reduce((counts,source)=>{const domain=source.domains.find(item=>item.role==='primary')?.domain??'undetermined';counts.set(domain,(counts.get(domain)??0)+1);return counts;},new Map<string,number>()).entries()].map(([domain,count])=>({domain,count})).sort((a,b)=>b.count-a.count);
	const dossiers = memoryView==='knowledge'?listMemoryDossiers(100):[];
	const historicalFactIds = [...facts, ...confirmed, ...dossiers.flatMap(dossier => dossier.facts)].filter(fact => isHistoricalAppointment(fact, reviewQueue.today)).map(fact => fact.fact_id);
	return {
		memoryView,reviewLimit,
  profileSourceLabels:Object.fromEntries(activeSources.filter(s=>candidateBundles.some(b=>b.profileGroup?.sections.some(section=>section.claims.some(c=>c.variants.some(v=>v.source===s.source_ref))))).map(s=>[s.source_ref,s.title])),
  retentionCounts:retention.counts,
  historyCount:reviewQueue.counts.historicalFacts+retention.counts.history+retention.counts.profiles,
  retentionGroups:retention.groups.filter(g=>memoryView==='automatic'?g.mode==='discard':memoryView==='history'?g.mode!=='discard':false).slice(0,reviewLimit),
		workRuntime: locals.user.role==='owner'?{enabled:memoryWorkEnabled(),...runtimeState!,monthlyAutomation:monthlyPaymentAutomation(),repairs:runtimeState?.repairs??{}}:null,
		workDomain,workKind,workKinds:work.kinds,workDomains:work.domains,
		workCounts:{ decision:work.counts.decision+reviewQueue.standalone.filter(f=>!standaloneWaiting(f)).length, processing:work.counts.processing+reviewQueue.standalone.filter(standaloneWaiting).length },
		automaticCount: applicationEvidence.length + paymentConfirmed.length + careerConfirmed.length + retention.counts.discard + duplicateImports.length,
		duplicateImports: memoryView === 'automatic' ? duplicateImports : [],
		applicationEvidence: memoryView === 'automatic' ? applicationEvidence : [],
		careerConfirmed: memoryView === 'automatic' ? careerConfirmed : [],
		paymentConfirmed: memoryView === 'automatic' ? paymentConfirmed : [],
		temporalCounts: reviewQueue.counts, historicalFactIds,
		historicalBundles: memoryView==='history'?reviewQueue.historical.slice(0,reviewLimit):[],
		historicalStandalone: memoryView==='history'?reviewQueue.historicalStandalone.slice(0,reviewLimit):[],
		sourceConfirmed: memoryView==='maintenance'?sourceConfirmed:[],
		quorumStatus: { eligible: quorum.filter((claim) => claim.state === 'eligible').length, blocked: quorum.filter((claim) => claim.state === 'blocked').length },
		calendarMatches: (memoryView==='review'||memoryView==='knowledge')&&locals.user.role === 'owner' && !isDemoVaultActive() ? await calendarMatches().catch(() => ({} as Record<string,string>)) : {} as Record<string,string>,
		calendarConflicts: (memoryView==='review'||memoryView==='knowledge')&&locals.user.role === 'owner' && !isDemoVaultActive() ? calendarConflicts() : {} as Record<string,string>,
		overview: { ...overview, candidates: Math.max(0, overview.candidates - coveredPending.size - reviewQueue.counts.historicalFacts - retention.entries.filter(e=>retention.hidden.has(e.proposal_id)).reduce((n,e)=>n+e.factCount,0)) },
		sourceCount:activeSources.length,sourceDomainCounts,
		sources: memoryView==='maintenance'?activeSources:[],
		candidateGroups,
		candidateBundles,
		delegatedReviews: memoryView==='maintenance'?listDelegatedMemoryReviews():[],
		consolidationBundles: memoryView==='maintenance'?listMemoryConsolidationBundles('candidate', 20):[],
		dossiers,
		confirmed,
		inactive: memoryView==='knowledge'?facts.filter((fact) => fact.status === 'rejected' || fact.status === 'superseded'):[],
		preview: memoryView==='overview'&&query
			? compileMemoryContext({ consumer_id: 'owner-preview', domain, query, max_sensitivity: maxSensitivity, limit: 10 })
			: null,
		previewInput: { domain, query, maxSensitivity }
	};
};

const ownerActions: Actions = {
 confirmProfile:async({request,locals})=>{
  if(locals.user?.role!=='owner')return fail(403,{message:'Nur der Owner darf Belege bestätigen.'});
  try{const form=await request.formData(),ids=JSON.parse(field(form,'proposal_ids',10000));
   if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||id.length>64))return fail(400,{message:'Ungültige Belegauswahl.'});
   const count=confirmProfileGroup(ids,field(form,'digest',64),`owner:${locals.user.id}`);
   return {success:true,message:`${count} Belege gemeinsam bestätigt.`};
  }catch(error){return fail(409,{message:error instanceof Error?error.message:'Die Belege haben sich geändert. Bitte neu laden.'});}
 },
 restoreRetention: async({request,locals})=>{
  if(locals.user?.role!=='owner')return fail(403,{message:'Nur der Owner darf Vorschläge zurückholen.'});
  try{const data=await request.formData();restoreMemoryRetention(field(data,'proposal_id',64),`owner:${locals.user.id}`);return {success:true,message:'Wieder unter „Deine Entscheidung“. '};}catch{return fail(409,{message:'Der Vorschlag hat sich geändert. Bitte neu laden.'});}
 },
	resumeWork: async ({locals}) => { if(locals.user?.role!=='owner') return fail(403,{message:'Nur der Owner kann fortsetzen.'}); try {resumeMemoryWork();return {success:true,message:'Memory-Nacharbeit fortgesetzt.'};}catch{return fail(409,{message:'Die Eingangsordner und Kontozuordnung müssen zuerst eingerichtet bzw. erneut geprüft werden.'});} },
	pauseWork: async ({locals}) => { if(locals.user?.role!=='owner') return fail(403,{message:'Nur der Owner kann pausieren.'}); pauseMemoryWork(); return {success:true,message:'Memory-Nacharbeit pausiert.'}; },
	correct: async ({ locals }) => {
		if (locals.user?.role !== 'owner') return fail(403, { message: 'Nur der Owner darf Aussagen korrigieren.' });
		return fail(410, { message: 'Dieser Korrekturweg wurde ersetzt. Bitte „Fakt berichtigen“ mit lokalem Agenten und Slidefreigabe öffnen.' });
	},
	add: async ({ request }) => {
		const data = await request.formData();
		try {
			const domain = field(data, 'domain', 64);
			const dataClass = field(data, 'data_class', 64);
			if (!ID.test(domain) || !ID.test(dataClass)) throw new Error('Domäne oder Art ist ungültig.');
			const proposed = proposeMemoryFact({
				domain,
				data_class: dataClass,
				sensitivity: sensitivity(data),
				subject: field(data, 'subject', 240),
				predicate: PREDICATES[dataClass] ?? 'has_context',
				value: field(data, 'value', 8_000),
				source_kind: 'owner',
				source_ref: `manual:${randomUUID()}`,
				actor_kind: 'human',
				actor_id: 'owner'
			});
			confirmMemoryFactByHuman(proposed.fact_id, 'owner');
			return { success: true, message: 'Als bestätigtes Wissen gespeichert.' };
		} catch (error) {
			return fail(400, { message: error instanceof Error ? error.message : 'Wissen konnte nicht gespeichert werden.' });
		}
	},
	confirm: async ({ request }) => {
		const data = await request.formData();
		try {
			confirmMemoryFactByHuman(factId(data), 'owner');
			return { success: true, message: 'Kandidat bestätigt.' };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Kandidat konnte nicht bestätigt werden.' });
		}
	},
	confirmSource: async ({ request }) => {
		const data = await request.formData();
		try {
			const group = source(data);
			const confirmed = confirmMemoryCandidatesBySource(group.domain, group.sourceRef, 'owner', true);
			return { success: true, message: `${confirmed.length} Wissenseinträge aus einem Beleg bestätigt.` };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Beleg konnte nicht bestätigt werden.' });
		}
	},
	confirmProposal: async ({ request }) => {
		const data = await request.formData();
		try {
			const confirmed = confirmMemoryReviewProposalBundle(field(data, 'proposal_id', 64), 'owner');
			const count = confirmed.entities.length + [...confirmed.facts, ...confirmed.relations, ...confirmed.episodes]
				.filter((item) => item.status === 'confirmed').length;
			return { success: true, message: `${count} Gedächtnisobjekte bestätigt.${confirmed.proposal.status === 'candidate' ? ' Vergangene Termine und die gemischte Zusammenfassung bleiben unbestätigt in der Historie.' : ''}` };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Vorschlagsbündel konnte nicht bestätigt werden.' });
		}
	},
	reject: async ({ request }) => {
		const data = await request.formData();
		try {
			rejectMemoryCandidate(factId(data), 'owner');
			return { success: true, message: 'Kandidat verworfen.' };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Kandidat konnte nicht verworfen werden.' });
		}
	},
	rejectSource: async ({ request }) => {
		const data = await request.formData();
		try {
			const group = source(data);
			const rejected = rejectMemoryCandidatesBySource(group.domain, group.sourceRef, 'owner');
			return { success: true, message: `${rejected.length} Vorschläge aus einem Beleg verworfen.` };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Beleg konnte nicht verworfen werden.' });
		}
	},
	rejectProposal: async ({ request }) => {
		const data = await request.formData();
		try {
			rejectMemoryProposalBundle(field(data, 'proposal_id', 64), 'owner');
			return { success: true, message: 'Vorschlagsbündel verworfen.' };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Vorschlagsbündel konnte nicht verworfen werden.' });
		}
	},
	forget: async ({ request }) => {
		const data = await request.formData();
		try {
			tombstoneMemoryFact(factId(data), 'owner');
			return { success: true, message: 'Inhalt aus dem Gedächtnis entfernt; der Löschvorgang bleibt protokolliert.' };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Inhalt konnte nicht entfernt werden.' });
		}
	},
	nightShift: async () => {
		try {
			const nightShift = await runMemoryNightShift();
			return {
				success: true,
				message: nightShift.consolidation_run_id
					? `Nachtschicht hat ${nightShift.checked_facts} bestätigte Fakten geprüft und ein gemeinsames Prüfbündel angelegt.`
					: `Nachtschicht hat ${nightShift.checked_facts} bestätigte Fakten geprüft. Es wartet keine neue Konsolidierung.`,
				nightShift
			};
		} catch (error) {
			return fail(500, { message: error instanceof Error ? error.message : 'Nachtschicht konnte nicht laufen.' });
		}
	},
	applyConsolidation: async ({ request }) => {
		const data = await request.formData();
		try {
			const result = applyMemoryConsolidationBundle(field(data, 'run_id', 64), 'owner');
			return {
				success: true,
				message: `${result.superseded_facts} Dubletten konsolidiert, ${result.linked_facts} Fakten verbunden, ${result.created_contexts} belegte Kontexte übernommen.`
			};
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Nachtschichtbündel konnte nicht übernommen werden.' });
		}
	},
	rejectConsolidation: async ({ request }) => {
		const data = await request.formData();
		try {
			rejectMemoryConsolidationBundle(field(data, 'run_id', 64), 'owner');
			return { success: true, message: 'Nachtschichtbündel verworfen; das bestätigte Wissen blieb unverändert.' };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Nachtschichtbündel konnte nicht verworfen werden.' });
		}
	}
};

// Page actions do not run layout loaders. Authorize every action before reading its form.
export const actions: Actions = Object.fromEntries(Object.entries(ownerActions).map(([name, action]) => [name, async (event) => {
 if (event.locals.user?.role !== 'owner') return fail(403, { message: 'Owner access required' });
 return action!(event);
}]));
