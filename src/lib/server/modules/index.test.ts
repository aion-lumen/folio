import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getModuleDatabasePath, getModuleRegistrySnapshot, hasModuleCapability } from './index.js';

describe('built-in module registry', () => {
	let home: string;
	let previousHome: string | undefined;
	let previousAll: string | undefined;
	let previousList: string | undefined;
	let previousVaultOverride: string | undefined;

	beforeEach(() => {
		home = join(tmpdir(), `folio-modules-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(home, '.folio'), { recursive: true });
		previousHome = process.env.HOME;
		previousAll = process.env.FOLIO_MODULES_DISABLED;
		previousList = process.env.FOLIO_DISABLED_MODULES;
		previousVaultOverride = process.env.FOLIO_VAULT_OVERRIDE;
		process.env.HOME = home;
		delete process.env.FOLIO_MODULES_DISABLED;
		delete process.env.FOLIO_DISABLED_MODULES;
		delete process.env.FOLIO_VAULT_OVERRIDE;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		if (previousAll === undefined) delete process.env.FOLIO_MODULES_DISABLED;
		else process.env.FOLIO_MODULES_DISABLED = previousAll;
		if (previousList === undefined) delete process.env.FOLIO_DISABLED_MODULES;
		else process.env.FOLIO_DISABLED_MODULES = previousList;
		if (previousVaultOverride === undefined) delete process.env.FOLIO_VAULT_OVERRIDE;
		else process.env.FOLIO_VAULT_OVERRIDE = previousVaultOverride;
		rmSync(home, { recursive: true, force: true });
	});

	it('keeps Council opt-in while core built-ins are registered', () => {
		expect(hasModuleCapability('career', 'assessments.write')).toBe(true);
		expect(hasModuleCapability('council', 'records.read')).toBe(false);
		expect(hasModuleCapability('leuchtfeuer', 'metrics.read')).toBe(true);
		expect(hasModuleCapability('sonar', 'notes.read')).toBe(true);
		expect(hasModuleCapability('relay', 'egress.approve')).toBe(true);
		expect(hasModuleCapability('relay', 'responses.apply')).toBe(true);
		writeFileSync(
			join(home, '.folio', 'active-vault.json'),
			JSON.stringify({ path: join(home, 'vault'), council: true })
		);
		expect(getModuleDatabasePath('sonar', 'vault-notes', 'notes.read')).toBe(join(home, 'vault', 'internal', 'sonar'));
		expect(getModuleDatabasePath('sonar', 'review-state', 'reviews.read')).toBe(join(home, 'vault', 'internal', 'sonar'));
		expect(getModuleDatabasePath('sonar', 'archive-cache', 'archive.read')).toBe(join(home, '.folio', 'sonar'));
		expect(hasModuleCapability('council', 'records.read')).toBe(true);
		expect(getModuleDatabasePath('council', 'primary', 'records.read')).toContain('council.db');
	});

	it('applies global and per-module emergency stops dynamically', () => {
		process.env.FOLIO_DISABLED_MODULES = 'leuchtfeuer';
		expect(hasModuleCapability('leuchtfeuer', 'metrics.read')).toBe(false);
		process.env.FOLIO_DISABLED_MODULES = 'relay';
		expect(hasModuleCapability('relay', 'responses.read')).toBe(false);
		expect(getModuleDatabasePath('relay', 'exchange', 'responses.read')).toBeNull();
		process.env.FOLIO_DISABLED_MODULES = '';
		process.env.FOLIO_MODULES_DISABLED = 'true';
		expect(hasModuleCapability('leuchtfeuer', 'metrics.read')).toBe(false);
	});

	it('keeps mutable Sonar demo reviews out of the bundled fixture vault', () => {
		process.env.FOLIO_VAULT_OVERRIDE = join(home, 'demo-vault');
		expect(getModuleDatabasePath('sonar', 'vault-notes', 'notes.read')).toBe(
			join(home, 'demo-vault', 'internal', 'sonar')
		);
		expect(getModuleDatabasePath('sonar', 'review-state', 'reviews.read')).toBe(
			join(home, '.folio', 'sonar-demo')
		);
		expect(getModuleDatabasePath('sonar', 'archive-cache', 'archive.read')).toBe(
			join(home, 'demo-vault', 'internal', 'sonar', 'archive-cache')
		);
	});

	it('registry snapshot contains both reference consumers and no paths', () => {
		const snapshot = getModuleRegistrySnapshot();
		expect(snapshot.map((item) => item.manifest.id)).toEqual(['career', 'council', 'leuchtfeuer', 'relay', 'sonar']);
		expect(JSON.stringify(snapshot)).not.toContain(home);
	});
});
