import { error } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { transferDownload } from '$lib/server/modules/ledger-books/transfer-sources.js';
import type { RequestHandler } from './$types.js';
export const GET: RequestHandler = ({ locals, params }) => {
    if (locals.user.role !== 'owner')
        error(403, 'Nur für den Eigentümer verfügbar.');
    requireModuleCapability('ledger-books', 'batches.read');
    try {
        const download = transferDownload(params.digest);
        return new Response(new Uint8Array(download.bytes), { headers: { 'content-type': download.contentType + '; charset=utf-8', 'content-disposition': `attachment; filename="${download.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" } });
    }
    catch {
        error(409, 'Transferbeleg nicht verfügbar oder verändert.');
    }
};
