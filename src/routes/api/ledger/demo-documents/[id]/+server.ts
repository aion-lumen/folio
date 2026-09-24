import { error } from '@sveltejs/kit';
import { ledgerDemoDocument } from '$lib/server/ledger-demo-cases.js';
import type { RequestHandler } from './$types.js';
export const GET: RequestHandler = ({ params }) => {
	try {
		const bytes = ledgerDemoDocument(params.id);
		return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-disposition': 'inline; filename="Demo-Rechnung.pdf"', 'content-security-policy': "sandbox; default-src 'none'" } });
	} catch { error(404, 'Dieser Demo-Beleg ist nicht verfügbar oder seine Prüfung ist veraltet.'); }
};
