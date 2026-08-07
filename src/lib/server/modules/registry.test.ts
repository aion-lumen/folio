import { describe, expect, it } from 'vitest';
import { ModuleRegistry, ModuleRegistryError, validateModuleManifest } from './registry.js';
import type { ModuleManifest, ModuleRegistration } from './types.js';

function registration(overrides: Partial<ModuleManifest> = {}): ModuleRegistration {
	return {
		manifest: {
			schema: 'folio/module-manifest/v1',
			id: 'example',
			label: 'Example',
			version: '1',
			capabilities: [
				{ id: 'records.read', kind: 'read', description: 'Read records.' },
				{ id: 'panel.render', kind: 'render', description: 'Render the panel.' }
			],
			data_classes: [
				{ id: 'record', sensitivity: 'private', retention: { policy: 'owner', enforced: false } }
			],
			panels: [
				{
					id: 'main',
					label: 'Main',
					requires: 'panel.render',
					fields: [{ id: 'record.title', label: 'Title', data_class: 'record' }]
				}
			],
			databases: [
				{ id: 'primary', engine: 'sqlite', access: 'read-only', data_classes: ['record'] }
			],
			kill_switch: {
				global_env: 'FOLIO_MODULES_DISABLED',
				module_env: 'FOLIO_DISABLED_MODULES'
			},
			...overrides
		},
		enabled: () => true,
		database_paths: { primary: () => '/private/example.db' }
	};
}

describe('ModuleRegistry', () => {
	it('denies unknown modules and capabilities by default', () => {
		const registry = new ModuleRegistry();
		registry.register(registration());
		expect(registry.access('missing', 'records.read').reason).toBe('unknown-module');
		expect(registry.access('example', 'records.write').reason).toBe('unknown-capability');
	});

	it('applies disabled state and kill switch before granting capabilities', () => {
		const disabled = registration({ id: 'disabled' });
		disabled.enabled = () => false;
		const registry = new ModuleRegistry((id) => id === 'example');
		registry.register(registration());
		registry.register(disabled);
		expect(registry.access('example', 'records.read').reason).toBe('kill-switch');
		expect(registry.access('disabled', 'records.read').reason).toBe('module-disabled');
	});

	it('resolves a declared database only behind an allowed capability', () => {
		const registry = new ModuleRegistry();
		registry.register(registration());
		expect(registry.databasePath('example', 'primary', 'records.read')).toBe('/private/example.db');
		expect(registry.databasePath('example', 'missing', 'records.read')).toBeNull();
		expect(registry.databasePath('example', 'primary', 'records.write')).toBeNull();
	});

	it('snapshot exposes declarations and state but no runtime paths', () => {
		const registry = new ModuleRegistry();
		registry.register(registration());
		const serialized = JSON.stringify(registry.snapshot());
		expect(serialized).toContain('records.read');
		expect(serialized).not.toContain('/private/example.db');
	});

	it('copies and freezes the manifest at registration time', () => {
		const source = registration();
		const registry = new ModuleRegistry();
		registry.register(source);
		source.manifest.capabilities = [];
		expect(registry.access('example', 'records.read').allowed).toBe(true);
		expect(Object.isFrozen(registry.snapshot()[0].manifest.capabilities)).toBe(true);
	});

	it('rejects duplicate ids and dangling manifest references', () => {
		const registry = new ModuleRegistry();
		registry.register(registration());
		expect(() => registry.register(registration())).toThrow(ModuleRegistryError);
		expect(() =>
			validateModuleManifest(
				registration({
					panels: [
						{ id: 'broken', label: 'Broken', requires: 'missing', fields: [] }
					]
				}).manifest
			)
		).toThrow(/unknown capability/);
	});
});
