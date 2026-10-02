import { queueStatementJob,statementJob } from '$lib/server/modules/ledger-books/statement-jobs.js';
import { memoryWorkStatus,monthlyPaymentAutomation,setMonthlyPaymentAutomation,retryMonthlyWork } from '$lib/server/memory/work-runtime.js';
import { listPaymentConfirmedMemory } from '$lib/server/memory/payment-confirmation.js';
import {financeRunView,requestFinancePause} from '$lib/server/modules/ledger-books/finance-run-state.js';
import { error, fail } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	getFinanceObservationExchangeStatus,
	writeFinanceObservationExchange
} from '$lib/server/modules/ledger-books/observations.js';
import { readFinanceIntakeStatus } from '$lib/server/modules/ledger-books/intake.js';
import { readBooksReviewBatch } from '$lib/server/modules/ledger-books/store.js';
import { readManualStatementImport } from '$lib/server/modules/ledger-books/manual-import.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
 if(locals.user?.role!=='owner')throw error(403,'Owner access required.');
	requireModuleCapability('ledger-books', 'panel.render');
	requireModuleCapability('ledger-books', 'batches.read');
	requireModuleCapability('ledger-books', 'intake.read');
	requireModuleCapability('ledger-books', 'observations.read');
 const confirmed=locals.user.role==='owner'?listPaymentConfirmedMemory():[];
	return {
		financeRun:locals.user.role==='owner'?financeRunView():null,
		books: readBooksReviewBatch(),
		intake: readFinanceIntakeStatus(),
		observations: getFinanceObservationExchangeStatus(),
		manualImport: readManualStatementImport(new Set(confirmed.map(c=>c.fact_id))),
        statementJob: locals.user.role==='owner'?statementJob():null,
        statementWork:memoryWorkStatus().statements??{},
        statementInventoryError:memoryWorkStatus().inventory_error??null,
        monthlyWork:locals.user.role==='owner'?memoryWorkStatus().monthly:null,
        monthlyAutomation:locals.user.role==='owner'?monthlyPaymentAutomation():null,
		paymentConfirmed: confirmed
	};
};

export const actions: Actions = {
 retryMonthly:async({locals,request,url})=>{
  if(locals.user.role!=='owner'||request.headers.get('origin')!==url.origin)return fail(403,{message:'Owner and same origin required.'});
  requireModuleCapability('ledger-books','statements.preview');
  try{retryMonthlyWork();return {success:true,message:'Erneute Prüfung vorbereitet.'};}
  catch{return fail(409,{message:'Bitte Kontozuordnung prüfen.'});}
 },
 monthlyAutomation:async({locals,request,url})=>{
  if(locals.user.role!=='owner'||request.headers.get('origin')!==url.origin)return fail(403,{message:'Owner and same origin required.'});
  requireModuleCapability('ledger-books','statements.preview');
  const body=await request.formData(),enabled=body.get('enabled');if(enabled!=='true'&&enabled!=='false')return fail(400,{message:'Invalid setting.'});
  try{setMonthlyPaymentAutomation(String(locals.user.id),enabled==='true');return {success:true,message:enabled==='true'?'Monatsabgleich aktiviert.':'Monatsabgleich deaktiviert.'};}
  catch{return fail(409,{message:'Bitte zuerst Konten einrichten und pausierte Memory-Nacharbeit fortsetzen.'});}
 },
	financePause:async({locals,request,url})=>{
		if(locals.user.role!=='owner'||request.headers.get('origin')!==url.origin)return fail(403,{message:'Owner and same origin required.'});
		requireModuleCapability('ledger-books','statements.preview');
		const body=await request.formData();const pause=body.get('pause');if(pause!=='true'&&pause!=='false')return fail(400,{message:'Invalid pause value.'});
		requestFinancePause(pause==='true');return {success:true,message:pause==='true'?'Pause angefordert. Der aktuelle Prüfschritt wird geordnet beendet.':'Fortsetzung angefordert.'};
	},
	previewStatement: async ({ locals, request, url }) => {
		if (locals.user.role !== 'owner') return fail(403, { message: 'Owner access required.' });
		if (request.headers.get('origin') !== url.origin) return fail(403, { message: 'Same-origin request required.' });
		requireModuleCapability('ledger-books', 'statements.preview');
		const body = await request.formData();
		try {
			queueStatementJob(String(body.get('selection') ?? ''), String(body.get('sha256') ?? ''), String(body.get('account') ?? ''), String(body.get('profile') ?? ''));
			return {success:true,message:'Auszug wird im Hintergrund geprüft.'};
		} catch (error) { return fail(409, { message: error instanceof Error && /^[a-z_]+$/u.test(error.message) ? error.message : 'Import konnte nicht geprüft werden.' }); }
	},
	syncObservations: async ({ locals }) => {
		if (locals.user.role !== 'owner') return fail(403, { message: 'Owner access required.' });
		requireModuleCapability('ledger-books', 'observations.write');
		try {
			const batch = writeFinanceObservationExchange();
			return {
				success: true,
				message: `${batch.observations.length} bestätigte Finanzbeobachtungen für Ledger bereitgestellt. Nichts wurde gebucht.`
			};
		} catch (error) {
			return fail(409, {
				message: error instanceof Error ? error.message : 'Finanzbeobachtungen konnten nicht bereitgestellt werden.'
			});
		}
	}
};
