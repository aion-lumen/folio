import { hasModuleCapability } from '$lib/server/modules/index.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { readSonarPlacementState } from '$lib/server/modules/sonar/placements.js';
import { readSonarPublicationState } from '$lib/server/modules/sonar/publications.js';
import { readSonarSearchRunStatus } from '$lib/server/modules/sonar/search-runner.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url, locals }) => {
	requireModuleCapability('sonar', 'panel.render');
	requireModuleCapability('sonar', 'placements.read');
	requireModuleCapability('sonar', 'publish.read');
	requireModuleCapability('sonar', 'search.read');
	const placements = readSonarPlacementState();
	return {
		placements,
		publications: readSonarPublicationState(),
		searchStatus: readSonarSearchRunStatus(),
		initialCandidateId: url.searchParams.get('candidate'),
		canReview: placements.ledgerHealthy && hasModuleCapability('sonar', 'review.write'),
		canApprove: placements.ledgerHealthy && hasModuleCapability('sonar', 'publish.approve'),
		canRunSearch: locals.user.role === 'owner' && hasModuleCapability('sonar', 'search.execute')
	};
};
