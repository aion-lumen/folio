import { listPaymentConfirmedMemory } from '$lib/server/memory/payment-confirmation.js';
import {financeRunView,requestFinancePause} from '$lib/server/modules/ledger-books/finance-run-state.js';
import { fail } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	getFinanceObservationExchangeStatus,
	writeFinanceObservationExchange
} from '$lib/server/modules/ledger-books/observations.js';
import { readFinanceIntakeStatus } from '$lib/server/modules/ledger-books/intake.js';
import { readBooksReviewBatch } from '$lib/server/modules/ledger-books/store.js';
import { previewManualStatement, readManualStatementImport } from '$lib/server/modules/ledger-books/manual-import.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	requireModuleCapability('ledger-books', 'panel.render');
	requireModuleCapability('ledger-books', 'batches.read');
	requireModuleCapability('ledger-books', 'intake.read');
	requireModuleCapability('ledger-books', 'observations.read');
	return {
		financeRun:locals.user.role==='owner'?financeRunView():null,
		books: readBooksReviewBatch(),
		intake: readFinanceIntakeStatus(),
		observations: getFinanceObservationExchangeStatus(),
		manualImport: readManualStatementImport(),
		paymentConfirmed: locals.user.role === 'owner' ? listPaymentConfirmedMemory() : []
	};
};

export const actions: Actions = {
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
			const result = await previewManualStatement(String(body.get('selection') ?? ''), String(body.get('sha256') ?? ''), String(body.get('account') ?? ''), String(body.get('profile') ?? ''));
			return { success: result.status === 'staged_unbooked', message: result.status === 'staged_unbooked' ? 'Ledger-Vorschau bereit. Nichts gebucht; Original unverändert.' : `Import angehalten: ${result.reason_code}` };
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
