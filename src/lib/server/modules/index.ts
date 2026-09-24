import { isLedgerDemo } from '../ledger-demo.js';
import { areModulesDisabled, getDisabledModuleIds } from '../env.js';
import { CAREER_MODULE } from './career/manifest.js';
import { COUNCIL_MODULE } from './council/manifest.js';
import { LEUCHTFEUER_MODULE } from './leuchtfeuer/manifest.js';
import { LEDGER_BOOKS_MODULE } from './ledger-books/manifest.js';
import { RELAY_MODULE } from './relay/manifest.js';
import { SONAR_MODULE } from './sonar/manifest.js';
import { ModuleRegistry } from './registry.js';

const registry = new ModuleRegistry(
	(moduleId) => areModulesDisabled() || getDisabledModuleIds().has(moduleId)
);
registry.register(CAREER_MODULE);
registry.register(COUNCIL_MODULE);
registry.register(LEUCHTFEUER_MODULE);
registry.register(LEDGER_BOOKS_MODULE);
registry.register(RELAY_MODULE);
registry.register(SONAR_MODULE);

export function getModuleAccess(moduleId: string, capabilityId: string) {
	if (isLedgerDemo() && (moduleId !== 'ledger-books' || !['panel.render', 'batches.read'].includes(capabilityId))) return { allowed: false, reason: 'module-disabled' as const };
	return registry.access(moduleId, capabilityId);
}

export function hasModuleCapability(moduleId: string, capabilityId: string): boolean {
	return getModuleAccess(moduleId, capabilityId).allowed;
}

export function getModuleDatabasePath(
	moduleId: string,
	databaseId: string,
	capabilityId: string
): string | null {
	if (isLedgerDemo()) return null;
	return registry.databasePath(moduleId, databaseId, capabilityId);
}

export function getModuleRegistrySnapshot() {
	return registry.snapshot();
}
