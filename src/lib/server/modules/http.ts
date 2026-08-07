import { error } from '@sveltejs/kit';
import { getModuleAccess } from './index.js';

/** Fail closed without revealing whether a disabled or unknown module is installed. */
export function requireModuleCapability(moduleId: string, capabilityId: string): void {
	const access = getModuleAccess(moduleId, capabilityId);
	if (!access.allowed) throw error(404, 'Module capability not available');
}
