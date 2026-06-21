import { json } from '@sveltejs/kit';
import { loadCampaign, loadAllActs, loadAllChapters } from '$lib/server/vault/reader.js';

export async function GET() {
	const [campaign, acts, chapters] = await Promise.all([
		loadCampaign(),
		loadAllActs(),
		loadAllChapters()
	]);
	return json({ campaign, acts, chapters });
}
