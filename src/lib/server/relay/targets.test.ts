import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
	DEMO_CAREER_TARGET,
	createDefaultCareerFilesystemTarget,
	getSessionTargetsPath,
	loadSessionTargets
} from './targets.js';

describe('Session target manifest', () => {
	let root = '';
	afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

	it('loads a provider-neutral target and rejects unknown capabilities', () => {
		root = join(tmpdir(), `folio-targets-${Date.now()}`);
		mkdirSync(root, { recursive: true });
		const path = join(root, 'targets.yaml');
		writeFileSync(path, `schema: folio/session-targets/v1
targets:
  - id: career-session
    label: Career session
    domain: career
    adapter: filesystem
    locality: cloud
    capabilities: [analyze, reply_draft]
    allowed_data_classes: [mail_body]
    retention_days: 14
`);
		expect(loadSessionTargets(path)[0]).toEqual(expect.objectContaining({ id: 'career-session', locality: 'cloud' }));
		writeFileSync(path, readFileSync(path, 'utf8').replace('reply_draft', 'post_publicly'));
		expect(() => loadSessionTargets(path)).toThrow(/unknown target capability/);
	});

	it('requires an explicit sensitivity ceiling when memory context is enabled', () => {
		root = join(tmpdir(), `folio-targets-${Date.now()}`);
		mkdirSync(root, { recursive: true });
		const path = join(root, 'targets.yaml');
		writeFileSync(path, `schema: folio/session-targets/v1
targets:
  - id: career-session
    label: Career session
    domain: career
    adapter: filesystem
    locality: cloud
    capabilities: [reply_draft]
    allowed_data_classes: [mail_body, memory_context]
    retention_days: 14
`);
		expect(() => loadSessionTargets(path)).toThrow(/must declare memory_max_sensitivity/);
		writeFileSync(path, readFileSync(path, 'utf8').replace('    retention_days', '    memory_max_sensitivity: private\n    retention_days'));
		expect(loadSessionTargets(path)[0].memory_max_sensitivity).toBe('private');
	});

	it('creates one generic filesystem target without overwriting an existing manifest', () => {
		root = join(tmpdir(), `folio-targets-${Date.now()}`);
		const path = join(root, 'targets.yaml');
		const target = createDefaultCareerFilesystemTarget(path);
		expect(target).toEqual(expect.objectContaining({
			id: 'career-session',
			adapter: 'filesystem',
			locality: 'cloud',
			memory_max_sensitivity: 'private'
		}));
		expect(loadSessionTargets(path)).toHaveLength(1);
		expect(() => createDefaultCareerFilesystemTarget(path)).toThrow(/already exists/);
	});

	it('keeps the demo target manifest separate from the real target manifest', () => {
		const previousHome = process.env.HOME;
		const previousVaultOverride = process.env.FOLIO_VAULT_OVERRIDE;
		const previousTargetsPath = process.env.FOLIO_SESSION_TARGETS_PATH;
		root = join(tmpdir(), `folio-targets-${Date.now()}`);
		mkdirSync(join(root, '.folio'), { recursive: true });
		writeFileSync(join(root, '.folio', 'session-targets.yaml'), `schema: folio/session-targets/v1
targets:
  - id: real-only
    label: Real target
    domain: career
    adapter: filesystem
    locality: cloud
    capabilities: [reply_draft]
    allowed_data_classes: [mail_body]
    retention_days: 14
`);

		try {
			process.env.HOME = root;
			process.env.FOLIO_VAULT_OVERRIDE = '/repo/folio/templates/demo-vault';
			delete process.env.FOLIO_SESSION_TARGETS_PATH;
			expect(getSessionTargetsPath()).toBe(join(root, '.folio', 'session-targets-demo.yaml'));
			expect(loadSessionTargets()).toEqual([DEMO_CAREER_TARGET]);
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousVaultOverride === undefined) delete process.env.FOLIO_VAULT_OVERRIDE;
			else process.env.FOLIO_VAULT_OVERRIDE = previousVaultOverride;
			if (previousTargetsPath === undefined) delete process.env.FOLIO_SESSION_TARGETS_PATH;
			else process.env.FOLIO_SESSION_TARGETS_PATH = previousTargetsPath;
		}
	});
});
