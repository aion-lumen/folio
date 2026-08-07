import type {
	ModuleAccess,
	ModuleManifest,
	ModuleRegistration,
	ModuleSnapshot
} from './types.js';

const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export class ModuleRegistryError extends Error {}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}

function uniqueIds(values: readonly { id: string }[], label: string): Set<string> {
	const ids = new Set<string>();
	for (const value of values) {
		if (!ID.test(value.id)) throw new ModuleRegistryError(`invalid ${label} id: ${value.id}`);
		if (ids.has(value.id)) throw new ModuleRegistryError(`duplicate ${label} id: ${value.id}`);
		ids.add(value.id);
	}
	return ids;
}

export function validateModuleManifest(manifest: ModuleManifest): void {
	if (manifest.schema !== 'folio/module-manifest/v1') {
		throw new ModuleRegistryError(`unsupported manifest schema: ${manifest.schema}`);
	}
	if (!ID.test(manifest.id)) throw new ModuleRegistryError(`invalid module id: ${manifest.id}`);
	if (!manifest.label.trim() || !manifest.version.trim()) {
		throw new ModuleRegistryError(`module ${manifest.id} needs label and version`);
	}
	const capabilities = uniqueIds(manifest.capabilities, 'capability');
	const dataClasses = uniqueIds(manifest.data_classes, 'data class');
	uniqueIds(manifest.panels, 'panel');
	uniqueIds(manifest.databases, 'database');
	for (const panel of manifest.panels) {
		if (!capabilities.has(panel.requires)) {
			throw new ModuleRegistryError(`panel ${panel.id} requires unknown capability`);
		}
		uniqueIds(panel.fields, `panel field in ${panel.id}`);
		for (const field of panel.fields) {
			if (!dataClasses.has(field.data_class)) {
				throw new ModuleRegistryError(`panel field ${field.id} uses unknown data class`);
			}
		}
	}
	for (const database of manifest.databases) {
		for (const dataClass of database.data_classes) {
			if (!dataClasses.has(dataClass)) {
				throw new ModuleRegistryError(`database ${database.id} uses unknown data class`);
			}
		}
	}
}

export class ModuleRegistry {
	readonly #registrations = new Map<string, ModuleRegistration>();

	constructor(private readonly killed: (moduleId: string) => boolean = () => false) {}

	register(registration: ModuleRegistration): void {
		const manifest = deepFreeze(structuredClone(registration.manifest));
		validateModuleManifest(manifest);
		const id = manifest.id;
		if (this.#registrations.has(id)) {
			throw new ModuleRegistryError(`module already registered: ${id}`);
		}
		const declaredDatabases = new Set(manifest.databases.map((item) => item.id));
		for (const databaseId of Object.keys(registration.database_paths ?? {})) {
			if (!declaredDatabases.has(databaseId)) {
				throw new ModuleRegistryError(`runtime path for undeclared database: ${databaseId}`);
			}
		}
		this.#registrations.set(id, {
			manifest,
			enabled: registration.enabled,
			database_paths: registration.database_paths
		});
	}

	access(moduleId: string, capabilityId: string): ModuleAccess {
		const registration = this.#registrations.get(moduleId);
		if (!registration) return { allowed: false, reason: 'unknown-module' };
		if (this.killed(moduleId)) return { allowed: false, reason: 'kill-switch' };
		if (!registration.enabled()) return { allowed: false, reason: 'module-disabled' };
		if (!registration.manifest.capabilities.some((item) => item.id === capabilityId)) {
			return { allowed: false, reason: 'unknown-capability' };
		}
		return { allowed: true, reason: 'allowed' };
	}

	databasePath(moduleId: string, databaseId: string, capabilityId: string): string | null {
		if (!this.access(moduleId, capabilityId).allowed) return null;
		const registration = this.#registrations.get(moduleId);
		if (!registration?.manifest.databases.some((item) => item.id === databaseId)) return null;
		return registration.database_paths?.[databaseId]?.() ?? null;
	}

	snapshot(): ModuleSnapshot[] {
		return [...this.#registrations.values()]
			.map((registration) => ({
				manifest: registration.manifest,
				enabled: registration.enabled() && !this.killed(registration.manifest.id),
				killed: this.killed(registration.manifest.id)
			}))
			.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
	}
}
