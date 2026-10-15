import { getModuleDatabasePath } from '../index.js';
import {
	readPublicationState,
	type PublicationView
} from '../../../../../scripts/sonar-placement-publish.js';

export interface SonarPublicationState {
	byCandidate: Record<string, PublicationView>;
	healthy: boolean;
}

export function readSonarPublicationState(rootOverride?: string): SonarPublicationState {
	try {
		const root = rootOverride ?? getModuleDatabasePath('sonar', 'publish-state', 'publish.read');
		if (!root) return { byCandidate: {}, healthy: false };
		return { byCandidate: Object.fromEntries(readPublicationState(root)), healthy: true };
	} catch {
		return { byCandidate: {}, healthy: false };
	}
}
