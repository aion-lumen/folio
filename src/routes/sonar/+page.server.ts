import { requireModuleCapability } from '$lib/server/modules/http.js';
import { hasModuleCapability } from '$lib/server/modules/index.js';
import { readSonarState } from '$lib/server/modules/sonar/store.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	requireModuleCapability('sonar', 'panel.render');
	requireModuleCapability('sonar', 'notes.read');
	requireModuleCapability('sonar', 'reviews.read');
	const sonar = readSonarState();
	return {
		sonar,
		canReview: sonar.ledgerHealthy && hasModuleCapability('sonar', 'review.write')
	};
};
