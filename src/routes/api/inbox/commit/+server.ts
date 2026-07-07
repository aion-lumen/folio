import { json, error } from '@sveltejs/kit';
import { commitInboxItems, scanInbox } from '$lib/server/inbox/index.js';
import type { RequestHandler } from './$types.js';

interface CommitBody {
	filenames?: string[];
	allValid?: boolean;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: CommitBody;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'JSON body required');
	}

	let filenames = body.filenames ?? [];
	if (body.allValid) {
		const scan = await scanInbox();
		filenames = scan.items.filter((i) => i.status === 'valid').map((i) => i.filename);
	}

	if (filenames.length === 0) {
		throw error(400, 'No files to commit (pass filenames or allValid: true)');
	}

	const result = await commitInboxItems(filenames);
	return json({
		ok: true,
		committed: result.committed.length,
		skipped: result.skipped.length,
		details: result
	});
};
