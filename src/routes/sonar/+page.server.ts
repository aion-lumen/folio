import { requireModuleCapability } from '$lib/server/modules/http.js';
import { hasModuleCapability } from '$lib/server/modules/index.js';
import { readSonarArchiveState } from '$lib/server/modules/sonar/archive.js';
import { readSonarState } from '$lib/server/modules/sonar/store.js';
import { isDemoVaultActive } from '$lib/server/env.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	requireModuleCapability('sonar', 'panel.render');
	requireModuleCapability('sonar', 'notes.read');
	requireModuleCapability('sonar', 'reviews.read');
	requireModuleCapability('sonar', 'archive.read');
	const sonar = readSonarState();
	return {
		sonar,
		archive: readSonarArchiveState(),
		archiveDemo: isDemoVaultActive(),
		canReview: sonar.ledgerHealthy && hasModuleCapability('sonar', 'review.write')
	};
};
