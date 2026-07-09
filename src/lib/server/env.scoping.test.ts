import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	getFeedbackDbPath,
	getFolioDbPath,
	getCouncilDbPath,
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
		rmSync(home, { recursive: true, force: true });
	});

	it('isDemoVaultPath matches the known demo vault locations', () => {
		expect(isDemoVaultPath('/Users/Shared/folio-demo')).toBe(true);
		expect(isDemoVaultPath('/repo/folio/templates/demo-vault')).toBe(true);
		expect(isDemoVaultPath('/Users/me/Projects/life')).toBe(false);
		expect(isDemoVaultPath(null)).toBe(false);
	});

	it('demo vault (by path) scopes all three stores to *-demo.db', () => {
		writeActiveVault({ path: '/Users/Shared/folio-demo' });
		expect(isDemoVaultActive()).toBe(true);
		expect(getFeedbackDbPath()).toContain('feedback-demo.db');
		expect(getFolioDbPath()).toContain('folio-demo.db');
		expect(getCouncilDbPath()).toContain('council-demo.db');
	});

	it('demo:true flag scopes even without a heuristic path match', () => {
		writeActiveVault({ path: '/some/custom/vault', demo: true });
		expect(isDemoVaultActive()).toBe(true);
		expect(getFeedbackDbPath()).toContain('feedback-demo.db');
	});

	it('real vault resolves to the real stores (no -demo)', () => {
		writeActiveVault({ path: join(home, 'Projects/life') });
		expect(isDemoVaultActive()).toBe(false);
		expect(getFeedbackDbPath()).toContain('feedback.db');
		expect(getFeedbackDbPath()).not.toContain('feedback-demo.db');
		expect(getFolioDbPath()).not.toContain('folio-demo.db');
	});

	it('no active vault → real stores (default)', () => {
		expect(isDemoVaultActive()).toBe(false);
		expect(getFolioDbPath()).not.toContain('-demo');
	});
});
