import { areModulesDisabled, getDisabledModuleIds } from '../env.js';
import { COUNCIL_MODULE } from './council/manifest.js';
import { LEUCHTFEUER_MODULE } from './leuchtfeuer/manifest.js';
import { RELAY_MODULE } from './relay/manifest.js';
import { SONAR_MODULE } from './sonar/manifest.js';
import { ModuleRegistry } from './registry.js';

const registry = new ModuleRegistry(
	(moduleId) => areModulesDisabled() || getDisabledModuleIds().has(moduleId)
);
registry.register(COUNCIL_MODULE);
registry.register(LEUCHTFEUER_MODULE);
registry.register(RELAY_MODULE);
registry.register(SONAR_MODULE);

export function getModuleAccess(moduleId: string, capabilityId: string) {
	return registry.access(moduleId, capabilityId);
}

export function hasModuleCapability(moduleId: string, capabilityId: string): boolean {
	return registry.access(moduleId, capabilityId).allowed;
}

export function getModuleDatabasePath(
	moduleId: string,
	databaseId: string,
	capabilityId: string
): string | null {
	return registry.databasePath(moduleId, databaseId, capabilityId);
}

export function getModuleRegistrySnapshot() {
	return registry.snapshot();
}
