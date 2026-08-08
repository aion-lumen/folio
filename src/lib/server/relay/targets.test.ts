import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSessionTargets } from './targets.js';

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
    adapter: cowork-filesystem
    locality: cloud
    capabilities: [analyze, reply_draft]
    allowed_data_classes: [mail_body]
    retention_days: 14
`);
		expect(loadSessionTargets(path)[0]).toEqual(expect.objectContaining({ id: 'career-session', locality: 'cloud' }));
		writeFileSync(path, readFileSync(path, 'utf8').replace('reply_draft', 'post_publicly'));
		expect(() => loadSessionTargets(path)).toThrow(/unknown target capability/);
	});
});
