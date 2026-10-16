import { error } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { hasModuleCapability } from '$lib/server/modules/index.js';
import { readSonarArchiveState } from '$lib/server/modules/sonar/archive.js';
import { readSonarFollowingState } from '$lib/server/modules/sonar/following.js';
import { readSonarPlacementState } from '$lib/server/modules/sonar/placements.js';
import { readSonarPublicationState } from '$lib/server/modules/sonar/publications.js';
import { readSonarState } from '$lib/server/modules/sonar/store.js';
import { isDemoVaultActive } from '$lib/server/env.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('sonar', 'panel.render');
	requireModuleCapability('sonar', 'notes.read');
	requireModuleCapability('sonar', 'reviews.read');
	requireModuleCapability('sonar', 'archive.read');
	requireModuleCapability('sonar', 'placements.read');
	requireModuleCapability('sonar', 'publish.read');
	const sonar = readSonarState();
	const following = readSonarFollowingState();
	const placements = readSonarPlacementState();
	const publications = readSonarPublicationState();
	return {
		sonar,
		archive: readSonarArchiveState(),
		following,
		placements,
		publications,
		archiveDemo: isDemoVaultActive(),
		canReview: sonar.ledgerHealthy && hasModuleCapability('sonar', 'review.write'),
		canReviewPlacements: placements.ledgerHealthy && hasModuleCapability('sonar', 'review.write'),
		canApprovePlacements: placements.ledgerHealthy && hasModuleCapability('sonar', 'publish.approve'),
		canReviewFollowing:
			following.sourceHealthy &&
			following.ledgerHealthy &&
			hasModuleCapability('sonar', 'review.write')
	};
};
