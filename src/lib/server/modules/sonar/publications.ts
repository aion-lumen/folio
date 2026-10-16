import { getModuleDatabasePath } from '../index.js';
import {
	readPublicationState,
	withPublicationLock,
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

export { SonarPublicationBusyError } from '../../../../../scripts/sonar-placement-publish.js';

export function withSonarPublicationLock<T>(operation: () => T, rootOverride?: string): T {
 const root = rootOverride ?? getModuleDatabasePath('sonar', 'publish-state', 'publish.approve');
 if (!root) throw new Error('Sonar publication state is not available');
 return withPublicationLock(root, operation);
}
