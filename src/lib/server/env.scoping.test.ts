import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	getFeedbackDbPath,
	getFolioDbPath,
	getCouncilDbPath,
	getVaultPath,
	isCouncilRegistered,
	isDemoVaultActive,
	isDemoVaultPath
} from './env.js';

describe('vault-scoped DB paths', () => {
	let home: string;
	let prevHome: string | undefined;

	function writeActiveVault(obj: Record<string, unknown>) {
		mkdirSync(join(home, '.folio'), { recursive: true });
		writeFileSync(join(home, '.folio', 'active-vault.json'), JSON.stringify(obj), 'utf-8');
	}

	beforeEach(() => {
		home = join(tmpdir(), `folio-scoping-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(home, { recursive: true });
		prevHome = process.env.HOME;
		process.env.HOME = home;
	});

	afterEach(() => {
		if (prevHome === undefined) delete process.env.HOME;
		else process.env.HOME = prevHome;
		delete process.env.FOLIO_VAULT_OVERRIDE;
		delete process.env.VAULT_PATH;
		rmSync(home, { recursive: true, force: true });
	});

	it('isDemoVaultPath matches the known demo vault locations', () => {
		expect(isDemoVaultPath('/Users/Shared/folio-demo')).toBe(true);
		expect(isDemoVaultPath('/repo/folio/templates/demo-vault')).toBe(true);
		expect(isDemoVaultPath('/Users/me/Projects/life')).toBe(false);
		expect(isDemoVaultPath(null)).toBe(false);
	});

	it('demo vault (by path) scopes mail+folio stores to *-demo.db; Council is unregistered', () => {
		writeActiveVault({ path: '/Users/Shared/folio-demo' });
		expect(isDemoVaultActive()).toBe(true);
		expect(getFeedbackDbPath()).toContain('feedback-demo.db');
		expect(getFolioDbPath()).toContain('folio-demo.db');
		// Aufgabe 4(b): demo vault does NOT register Council → null (not council-demo.db).
		expect(isCouncilRegistered()).toBe(false);
		expect(getCouncilDbPath()).toBeNull();
	});

	it('demo:true flag scopes even without a heuristic path match', () => {
		writeActiveVault({ path: '/some/custom/vault', demo: true });
		expect(isDemoVaultActive()).toBe(true);
		expect(getFeedbackDbPath()).toContain('feedback-demo.db');
	});

	it('real vault resolves to the real stores (no -demo) + Council registered', () => {
		writeActiveVault({ path: join(home, 'Projects/life') });
		expect(isDemoVaultActive()).toBe(false);
		expect(getFeedbackDbPath()).toContain('feedback.db');
		expect(getFeedbackDbPath()).not.toContain('feedback-demo.db');
		expect(getFolioDbPath()).not.toContain('folio-demo.db');
		expect(isCouncilRegistered()).toBe(true);
		expect(getCouncilDbPath()).toContain('council.db');
	});

	it('no active vault → real stores (default)', () => {
		expect(isDemoVaultActive()).toBe(false);
		expect(getFolioDbPath()).not.toContain('-demo');
	});

	// Hermetic eval: FOLIO_VAULT_OVERRIDE wins over active-vault.json, so a run measures
	// against the vault the harness declares — never "whichever vault happened to be active".
	it('FOLIO_VAULT_OVERRIDE takes precedence over active-vault.json (eval hermeticity)', () => {
		writeActiveVault({ path: '/some/other/active/vault', demo: true });
		process.env.FOLIO_VAULT_OVERRIDE = '/repo/folio/templates/demo-vault';
		expect(getVaultPath()).toBe('/repo/folio/templates/demo-vault');
	});

	it('without the override, active-vault.json still wins over process.env.VAULT_PATH', () => {
		writeActiveVault({ path: '/the/active/vault' });
		process.env.VAULT_PATH = '/an/env/vault';
		expect(getVaultPath()).toBe('/the/active/vault');
	});
});
